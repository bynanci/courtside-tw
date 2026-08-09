#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/compose.yaml"
ENV_FILE="${COMPOSE_ENV_FILE:-$COMPOSE_DIR/.env.example}"
PROJECT_NAME="courtside-v003-$$"
TIMEOUT_SECONDS="${V003_TIMEOUT_SECONDS:-120}"

fail() {
  echo "verify-article-contributors-migration: $*" >&2
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
      echo "verify-article-contributors-migration: isolated postgres healthy"
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
  echo "verify-article-contributors-migration: pass - $label"
}

expect_failure() {
  local label statement
  label="$1"
  statement="$2"
  if sql -c "$statement" >/dev/null 2>&1; then
    fail "$label: statement unexpectedly succeeded"
  fi
  echo "verify-article-contributors-migration: pass - $label rejected"
}

require_runtime
trap cleanup EXIT

compose config --quiet
compose up --build --detach postgres >/dev/null
wait_for_healthy

for migration in \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V001__foundation.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V002__publication_content_core.sql" \
  "$REPO_ROOT/apps/api/src/main/resources/db/migration/V003__article_contributors.sql"; do
  [ -r "$migration" ] || fail "missing migration: $migration"
  sql -f - < "$migration"
done
echo "verify-article-contributors-migration: V001/V002/V003 applied"

assert_equal "contributor tables" 2 "$(scalar "SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relname IN ('contributor', 'article_contributor');")"
assert_equal "application contributor SELECT" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.contributor', 'SELECT');")"
assert_equal "application contributor INSERT" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.contributor', 'INSERT');")"
assert_equal "application contributor UPDATE" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.contributor', 'UPDATE');")"
assert_equal "application article_contributor SELECT" t "$(scalar "SELECT has_table_privilege('courtside_app', 'public.article_contributor', 'SELECT');")"
assert_equal "application article_contributor INSERT" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.article_contributor', 'INSERT');")"
assert_equal "application article_contributor UPDATE" f "$(scalar "SELECT has_table_privilege('courtside_app', 'public.article_contributor', 'UPDATE');")"

sql <<'SQL'
INSERT INTO article (id, slug, state)
VALUES ('00000000-0000-4000-8000-000000000101', 'migration-article', 'DRAFT');

INSERT INTO article_revision (
    id, article_id, revision_number, title, dek, content_document, state
) VALUES (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000101',
    1,
    'Migration Article',
    '',
    '{}'::jsonb,
    'DRAFT'
);

INSERT INTO contributor (
    id, slug, display_name
) VALUES (
    '00000000-0000-4000-8000-000000000103',
    'migration-contributor',
    'Migration Contributor'
);

INSERT INTO article_contributor (
    id, article_revision_id, contributor_id, role, position
) VALUES (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
    'AUTHOR',
    1
);
SQL
echo "verify-article-contributors-migration: valid contributor binding accepted"

expect_failure "invalid contributor slug" "INSERT INTO contributor (slug, display_name) VALUES ('Invalid Slug', 'Invalid');"
expect_failure "control character in display name" "INSERT INTO contributor (slug, display_name) VALUES ('control-name', E'Bad\\nName');"
expect_failure "invalid contributor role" "INSERT INTO article_contributor (article_revision_id, contributor_id, role, position) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103', 'WRITER', 2);"
expect_failure "non-positive contributor position" "INSERT INTO article_contributor (article_revision_id, contributor_id, role, position) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103', 'EDITOR', 0);"
expect_failure "duplicate revision position" "INSERT INTO article_contributor (article_revision_id, contributor_id, role, position) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103', 'EDITOR', 1);"
expect_failure "duplicate revision person role" "INSERT INTO article_contributor (article_revision_id, contributor_id, role, position) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103', 'AUTHOR', 2);"
expect_failure "application contributor INSERT" "SET ROLE courtside_app; INSERT INTO public.contributor (slug, display_name) VALUES ('blocked-write', 'Blocked');"
expect_failure "application contributor UPDATE" "SET ROLE courtside_app; UPDATE public.contributor SET display_name = 'Tampered' WHERE id = '00000000-0000-4000-8000-000000000103';"
expect_failure "application article_contributor INSERT" "SET ROLE courtside_app; INSERT INTO public.article_contributor (article_revision_id, contributor_id, role, position) VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103', 'EDITOR', 2);"
expect_failure "application article_contributor UPDATE" "SET ROLE courtside_app; UPDATE public.article_contributor SET role = 'EDITOR' WHERE id = '00000000-0000-4000-8000-000000000104';"

sql -c "SET ROLE courtside_app; SELECT count(*) FROM public.contributor;" >/dev/null
echo "verify-article-contributors-migration: application role can read contributor source"

echo "verify-article-contributors-migration: PASS (isolated Compose project $PROJECT_NAME; temporary volume will be removed)"
