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


STATE_SCHEMA_VERSION = 1
MAX_JSON_BYTES = 64 * 1024
PRODUCTION_CONFIRMATION = "I_UNDERSTAND_PROTECTED_PRODUCTION_ACTION"
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


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.is_symlink():
        raise ReleaseError("refusing to replace a symbolic-link output")
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
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

    images = raw["images"]
    if not isinstance(images, dict):
        raise ReleaseError("images must be an object")
    require_exact_keys(images, {"api", "web"}, "images")
    for name, image in images.items():
        if not isinstance(image, str) or not IMAGE_DIGEST_PATTERN.fullmatch(image):
            raise ReleaseError(f"images.{name} must be pinned with @sha256:<64 hex>")

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


def validate_readiness(raw: dict[str, Any], release_id: str) -> int:
    require_exact_keys(
        raw,
        {"schema_version", "release_id", "status", "database_schema", "checks"},
        "readiness receipt",
    )
    if raw["schema_version"] != 1:
        raise ReleaseError("readiness schema_version must be 1")
    if raw["release_id"] != release_id:
        raise ReleaseError("readiness release_id does not match the candidate")
    status = raw["status"]
    if status not in {"healthy", "degraded", "failed"}:
        raise ReleaseError("readiness status must be healthy, degraded or failed")
    checks = raw["checks"]
    if not isinstance(checks, list) or not checks:
        raise ReleaseError("readiness checks must be a non-empty list")
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise ReleaseError(f"readiness checks[{index}] must be an object")
        require_exact_keys(check, {"name", "status"}, f"readiness checks[{index}]")
        if not isinstance(check["name"], str) or not check["name"].strip():
            raise ReleaseError(f"readiness checks[{index}].name must be non-empty")
        if check["status"] not in {"healthy", "degraded", "failed"}:
            raise ReleaseError(f"readiness checks[{index}].status is invalid")
    if status != "healthy" or any(check["status"] != "healthy" for check in checks):
        raise ReleaseError(
            f"candidate readiness is {status}; every check must be healthy before activation"
        )
    return require_integer(raw["database_schema"], "readiness database_schema")


def new_state() -> dict[str, Any]:
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "revision": 0,
        "database_schema_version": None,
        "active_release": None,
        "previous_release": None,
        "last_action_receipt": None,
        "releases": {},
    }


def validate_state(raw: dict[str, Any]) -> dict[str, Any]:
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
        "release state",
    )
    if raw["schema_version"] != STATE_SCHEMA_VERSION:
        raise ReleaseError("unsupported release state schema_version")
    require_integer(raw["revision"], "release state revision")
    database_schema = raw["database_schema_version"]
    if database_schema is not None:
        require_integer(database_schema, "release state database_schema_version")
    last_action_receipt = raw["last_action_receipt"]
    if last_action_receipt is not None and not isinstance(last_action_receipt, dict):
        raise ReleaseError("release state last_action_receipt must be an object or null")
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
    for pointer in ("active_release", "previous_release"):
        value = raw[pointer]
        if value is not None and value not in normalized_releases:
            raise ReleaseError(f"release state {pointer} points to an unknown release")
    raw["releases"] = normalized_releases
    return raw


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return new_state()
    return validate_state(read_json(path, "release state"))


def supports_schema(manifest: dict[str, Any], schema_version: int) -> bool:
    compatible = manifest["database"]["compatible_schema"]
    return compatible["min"] <= schema_version <= compatible["max"]


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
    observed_schema = validate_readiness(readiness, release_id)
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
    state: dict[str, Any], release_id: str, environment: str
) -> tuple[dict[str, Any], bool]:
    receipt = receipt_base("rollback", environment, state)
    target = state["releases"].get(release_id)
    if target is None:
        raise ReleaseError("rollback release is not registered")
    if state["active_release"] == release_id:
        receipt.update({"result": "no_op", "release_id": release_id})
        return receipt, False
    database_schema = state["database_schema_version"]
    if database_schema is None:
        raise ReleaseError("cannot roll back before an application release is active")
    if not supports_schema(target, database_schema):
        raise ReleaseError(
            "rollback release is incompatible with the forward database schema; fix forward"
        )

    active_before = state["active_release"]
    state["previous_release"] = active_before
    state["active_release"] = release_id
    state["revision"] += 1
    receipt.update(
        {
            "result": "pass",
            "release_id": release_id,
            "active_after": release_id,
            "database_schema_after": database_schema,
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
    state = new_state()
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
            state = load_state(args.state)
            changed = False
            if args.action == "register":
                manifest = validate_manifest(read_json(args.manifest, "release manifest"))
                receipt, changed = register_release(state, manifest, args.environment)
            elif args.action == "activate":
                readiness = read_json(args.readiness, "readiness receipt")
                receipt, changed = activate_release(
                    state, args.release, readiness, args.environment
                )
            elif args.action == "rollback":
                receipt, changed = rollback_release(state, args.release, args.environment)
            else:
                receipt = receipt_base("status", args.environment, state)
                receipt.update({"result": "pass", "state": state})
            if changed:
                # Keep an authoritative recovery receipt in the atomic state.
                # If the separate receipt path later fails, a retry can read the
                # completed effect instead of guessing whether it occurred.
                state["last_action_receipt"] = receipt
                atomic_write_json(args.state, state)
            atomic_write_json(args.receipt, receipt)
            print(json.dumps(receipt, sort_keys=True))
            return 0
    except ReleaseError as error:
        receipt = receipt_base(args.action, args.environment, state)
        receipt.update({"result": "blocked", "reason": str(error)})
        try:
            atomic_write_json(args.receipt, receipt)
        except ReleaseError as receipt_error:
            print(f"release.py: {receipt_error}", file=sys.stderr)
        print(f"release.py: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
