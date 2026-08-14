# First issue editorial publishing runbook

This runbook defines the deterministic first-issue fixture used by the public
reader acceptance path. It is a test seed and operating contract, not a
production import with embedded credentials.

## Preflight

Run the seed validator from the repository root:

```bash
node --experimental-strip-types scripts/content/import-seed.ts
```

The command is deliberately dry-run only. It verifies the issue number and
slug, ordered sections, unique article slugs, canonical ContentDocument v1
payloads, and both a rights-valid and an intentionally expired case.

## Editorial sequence

1. An `EDITOR` creates the issue and the two article revisions from
   `apps/api/src/test/resources/fixtures/first-issue/manifest.json`.
2. The editor submits each revision only after the content and media rights
   fields are complete.
3. A separate `PUBLISHER` reviews the readiness report, confirms the valid
   rights case, and rejects the expired case with `RIGHTS_EXPIRED`.
4. The publisher publishes the valid issue once and records the immutable
   snapshot, outbox event, and audit entry.
5. Public verification follows `Home → Issue → TOC → Article → Closure`.
   Closure must retain source/media attribution, the return-to-TOC link, and
   previous/next issue navigation while remaining readable without login,
   wallet, or external provider availability.

## Failure handling

Publication is not considered complete when an external cache or search purge
fails. The origin must deny withdrawn content first; the durable outbox retries
the external invalidation with the same idempotency key. See
`PublicationReliabilityIT` for the executable proof of this ordering.
