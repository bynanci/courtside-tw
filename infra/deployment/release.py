#!/usr/bin/env python3
"""Forward-only application release state for T082.

This controller records an immutable candidate, activates it only after a
healthy readiness receipt, and rolls application traffic back without issuing
database commands. Production use is deliberately guarded and still requires
the platform-specific traffic switch described in the runbook.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


STATE_SCHEMA_VERSION = 2
LEGACY_STATE_SCHEMA_VERSION = 1
MAX_JSON_BYTES = 64 * 1024
MAX_STATE_BYTES = 48 * 1024
MAX_RECEIPT_HISTORY_ITEMS = 16
SCHEMA_READBACK_MAX_AGE_SECONDS = 10 * 60
PRODUCTION_CONFIRMATION = "I_UNDERSTAND_PROTECTED_PRODUCTION_ACTION"
STATE_UPGRADE_CONFIRMATION = "I_UNDERSTAND_STATE_SCHEMA_UPGRADE"
REQUIRED_READINESS_CHECKS = frozenset(
    {"api-readiness", "worker-readiness", "public-web-readiness"}
)
RELEASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,62}$")
SOURCE_SHA_PATTERN = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
IMAGE_DIGEST_PATTERN = re.compile(
    r"^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?@sha256:[0-9a-f]{64}$"
)


class ReleaseError(Exception):
    """A safe, user-facing release-contract failure."""


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    keys = set(value)
    if keys != expected:
        missing = sorted(expected - keys)
        unexpected = sorted(keys - expected)
        raise ReleaseError(
            f"{label} keys do not match the contract; "
            f"missing={missing}, unexpected={unexpected}"
        )


def require_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ReleaseError(f"{label} must be a non-negative integer")
    return value


def read_json(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink():
        raise ReleaseError(f"{label} must not be a symbolic link")
    try:
        if path.stat().st_size > MAX_JSON_BYTES:
            raise ReleaseError(f"{label} exceeds {MAX_JSON_BYTES} bytes")
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ReleaseError(f"{label} is missing") from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleaseError(f"{label} is not readable canonical JSON") from error
    if not isinstance(parsed, dict):
        raise ReleaseError(f"{label} must be a JSON object")
    return parsed


def validate_image_map(value: Any, label: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ReleaseError(f"{label} must be an object")
    require_exact_keys(value, {"api", "web"}, label)
    normalized: dict[str, str] = {}
    for name, image in value.items():
        if not isinstance(image, str) or not IMAGE_DIGEST_PATTERN.fullmatch(image):
            raise ReleaseError(f"{label}.{name} must be pinned with @sha256:<64 hex>")
        normalized[name] = image
    return normalized


def atomic_write_json(
    path: Path,
    payload: dict[str, Any],
    label: str = "JSON output",
    max_bytes: int = MAX_JSON_BYTES,
) -> None:
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if len(serialized.encode("utf-8")) > max_bytes:
        raise ReleaseError(f"{label} exceeds {max_bytes} bytes")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.is_symlink():
        raise ReleaseError("refusing to replace a symbolic-link output")
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary.exists():
            temporary.unlink()


def validate_manifest(raw: dict[str, Any]) -> dict[str, Any]:
    require_exact_keys(
        raw,
        {"schema_version", "release_id", "source_sha", "images", "database"},
        "release manifest",
    )
    if raw["schema_version"] != 1:
        raise ReleaseError("release manifest schema_version must be 1")

    release_id = raw["release_id"]
    if not isinstance(release_id, str) or not RELEASE_ID_PATTERN.fullmatch(release_id):
        raise ReleaseError("release_id must be a bounded lowercase identifier")

    source_sha = raw["source_sha"]
    if not isinstance(source_sha, str) or not SOURCE_SHA_PATTERN.fullmatch(source_sha):
        raise ReleaseError("source_sha must be a full 40- or 64-character lowercase SHA")

    images = validate_image_map(raw["images"], "images")

    database = raw["database"]
    if not isinstance(database, dict):
        raise ReleaseError("database must be an object")
    require_exact_keys(
        database,
        {"target_schema", "compatible_schema", "migration_phase"},
        "database",
    )
    target = require_integer(database["target_schema"], "database.target_schema")
    compatible = database["compatible_schema"]
    if not isinstance(compatible, dict):
        raise ReleaseError("database.compatible_schema must be an object")
    require_exact_keys(compatible, {"min", "max"}, "database.compatible_schema")
    minimum = require_integer(compatible["min"], "database.compatible_schema.min")
    maximum = require_integer(compatible["max"], "database.compatible_schema.max")
    if not minimum <= target <= maximum:
        raise ReleaseError("target schema must fall inside the candidate compatibility range")

    phase = database["migration_phase"]
    if phase == "contract":
        raise ReleaseError(
            "contract is a later forward migration after the rollback window closes; "
            "it is never automated by this controller"
        )
    if phase not in {"expand", "migrate"}:
        raise ReleaseError("database.migration_phase must be expand or migrate")

    return {
        "schema_version": 1,
        "release_id": release_id,
        "source_sha": source_sha,
        "images": {"api": images["api"], "web": images["web"]},
        "database": {
            "target_schema": target,
            "compatible_schema": {"min": minimum, "max": maximum},
            "migration_phase": phase,
        },
    }


def validate_readiness(
    raw: dict[str, Any], candidate: dict[str, Any], expected_environment: str
) -> int:
    require_exact_keys(
        raw,
        {
            "schema_version",
            "environment",
            "release_id",
            "source_sha",
            "images",
            "status",
            "database_schema",
            "checks",
        },
        "readiness receipt",
    )
    if raw["schema_version"] != 1:
        raise ReleaseError("readiness schema_version must be 1")
    if raw["environment"] != expected_environment:
        raise ReleaseError("readiness environment does not match the target environment")
    if raw["release_id"] != candidate["release_id"]:
        raise ReleaseError("readiness release_id does not match the candidate")
    source_sha = raw["source_sha"]
    if not isinstance(source_sha, str) or not SOURCE_SHA_PATTERN.fullmatch(source_sha):
        raise ReleaseError("readiness source_sha must be a full lowercase SHA")
    if source_sha != candidate["source_sha"]:
        raise ReleaseError("readiness source_sha does not match the candidate")
    images = validate_image_map(raw["images"], "readiness images")
    if images != candidate["images"]:
        raise ReleaseError("readiness images do not match the candidate")
    status = raw["status"]
    if status not in {"healthy", "degraded", "failed"}:
        raise ReleaseError("readiness status must be healthy, degraded or failed")
    checks = raw["checks"]
    if not isinstance(checks, list) or not checks:
        raise ReleaseError("readiness checks must be a non-empty list")
    check_names: set[str] = set()
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise ReleaseError(f"readiness checks[{index}] must be an object")
        require_exact_keys(check, {"name", "status"}, f"readiness checks[{index}]")
        if not isinstance(check["name"], str) or not check["name"].strip():
            raise ReleaseError(f"readiness checks[{index}].name must be non-empty")
        if check["name"] in check_names:
            raise ReleaseError(f"readiness check {check['name']} must be unique")
        check_names.add(check["name"])
        if check["status"] not in {"healthy", "degraded", "failed"}:
            raise ReleaseError(f"readiness checks[{index}].status is invalid")
    missing_checks = sorted(REQUIRED_READINESS_CHECKS - check_names)
    if missing_checks:
        raise ReleaseError(f"readiness is missing mandatory checks: {missing_checks}")
    if status != "healthy" or any(check["status"] != "healthy" for check in checks):
        raise ReleaseError(
            f"candidate readiness is {status}; every check must be healthy before activation"
        )
    return require_integer(raw["database_schema"], "readiness database_schema")


def validate_schema_readback(
    raw: dict[str, Any], expected_environment: str
) -> tuple[int, str]:
    require_exact_keys(
        raw,
        {"schema_version", "environment", "database_schema", "observed_at"},
        "schema read-back",
    )
    if raw["schema_version"] != 1:
        raise ReleaseError("schema read-back schema_version must be 1")
    if raw["environment"] != expected_environment:
        raise ReleaseError("schema read-back environment does not match the target environment")
    observed_at = raw["observed_at"]
    if not isinstance(observed_at, str):
        raise ReleaseError("schema read-back observed_at must be an RFC3339 timestamp")
    try:
        observed_time = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ReleaseError("schema read-back observed_at must be an RFC3339 timestamp") from error
    if observed_time.tzinfo is None:
        raise ReleaseError("schema read-back observed_at must include a timezone")
    age_seconds = (datetime.now(UTC) - observed_time.astimezone(UTC)).total_seconds()
    if age_seconds < -60 or age_seconds > SCHEMA_READBACK_MAX_AGE_SECONDS:
        raise ReleaseError("schema read-back is not current")
    return (
        require_integer(raw["database_schema"], "schema read-back database_schema"),
        observed_at,
    )


def new_state(environment: str) -> dict[str, Any]:
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "environment": environment,
        "revision": 0,
        "database_schema_version": None,
        "active_release": None,
        "previous_release": None,
        "last_action_receipt": None,
        "receipt_history": [],
        "activated_releases": [],
        "releases": {},
    }


def validate_legacy_state(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate the pre-environment-bound state without treating it as safe."""

    require_exact_keys(
        raw,
        {
            "schema_version",
            "revision",
            "database_schema_version",
            "active_release",
            "previous_release",
            "last_action_receipt",
            "releases",
        },
        "legacy release state",
    )
    if raw["schema_version"] != LEGACY_STATE_SCHEMA_VERSION:
        raise ReleaseError("legacy release state schema_version must be 1")
    require_integer(raw["revision"], "legacy release state revision")
    database_schema = raw["database_schema_version"]
    if database_schema is not None:
        require_integer(database_schema, "legacy release state database_schema_version")
    last_action_receipt = raw["last_action_receipt"]
    if last_action_receipt is not None and not isinstance(last_action_receipt, dict):
        raise ReleaseError("legacy release state last_action_receipt must be an object or null")
    releases = raw["releases"]
    if not isinstance(releases, dict):
        raise ReleaseError("legacy release state releases must be an object")
    normalized_releases: dict[str, Any] = {}
    for release_id, manifest in releases.items():
        if not isinstance(manifest, dict):
            raise ReleaseError("legacy stored release manifest must be an object")
        normalized = validate_manifest(manifest)
        if normalized["release_id"] != release_id:
            raise ReleaseError("legacy stored release key does not match its release_id")
        normalized_releases[release_id] = normalized
    for pointer in ("active_release", "previous_release"):
        value = raw[pointer]
        if value is not None and (
            not isinstance(value, str) or value not in normalized_releases
        ):
            raise ReleaseError(f"legacy release state {pointer} points to an unknown release")
    raw["releases"] = normalized_releases
    return raw


def validate_upgrade_evidence(
    raw: dict[str, Any], legacy: dict[str, Any], expected_environment: str
) -> dict[str, Any]:
    require_exact_keys(
        raw,
        {
            "schema_version",
            "environment",
            "activated_releases",
            "active_release",
            "previous_release",
        },
        "state upgrade evidence",
    )
    if raw["schema_version"] != LEGACY_STATE_SCHEMA_VERSION:
        raise ReleaseError("state upgrade evidence schema_version must be 1")
    if raw["environment"] != expected_environment:
        raise ReleaseError("state upgrade evidence environment does not match the target environment")
    activated_releases = raw["activated_releases"]
    if not isinstance(activated_releases, list):
        raise ReleaseError("state upgrade activation history must be a list")
    if any(not isinstance(release_id, str) for release_id in activated_releases):
        raise ReleaseError("state upgrade activation history entries must be release IDs")
    if len(activated_releases) != len(set(activated_releases)):
        raise ReleaseError("state upgrade activation history must be unique")
    if not activated_releases and (
        legacy["active_release"] is not None or legacy["previous_release"] is not None
    ):
        raise ReleaseError(
            "state upgrade activation history cannot be empty when legacy pointers exist"
        )
    known_releases = set(legacy["releases"])
    for release_id in activated_releases:
        if release_id not in known_releases:
            raise ReleaseError("state upgrade activation history points to an unknown release")
    for pointer in ("active_release", "previous_release"):
        value = raw[pointer]
        if value is not None and value not in activated_releases:
            raise ReleaseError(
                f"state upgrade activation history does not contain {pointer}"
            )
        if value != legacy[pointer]:
            raise ReleaseError(
                f"state upgrade {pointer} does not match the legacy release state"
            )
    return {
        "schema_version": LEGACY_STATE_SCHEMA_VERSION,
        "environment": expected_environment,
        "activated_releases": list(activated_releases),
        "active_release": raw["active_release"],
        "previous_release": raw["previous_release"],
    }


def migrate_v1_state(
    raw: dict[str, Any],
    expected_environment: str,
    upgrade_evidence: dict[str, Any],
    confirmation: str,
) -> dict[str, Any]:
    """Convert a v1 ledger only with explicit environment and history evidence."""

    if confirmation != STATE_UPGRADE_CONFIRMATION:
        raise ReleaseError("state upgrade requires the exact operator confirmation")
    legacy = validate_legacy_state(json.loads(json.dumps(raw)))
    evidence = validate_upgrade_evidence(upgrade_evidence, legacy, expected_environment)
    legacy_receipt = legacy["last_action_receipt"]
    if isinstance(legacy_receipt, dict):
        if legacy_receipt.get("environment") != expected_environment:
            raise ReleaseError("legacy action receipt environment does not match the target environment")
    migrated = new_state(expected_environment)
    migrated.update(
        {
            "revision": legacy["revision"],
            "database_schema_version": legacy["database_schema_version"],
            "active_release": evidence["active_release"],
            "previous_release": evidence["previous_release"],
            "last_action_receipt": legacy_receipt,
            "receipt_history": [legacy_receipt] if isinstance(legacy_receipt, dict) else [],
            "activated_releases": evidence["activated_releases"],
            "releases": legacy["releases"],
        }
    )
    return validate_state(migrated, expected_environment)


def validate_state(
    raw: dict[str, Any], expected_environment: str
) -> dict[str, Any]:
    required_keys = {
        "schema_version",
        "environment",
        "revision",
        "database_schema_version",
        "active_release",
        "previous_release",
        "last_action_receipt",
        "activated_releases",
        "releases",
    }
    optional_keys = {"receipt_history"}
    if set(raw) not in (required_keys, required_keys | optional_keys):
        missing = sorted(required_keys - set(raw))
        unexpected = sorted(set(raw) - required_keys - optional_keys)
        raise ReleaseError(
            "release state keys do not match the contract; "
            f"missing={missing}, unexpected={unexpected}"
        )
    if raw["schema_version"] != STATE_SCHEMA_VERSION:
        raise ReleaseError("unsupported release state schema_version")
    if raw["environment"] != expected_environment:
        raise ReleaseError("release state environment does not match the target environment")
    require_integer(raw["revision"], "release state revision")
    database_schema = raw["database_schema_version"]
    if database_schema is not None:
        require_integer(database_schema, "release state database_schema_version")
    last_action_receipt = raw["last_action_receipt"]
    if last_action_receipt is not None and not isinstance(last_action_receipt, dict):
        raise ReleaseError("release state last_action_receipt must be an object or null")
    receipt_history = raw.get("receipt_history", [])
    if not isinstance(receipt_history, list):
        raise ReleaseError("release state receipt_history must be a list")
    if len(receipt_history) > MAX_RECEIPT_HISTORY_ITEMS:
        raise ReleaseError(
            f"release state receipt_history exceeds {MAX_RECEIPT_HISTORY_ITEMS} entries"
        )
    if any(not isinstance(receipt, dict) for receipt in receipt_history):
        raise ReleaseError("release state receipt_history entries must be objects")
    raw["receipt_history"] = receipt_history
    releases = raw["releases"]
    if not isinstance(releases, dict):
        raise ReleaseError("release state releases must be an object")
    normalized_releases: dict[str, Any] = {}
    for release_id, manifest in releases.items():
        if not isinstance(manifest, dict):
            raise ReleaseError("stored release manifest must be an object")
        normalized = validate_manifest(manifest)
        if normalized["release_id"] != release_id:
            raise ReleaseError("stored release key does not match its release_id")
        normalized_releases[release_id] = normalized
    activated_releases = raw["activated_releases"]
    if not isinstance(activated_releases, list):
        raise ReleaseError("release state activated_releases must be a list")
    for release_id in activated_releases:
        if not isinstance(release_id, str) or release_id not in normalized_releases:
            raise ReleaseError("release state activated_releases points to an unknown release")
    if len(activated_releases) != len(set(activated_releases)):
        raise ReleaseError("release state activated_releases must be unique")
    for pointer in ("active_release", "previous_release"):
        value = raw[pointer]
        if value is not None and (
            not isinstance(value, str) or value not in normalized_releases
        ):
            raise ReleaseError(f"release state {pointer} points to an unknown release")
        if value is not None and value not in activated_releases:
            raise ReleaseError(
                f"release state {pointer} was not previously activated healthy"
            )
    raw["releases"] = normalized_releases
    return raw


def load_state(path: Path, expected_environment: str) -> dict[str, Any]:
    if not path.exists():
        return new_state(expected_environment)
    raw = read_json(path, "release state")
    if raw.get("schema_version") == LEGACY_STATE_SCHEMA_VERSION:
        raise ReleaseError(
            "release state schema v1 requires an explicit environment-bound upgrade-state command"
        )
    return validate_state(raw, expected_environment)


def supports_schema(manifest: dict[str, Any], schema_version: int) -> bool:
    compatible = manifest["database"]["compatible_schema"]
    return compatible["min"] <= schema_version <= compatible["max"]


def record_action_receipt(state: dict[str, Any], receipt: dict[str, Any]) -> None:
    """Keep the latest receipt plus a bounded, oldest-first recovery history."""

    previous = state.get("last_action_receipt")
    history = list(state.get("receipt_history", []))
    if isinstance(previous, dict) and (not history or history[-1] != previous):
        history.append(previous)
    if not history or history[-1] != receipt:
        history.append(receipt)
    state["receipt_history"] = history[-MAX_RECEIPT_HISTORY_ITEMS:]
    state["last_action_receipt"] = receipt


def receipt_base(action: str, environment: str, state: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "task": "T082",
        "action": action,
        "environment": environment,
        "observed_at": utc_now(),
        "active_before": state.get("active_release"),
        "active_after": state.get("active_release"),
        "database_schema_before": state.get("database_schema_version"),
        "database_schema_after": state.get("database_schema_version"),
        "schema_rollback_performed": False,
        "destructive_schema_action": False,
        "state_revision": state.get("revision", 0),
    }


def register_release(
    state: dict[str, Any], manifest: dict[str, Any], environment: str
) -> tuple[dict[str, Any], bool]:
    receipt = receipt_base("register", environment, state)
    release_id = manifest["release_id"]
    existing = state["releases"].get(release_id)
    if existing is not None:
        if existing != manifest:
            raise ReleaseError("release_id is already bound to different immutable inputs")
        receipt.update({"result": "no_op", "release_id": release_id})
        return receipt, False
    state["releases"][release_id] = manifest
    state["revision"] += 1
    receipt.update(
        {
            "result": "pass",
            "release_id": release_id,
            "source_sha": manifest["source_sha"],
            "image_digests": manifest["images"],
            "state_revision": state["revision"],
        }
    )
    return receipt, True


def activate_release(
    state: dict[str, Any], release_id: str, readiness: dict[str, Any], environment: str
) -> tuple[dict[str, Any], bool]:
    receipt = receipt_base("activate", environment, state)
    candidate = state["releases"].get(release_id)
    if candidate is None:
        raise ReleaseError("candidate release is not registered")
    observed_schema = validate_readiness(readiness, candidate, environment)
    if state["active_release"] == release_id:
        receipt.update({"result": "no_op", "release_id": release_id})
        return receipt, False

    database_before = state["database_schema_version"]
    target_schema = candidate["database"]["target_schema"]
    if observed_schema != target_schema:
        raise ReleaseError("readiness database schema does not match the release target")
    if database_before is not None:
        if target_schema < database_before:
            raise ReleaseError("candidate would require a database down migration")
        if not supports_schema(candidate, database_before):
            raise ReleaseError("candidate does not support the current database schema")

    active_id = state["active_release"]
    if active_id is not None:
        active = state["releases"][active_id]
        if not supports_schema(active, observed_schema):
            raise ReleaseError(
                "active release would not survive the candidate forward schema; "
                "expand compatibility before activation"
            )

    database_after = observed_schema
    state["previous_release"] = active_id
    state["active_release"] = release_id
    state["database_schema_version"] = database_after
    if release_id not in state["activated_releases"]:
        state["activated_releases"].append(release_id)
    state["revision"] += 1
    receipt.update(
        {
            "result": "pass",
            "release_id": release_id,
            "active_after": release_id,
            "database_schema_after": database_after,
            "state_revision": state["revision"],
        }
    )
    return receipt, True


def rollback_release(
    state: dict[str, Any],
    release_id: str,
    environment: str,
    schema_readback: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    receipt = receipt_base("rollback", environment, state)
    target = state["releases"].get(release_id)
    if target is None:
        raise ReleaseError("rollback release is not registered")
    if release_id not in state["activated_releases"]:
        raise ReleaseError("rollback release was not previously activated healthy")
    observed_schema, observed_at = validate_schema_readback(
        schema_readback, environment
    )
    recorded_schema = state["database_schema_version"]
    if recorded_schema is None:
        raise ReleaseError("cannot roll back before an application release is active")
    if observed_schema < recorded_schema:
        raise ReleaseError("live schema is behind the recorded forward database schema")
    if not supports_schema(target, observed_schema):
        raise ReleaseError(
            "rollback release is incompatible with the forward database schema; fix forward"
        )
    receipt.update(
        {
            "database_schema_before": observed_schema,
            "database_schema_after": observed_schema,
            "schema_readback_observed_at": observed_at,
        }
    )
    if state["active_release"] == release_id:
        if recorded_schema == observed_schema:
            receipt.update({"result": "no_op", "release_id": release_id})
            return receipt, False
        state["database_schema_version"] = observed_schema
        state["revision"] += 1
        receipt.update(
            {
                "result": "pass",
                "effect": "schema_readback_reconciled",
                "release_id": release_id,
                "state_revision": state["revision"],
            }
        )
        return receipt, True

    active_before = state["active_release"]
    state["previous_release"] = active_before
    state["active_release"] = release_id
    state["database_schema_version"] = observed_schema
    state["revision"] += 1
    receipt.update(
        {
            "result": "pass",
            "release_id": release_id,
            "active_after": release_id,
            "database_schema_after": observed_schema,
            "state_revision": state["revision"],
        }
    )
    return receipt, True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument(
        "--environment", choices=("test", "staging", "production"), required=True
    )
    commands = parser.add_subparsers(dest="action", required=True)

    register = commands.add_parser("register", help="Register immutable release inputs")
    register.add_argument("--manifest", type=Path, required=True)

    activate = commands.add_parser("activate", help="Activate one healthy candidate")
    activate.add_argument("--release", required=True)
    activate.add_argument("--readiness", type=Path, required=True)

    rollback = commands.add_parser("rollback", help="Roll application traffic back")
    rollback.add_argument("--release", required=True)
    rollback.add_argument("--schema-readback", type=Path, required=True)

    upgrade = commands.add_parser(
        "upgrade-state",
        help="Upgrade a v1 ledger with explicit environment and activation evidence",
    )
    upgrade.add_argument("--activation-history", type=Path, required=True)
    upgrade.add_argument("--confirmation", required=True)

    commands.add_parser("status", help="Read the release state without mutation")
    return parser.parse_args()


def require_production_confirmation(environment: str, action: str) -> None:
    if action == "status" or environment != "production":
        return
    if os.environ.get("COURTSIDE_PRODUCTION_DEPLOY_CONFIRM") != PRODUCTION_CONFIRMATION:
        raise ReleaseError(
            "production mutation requires the exact short-lived operator confirmation"
        )


def main() -> int:
    args = parse_args()
    state = new_state(args.environment)
    if args.state.resolve() == args.receipt.resolve():
        print("release.py: state and receipt paths must differ", file=sys.stderr)
        return 2

    lock_path = args.state.with_suffix(f"{args.state.suffix}.lock")
    try:
        require_production_confirmation(args.environment, args.action)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        if lock_path.is_symlink():
            raise ReleaseError("release-state lock must not be a symbolic link")
        with lock_path.open("a+", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            changed = False
            if args.action == "upgrade-state":
                legacy = read_json(args.state, "legacy release state")
                evidence = read_json(args.activation_history, "state upgrade evidence")
                state = migrate_v1_state(
                    legacy,
                    args.environment,
                    evidence,
                    args.confirmation,
                )
                state["revision"] += 1
                receipt = receipt_base("upgrade-state", args.environment, state)
                receipt.update(
                    {
                        "result": "pass",
                        "from_schema_version": LEGACY_STATE_SCHEMA_VERSION,
                        "to_schema_version": STATE_SCHEMA_VERSION,
                        "active_after": state["active_release"],
                        "state_revision": state["revision"],
                    }
                )
                record_action_receipt(state, receipt)
                changed = True
            else:
                state = load_state(args.state, args.environment)
            if args.action == "register":
                manifest = validate_manifest(read_json(args.manifest, "release manifest"))
                receipt, changed = register_release(state, manifest, args.environment)
            elif args.action == "activate":
                readiness = read_json(args.readiness, "readiness receipt")
                receipt, changed = activate_release(
                    state, args.release, readiness, args.environment
                )
            elif args.action == "rollback":
                schema_readback = read_json(args.schema_readback, "schema read-back")
                receipt, changed = rollback_release(
                    state,
                    args.release,
                    args.environment,
                    schema_readback,
                )
            else:
                if args.action == "status":
                    receipt = receipt_base("status", args.environment, state)
                    receipt.update({"result": "pass", "state": state})
            if changed:
                # Keep an authoritative recovery receipt in the atomic state.
                # If the separate receipt path later fails, a retry can read the
                # completed effect instead of guessing whether it occurred.
                if args.action != "upgrade-state":
                    record_action_receipt(state, receipt)
                atomic_write_json(
                    args.state,
                    state,
                    label="release state",
                    max_bytes=MAX_STATE_BYTES,
                )
            atomic_write_json(args.receipt, receipt, label="release receipt")
            print(json.dumps(receipt, sort_keys=True))
            return 0
    except ReleaseError as error:
        receipt = receipt_base(args.action, args.environment, state)
        receipt.update({"result": "blocked", "reason": str(error)})
        try:
            atomic_write_json(args.receipt, receipt, label="release receipt")
        except ReleaseError as receipt_error:
            print(f"release.py: {receipt_error}", file=sys.stderr)
        print(f"release.py: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
