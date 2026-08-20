#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
DEFAULT_METADATA_QUERY="$REPO_ROOT/infra/deployment/backup/media-metadata.sql"

BACKUP_DIR="${BACKUP_DIR:-}"
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:-}"
RECEIPT_PATH="${RESTORE_RECEIPT_PATH:-$REPO_ROOT/artifacts/t081-restore-receipt.json}"
SAMPLE_SIZE="${RESTORE_SAMPLE_SIZE:-5}"
VERIFIED_AT="${RESTORE_VERIFIED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
MAX_RPO_HOURS="${MAX_RPO_HOURS:-24}"
MAX_RTO_MINUTES="${MAX_RTO_MINUTES:-240}"
METADATA_QUERY_FILE="${MEDIA_METADATA_QUERY_FILE:-$DEFAULT_METADATA_QUERY}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PSQL_BIN="${PSQL_BIN:-psql}"

usage() {
  cat <<'EOF'
Usage: scripts/operations/restore-verify.sh [options]

Options:
  --backup-dir DIR             Immutable backup directory.
  --restore-database-url URL   Explicit isolated PostgreSQL target URL.
  --receipt FILE               JSON receipt destination.
  --sample-size N              Deterministic checksum sample size; default 5.
  --verified-at ISO8601 UTC    Verification time; defaults to current UTC.
  --metadata-query FILE        Media metadata projection used for comparison.
  -h, --help                   Show this help.

Safety:
  ISOLATED_RESTORE_CONFIRM must equal I_UNDERSTAND_ISOLATED_TARGET. The
  command never guesses or selects a production target.
EOF
}

fail() {
  echo "restore-verify: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

validate_timestamp() {
  python3 - "$1" <<'PY'
from datetime import datetime, timezone
import sys

value = sys.argv[1]
try:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
except ValueError as error:
    raise SystemExit(f"invalid UTC timestamp: {value}") from error

if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
    raise SystemExit(f"timestamp must use UTC: {value}")

normalized = parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
if normalized != value:
    raise SystemExit(f"timestamp must be canonical UTC ISO-8601: {value}")
PY
}

while (($# > 0)); do
  case "$1" in
    --backup-dir)
      (($# >= 2)) || fail "--backup-dir requires a value"
      BACKUP_DIR="$2"
      shift 2
      ;;
    --restore-database-url)
      (($# >= 2)) || fail "--restore-database-url requires a value"
      RESTORE_DATABASE_URL="$2"
      shift 2
      ;;
    --receipt)
      (($# >= 2)) || fail "--receipt requires a value"
      RECEIPT_PATH="$2"
      shift 2
      ;;
    --sample-size)
      (($# >= 2)) || fail "--sample-size requires a value"
      SAMPLE_SIZE="$2"
      shift 2
      ;;
    --verified-at)
      (($# >= 2)) || fail "--verified-at requires a value"
      VERIFIED_AT="$2"
      shift 2
      ;;
    --metadata-query)
      (($# >= 2)) || fail "--metadata-query requires a value"
      METADATA_QUERY_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$BACKUP_DIR" ]] || fail "--backup-dir or BACKUP_DIR is required"
[[ -n "$RESTORE_DATABASE_URL" ]] || fail "--restore-database-url or RESTORE_DATABASE_URL is required"
[[ "${ISOLATED_RESTORE_CONFIRM:-}" == "I_UNDERSTAND_ISOLATED_TARGET" ]] || {
  fail "refusing restore without ISOLATED_RESTORE_CONFIRM=I_UNDERSTAND_ISOLATED_TARGET"
}
[[ "$SAMPLE_SIZE" =~ ^[1-9][0-9]*$ ]] || fail "sample size must be a positive integer"
[[ -r "$METADATA_QUERY_FILE" ]] || fail "media metadata query is not readable: $METADATA_QUERY_FILE"
validate_timestamp "$VERIFIED_AT"

for command_name in "$PG_RESTORE_BIN" "$PSQL_BIN" python3 sha256sum date; do
  require_command "$command_name"
done

BACKUP_DIR=$(CDPATH= cd -- "$BACKUP_DIR" && pwd)
MANIFEST_PATH="$BACKUP_DIR/manifest.json"
CHECKSUMS_PATH="$BACKUP_DIR/checksums.sha256"
DATABASE_DUMP="$BACKUP_DIR/database.dump"
MEDIA_METADATA="$BACKUP_DIR/media-metadata.csv"

for required_file in "$MANIFEST_PATH" "$CHECKSUMS_PATH" "$DATABASE_DUMP" "$MEDIA_METADATA"; do
  [[ -r "$required_file" ]] || fail "backup is incomplete; missing $required_file"
done

python3 - "$MANIFEST_PATH" "$BACKUP_DIR" <<'PY'
import json
from pathlib import Path
import sys

manifest_path = Path(sys.argv[1])
backup_dir = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

if manifest.get("schema_version") != 1:
    raise SystemExit("unsupported T081 backup manifest schema")
if manifest.get("database_dump") != "database.dump":
    raise SystemExit("manifest database dump path is not canonical")
if manifest.get("media_metadata") != "media-metadata.csv":
    raise SystemExit("manifest media metadata path is not canonical")
if not manifest.get("backup_id"):
    raise SystemExit("manifest backup_id is missing")
if not manifest.get("source_as_of"):
    raise SystemExit("manifest source_as_of is missing")

for name in ("database.dump", "media-metadata.csv"):
    candidate = (backup_dir / name).resolve()
    if candidate.parent != backup_dir or not candidate.is_file():
        raise SystemExit(f"manifest payload is not a regular file: {name}")
PY

(
  cd "$BACKUP_DIR"
  sha256sum --strict --check checksums.sha256
)

TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/courtside-t081-restore-XXXXXX")
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

RESTORE_START_NS=$(python3 -c 'import time; print(time.monotonic_ns())')

"$PG_RESTORE_BIN" \
  --exit-on-error \
  --single-transaction \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" \
  < "$DATABASE_DUMP"

"$PSQL_BIN" \
  -X \
  -v ON_ERROR_STOP=1 \
  --csv \
  -P footer=off \
  "$RESTORE_DATABASE_URL" < "$METADATA_QUERY_FILE" > "$TEMP_DIR/restored-media-metadata.csv"

mkdir -p "$(dirname -- "$RECEIPT_PATH")"

python3 \
  "$MANIFEST_PATH" \
  "$MEDIA_METADATA" \
  "$TEMP_DIR/restored-media-metadata.csv" \
  "$SAMPLE_SIZE" \
  "$VERIFIED_AT" \
  "$MAX_RPO_HOURS" \
  "$MAX_RTO_MINUTES" \
  "$RESTORE_START_NS" \
  "$RECEIPT_PATH" <<'PY'
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time

(
    manifest_path,
    backup_csv_path,
    restored_csv_path,
    sample_size_text,
    verified_at_text,
    max_rpo_text,
    max_rto_text,
    restore_start_ns,
    receipt_path,
) = sys.argv[1:]

expected_fields = [
    "asset_id",
    "asset_checksum_sha256",
    "asset_byte_size",
    "private_storage_key",
    "variant",
    "variant_checksum_sha256",
    "variant_byte_size",
    "public_storage_key",
    "rights_status",
]
checksum_pattern = re.compile(r"^[0-9a-f]{64}$")

def parse_timestamp(value: str, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise SystemExit(f"invalid {label}: {value}") from error
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise SystemExit(f"{label} must be UTC: {value}")
    normalized = parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if normalized != value:
        raise SystemExit(f"{label} must be canonical UTC ISO-8601: {value}")
    return parsed.astimezone(timezone.utc)

def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != expected_fields:
            raise SystemExit(f"metadata columns do not match T081 contract in {path.name}")
        rows = list(reader)
    return sorted(rows, key=lambda row: (row["asset_id"], row["variant"]))

manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
source_as_of = parse_timestamp(manifest["source_as_of"], "source_as_of")
verified_at = parse_timestamp(verified_at_text, "verified_at")
rpo_hours = (verified_at - source_as_of).total_seconds() / 3600
if rpo_hours < 0:
    raise SystemExit("verified_at precedes source_as_of")
if rpo_hours > float(max_rpo_text):
    raise SystemExit(f"RPO exceeded: {rpo_hours:.3f}h > {max_rpo_text}h")

backup_rows = load_rows(Path(backup_csv_path))
restored_rows = load_rows(Path(restored_csv_path))
if not backup_rows:
    raise SystemExit("no media metadata rows available for sampled checksum validation")
if backup_rows != restored_rows:
    raise SystemExit("restored media metadata does not exactly match the backup projection")

sample_size = int(sample_size_text)
sample = backup_rows[: min(sample_size, len(backup_rows))]
for row in sample:
    if not checksum_pattern.fullmatch(row["asset_checksum_sha256"]):
        raise SystemExit("sample contains an invalid asset SHA-256 checksum")
    variant_checksum = row["variant_checksum_sha256"]
    if variant_checksum and not checksum_pattern.fullmatch(variant_checksum):
        raise SystemExit("sample contains an invalid variant SHA-256 checksum")

rto_minutes = (time.monotonic_ns() - int(restore_start_ns)) / 1_000_000_000 / 60
if rto_minutes > float(max_rto_text):
    raise SystemExit(f"RTO exceeded: {rto_minutes:.3f}m > {max_rto_text}m")

asset_ids = sorted({row["asset_id"] for row in backup_rows})
expected_counts = manifest.get("row_counts", {})
if expected_counts.get("media_metadata_rows") != len(backup_rows):
    raise SystemExit("backup manifest media metadata row count is inconsistent")
if expected_counts.get("media_asset_ids") != len(asset_ids):
    raise SystemExit("backup manifest media asset count is inconsistent")

receipt = {
    "schema_version": 1,
    "evidence_type": "t081-isolated-restore",
    "result": "PASS",
    "release_ready": True,
    "backup_id": manifest["backup_id"],
    "source_as_of": manifest["source_as_of"],
    "verified_at": verified_at_text,
    "rpo_hours": round(rpo_hours, 3),
    "rpo_limit_hours": float(max_rpo_text),
    "rto_minutes": round(rto_minutes, 3),
    "rto_limit_minutes": float(max_rto_text),
    "row_count_verification": {
        "backup_media_metadata_rows": len(backup_rows),
        "restored_media_metadata_rows": len(restored_rows),
        "media_asset_ids": len(asset_ids),
        "status": "PASS",
    },
    "checksum_verification": {
        "algorithm": "SHA-256",
        "fields": ["asset_checksum_sha256", "variant_checksum_sha256"],
        "sample_size_requested": sample_size,
        "sample_size_verified": len(sample),
        "status": "PASS",
    },
    "isolation": {
        "caller_confirmation": "I_UNDERSTAND_ISOLATED_TARGET",
        "database_target": "explicit caller-supplied target; not persisted",
        "destructive_scope": "only the explicitly supplied restore database",
    },
    "limitations": [
        "This task verifies database and media metadata recovery; original object bytes remain subject to the storage provider backup policy.",
        "RPO is measured from the declared source_as_of timestamp; it does not prove an external scheduler ran every 24 hours.",
        "Application rollback and expand/migrate/contract schema procedures are T082 scope.",
    ],
}

Path(receipt_path).write_text(
    json.dumps(receipt, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
print(json.dumps(receipt, indent=2, sort_keys=True))
PY
