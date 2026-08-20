#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
DEFAULT_METADATA_QUERY="$SCRIPT_DIR/media-metadata.sql"

DATABASE_URL="\${DATABASE_URL:-}"
BACKUP_ROOT="\${BACKUP_ROOT:-$REPO_ROOT/artifacts/t081-backups}"
SOURCE_AS_OF="\${SOURCE_AS_OF:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
BACKUP_ID="\${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
METADATA_QUERY_FILE="\${MEDIA_METADATA_QUERY_FILE:-$DEFAULT_METADATA_QUERY}"

usage() {
  cat <<'EOF'
Usage: infra/deployment/backup/backup.sh [options]

Options:
  --database-url URL     PostgreSQL source URL; may also use DATABASE_URL.
  --output-root DIR      Root directory for immutable backup snapshots.
  --source-as-of ISO8601 UTC timestamp; defaults to the capture time.
  --backup-id ID          Stable snapshot directory name.
  --metadata-query FILE  SQL projection for media metadata.
  -h, --help             Show this help.

The backup contains a PostgreSQL custom-format dump and a private media
metadata CSV. It does not print or persist the database URL in the manifest.
EOF
}

fail() {
  echo "backup: $*" >&2
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
    --database-url)
      (($# >= 2)) || fail "--database-url requires a value"
      DATABASE_URL="$2"
      shift 2
      ;;
    --output-root)
      (($# >= 2)) || fail "--output-root requires a value"
      BACKUP_ROOT="$2"
      shift 2
      ;;
    --source-as-of)
      (($# >= 2)) || fail "--source-as-of requires a value"
      SOURCE_AS_OF="$2"
      shift 2
      ;;
    --backup-id)
      (($# >= 2)) || fail "--backup-id requires a value"
      BACKUP_ID="$2"
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

[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL or --database-url is required"
[[ -r "$METADATA_QUERY_FILE" ]] || fail "media metadata query is not readable: $METADATA_QUERY_FILE"
[[ "$BACKUP_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]] || fail "backup id contains unsupported characters: $BACKUP_ID"
validate_timestamp "$SOURCE_AS_OF"

for command_name in pg_dump psql python3 sha256sum; do
  require_command "$command_name"
done

mkdir -p "$BACKUP_ROOT"
BACKUP_ROOT=$(CDPATH= cd -- "$BACKUP_ROOT" && pwd)
LOCK_DIR="$BACKUP_ROOT/.backup.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "another backup is already writing to $BACKUP_ROOT"
fi

STAGING_DIR="$BACKUP_ROOT/.staging-$BACKUP_ID-$$"
FINAL_DIR="$BACKUP_ROOT/$BACKUP_ID"
cleanup() {
  if [[ -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

[[ ! -e "$FINAL_DIR" ]] || fail "backup already exists and is immutable: $FINAL_DIR"
umask 077
mkdir "$STAGING_DIR"

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$STAGING_DIR/database.dump" \
  "$DATABASE_URL"

psql \
  -X \
  -v ON_ERROR_STOP=1 \
  --csv \
  -P footer=off \
  --file="$METADATA_QUERY_FILE" \
  "$DATABASE_URL" > "$STAGING_DIR/media-metadata.csv"

python3 - "$STAGING_DIR" "$BACKUP_ID" "$SOURCE_AS_OF" "$METADATA_QUERY_FILE" <<'PY'
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

stage = Path(sys.argv[1])
backup_id = sys.argv[2]
source_as_of = sys.argv[3]
metadata_query = Path(sys.argv[4])

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

with (stage / "media-metadata.csv").open(newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    if reader.fieldnames != expected_fields:
        raise SystemExit(
            "media metadata projection columns do not match the T081 contract: "
            f"{reader.fieldnames!r}"
        )
    rows = list(reader)

for row_number, row in enumerate(rows, start=2):
    if not checksum_pattern.fullmatch(row["asset_checksum_sha256"]):
        raise SystemExit(f"invalid asset checksum at CSV row {row_number}")
    variant_checksum = row["variant_checksum_sha256"]
    if variant_checksum and not checksum_pattern.fullmatch(variant_checksum):
        raise SystemExit(f"invalid variant checksum at CSV row {row_number}")
    if int(row["asset_byte_size"]) <= 0 or int(row["variant_byte_size"]) < 0:
        raise SystemExit(f"invalid byte size at CSV row {row_number}")
    if not row["asset_id"] or not row["private_storage_key"]:
        raise SystemExit(f"missing media identity at CSV row {row_number}")

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
asset_ids = sorted({row["asset_id"] for row in rows})
manifest = {
    "schema_version": 1,
    "evidence_type": "t081-database-media-metadata-backup",
    "backup_id": backup_id,
    "created_at": created_at,
    "source_as_of": source_as_of,
    "database_dump": "database.dump",
    "media_metadata": "media-metadata.csv",
    "metadata_query": metadata_query.name,
    "row_counts": {
        "media_metadata_rows": len(rows),
        "media_asset_ids": len(asset_ids),
    },
    "database_dump_sha256": sha256(stage / "database.dump"),
    "media_metadata_sha256": sha256(stage / "media-metadata.csv"),
    "checksum_algorithm": "SHA-256",
}

(stage / "manifest.json").write_text(
    json.dumps(manifest, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

(
  cd "$STAGING_DIR"
  sha256sum database.dump media-metadata.csv > checksums.sha256
)

mv "$STAGING_DIR" "$FINAL_DIR"
STAGING_DIR=""

python3 - "$FINAL_DIR/manifest.json" <<'PY'
import json
from pathlib import Path
import sys

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(json.dumps({
    "result": "PASS",
    "backup_dir": str(Path(sys.argv[1]).parent),
    "backup_id": manifest["backup_id"],
    "source_as_of": manifest["source_as_of"],
    "media_metadata_rows": manifest["row_counts"]["media_metadata_rows"],
    "database_dump_sha256": manifest["database_dump_sha256"],
    "media_metadata_sha256": manifest["media_metadata_sha256"],
}, indent=2, sort_keys=True))
PY
