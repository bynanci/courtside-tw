#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/compose.yaml"
ENV_FILE="${COMPOSE_ENV_FILE:-$COMPOSE_DIR/.env.example}"
PROJECT_NAME="courtside-us3-remediation-$$"
TIMEOUT_SECONDS="${EDITORIAL_MIGRATION_TIMEOUT_SECONDS:-120}"

fail() {
  echo "verify-editorial-publication-migration: $*" >&2
  exit 1
}

require_runtime() {
  command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
  [ -r "$COMPOSE_FILE" ] || fail "missing Compose file: $COMPOSE_FILE"
  [ -r "$ENV_FILE" ] || fail "missing Compose env file: $ENV_FILE"
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
  [ -n "$container" ] || fail "Compose did not create an isolated postgres container"

  elapsed=0
  health=starting
  while [ "$elapsed" -lt "$TIMEOUT_SECONDS" ]; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container" 2>/dev/null || true)"
    if [ "$health" = healthy ]; then
      echo "verify-editorial-publication-migration: isolated postgres healthy"
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
  echo "verify-editorial-publication-migration: pass - $label"
}

expect_failure() {
  local label statement
  label="$1"
  statement="$2"
  if sql -c "$statement" >/dev/null 2>&1; then
    fail "$label: statement unexpectedly succeeded"
  fi
  echo "verify-editorial-publication-migration: pass - $label rejected"
}

require_runtime
trap cleanup EXIT

compose config --quiet
compose up --build --detach postgres >/dev/null
wait_for_healthy

for migration in \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V001__foundation.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V002__publication_content_core.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V003__article_contributors.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V004__editorial_publication_workflow.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V005__editorial_publication_gate_hardening.sql"; do
  [ -r "$migration" ] || fail "missing migration: $migration"
  sql -f - < "$migration"
done
echo "verify-editorial-publication-migration: V001/V002/V003/V004/V005 applied"

assert_equal "workflow tables" 6 "$(scalar "SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relname IN ('publication_review', 'publication_rights_reference', 'publication_snapshot', 'publication_job', 'publication_idempotency', 'publication_impact_link');")"
assert_equal "application review INSERT" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.publication_review', 'INSERT');")"
assert_equal "application review UPDATE" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.publication_review', 'UPDATE');")"
assert_equal "application job UPDATE" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.publication_job', 'UPDATE');")"
assert_equal "application snapshot DELETE" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.publication_snapshot', 'DELETE');")"
assert_equal "append-only triggers" 4 "$(scalar "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'publication_%_append_only';")"

sql <<'SQL'
INSERT INTO media_asset (
    id, private_storage_key, checksum_sha256, mime_type, byte_size, width, height, alt_text, processing_state
) VALUES (
    '00000000-0000-4000-8000-000000000501',
    'migration/v005/asset',
    repeat('a', 64),
    'image/jpeg',
    1,
    1,
    1,
    'Migration asset',
    'READY'
);

INSERT INTO article (id, slug) VALUES (
    '00000000-0000-4000-8000-000000000503',
    'migration-v005-article'
);

INSERT INTO article_revision (
    id, article_id, revision_number, title, dek, content_document
) VALUES (
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000503',
    1,
    'Migration article',
    'Migration fixture',
    '{}'::jsonb
);

INSERT INTO rights_record (
    id, asset_id, rights_owner, license_name, allowed_channels, territories,
    valid_from, valid_until, credit, withdrawal_terms, status, version
) VALUES (
    '00000000-0000-4000-8000-000000000506',
    '00000000-0000-4000-8000-000000000501',
    'Migration owner',
    'Migration license',
    ARRAY['PUBLIC_WEB']::text[],
    ARRAY['GLOBAL']::text[],
    '2026-08-08T00:00:00Z',
    '2026-08-10T00:00:00Z',
    'Migration credit',
    'Migration withdrawal terms',
    'VALID',
    3
);

INSERT INTO publication_snapshot (
    id, aggregate_type, aggregate_id, revision_id, snapshot_version,
    content_document, checksum_sha256, created_by
) VALUES (
    '00000000-0000-4000-8000-000000000502',
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
    1,
    '{}'::jsonb,
    repeat('b', 64),
    'migration-test'
);

INSERT INTO publication_review (
    aggregate_type, aggregate_id, revision_id, reviewer_subject, reviewer_role, decision
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
    'migration-editor',
    'EDITOR',
    'SUBMITTED'
);

INSERT INTO publication_rights_reference (
    aggregate_type, aggregate_id, revision_id, asset_id, required_channel,
    decision_code, checked_by, rights_record_id, rights_record_version
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000501',
    'PUBLIC_WEB',
    'RIGHTS_ALLOWED',
    'migration-publisher',
    '00000000-0000-4000-8000-000000000506',
    3
);

INSERT INTO publication_idempotency (
    actor_subject, operation, idempotency_key, request_hash_sha256, response
) VALUES (
    'migration-editor',
    'SUBMIT',
    'migration-v005-key',
    repeat('c', 64),
    '{"status":"ACCEPTED"}'::jsonb
);

INSERT INTO publication_job (
    aggregate_type, aggregate_id, operation, idempotency_key, requested_by, status, last_error, payload
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    'PUBLISH',
    'migration-v005-job-key',
    'migration-editor',
    'BLOCKED',
    'rights expired at execution',
    '{}'::jsonb
);

INSERT INTO publication_impact_link (
    snapshot_id, asset_id, impact_type
) VALUES (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000501',
    'CONTENT_MEDIA'
);

INSERT INTO publication_job (
    aggregate_type, aggregate_id, operation, idempotency_key, requested_by, payload
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    'PUBLISH',
    'migration-v005-job-key',
    'migration-other-actor',
    '{}'::jsonb
);

INSERT INTO publication_job (
    aggregate_type, aggregate_id, operation, idempotency_key, requested_by, payload
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    'ARCHIVE',
    'migration-v005-job-key',
    'migration-editor',
    '{}'::jsonb
);
SQL
echo "verify-editorial-publication-migration: valid workflow records accepted"

expect_failure "duplicate scoped job key" "INSERT INTO publication_job (aggregate_type, aggregate_id, operation, idempotency_key, requested_by, payload) VALUES ('ARTICLE', '00000000-0000-4000-8000-000000000503', 'PUBLISH', 'migration-v005-job-key', 'migration-editor', '{}'::jsonb);"
expect_failure "duplicate idempotency key" "INSERT INTO publication_idempotency (actor_subject, operation, idempotency_key, request_hash_sha256, response) VALUES ('migration-editor', 'SUBMIT', 'migration-v005-key', repeat('d', 64), '{}'::jsonb);"
expect_failure "article review without revision" "INSERT INTO publication_review (aggregate_type, aggregate_id, reviewer_subject, reviewer_role, decision) VALUES ('ARTICLE', '00000000-0000-4000-8000-000000000503', 'migration-editor-2', 'EDITOR', 'SUBMITTED');"
expect_failure "article review with wrong revision" "INSERT INTO publication_review (aggregate_type, aggregate_id, revision_id, reviewer_subject, reviewer_role, decision) VALUES ('ARTICLE', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000507', 'migration-editor-3', 'EDITOR', 'SUBMITTED');"
expect_failure "snapshot update" "UPDATE publication_snapshot SET checksum_sha256 = repeat('d', 64) WHERE id = '00000000-0000-4000-8000-000000000502';"
expect_failure "rights evidence update" "UPDATE publication_rights_reference SET rights_record_version = 4 WHERE aggregate_id = '00000000-0000-4000-8000-000000000503';"
expect_failure "review delete" "DELETE FROM publication_review WHERE reviewer_subject = 'migration-editor';"
expect_failure "application snapshot update" "SET ROLE courtside_app; UPDATE public.publication_snapshot SET checksum_sha256 = repeat('e', 64) WHERE id = '00000000-0000-4000-8000-000000000502';"

sql <<'SQL'
SET ROLE courtside_app;

INSERT INTO public.publication_snapshot (
    aggregate_type, aggregate_id, revision_id, snapshot_version,
    content_document, checksum_sha256, created_by
) VALUES (
    'ARTICLE',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
    2,
    '{}'::jsonb,
    repeat('e', 64),
    'application-test'
);

RESET ROLE;
SQL
echo "verify-editorial-publication-migration: application role can append snapshots"

sql -c "SET ROLE courtside_app; SELECT count(*) FROM public.publication_snapshot;" >/dev/null
echo "verify-editorial-publication-migration: application role can read workflow snapshots"

echo "verify-editorial-publication-migration: PASS (isolated Compose project $PROJECT_NAME; temporary volume will be removed)"
