#!/usr/bin/env python3
"""Tests-first regression contract for the bounded T082 runtime remediation."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path


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


def legacy_state() -> dict[str, object]:
    release_a = manifest("release-a", "a", 9, 9, 10)
    release_b = manifest("release-b", "b", 10, 9, 11)
    return {
        "schema_version": 1,
        "revision": 4,
        "database_schema_version": 10,
        "active_release": "release-b",
        "previous_release": "release-a",
        "last_action_receipt": {
            "schema_version": 1,
            "task": "T082",
            "action": "activate",
            "environment": "test",
            "observed_at": "2026-08-23T00:00:00Z",
            "active_before": "release-a",
            "active_after": "release-b",
            "database_schema_before": 9,
            "database_schema_after": 10,
            "schema_rollback_performed": False,
            "destructive_schema_action": False,
            "state_revision": 4,
        },
        "releases": {"release-a": release_a, "release-b": release_b},
    }


def upgrade_evidence(
    *,
    environment: str = "test",
    activated_releases: list[str] | None = None,
    active_release: str | None = "release-b",
    previous_release: str | None = "release-a",
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "environment": environment,
        "activated_releases": (
            ["release-a", "release-b"]
            if activated_releases is None
            else activated_releases
        ),
        "active_release": active_release,
        "previous_release": previous_release,
    }


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

    def test_v1_state_requires_an_explicit_environment_bound_upgrade(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            state_path.write_text(json.dumps(legacy_state()), encoding="utf-8")
            with self.assertRaisesRegex(release.ReleaseError, "explicit.*upgrade"):
                release.load_state(state_path, "test")

    def test_v1_upgrade_preserves_environment_and_healthy_activation_history(self) -> None:
        migrated = release.migrate_v1_state(
            legacy_state(),
            "test",
            upgrade_evidence(),
            release.STATE_UPGRADE_CONFIRMATION,
        )

        self.assertEqual(migrated["schema_version"], release.STATE_SCHEMA_VERSION)
        self.assertEqual(migrated["environment"], "test")
        self.assertEqual(migrated["activated_releases"], ["release-a", "release-b"])
        self.assertEqual(migrated["active_release"], "release-b")
        self.assertEqual(migrated["previous_release"], "release-a")
        self.assertEqual(
            migrated["receipt_history"], [legacy_state()["last_action_receipt"]]
        )
        release.validate_state(migrated, "test")

    def test_v1_upgrade_rejects_environment_or_history_mismatch(self) -> None:
        with self.assertRaisesRegex(release.ReleaseError, "environment"):
            release.migrate_v1_state(
                legacy_state(),
                "production",
                upgrade_evidence(environment="staging"),
                release.STATE_UPGRADE_CONFIRMATION,
            )

        with self.assertRaisesRegex(release.ReleaseError, "activation history"):
            release.migrate_v1_state(
                legacy_state(),
                "test",
                upgrade_evidence(activated_releases=["release-b"]),
                release.STATE_UPGRADE_CONFIRMATION,
            )

    def test_v1_upgrade_rejects_missing_confirmation_and_unknown_history_targets(self) -> None:
        with self.assertRaisesRegex(release.ReleaseError, "confirmation"):
            release.migrate_v1_state(
                legacy_state(),
                "test",
                upgrade_evidence(),
                "",
            )

        with self.assertRaisesRegex(release.ReleaseError, "unknown release"):
            release.migrate_v1_state(
                legacy_state(),
                "test",
                upgrade_evidence(activated_releases=["release-a", "missing"]),
                release.STATE_UPGRADE_CONFIRMATION,
            )

    def test_v1_empty_ledger_can_upgrade_with_empty_activation_history(self) -> None:
        legacy = legacy_state()
        legacy.update(
            {
                "active_release": None,
                "previous_release": None,
                "last_action_receipt": None,
                "releases": {},
            }
        )

        migrated = release.migrate_v1_state(
            legacy,
            "test",
            upgrade_evidence(
                activated_releases=[],
                active_release=None,
                previous_release=None,
            ),
            release.STATE_UPGRADE_CONFIRMATION,
        )

        self.assertEqual(migrated["schema_version"], release.STATE_SCHEMA_VERSION)
        self.assertEqual(migrated["activated_releases"], [])
        self.assertEqual(migrated["receipt_history"], [])

    def test_v1_upgrade_rejects_non_string_history_entries(self) -> None:
        with self.assertRaisesRegex(release.ReleaseError, "entries must be release IDs"):
            release.migrate_v1_state(
                legacy_state(),
                "test",
                upgrade_evidence(activated_releases=["release-a", {"release": "b"}]),
                release.STATE_UPGRADE_CONFIRMATION,
            )

    def test_receipt_history_is_bounded_and_keeps_the_latest_recovery_window(self) -> None:
        state = release.new_state("test")
        state["receipt_history"] = [
            {"action": "register", "state_revision": index}
            for index in range(release.MAX_RECEIPT_HISTORY_ITEMS + 3)
        ]
        release.record_action_receipt(
            state,
            {"action": "activate", "state_revision": 99},
        )

        self.assertEqual(len(state["receipt_history"]), release.MAX_RECEIPT_HISTORY_ITEMS)
        self.assertEqual(state["receipt_history"][-1]["state_revision"], 99)
        release.validate_state(state, "test")

    def test_existing_v2_state_without_history_is_readable_and_normalized(self) -> None:
        state = release.new_state("test")
        state.pop("receipt_history")

        normalized = release.validate_state(state, "test")

        self.assertEqual(normalized["receipt_history"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
