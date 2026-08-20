#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

fail() {
  echo "verify-backup-restore: $*" >&2
  exit 1
}

required_files=(
  "$REPO_ROOT/infra/deployment/backup/backup.sh"
  "$REPO_ROOT/infra/deployment/backup/media-metadata.sql"
  "$REPO_ROOT/scripts/operations/restore-verify.sh"
  "$REPO_ROOT/docs/operations/disaster-recovery.md"
)

for required_file in "${required_files[@]}"; do
  [ -r "$required_file" ] || fail "missing T081 implementation file: $required_file"
done

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required for the isolated restore drill"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required for the isolated restore drill"

echo "verify-backup-restore: T081 prerequisites present"
echo "verify-backup-restore: implementation contract test is intentionally RED until backup and restore verification are implemented"
