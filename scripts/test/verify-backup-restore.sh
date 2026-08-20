SOURCE_PORT="$(compose port postgres 5432 | awk -F: 'END {print $NF}' | tr -d '\r')"
[[ "$SOURCE_PORT" =~ ^[0-9]+$ ]] || fail "unable to resolve the isolated PostgreSQL port"
SOURCE_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${SOURCE_PORT}/${POSTGRES_DB}"
SOURCE_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
BACKUP_ID="t081-$$"
SOURCE_AS_OF="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PG_DUMP_BIN="$CLIENT_BIN_DIR/pg_dump" \
PSQL_BIN="$CLIENT_BIN_DIR/psql" \
  bash "$REPO_ROOT/infra/deployment/backup/backup.sh" \
  --database-url "$SOURCE_DATABASE_URL" \
  --output-root "$ARTIFACT_DIR" \
  --backup-id "$BACKUP_ID" \
  --source-as-of "$SOURCE_AS_OF" \
  > "$ARTIFACT_DIR/backup.log"

BACKUP_DIR="$ARTIFACT_DIR/$BACKUP_ID"
[ -r "$BACKUP_DIR/manifest.json" ] || fail "backup manifest was not created"

if ISOLATED_RESTORE_CONFIRM= \
  bash "$REPO_ROOT/scripts/operations/restore-verify.sh" \
  --backup-dir "$BACKUP_DIR" \
  --restore-database-url "postgresql://invalid-isolated-target" \
  --receipt "$ARTIFACT_DIR/should-not-exist.json" \
  > /dev/null 2> "$ARTIFACT_DIR/restore-safety.log"; then
  fail "restore unexpectedly accepted an unconfirmed target"
fi
grep -q "refusing restore without ISOLATED_RESTORE_CONFIRM" "$ARTIFACT_DIR/restore-safety.log" \
  || fail "restore safety denial did not explain the required confirmation"

sql -c "CREATE DATABASE \"$RESTORE_DB_NAME\";"
RESTORE_DATABASE_CREATED=1
RESTORE_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${RESTORE_DB_NAME}"
RESTORE_RECEIPT="$ARTIFACT_DIR/restore-receipt.json"

ISOLATED_RESTORE_CONFIRM=I_UNDERSTAND_ISOLATED_TARGET \
PG_RESTORE_BIN="$CLIENT_BIN_DIR/pg_restore" \
PSQL_BIN="$CLIENT_BIN_DIR/psql" \
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
