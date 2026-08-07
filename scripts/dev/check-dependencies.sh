#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/compose.yaml"
ENV_FILE="${COMPOSE_ENV_FILE:-$COMPOSE_DIR/.env.example}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-courtside-tw-local}"
TIMEOUT_SECONDS="${DEPENDENCY_TIMEOUT_SECONDS:-60}"

usage() {
  cat <<'EOF'
Usage: scripts/dev/check-dependencies.sh [command]

Commands:
  check   Validate the Compose contract, start local dependencies and wait for healthy status (default)
  up      Start local dependencies and wait for healthy status
  config  Validate the Compose file and local environment without starting containers
  status  Show the current local dependency container status
  down    Stop local containers without deleting named volumes
  help    Show this help

Environment:
  COMPOSE_ENV_FILE             Optional local env file; defaults to infra/compose/.env.example
  COMPOSE_PROJECT_NAME         Compose project name; defaults to courtside-tw-local
  DEPENDENCY_TIMEOUT_SECONDS   Per-service health timeout; defaults to 60
EOF
}

fail() {
  echo "check-dependencies: $*" >&2
  exit 1
}

require_files() {
  [ -r "$COMPOSE_FILE" ] || fail "missing Compose file: $COMPOSE_FILE"
  [ -r "$ENV_FILE" ] || fail "missing local env file: $ENV_FILE"
}

require_runtime() {
  command -v docker >/dev/null 2>&1 || fail "Docker CLI is required; install Docker Desktop or a compatible Docker runtime"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
}

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

validate_config() {
  require_files
  require_runtime
  compose config --quiet
}

wait_for_healthy() {
  services="postgres s3 oidc"

  for service in $services; do
    container="$(compose ps --quiet "$service")"
    [ -n "$container" ] || fail "Compose did not create a container for service: $service"

    elapsed=0
    health="starting"
    while [ "$elapsed" -lt "$TIMEOUT_SECONDS" ]; do
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container" 2>/dev/null || true)"
      if [ "$health" = "healthy" ]; then
        echo "check-dependencies: $service healthy"
        break
      fi
      if [ "$health" = "unhealthy" ] || [ "$health" = "no-healthcheck" ]; then
        compose logs --no-color --tail=80 "$service" >&2 || true
        fail "$service health check failed: $health"
      fi
      sleep 1
      elapsed=$((elapsed + 1))
    done

    [ "$health" = "healthy" ] || {
      compose logs --no-color --tail=80 "$service" >&2 || true
      fail "$service did not become healthy within ${TIMEOUT_SECONDS}s"
    }
  done
}

start_and_wait() {
  validate_config
  compose up --detach --remove-orphans
  wait_for_healthy
  echo "check-dependencies: local PostgreSQL, S3 and OIDC dependencies are healthy"
}

command_name="${1:-check}"
[ "$#" -le 1 ] || fail "only one command may be provided"

case "$command_name" in
  check|up)
    start_and_wait
    ;;
  config)
    validate_config
    echo "check-dependencies: Compose configuration is valid"
    ;;
  status)
    require_files
    require_runtime
    compose ps
    ;;
  down)
    require_files
    require_runtime
    compose down --remove-orphans
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    fail "unknown command: $command_name"
    ;;
esac
