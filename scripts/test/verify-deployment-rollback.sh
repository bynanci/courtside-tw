#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTROLLER="$REPO_ROOT/infra/deployment/release.py"
DEPLOYMENT_DOC="$REPO_ROOT/docs/operations/deployment.md"
ROLLBACK_DOC="$REPO_ROOT/docs/operations/rollback.md"
API_DOCKERFILE="$REPO_ROOT/infra/docker/api.Dockerfile"
WEB_DOCKERFILE="$REPO_ROOT/infra/docker/web.Dockerfile"
ARTIFACT_DIR="${T082_ARTIFACT_DIR:-$REPO_ROOT/artifacts/deployment/t082}"

fail() {
  echo "verify-deployment-rollback: $*" >&2
  exit 1
}

for required in \
  "$CONTROLLER" \
  "$DEPLOYMENT_DOC" \
  "$ROLLBACK_DOC" \
  "$API_DOCKERFILE" \
  "$WEB_DOCKERFILE"; do
  [ -r "$required" ] || fail "missing T082 artifact: ${required#"$REPO_ROOT/"}"
done

command -v python3 >/dev/null 2>&1 || fail "python3 is required"

mkdir -p "$ARTIFACT_DIR"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

STATE="$WORK_DIR/release-state.json"
SENTINEL="t082-secret-sentinel-must-not-appear"

write_manifest() {
  local path="$1"
  local release_id="$2"
  local source_sha="$3"
  local api_digest="$4"
  local web_digest="$5"
  local target_schema="$6"
  local compatible_min="$7"
  local compatible_max="$8"
  local phase="$9"

  python3 - "$path" "$release_id" "$source_sha" "$api_digest" "$web_digest" \
    "$target_schema" "$compatible_min" "$compatible_max" "$phase" <<'PY'
import json
import sys

(
    path,
    release_id,
    source_sha,
    api_digest,
    web_digest,
    target_schema,
    compatible_min,
    compatible_max,
    phase,
) = sys.argv[1:]

with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "schema_version": 1,
            "release_id": release_id,
            "source_sha": source_sha,
            "images": {"api": api_digest, "web": web_digest},
            "database": {
                "target_schema": int(target_schema),
                "compatible_schema": {
                    "min": int(compatible_min),
                    "max": int(compatible_max),
                },
                "migration_phase": phase,
            },
        },
        handle,
        indent=2,
        sort_keys=True,
    )
    handle.write("\n")
PY
}

write_readiness() {
  local path="$1"
  local release_id="$2"
  local status="$3"

  python3 - "$path" "$release_id" "$status" <<'PY'
import json
import sys

path, release_id, status = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "schema_version": 1,
            "release_id": release_id,
            "status": status,
            "checks": [
                {"name": "api-readiness", "status": status},
                {"name": "web-readiness", "status": status},
            ],
        },
        handle,
        indent=2,
        sort_keys=True,
    )
    handle.write("\n")
PY
}

run_controller() {
  DATABASE_URL="postgresql://$SENTINEL.invalid/courtside" \
    python3 "$CONTROLLER" \
      --state "$STATE" \
      --environment test \
      --receipt "$1" \
      "${@:2}"
}

expect_failure() {
  local label="$1"
  shift
  if "$@" >"$WORK_DIR/expected-failure.log" 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  echo "verify-deployment-rollback: pass - $label rejected"
}

SOURCE_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SOURCE_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
SOURCE_C="cccccccccccccccccccccccccccccccccccccccc"
SOURCE_D="dddddddddddddddddddddddddddddddddddddddd"
DIGEST_A="registry.example.invalid/courtside-api@sha256:$(printf '1%.0s' {1..64})"
DIGEST_B="registry.example.invalid/courtside-web@sha256:$(printf '2%.0s' {1..64})"
DIGEST_C="registry.example.invalid/courtside-api@sha256:$(printf '3%.0s' {1..64})"
DIGEST_D="registry.example.invalid/courtside-web@sha256:$(printf '4%.0s' {1..64})"

write_manifest "$WORK_DIR/release-a.json" release-a "$SOURCE_A" "$DIGEST_A" "$DIGEST_B" 9 9 10 expand
write_readiness "$WORK_DIR/readiness-a.json" release-a healthy
run_controller "$WORK_DIR/register-a.json" register --manifest "$WORK_DIR/release-a.json"
run_controller "$WORK_DIR/activate-a.json" activate --release release-a --readiness "$WORK_DIR/readiness-a.json"

write_manifest "$WORK_DIR/release-b.json" release-b "$SOURCE_B" "$DIGEST_C" "$DIGEST_D" 10 9 11 migrate
write_readiness "$WORK_DIR/readiness-b.json" release-b healthy
run_controller "$WORK_DIR/register-b.json" register --manifest "$WORK_DIR/release-b.json"
run_controller "$WORK_DIR/activate-b.json" activate --release release-b --readiness "$WORK_DIR/readiness-b.json"

# Application rollback must move only the active release. The forward schema
# remains at version 10 so there is no down migration or destructive reset.
run_controller "$WORK_DIR/rollback-a.json" rollback --release release-a

python3 - "$STATE" "$WORK_DIR/rollback-a.json" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
receipt = json.load(open(sys.argv[2], encoding="utf-8"))
assert state["active_release"] == "release-a", state
assert state["database_schema_version"] == 10, state
assert receipt["active_before"] == "release-b", receipt
assert receipt["active_after"] == "release-a", receipt
assert receipt["database_schema_before"] == 10, receipt
assert receipt["database_schema_after"] == 10, receipt
assert receipt["schema_rollback_performed"] is False, receipt
assert receipt["destructive_schema_action"] is False, receipt
PY

# Re-activation succeeds because both old and candidate versions accept the
# forward schema. A repeated activation is an explicit idempotent no-op.
run_controller "$WORK_DIR/reactivate-b.json" activate --release release-b --readiness "$WORK_DIR/readiness-b.json"
run_controller "$WORK_DIR/reactivate-b-no-op.json" activate --release release-b --readiness "$WORK_DIR/readiness-b.json"
python3 - "$WORK_DIR/reactivate-b-no-op.json" <<'PY'
import json
import sys

receipt = json.load(open(sys.argv[1], encoding="utf-8"))
assert receipt["result"] == "no_op", receipt
assert receipt["active_before"] == receipt["active_after"] == "release-b", receipt
PY

# A failed or degraded candidate may never replace the last healthy release.
write_manifest "$WORK_DIR/release-c.json" release-c "$SOURCE_C" "$DIGEST_A" "$DIGEST_D" 10 10 11 expand
run_controller "$WORK_DIR/register-c.json" register --manifest "$WORK_DIR/release-c.json"
write_readiness "$WORK_DIR/readiness-c-failed.json" release-c failed
write_readiness "$WORK_DIR/readiness-c-degraded.json" release-c degraded
expect_failure "failed candidate" run_controller "$WORK_DIR/failed-c.json" activate --release release-c --readiness "$WORK_DIR/readiness-c-failed.json"
expect_failure "degraded candidate" run_controller "$WORK_DIR/degraded-c.json" activate --release release-c --readiness "$WORK_DIR/readiness-c-degraded.json"

python3 - "$STATE" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
assert state["active_release"] == "release-b", state
assert state["database_schema_version"] == 10, state
PY

# The controller refuses a contract phase while an application rollback target
# is still required, and refuses mutable image tags or an incompatible forward
# schema that the active release could not survive.
write_manifest "$WORK_DIR/release-contract.json" release-contract "$SOURCE_D" "$DIGEST_A" "$DIGEST_B" 10 10 10 contract
expect_failure "automated contract phase" run_controller "$WORK_DIR/register-contract.json" register --manifest "$WORK_DIR/release-contract.json"

write_manifest "$WORK_DIR/release-mutable.json" release-mutable "$SOURCE_D" "registry.example.invalid/api:latest" "$DIGEST_B" 10 10 10 expand
expect_failure "mutable image" run_controller "$WORK_DIR/register-mutable.json" register --manifest "$WORK_DIR/release-mutable.json"

write_manifest "$WORK_DIR/release-d.json" release-d "$SOURCE_D" "$DIGEST_A" "$DIGEST_B" 12 10 12 migrate
run_controller "$WORK_DIR/register-d.json" register --manifest "$WORK_DIR/release-d.json"
write_readiness "$WORK_DIR/readiness-d.json" release-d healthy
expect_failure "incompatible previous release" run_controller "$WORK_DIR/activate-d.json" activate --release release-d --readiness "$WORK_DIR/readiness-d.json"

# A production mutation is a protected action and must not run without the
# exact confirmation capability, even when all other inputs are valid.
expect_failure "unconfirmed production action" env -u COURTSIDE_PRODUCTION_DEPLOY_CONFIRM \
  python3 "$CONTROLLER" \
    --state "$WORK_DIR/production-state.json" \
    --environment production \
    --receipt "$WORK_DIR/production-denied.json" \
    register --manifest "$WORK_DIR/release-a.json"

python3 - "$REPO_ROOT" "$STATE" "$WORK_DIR/rollback-a.json" "$ARTIFACT_DIR/t082-deployment-rollback-receipt.json" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
state = json.load(open(sys.argv[2], encoding="utf-8"))
rollback = json.load(open(sys.argv[3], encoding="utf-8"))
output = pathlib.Path(sys.argv[4])

deployment = (root / "docs/operations/deployment.md").read_text(encoding="utf-8").lower()
rollback_doc = (root / "docs/operations/rollback.md").read_text(encoding="utf-8").lower()
for term in ("expand", "migrate", "contract", "readiness", "immutable"):
    assert term in deployment, f"deployment runbook missing {term}"
for term in ("application rollback", "forward schema", "non-destructive", "hold"):
    assert term in rollback_doc, f"rollback runbook missing {term}"

for dockerfile in (root / "infra/docker/api.Dockerfile", root / "infra/docker/web.Dockerfile"):
    text = dockerfile.read_text(encoding="utf-8")
    assert "USER 10001:10001" in text, f"{dockerfile} must use the fixed non-root identity"
    assert "COPY --chown=10001:10001" in text, f"{dockerfile} must own only copied artifacts"
    assert "ARG " in text and "RUNTIME_IMAGE" in text, f"{dockerfile} must require an approved runtime image"
    assert "PASSWORD" not in text and "TOKEN" not in text and "SECRET" not in text

receipt = {
    "schema_version": 1,
    "task": "T082",
    "environment": "isolated-test",
    "result": "pass",
    "release_ready": True,
    "active_release_after_drill": state["active_release"],
    "database_schema_after_drill": state["database_schema_version"],
    "application_rollback": {
        "from": rollback["active_before"],
        "to": rollback["active_after"],
        "database_schema_before": rollback["database_schema_before"],
        "database_schema_after": rollback["database_schema_after"],
        "schema_rollback_performed": rollback["schema_rollback_performed"],
        "destructive_schema_action": rollback["destructive_schema_action"],
    },
    "negative_paths": [
        "failed candidate rejected",
        "degraded candidate rejected",
        "mutable image rejected",
        "contract phase rejected during rollback window",
        "incompatible forward schema rejected",
        "unconfirmed production mutation rejected",
    ],
    "limitations": [
        "No production deployment or provider traffic switch was executed.",
        "Exact-head CI, Security, review-thread and protected-merge gates remain external.",
    ],
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

if grep -R --fixed-strings "$SENTINEL" "$ARTIFACT_DIR" "$WORK_DIR" --include='*.json' >/dev/null; then
  fail "receipt leaked the secret sentinel"
fi

echo "verify-deployment-rollback: PASS (isolated state machine; forward schema preserved)"
