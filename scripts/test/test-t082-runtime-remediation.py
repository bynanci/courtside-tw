#!/usr/bin/env python3
"""Regression contract for the seven post-merge T082 runtime findings."""

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
