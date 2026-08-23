# Production deployment and forward-only migration

Status: T082 executable contract. No production deployment is claimed by this
document or by the repository drill.

## Release objective and authority

A release is acceptable only when immutable API and web images can be staged
beside the current healthy release, both application versions remain compatible
with the forward database schema, and traffic can return to the previous
application without a database down migration.

Production activation is a protected G3 action. It requires an accountable
release owner, an exact target and release manifest, current backup/restore
evidence, platform-specific traffic-switch approval, monitoring, and an
authoritative post-action receipt. CI, an Agent, or this runbook cannot approve
or perform that action by inference.

The repository provides:

- `infra/docker/api.Dockerfile` and `infra/docker/web.Dockerfile`, which package
  prebuilt artifacts on an explicitly supplied runtime image digest and run as
  numeric non-root user `10001:10001`;
- `infra/deployment/release.compose.yaml`, a provider-neutral candidate runtime
  with no database, secret, public port, or production credential embedded;
- `infra/deployment/release.py`, an atomic release-state gate that validates
  immutable inputs, environment-bound readiness and state, live rollback
  schema read-back and old/new schema compatibility;
- versioned release/readiness examples and a redacted behavioral receipt.

The production platform remains responsible for its secret manager, image
registry, networks, ingress, TLS, database migration runner and atomic traffic
switch. Those capabilities are never passed to the test controller.

## Immutable release inputs

Create a release manifest from the exact reviewed source head. It must contain:

- a bounded release ID and full 40- or 64-character source SHA;
- API and web OCI references pinned as `name@sha256:<64 hex>`;
- the forward target schema version;
- the minimum and maximum schema versions accepted by the candidate;
- `expand` or `migrate` as the current migration phase.

Mutable tags, unknown fields and a `contract` phase are rejected. Build-time
runtime images are also required as digest build arguments; there is no mutable
Dockerfile default. The release image digest, rather than a tag, is copied into
the production change record.

Example packaging commands, executed only in a reviewed CI build environment:

```bash
gradle --no-daemon --console=plain -p apps/api bootJar
pnpm --filter @courtside/web build

docker build \
  --file infra/docker/api.Dockerfile \
  --build-arg API_RUNTIME_IMAGE="<approved-java-runtime>@sha256:<digest>" \
  --build-arg SOURCE_SHA="$SOURCE_SHA" \
  --tag "$API_CANDIDATE_TAG" .

docker build \
  --file infra/docker/web.Dockerfile \
  --build-arg WEB_RUNTIME_IMAGE="<approved-node-runtime>@sha256:<digest>" \
  --build-arg SOURCE_SHA="$SOURCE_SHA" \
  --tag "$WEB_CANDIDATE_TAG" .
```

Push and resolve both images back to immutable registry digests before creating
the manifest. Tags above are local build handles only and are never valid
deployment inputs. Image vulnerability/SBOM policy remains part of the exact
Security gate.

## Expand → migrate → activate → contract

The sequence is deliberately asymmetric: database state moves forward;
application traffic may move forward or backward while compatibility remains.

### 1. Preflight

1. Resolve the exact environment, current active release, current database
   migration history and candidate source head.
2. Attach a current T081 backup/isolated-restore receipt and the provider's
   original-media recovery obligation.
3. Confirm the previous application accepts the candidate target schema and the
   candidate accepts both the current and target schemas.
4. Confirm CI, Security, image provenance and required review status for the
   exact candidate head. Stop on stale or superseded evidence.
5. Keep database credentials, OIDC secrets, object-storage credentials and
   signing material in platform secret injection; never place them in the
   release manifest, command history or receipt.

### 2. Expand

Apply only additive, forward migrations: new nullable columns/tables/indexes,
new values accepted by both applications, and permissions required by the new
path. The migration runner is a separate short-lived identity; API, worker and
web identities cannot apply schema changes.

If expand fails before commit, abort its transaction and do not stage the
candidate. If it commits, retain the additive schema and fix forward. Never
drop it merely to make an old image start.

### 3. Migrate

Run bounded, resumable and idempotent data migration while both old and new
applications tolerate the schema. Record checkpoints, affected counts and
failure state without content bodies, participant data or credentials. Dual
read/write behavior must have a named expiry and must not silently overwrite
immutable publication or audit history.

### 4. Stage and classify readiness

Start the candidate beside the active release using an environment-specific
project/network boundary. Probe it without public traffic and produce a strict
readiness receipt:

- `healthy`: every required API, worker and web check passes;
- `degraded`: the candidate responds but a required dependency or invariant is
  impaired;
- `failed`: startup, migration compatibility or a required probe fails.

Only `healthy` may activate. `degraded`, `failed`, missing or mismatched
receipts leave the current healthy release active. The receipt also carries the
database schema version read back after the forward migration; it must equal the
candidate target. It carries the candidate source SHA and API/web image digests
as well, and the controller requires those immutable identities to match the
registered release manifest before activation. The receipt must name the exact
target environment and include healthy `api-readiness`, `worker-readiness` and
`public-web-readiness` checks; an arbitrary or partial check set is rejected.
The controller records these observations but never runs SQL or promotes a
schema version from the manifest alone.

### 5. Register and activate

The state file belongs in an access-controlled, environment-specific operations
store, not the Git repository. State schema v2 persists the environment and
rejects any invocation whose `--environment` differs, including `status`.
Never share one state path across test, staging and production. A staging
example is:

```bash
python3 infra/deployment/release.py \
  --state /var/lib/courtside/releases/state.json \
  --environment staging \
  --receipt /var/lib/courtside/releases/register-receipt.json \
  register --manifest /change/release-manifest.json

python3 infra/deployment/release.py \
  --state /var/lib/courtside/releases/state.json \
  --environment staging \
  --receipt /var/lib/courtside/releases/activate-receipt.json \
  activate --release release-20260821-001 \
  --readiness /change/readiness.json
```

The controller serializes mutations, writes state atomically with the last
action receipt embedded for crash reconciliation, writes a separate redacted
receipt, and returns `no_op` when the same immutable operation has already
completed. The production command additionally requires the exact short-lived
`COURTSIDE_PRODUCTION_DEPLOY_CONFIRM` capability. Possessing that token does not
replace the platform traffic-switch approval. State commits are capped at
48 KiB, below the controller's 64 KiB read limit; an over-budget registration
fails before replacing the last readable state.

### v1 ledger upgrade (bounded and explicit)

State schema v1 predates the environment binding and has no authoritative
activation history. The controller therefore fails closed when a v1 file is
read; `status`, registration, activation and rollback do not reinterpret it as
staging or production. An operator must provide a separate, bounded evidence
file from the authoritative activation ledger and confirm the exact target
environment:

```json
{
  "schema_version": 1,
  "environment": "staging",
  "activated_releases": ["release-20260821-001", "release-20260822-002"],
  "active_release": "release-20260822-002",
  "previous_release": "release-20260821-001"
}
```

The evidence must name the same environment passed to the command, list only
known release IDs, preserve the legacy active/previous pointers and be unique.
The controller never infers activation from registration, manifests or a
cached pointer. A v1 receipt with an environment must also match the target.
Run the migration as a state-only operation, with no SQL, provider traffic
switch, image promotion, secret change or production activation:

```bash
python3 infra/deployment/release.py \
  --state /var/lib/courtside/releases/state.json \
  --environment staging \
  --receipt /change/state-upgrade-receipt.json \
  upgrade-state \
  --activation-history /change/v1-activation-evidence.json \
  --confirmation I_UNDERSTAND_STATE_SCHEMA_UPGRADE
```

The resulting v2 state carries the environment, the explicitly evidenced
healthy activation history and the prior receipt before normal commands are
allowed. Its `receipt_history` keeps the latest 16 receipts, while the entire
state remains under the 48 KiB atomic-write budget; older entries are pruned
oldest-first. Any environment mismatch, unknown target, ambiguous history or
over-budget result remains `HOLD`.

Rollback additionally requires a fresh live schema read-back produced by the
environment's database migration/read-only inspection identity, not a manifest
value or cached controller field. The JSON contract is exact and contains only:

```json
{
  "schema_version": 1,
  "environment": "staging",
  "database_schema": 10,
  "observed_at": "2026-08-23T05:00:00Z"
}
```

The environment must match the command and `observed_at` must be no more than
10 minutes old. A rollback target must also have a prior healthy activation in
the same state ledger; registration alone never makes a candidate eligible.

After the controller passes, the release owner may authorize the provider's
atomic ingress switch. Verify public read, publication authorization,
withdrawal, cache/search freshness and worker behavior against the candidate;
the T083 observability implementation remains out of T082 scope.

### 6. Observe and close the rollback window

Keep the previous application artifact runnable until the declared observation
window, rollback drill and accountable acceptance finish. Do not delete the
previous image or its manifest while it remains the rollback target.

### 7. Contract later

Contract is a separate forward migration after all of the following are true:

- no supported application reads or writes the legacy shape;
- backfill and contradiction checks are complete;
- the rollback window is explicitly closed;
- a fresh backup/restore point and independent migration review exist;
- the release owner approves the exact contract change.

The T082 controller intentionally has no contract or down command. A contract
migration gets its own reviewable change, tests and recovery plan; it is never
bundled into application activation merely to simplify rollback.

## Hold conditions

Keep deployment `HOLD` when any immutable image or source fingerprint is
missing, a secret appears in an input or receipt, readiness is not fully
healthy, old/new schema ranges do not overlap, the active application would not
survive the forward target schema, backup/restore proof is stale, required
checks or review threads are unresolved, state/readiness/schema evidence names
another environment, the live schema read-back is missing or stale, the target
was never healthy-active, state history cannot remain within its write budget,
or an atomic platform traffic switch and tested application rollback are
unavailable.

## Repository verification

```bash
T082_ARTIFACT_DIR=artifacts/dependencies/t082 \
  bash scripts/test/verify-deployment-rollback.sh
```

This isolated drill validates registration, readiness states, compatibility,
idempotency, production denial, failed-candidate containment and application
rollback. It does not contact a registry, database, provider or production
network.
