# Disaster recovery: database and media metadata

Status: T081 implementation and isolated restore verification  
Scope: PostgreSQL database state plus the media metadata projection used to
reconcile private originals, public variants, rights status and checksums.

## Recovery contract

The release gate is explicit:

| Signal | Acceptance |
| --- | --- |
| Backup format | PostgreSQL custom-format dump with \`--no-owner --no-acl\` |
| Media metadata | Canonical CSV projection from \`infra/deployment/backup/media-metadata.sql\` |
| Integrity | SHA-256 checksums for the dump and metadata projection |
| Restore target | Caller-supplied isolated PostgreSQL database only |
| Row verification | Backup and restored media metadata projections match exactly |
| Checksum sample | Deterministic first N rows after \`asset_id, variant\` ordering |
| RPO | \`<= 24h\` from declared \`source_as_of\` to verification |
| RTO | \`<= 4h\` from restore start through metadata verification |
| Receipt | JSON with no database URL, password, token, private key or participant PII |

The RPO proof measures snapshot freshness. It does not claim that an external
scheduler has already executed every 24 hours. T082 owns deployment scheduling,
application rollback and expand/migrate/contract procedures.

Original media bytes are not copied by this task. Their availability remains a
separate storage-provider backup obligation. The database projection retains
the private/public storage keys, rights status and SHA-256 checksums needed to
detect a metadata or object-integrity mismatch during a provider-specific
restore.

## Backup

Run from a trusted operations environment with a read-capable database URL:

~~~bash
BACKUP_ID="prod-$(date -u +%Y%m%dT%H%M%SZ)" \
SOURCE_AS_OF="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
DATABASE_URL="$DATABASE_URL" \
BACKUP_ROOT="/secure/backups/courtside-tw" \
bash infra/deployment/backup/backup.sh
~~~

The command writes a new immutable directory containing:

- \`database.dump\`
- \`media-metadata.csv\`
- \`manifest.json\`
- \`checksums.sha256\`

The directory is first written under a staging name and atomically renamed.
A same-named snapshot is rejected. The backup lock prevents concurrent writers
from racing on the same destination.

The backup root must be encrypted, access-controlled and retained according to
the organisation's operational policy. Do not commit a backup directory or its
CSV to the repository.

## Isolated restore drill

Create a new empty database in an isolated environment. Do not point the
command at production or an application database:

~~~bash
createdb "$ISOLATED_DATABASE_URL" courtside_t081_restore
~~~

Then run:

~~~bash
ISOLATED_RESTORE_CONFIRM=I_UNDERSTAND_ISOLATED_TARGET \
RESTORE_DATABASE_URL="$ISOLATED_DATABASE_URL" \
RESTORE_RECEIPT_PATH="artifacts/t081-restore-receipt.json" \
bash scripts/operations/restore-verify.sh \
  --backup-dir "/secure/backups/courtside-tw/<backup-id>" \
  --restore-database-url "$ISOLATED_DATABASE_URL/courtside_t081_restore" \
  --receipt "artifacts/t081-restore-receipt.json" \
  --sample-size 5
~~~

The script refuses to run without the exact confirmation token. It verifies
the backup files before invoking \`pg_restore --single-transaction --clean
--if-exists\`, then queries the restored database using the same media metadata
projection. It removes no database and cannot infer a production target; the
operator owns creation and cleanup of the isolated target.

The resulting receipt is safe to attach to a PR or release record. It records:

- source and verification timestamps;
- measured RPO and RTO;
- media row and asset counts;
- checksum algorithm and sample count;
- explicit isolation boundary;
- limitations and deferred T082 work.

It never records the database URL or the metadata row contents.

## CI drill

The T081 CI job starts a temporary PostgreSQL Compose project, applies the
foundation schema, inserts two non-production media fixtures, creates a
separate restore database, runs the backup and restore scripts, validates the
receipt, and deletes the temporary project and volumes. The CI artifact
contains the redacted log, manifest, checksums, and restore receipt.

The committed drill is evidence of executable recovery behavior. It is not a
production backup schedule and does not prove the availability of original
media bytes.

## Failure and hold conditions

Keep T081 \`HOLD\` when any of the following occurs:

- the backup manifest or checksum file is missing or inconsistent;
- the restore target is not explicitly isolated;
- \`pg_restore\` fails or the restored media projection differs;
- the deterministic checksum sample is empty, invalid or mismatched;
- \`RPO > 24h\` or \`RTO > 4h\`;
- the receipt contains credentials, private keys, tokens or participant data;
- the storage-provider byte backup policy is absent for a release that claims
  recoverable original media.

T082 must add and verify production scheduling, deployment rollback and
non-destructive schema migration procedures before a beta/GA release claim.
