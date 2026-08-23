# Application rollback with a forward database schema

Status: T082 executable runbook. This is an application traffic rollback, not a
database restore, down migration or destructive reset.

## Invariant

Application rollback changes only the active release pointer and the production
platform's traffic target. The forward schema remains installed:

```text
active release B + database schema 10
        application rollback
active release A + database schema 10
```

Release A must already declare compatibility with schema 10. If it does not,
rollback is blocked and the operator must fix forward with B or a newly reviewed
release. The controller never attempts to make A compatible by deleting data,
dropping schema objects, running a down migration or restoring production over
the current database.

## Decision tree

1. **Candidate has not received traffic**: keep the healthy active release;
   stop/quarantine the candidate and record the failed or degraded readiness
   receipt.
2. **Candidate has traffic and the previous release supports the current
   schema**: authorize an atomic application traffic rollback, then verify the
   previous release against the unchanged schema.
3. **Previous release does not support the current schema**: do not force it;
   remove candidate traffic only if another healthy compatible target exists,
   otherwise enter `HOLD` and fix forward.
4. **Database integrity is damaged**: stop application writes and use the T081
   disaster-recovery incident path. Do not call an application rollback a
   database recovery.
5. **Rights withdrawal, immutable publication or audit history is affected**:
   preserve evidence and escalate; a cache or release rollback must not revive
   withdrawn content or rewrite append-only history.

## Protected production procedure

Before changing traffic, capture:

- environment and incident/change ID;
- candidate and previous source/image digests;
- active and current forward database schema version;
- compatibility ranges for both releases;
- current backup/restore point;
- failed signal, start time and accountable operator;
- exact traffic-switch target and rollback command preview.

Read the current schema from the target environment immediately before the
controller command. Store only the bounded schema receipt described in the
deployment runbook; it must name the same environment and be no more than
10 minutes old. Do not derive this value from the release manifest or cached
release state.

The repository state gate is:

```bash
COURTSIDE_PRODUCTION_DEPLOY_CONFIRM=I_UNDERSTAND_PROTECTED_PRODUCTION_ACTION \
python3 infra/deployment/release.py \
  --state /var/lib/courtside/releases/state.json \
  --environment production \
  --receipt /var/lib/courtside/releases/rollback-receipt.json \
  rollback --release <previous-release-id> \
  --schema-readback /change/live-schema-readback.json
```

If the environment still has a schema-v1 release ledger, first run the explicit
`migrate-state --legacy-backup <protected-path>` procedure in the deployment
runbook. Do not manually add environment or activation-history fields. The
migration preserves a full legacy backup, binds the operational state to the
operator-selected environment, and retains active/previous rollback eligibility
without changing traffic or schema.

This command verifies that the target was previously activated healthy in the
same environment-bound state and accepts the freshly read current forward
schema. A merely registered candidate is never rollback-eligible. It atomically
records the application pointer and explicitly reports:

- `active_before` and `active_after`;
- `database_schema_before` and `database_schema_after`;
- `schema_rollback_performed=false`;
- `destructive_schema_action=false`;
- `pass`, `no_op` or a fail-closed `blocked` result.

Only after that receipt passes may the accountable release owner authorize the
platform-specific ingress switch. The operator then:

1. routes new traffic to the previous compatible release atomically;
2. leaves the failed candidate isolated for evidence;
3. verifies API readiness, SSR public read, authorization and worker behavior;
4. confirms the database migration history and schema version did not move
   backward;
5. checks that withdrawal, audit, outbox and publication state did not regress;
6. records provider post-state and the exact release receipt;
7. keeps the incident/change in `HOLD` until required monitoring is healthy.

Re-running the state command for the already active target returns `no_op` and
does not create a second effect. A changed target requires a new preview and
approval.

## Non-destructive recovery boundaries

- Keep additive expand objects after an application rollback.
- Resume or correct data migration through an idempotent forward job.
- Correct incompatible data with a separately reviewed forward migration.
- Keep the previous and candidate images immutable for evidence and replay.
- Use T081 restore only to an explicitly isolated target for investigation; a
  production restore is a separate incident-level G3 decision.
- Run contract cleanup only after the rollback window closes and a later
  application version no longer needs the legacy shape.

## Hold and escalation conditions

Set rollback to `HOLD` when the target manifest or image digest is missing, the
target does not accept the current forward schema, traffic cannot switch
atomically, a receipt contains credentials or participant data, the current
schema/migration history is unknown or stale, receipt/state environments do not
match, the target lacks a prior healthy activation, database integrity is
disputed, a schema-v1 state has not completed its explicit backed-up migration,
review or Security evidence is stale, or the same rollback attempt fails twice
without a new evidence delta.

On `HOLD`, freeze new deployment actions, preserve logs and release manifests,
keep secrets out of the evidence bundle, and route the decision to the release
owner. Do not weaken the compatibility check or perform a destructive schema
rollback to obtain a green result.

## Verification

```bash
bash scripts/test/verify-deployment-rollback.sh
```

The drill proves that a healthy B release can advance schema 9 to schema 10,
application rollback can reactivate compatible A while schema 10 remains, and
failed/degraded candidates, mutable tags, contract-in-window, incompatible
schema and unconfirmed production actions fail closed.
