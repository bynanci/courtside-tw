#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/compose.yaml"
ENV_FILE="\${COMPOSE_ENV_FILE:-$COMPOSE_DIR/.env.example}"
MIGRATION_FILE="$REPO_ROOT/apps/api/src/main/resources/db/migration/V001__foundation.sql"
ARTIFACT_DIR="\${T081_ARTIFACT_DIR:-$REPO_ROOT/artifacts/t081}"
PROJECT_NAME="courtside-t081-$$"
TIMEOUT_SECONDS="\${T081_TIMEOUT_SECONDS:-120}"

if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_DB="\${POSTGRES_DB:-courtside}"
POSTGRES_USER="\${POSTGRES_USER:-courtside}"
POSTGRES_PASSWORD="\${POSTGRES_PASSWORD:-courtside-local-only}"

fail() {
  echo "verify-backup-restore: $*" >&2
  exit 1
}

require_runtime() {
  command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required on the test runner"
  command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required on the test runner"
  command -v psql >/dev/null 2>&1 || fail "psql is required on the test runner"
  [ -r "$COMPOSE_FILE" ] || fail "missing Compose file: $COMPOSE_FILE"
  [ -r "$ENV_FILE" ] || fail "missing Compose env file: $ENV_FILE"
  [ -r "$MIGRATION_FILE" ] || fail "missing foundation migration: $MIGRATION_FILE"
}

compose() {
  POSTGRES_PORT=0 docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

sql() {
  compose exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' -- "$@"
}

wait_for_healthy() {
  local container elapsed health
  container="$(compose ps --quiet postgres)"
  [ -n "$container" ] || fail "Compose did not create the isolated postgres container"

  elapsed=0
  health=starting
  while [ "$elapsed" -lt "$TIMEOUT_SECONDS" ]; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container" 2>/dev/null || true)"
    if [ "$health" = healthy ]; then
      echo "verify-backup-restore: isolated postgres healthy"
      return
    fi
    if [ "$health" = unhealthy ] || [ "$health" = no-healthcheck ]; then
      compose logs --no-color --tail=80 postgres >&2 || true
      fail "postgres health check failed: $health"
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  compose logs --no-color --tail=80 postgres >&2 || true
  fail "postgres did not become healthy within \${TIMEOUT_SECONDS}s"
}

RESTORE_DB_NAME="t081_restore_$$"
RESTORE_DATABASE_CREATED=0
cleanup() {
  if [[ "$RESTORE_DATABASE_CREATED" = 1 ]]; then
    sql -c "DROP DATABASE IF EXISTS \\"$RESTORE_DB_NAME\\" WITH (FORCE);" >/dev/null 2>&1 || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_runtime
mkdir -p "$ARTIFACT_DIR"
compose config --quiet
compose up --build --detach postgres >/dev/null
wait_for_healthy

sql -f - < "$MIGRATION_FILE" >/dev/null

sql <<'SQL'
INSERT INTO media_asset (
    id, private_storage_key, checksum_sha256, mime_type, byte_size,
    width, height, alt_text, processing_state
) VALUES
(
    '00000000-0000-4000-8000-000000000801',
    'private/t081/asset-1',
    repeat('a', 64),
    'image/jpeg',
    1024,
    1200,
    800,
    'T081 asset one',
    'READY'
),
(
    '00000000-0000-4000-8000-000000000802',
    'private/t081/asset-2',
    repeat('b', 64),
    'image/png',
    2048,
    800,
    800,
    'T081 asset two',
    'READY'
);

INSERT INTO media_variant (
    id, asset_id, variant, public_storage_key, checksum_sha256,
    mime_type, byte_size, width, height
) VALUES
(
    '00000000-0000-4000-8000-000000000803',
    '00000000-0000-4000-8000-000000000801',
    'hero',
    'public/t081/asset-1/hero.avif',
    repeat('c', 64),
    'image/avif',
    512,
    1200,
    800
),
(
    '00000000-0000-4000-8000-000000000804',
    '00000000-0000-4000-8000-000000000802',
    'square',
    'public/t081/asset-2/square.webp',
    repeat('d', 64),
    'image/webp',
    1024,
    800,
    800
);
SQL

SOURCE_PORT="$(compose port postgres 5432 | awk -F: 'END {print $NF}' | tr -d '\r')"
[[ "$SOURCE_PORT" =~ ^[0-9]+$ ]] || fail "unable to resolve the isolated PostgreSQL port"
SOURCE_DATABASE_URL="postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@127.0.0.1:\${SOURCE_PORT}/\${POSTGRES_DB}"
BACKUP_ID="t081-$$"
SOURCE_AS_OF="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

bash "$REPO_ROOT/infra/deployment/backup/backup.sh" \
  --database-url "$SOURCE_DATABASE_URL" \
  --output-root "$ARTIFACT_DIR" \
  --backup-id "$BACKUP_ID" \
  --source-as-of "$SOURCE_AS_OF" \
  > "$ARTIFACT_DIR/backup.log"

BACKUP_DIR="$ARTIFACT_DIR/$BACKUP_ID"
[ -r "$BACKUP_DIR/manifest.json" ] || fail "backup manifest was not created"

sql -c "CREATE DATABASE \\"$RESTORE_DB_NAME\\";"
RESTORE_DATABASE_CREATED=1
RESTORE_DATABASE_URL="postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@127.0.0.1:\${SOURCE_PORT}/\${RESTORE_DB_NAME}"
RESTORE_RECEIPT="$ARTIFACT_DIR/restore-receipt.json"

ISOLATED_RESTORE_CONFIRM=I_UNDERSTAND_ISOLATED_TARGET \
  bash "$REPO_ROOT/scripts/operations/restore-verify.sh" \
  --backup-dir "$BACKUP_DIR" \
  --restore-database-url "$RESTORE_DATABASE_URL" \
  --receipt "$RESTORE_RECEIPT" \
  --sample-size 2 \
  > "$ARTIFACT_DIR/restore-verify.log"

python3 - "$RESTORE_RECEIPT" <<'PY'
import json
from pathlib import Path
import sys

receipt = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if receipt.get("result") != "PASS" or receipt.get("release_ready") is not True:
    raise SystemExit("T081 restore receipt is not release-ready")
if receipt.get("rpo_hours", 999) > receipt.get("rpo_limit_hours", 24):
    raise SystemExit("T081 RPO budget failed")
if receipt.get("rto_minutes", 999) > receipt.get("rto_limit_minutes", 240):
    raise SystemExit("T081 RTO budget failed")
if receipt.get("checksum_verification", {}).get("sample_size_verified") != 2:
    raise SystemExit("T081 did not verify the requested checksum sample")
print(json.dumps({
    "result": receipt["result"],
    "backup_id": receipt["backup_id"],
    "rpo_hours": receipt["rpo_hours"],
    "rto_minutes": receipt["rto_minutes"],
    "sample_size_verified": receipt["checksum_verification"]["sample_size_verified"],
}, indent=2, sort_keys=True))
PY

echo "verify-backup-restore: PASS (isolated Compose project $PROJECT_NAME; restore target removed on exit)"
