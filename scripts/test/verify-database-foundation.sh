#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/compose.yaml"
ENV_FILE="${COMPOSE_ENV_FILE:-$COMPOSE_DIR/.env.example}"
MIGRATION_FILE="$REPO_ROOT/apps/api/src/main/resources/db/migration/V001__foundation.sql"
PROJECT_NAME="courtside-t013-$$"
TIMEOUT_SECONDS="${T013_TIMEOUT_SECONDS:-120}"

fail() {
  echo "verify-database-foundation: $*" >&2
  exit 1
}

require_runtime() {
  command -v docker >/dev/null 2>&1 || fail "Docker CLI is required for the PostgreSQL integration test"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required for the PostgreSQL integration test"
  [ -r "$COMPOSE_FILE" ] || fail "missing Compose file: $COMPOSE_FILE"
  [ -r "$ENV_FILE" ] || fail "missing Compose env file: $ENV_FILE"
  [ -r "$MIGRATION_FILE" ] || fail "missing T013 migration: $MIGRATION_FILE"
}

compose() {
  POSTGRES_PORT=0 docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
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
      echo "verify-database-foundation: isolated postgres healthy"
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
  fail "postgres did not become healthy within ${TIMEOUT_SECONDS}s"
}

sql() {
  compose exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' -- "$@"
}

scalar() {
  sql -Atqc "$1" | tr -d '\r\n'
}

assert_equal() {
  local label expected actual
  label="$1"
  expected="$2"
  actual="$3"
  [ "$actual" = "$expected" ] || fail "$label: expected '$expected', got '$actual'"
  echo "verify-database-foundation: pass - $label"
}

expect_failure() {
  local label statement
  label="$1"
  statement="$2"
  if sql -c "$statement" >/dev/null 2>&1; then
    fail "$label: statement unexpectedly succeeded"
  fi
  echo "verify-database-foundation: pass - $label rejected"
}

require_runtime
trap cleanup EXIT

compose config --quiet
compose up --build --detach postgres >/dev/null
wait_for_healthy

sql -f - < "$MIGRATION_FILE" >/dev/null
echo "verify-database-foundation: V001 applied"

assert_equal "pgcrypto extension" t "$(scalar "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto');")"
assert_equal "native UUIDv7 default" 7 "$(scalar "SELECT substring(uuidv7()::text, 15, 1);")"
assert_equal "foundation tables" 7 "$(scalar "SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relname IN ('reader_profile', 'role_assignment', 'media_asset', 'media_variant', 'rights_record', 'audit_event', 'outbox_event');")"
assert_equal "audit table owner" courtside_audit_owner "$(scalar "SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'audit_event';")"
assert_equal "application audit SELECT privilege" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.audit_event', 'SELECT');")"
assert_equal "application audit INSERT privilege" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.audit_event', 'INSERT');")"
assert_equal "application audit UPDATE privilege" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.audit_event', 'UPDATE');")"
assert_equal "application audit DELETE privilege" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.audit_event', 'DELETE');")"
assert_equal "application audit TRUNCATE privilege" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.audit_event', 'TRUNCATE');")"

sql <<'SQL'
INSERT INTO reader_profile (id, issuer, subject)
VALUES ('00000000-0000-4000-8000-000000000001', 'https://issuer.example.test', 'reader-1');

INSERT INTO role_assignment (id, reader_id, role_code, granted_by)
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'READER', 'system:test');

INSERT INTO media_asset (
    id, private_storage_key, checksum_sha256, mime_type, byte_size, width, height,
    alt_text, processing_state, created_by
)
VALUES (
    '00000000-0000-4000-8000-000000000003',
    'private/originals/asset-1',
    repeat('a', 64),
    'image/jpeg',
    1024,
    1200,
    800,
    'Test image',
    'READY',
    '00000000-0000-4000-8000-000000000001'
);

INSERT INTO media_variant (
    id, asset_id, variant, public_storage_key, checksum_sha256, mime_type, byte_size, width, height
)
VALUES (
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000003',
    'hero',
    'public/variants/asset-1/hero.avif',
    repeat('b', 64),
    'image/avif',
    512,
    1200,
    800
);

INSERT INTO rights_record (
    id, asset_id, rights_owner, license_name, allowed_channels, valid_from,
    valid_until, credit, withdrawal_terms, status
)
VALUES (
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000003',
    'Courtside test rights owner',
    'TEST-LICENSE',
    ARRAY['PUBLIC_WEB', 'OFFLINE'],
    now(),
    now() + interval '1 year',
    'Courtside test credit',
    'Withdraw on written rights-owner request',
    'VALID'
);

INSERT INTO outbox_event (
    id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
)
VALUES (
    '00000000-0000-4000-8000-000000000006',
    'media.asset.ready',
    'media_asset',
    '00000000-0000-4000-8000-000000000003',
    't013:test:asset-ready',
    '{"assetId":"00000000-0000-4000-8000-000000000003"}'::jsonb
);

INSERT INTO audit_event (
    id, actor_type, actor_subject, action, target_type, target_id, request_id, metadata
)
VALUES (
    '00000000-0000-4000-8000-000000000007',
    'SYSTEM',
    'system:t013-test',
    'FOUNDATION_TEST',
    'media_asset',
    '00000000-0000-4000-8000-000000000003',
    'request:t013-test',
    '{"fixture":"valid"}'::jsonb
);
SQL
echo "verify-database-foundation: valid identity/media/rights/outbox/audit rows accepted"

expect_failure "duplicate OIDC issuer/subject" "INSERT INTO reader_profile (issuer, subject) VALUES ('https://issuer.example.test', 'reader-1');"
expect_failure "duplicate active role assignment" "INSERT INTO role_assignment (reader_id, role_code) VALUES ('00000000-0000-4000-8000-000000000001', 'READER');"
expect_failure "invalid media MIME" "INSERT INTO media_asset (private_storage_key, checksum_sha256, mime_type, byte_size) VALUES ('private/originals/bad', repeat('c', 64), 'application/pdf', 10);"
expect_failure "partially specified media dimensions" "INSERT INTO media_asset (private_storage_key, checksum_sha256, mime_type, byte_size, width) VALUES ('private/originals/partial-dimensions', repeat('e', 64), 'image/jpeg', 10, 1);"
expect_failure "invalid rights channel" "INSERT INTO rights_record (asset_id, rights_owner, license_name, allowed_channels, valid_from, valid_until, credit, withdrawal_terms) VALUES ('00000000-0000-4000-8000-000000000003', 'owner', 'license', ARRAY['UNKNOWN'], now(), now() + interval '1 day', 'credit', 'terms');"
expect_failure "invalid rights validity window" "INSERT INTO rights_record (asset_id, rights_owner, license_name, allowed_channels, valid_from, valid_until, credit, withdrawal_terms) VALUES ('00000000-0000-4000-8000-000000000003', 'owner', 'license', ARRAY['PUBLIC_WEB'], now(), now() - interval '1 second', 'credit', 'terms');"
expect_failure "duplicate media variant" "INSERT INTO media_variant (asset_id, variant, public_storage_key, checksum_sha256, mime_type, byte_size, width, height) VALUES ('00000000-0000-4000-8000-000000000003', 'hero', 'public/variants/asset-1/hero-duplicate.avif', repeat('d', 64), 'image/avif', 10, 1, 1);"
expect_failure "duplicate outbox idempotency key" "INSERT INTO outbox_event (event_type, aggregate_type, aggregate_id, idempotency_key, payload) VALUES ('media.asset.ready', 'media_asset', '00000000-0000-4000-8000-000000000003', 't013:test:asset-ready', '{}'::jsonb);"
expect_failure "non-object audit metadata" "INSERT INTO audit_event (actor_type, actor_subject, action, target_type, metadata) VALUES ('SYSTEM', 'system:t013-test', 'BAD_METADATA', 'test', '[]'::jsonb);"

sql <<'SQL'
SET ROLE courtside_app;
INSERT INTO audit_event (
    id, actor_type, actor_subject, action, target_type, target_id, metadata
)
VALUES (
    '00000000-0000-4000-8000-000000000008',
    'SERVICE',
    'service:t013-test',
    'APPEND_ONLY_PROBE',
    'media_asset',
    '00000000-0000-4000-8000-000000000003',
    '{"fixture":"application-role"}'::jsonb
);
SQL
echo "verify-database-foundation: application role can append audit events"

expect_failure "application audit UPDATE" "SET ROLE courtside_app; UPDATE public.audit_event SET action = 'TAMPERED' WHERE id = '00000000-0000-4000-8000-000000000007';"
expect_failure "application audit DELETE" "SET ROLE courtside_app; DELETE FROM public.audit_event WHERE id = '00000000-0000-4000-8000-000000000007';"
expect_failure "application audit TRUNCATE" "SET ROLE courtside_app; TRUNCATE public.audit_event;"
assert_equal "append-only audit rows retained" 2 "$(scalar "SELECT count(*) FROM audit_event WHERE action IN ('FOUNDATION_TEST', 'APPEND_ONLY_PROBE');")"

echo "verify-database-foundation: PASS (isolated Compose project $PROJECT_NAME; temporary volume will be removed)"
