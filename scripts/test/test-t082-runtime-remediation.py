#!/usr/bin/env python3
"""Regression contract for the T082 runtime remediation findings."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTROLLER_PATH = REPO_ROOT / "infra/deployment/release.py"
COMPOSE_PATH = REPO_ROOT / "infra/deployment/release.compose.yaml"

SPEC = importlib.util.spec_from_file_location("courtside_release", CONTROLLER_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import contract
    raise RuntimeError("unable to load the T082 release controller")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


def image(name: str, digit: str) -> str:
    return f"registry.example.invalid/{name}@sha256:{digit * 64}"


def manifest(
    release_id: str,
    source_digit: str,
    target_schema: int,
    minimum_schema: int,
    maximum_schema: int,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "release_id": release_id,
        "source_sha": source_digit * 40,
        "images": {
            "api": image("courtside-api", source_digit),
            "web": image("courtside-web", source_digit),
        },
        "database": {
            "target_schema": target_schema,
            "compatible_schema": {
                "min": minimum_schema,
                "max": maximum_schema,
            },
            "migration_phase": "expand",
        },
    }


def readiness(
    candidate: dict[str, object],
    *,
    environment: str,
    checks: list[str],
    database_schema: int | None = None,
) -> dict[str, object]:
    database = candidate["database"]
    assert isinstance(database, dict)
    return {
        "schema_version": 1,
        "environment": environment,
        "release_id": candidate["release_id"],
        "source_sha": candidate["source_sha"],
        "images": copy.deepcopy(candidate["images"]),
        "status": "healthy",
        "database_schema": (
            database["target_schema"]
            if database_schema is None
            else database_schema
        ),
        "checks": [{"name": name, "status": "healthy"} for name in checks],
    }


def schema_readback(environment: str, database_schema: int) -> dict[str, object]:
    return {
        "schema_version": 1,
        "environment": environment,
        "database_schema": database_schema,
        "observed_at": datetime.now(UTC)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }


def activated_state() -> tuple[dict[str, object], dict[str, object]]:
    release_a = manifest("release-a", "a", 9, 9, 10)
    release_b = manifest("release-b", "b", 10, 9, 11)
    state = release.new_state("test")
    state["releases"] = {"release-a": release_a, "release-b": release_b}
    state["active_release"] = "release-b"
    state["previous_release"] = "release-a"
    state["database_schema_version"] = 10
    state["activated_releases"] = ["release-a", "release-b"]
    return state, release_a


class T082RuntimeRemediationTests(unittest.TestCase):
    def test_datasource_is_bound_to_spring_for_api_and_worker(self) -> None:
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertEqual(compose.count("SPRING_DATASOURCE_URL:"), 2)
        self.assertNotIn("\n      DATABASE_URL:", compose)

    def test_readiness_requires_api_worker_and_web(self) -> None:
        candidate = manifest("release-a", "a", 9, 9, 10)
        receipt = readiness(
            candidate,
            environment="test",
            checks=["api-readiness", "public-web-readiness"],
        )
        with self.assertRaisesRegex(release.ReleaseError, "worker-readiness"):
            release.validate_readiness(receipt, candidate, "test")

    def test_release_state_is_bound_to_one_environment(self) -> None:
        state = release.new_state("production")
        with self.assertRaisesRegex(release.ReleaseError, "environment"):
            release.validate_state(copy.deepcopy(state), "staging")

    def test_readiness_receipt_is_bound_to_environment(self) -> None:
        candidate = manifest("release-a", "a", 9, 9, 10)
        receipt = readiness(
            candidate,
            environment="staging",
            checks=["api-readiness", "worker-readiness", "public-web-readiness"],
        )
        with self.assertRaisesRegex(release.ReleaseError, "environment"):
            release.validate_readiness(receipt, candidate, "production")

    def test_rollback_rejects_never_activated_candidate(self) -> None:
        state, _ = activated_state()
        release_c = manifest("release-c", "c", 10, 9, 11)
        releases = state["releases"]
        assert isinstance(releases, dict)
        releases["release-c"] = release_c
        with self.assertRaisesRegex(release.ReleaseError, "previously activated"):
            release.rollback_release(
                state,
                "release-c",
                "test",
                schema_readback("test", 10),
            )

    def test_rollback_uses_live_schema_readback(self) -> None:
        state, _ = activated_state()
        with self.assertRaisesRegex(release.ReleaseError, "forward database schema"):
            release.rollback_release(
                state,
                "release-a",
                "test",
                schema_readback("test", 11),
            )

    def test_atomic_state_write_cannot_exceed_read_limit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            original = {"result": "preserved"}
            release.atomic_write_json(state_path, original)
            oversized = {"payload": "x" * release.MAX_JSON_BYTES}
            with self.assertRaisesRegex(release.ReleaseError, "exceeds"):
                release.atomic_write_json(state_path, oversized)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8")), original)
            self.assertLessEqual(state_path.stat().st_size, release.MAX_JSON_BYTES)

    def test_v1_state_migrates_without_losing_history_or_emergency_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "release-state.json"
            backup_path = root / "release-state.v1.json"
            migrate_receipt_path = root / "migration-receipt.json"
            status_receipt_path = root / "status-receipt.json"
            rollback_receipt_path = root / "rollback-receipt.json"
            schema_path = root / "schema-readback.json"

            release_a = manifest("release-a", "a", 9, 9, 10)
            release_b = manifest("release-b", "b", 10, 9, 11)
            releases: dict[str, object] = {
                "release-a": release_a,
                "release-b": release_b,
            }
            legacy_state: dict[str, object] = {
                "schema_version": 1,
                "revision": 4,
                "database_schema_version": 10,
                "active_release": "release-b",
                "previous_release": "release-a",
                "last_action_receipt": {"action": "activate", "result": "pass"},
                "releases": releases,
            }
            index = 0
            while len(
                (json.dumps(legacy_state, indent=2, sort_keys=True) + "\n").encode("utf-8")
            ) <= release.MAX_STATE_BYTES:
                release_id = f"registered-candidate-{index:03d}"
                digit = "cdef"[index % 4]
                releases[release_id] = manifest(release_id, digit, 10, 9, 11)
                index += 1
            serialized = json.dumps(legacy_state, indent=2, sort_keys=True) + "\n"
            self.assertLessEqual(len(serialized.encode("utf-8")), release.MAX_JSON_BYTES)
            state_path.write_text(serialized, encoding="utf-8")

            migration = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(migrate_receipt_path),
                    "--environment",
                    "staging",
                    "migrate-state",
                    "--legacy-backup",
                    str(backup_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(migration.returncode, 0, migration.stderr)

            migrated = json.loads(state_path.read_text(encoding="utf-8"))
            backup = json.loads(backup_path.read_text(encoding="utf-8"))
            migration_receipt = json.loads(
                migrate_receipt_path.read_text(encoding="utf-8")
            )
            self.assertEqual(backup, legacy_state)
            self.assertEqual(migrated["schema_version"], 2)
            self.assertEqual(migrated["environment"], "staging")
            self.assertEqual(migrated["active_release"], "release-b")
            self.assertEqual(migrated["previous_release"], "release-a")
            self.assertEqual(migrated["activated_releases"], ["release-a", "release-b"])
            self.assertIn("release-a", migrated["releases"])
            self.assertIn("release-b", migrated["releases"])
            self.assertLess(len(migrated["releases"]), len(releases))
            self.assertLessEqual(state_path.stat().st_size, release.MAX_STATE_BYTES)
            self.assertEqual(migration_receipt["legacy_release_count"], len(releases))
            self.assertGreater(migration_receipt["archived_only_release_count"], 0)
            self.assertEqual(
                migration_receipt["legacy_backup_sha256"],
                hashlib.sha256(backup_path.read_bytes()).hexdigest(),
            )
            self.assertEqual(migration_receipt["schema_rollback_performed"], False)
            self.assertEqual(migration_receipt["destructive_schema_action"], False)

            status = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(status_receipt_path),
                    "--environment",
                    "staging",
                    "status",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(status.returncode, 0, status.stderr)

            schema_path.write_text(
                json.dumps(schema_readback("staging", 10)), encoding="utf-8"
            )
            rollback = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(rollback_receipt_path),
                    "--environment",
                    "staging",
                    "rollback",
                    "--release",
                    "release-a",
                    "--schema-readback",
                    str(schema_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(rollback.returncode, 0, rollback.stderr)
            rollback_receipt = json.loads(
                rollback_receipt_path.read_text(encoding="utf-8")
            )
            self.assertEqual(rollback_receipt["active_after"], "release-a")
            self.assertEqual(rollback_receipt["schema_rollback_performed"], False)
            self.assertEqual(rollback_receipt["destructive_schema_action"], False)

    def test_v1_state_larger_than_64_kib_uses_a_separately_bounded_migration_read(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "release-state.json"
            backup_path = root / "release-state.v1.json"
            receipt_path = root / "migration-receipt.json"
            releases: dict[str, object] = {
                "release-a": manifest("release-a", "a", 9, 9, 10),
                "release-b": manifest("release-b", "b", 10, 9, 11),
            }
            legacy_state: dict[str, object] = {
                "schema_version": 1,
                "revision": 4,
                "database_schema_version": 10,
                "active_release": "release-b",
                "previous_release": "release-a",
                "last_action_receipt": {"action": "activate", "result": "pass"},
                "releases": releases,
            }
            index = 0
            while len(
                (json.dumps(legacy_state, indent=2, sort_keys=True) + "\n").encode("utf-8")
            ) <= release.MAX_JSON_BYTES + 1024:
                release_id = f"legacy-registered-{index:04d}"
                releases[release_id] = manifest(release_id, "cdef"[index % 4], 10, 9, 11)
                index += 1
            serialized = json.dumps(legacy_state, indent=2, sort_keys=True) + "\n"
            self.assertGreater(len(serialized.encode("utf-8")), release.MAX_JSON_BYTES)
            state_path.write_text(serialized, encoding="utf-8")

            migration = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(receipt_path),
                    "--environment",
                    "staging",
                    "migrate-state",
                    "--legacy-backup",
                    str(backup_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(migration.returncode, 0, migration.stderr)
            self.assertEqual(
                json.loads(backup_path.read_text(encoding="utf-8")), legacy_state
            )
            self.assertEqual(
                json.loads(state_path.read_text(encoding="utf-8"))["schema_version"], 2
            )

    def test_archived_release_id_cannot_be_rebound_after_migration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "release-state.json"
            backup_path = root / "release-state.v1.json"
            migrate_receipt_path = root / "migration-receipt.json"
            register_receipt_path = root / "register-receipt.json"
            manifest_path = root / "candidate.json"
            releases: dict[str, object] = {
                "release-a": manifest("release-a", "a", 9, 9, 10),
                "release-b": manifest("release-b", "b", 10, 9, 11),
            }
            legacy_state: dict[str, object] = {
                "schema_version": 1,
                "revision": 4,
                "database_schema_version": 10,
                "active_release": "release-b",
                "previous_release": "release-a",
                "last_action_receipt": {"action": "activate", "result": "pass"},
                "releases": releases,
            }
            index = 0
            while len(
                (json.dumps(legacy_state, indent=2, sort_keys=True) + "\n").encode("utf-8")
            ) <= release.MAX_STATE_BYTES:
                release_id = f"archived-candidate-{index:04d}"
                releases[release_id] = manifest(release_id, "c", 10, 9, 11)
                index += 1
            state_path.write_text(
                json.dumps(legacy_state, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            migration = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(migrate_receipt_path),
                    "--environment",
                    "staging",
                    "migrate-state",
                    "--legacy-backup",
                    str(backup_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(migration.returncode, 0, migration.stderr)
            migrated = json.loads(state_path.read_text(encoding="utf-8"))
            archived_id = next(
                release_id
                for release_id in releases
                if release_id not in migrated["releases"]
            )
            rebound = manifest(archived_id, "d", 10, 9, 11)
            manifest_path.write_text(json.dumps(rebound), encoding="utf-8")

            registration = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(register_receipt_path),
                    "--environment",
                    "staging",
                    "register",
                    "--manifest",
                    str(manifest_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(registration.returncode, 0)
            self.assertIn("different immutable inputs", registration.stderr)

    def test_migration_rejects_an_insecure_existing_legacy_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "release-state.json"
            backup_path = root / "release-state.v1.json"
            receipt_path = root / "migration-receipt.json"
            release_a = manifest("release-a", "a", 9, 9, 10)
            legacy_state: dict[str, object] = {
                "schema_version": 1,
                "revision": 1,
                "database_schema_version": 9,
                "active_release": "release-a",
                "previous_release": None,
                "last_action_receipt": {"action": "activate", "result": "pass"},
                "releases": {"release-a": release_a},
            }
            serialized = json.dumps(legacy_state, indent=2, sort_keys=True) + "\n"
            state_path.write_text(serialized, encoding="utf-8")
            backup_path.write_text(serialized, encoding="utf-8")
            os.chmod(backup_path, 0o644)

            migration = subprocess.run(
                [
                    sys.executable,
                    str(CONTROLLER_PATH),
                    "--state",
                    str(state_path),
                    "--receipt",
                    str(receipt_path),
                    "--environment",
                    "staging",
                    "migrate-state",
                    "--legacy-backup",
                    str(backup_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(migration.returncode, 0)
            self.assertIn("permissions", migration.stderr)
            self.assertEqual(
                json.loads(state_path.read_text(encoding="utf-8"))["schema_version"], 1
            )

    def test_legacy_backup_creation_is_exclusive_across_state_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            backup_path = Path(directory) / "shared-v1-backup.json"
            payloads = [
                {"schema_version": 1, "source": "first", "payload": "a" * 8192},
                {"schema_version": 1, "source": "second", "payload": "b" * 8192},
            ]
            barrier = threading.Barrier(2)
            original_atomic_write = release.atomic_write_json
            outcomes: list[tuple[str, object]] = []

            def delayed_atomic_write(*args: object, **kwargs: object) -> None:
                barrier.wait(timeout=5)
                original_atomic_write(*args, **kwargs)

            def writer(payload: dict[str, object]) -> None:
                try:
                    outcomes.append(
                        ("success", release.ensure_legacy_backup(backup_path, payload))
                    )
                except release.ReleaseError as error:
                    outcomes.append(("error", str(error)))

            with mock.patch.object(
                release, "atomic_write_json", side_effect=delayed_atomic_write
            ):
                threads = [
                    threading.Thread(target=writer, args=(payload,))
                    for payload in payloads
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join(timeout=10)

            self.assertTrue(all(not thread.is_alive() for thread in threads))
            self.assertEqual([kind for kind, _ in outcomes].count("success"), 1)
            self.assertEqual([kind for kind, _ in outcomes].count("error"), 1)
            self.assertIn(json.loads(backup_path.read_text(encoding="utf-8")), payloads)
            self.assertEqual(backup_path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main(verbosity=2)
