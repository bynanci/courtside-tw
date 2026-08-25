# Courtside TW incident response

This runbook covers the seven T083 observability surfaces. It is a response
contract, not proof that a production provider, exporter, receiver or synthetic
probe has been activated. Until every source heartbeat is bound and tested at
the same immutable release candidate, missing telemetry is a **release HOLD**.

The authoritative SLO and label contract is
[`infra/observability/slo-contract.yml`](../../infra/observability/slo-contract.yml).
The Prometheus-compatible alert rules deliberately contain no receiver,
endpoint, credential or individual on-call identity.

Each alert-rule evaluator is bound to exactly one environment. A shared
cross-environment evaluator is non-compliant because a healthy source in one
environment could hide a missing source in another. The dashboard likewise
requires one explicit environment selection.

## Severity and first response

| Severity   | First response                                                                                                      | Release effect                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `critical` | Contain immediately; assign an incident commander role and preserve rights/audit state.                             | HOLD; disable or bypass the affected mutation/read path when the surface can leak withdrawn content. |
| `page`     | Acknowledge within the configured operational response window; identify the exact environment and first bad sample. | HOLD while the alert is active or its evidence is unattributable.                                    |
| `warning`  | Triage during the staffed operational window and watch the long burn window.                                        | Do not promote a release until disposition is recorded.                                              |

For every alert:

1. Confirm the alert rule, dashboard and source heartbeat use the same
   environment and immutable release candidate.
2. If the source heartbeat is absent, stale, or not exactly `1`, classify the
   SLO as **unknown**. Do not replace missing data with zero and do not silence
   the alert merely to pass a gate.
3. Capture bounded metric aggregates and correlation time ranges. Put dynamic
   identifiers, request/trace correlation values and error detail only in the
   separately controlled log/trace system; never add them as metric labels.
4. Apply the smallest reversible containment. Follow
   [`rollback.md`](./rollback.md) for an application rollback and
   [`deployment.md`](./deployment.md) for release-state checks. Never perform a
   destructive schema rollback.
5. Keep T084+ and production provider changes outside the incident patch unless
   separately authorized.

<a id="public-read"></a>

## Public read

**Owner role:** `reader-operations`

**Alerts:** `CourtsidePublicReadTelemetryMissing`,
`CourtsidePublicReadFastBurn`, `CourtsidePublicReadSlowBurn`, and
`CourtsidePublicReadLatency`.

The approved objectives are 99.9% successful public issue/article origin
responses over 30 days and p95 origin latency no greater than 300 ms at the
declared baseline load.

Triage:

1. On the missing alert, verify all public-read source heartbeats are current.
   Stop; availability and latency are unknown until coverage returns.
2. Split failure rate from latency. Confirm the denominator contains only
   anonymous public issue/article origin responses and not health, editor or
   dynamic-path series.
3. Compare API, database and object-storage health; inspect the exact release
   state and dependency errors within the alert window.
4. If public-read errors exceed 2% for five minutes, authorization leaks, or a
   withdrawal is served, follow the existing immediate rollback/route-disable
   rule in the product plan.
5. Preserve anonymous reading. Do not introduce login, wallet, analytics consent
   or a cached stale response as containment.

Recovery requires current heartbeats, the fast and slow burn rules clear, p95
within threshold under the declared load, and one fresh anonymous
Home → Issue → Article verification on the same candidate.

<a id="publication-jobs"></a>

## Publication jobs

**Owner role:** `editorial-operations`

**Alerts:** `CourtsidePublicationTelemetryMissing`,
`CourtsidePublicationFastBurn`, and `CourtsidePublicationSlowBurn`.

The approved objective is 99% of accepted publication commands completing or
entering an explicit blocked state within 60 seconds. A retry attempt, lease, or
HTTP acceptance is not completion.

Triage:

1. Verify the source measures durable enqueue to terminal completion/explicit
   block. If it measures handler attempt time only, classify it as invalid and
   HOLD.
2. Check worker heartbeat, queue age, leases, retry rate and bounded event type.
3. Separate an explicit editorial/rights block from infrastructure failure. A
   valid block satisfies terminality but still needs operator-visible reason
   evidence outside metric labels.
4. Pause new publish mutations if backlog growth risks duplicate or late
   effects. Do not delete durable events or edit audit history.
5. Roll back only the application artifact when the current worker introduced
   the regression; preserve the forward-compatible schema and durable state.

Recovery requires current source heartbeat, stable queue age, idempotent replay
proof for any retried item, and the 5-minute plus 1-hour observation windows
showing attributable terminal outcomes.

<a id="withdrawal"></a>

## Withdrawal

**Owner role:** `rights-operations`

**Alerts:** `CourtsideWithdrawalTelemetryMissing`,
`CourtsideWithdrawalFastBurn`, `CourtsideWithdrawalSlowBurn`, and
`CourtsideWithdrawalSixtySecondBreach`.

The approved origin objectives are 99% denial within 30 seconds and 100% denial
within 60 seconds. The 60-second condition is a safety invariant, not an error
budget.

Triage and containment:

1. Treat missing non-privileged verification as unknown and critical to the
   release decision.
2. Recheck the withdrawn item through the origin with caches bypassed. Do not
   expose the withdrawn body while collecting evidence.
3. If origin still serves content at 60 seconds, disable the affected public
   route or feature flag and route to the prior compatible application only if
   it honors the same withdrawal state.
4. Verify the database state, immutable audit event, offline withdrawal manifest,
   search removal, and cache-purge surface. Do not rewrite history or claim a
   third-party/offline copy can be forcibly deleted.
5. Keep the rights decision authoritative over search, cache, offline,
   provenance and presentation.

Recovery requires origin denial, current withdrawal and cache-purge heartbeats,
search removal, and a fresh 60-second invariant observation. A cleared alert
without those receipts is insufficient.

<a id="search-freshness"></a>

## Search freshness

**Owner role:** `discovery-operations`

**Alerts:** `CourtsideSearchFreshnessTelemetryMissing`,
`CourtsideSearchFreshnessFastBurn`, and
`CourtsideSearchFreshnessSlowBurn`.

The approved objective is 99% of public publish/withdraw changes visible in
anonymous search within 60 seconds.

Triage:

1. Confirm the source measures commit time to the matching search projection,
   not API query latency or outbox handler attempt time.
2. Verify source heartbeat, publication event terminality, projection update and
   public query result. Do not retain or label raw search queries.
3. For a stale publish, temporarily remove search navigation to the stale result
   if it causes broken links. For a stale withdrawal, treat the incident as a
   rights event and follow the withdrawal containment above.
4. Retry only through the existing idempotent durable event path; do not patch
   projection rows manually without an authorized repair plan.

Recovery requires an attributable projection for both a publish and withdrawal
fixture, current heartbeat, and cleared fast/slow windows.

<a id="media-processing"></a>

## Media processing

**Owner role:** `media-operations`

**Alerts:** `CourtsideMediaProcessingTelemetryMissing`,
`CourtsideMediaProcessingFastBurn`, and
`CourtsideMediaProcessingSlowBurn`.

The approved objective is 99% of accepted, rights-valid images reaching `READY`
within 300 seconds. Inputs rejected for checksum, magic bytes, dimensions,
rights or other validation do not enter that valid-image denominator.

Triage:

1. Verify producer heartbeat, queue age, storage dependency, processing worker
   and variant writer. Confirm the denominator excludes intentionally invalid
   fixtures.
2. Inspect bounded outcome/reason aggregates. Keep object keys, payloads,
   filenames, credits and rights text out of metric labels.
3. Pause new media acceptance when backlog growth threatens the objective;
   continue serving already approved public variants.
4. Do not mark an asset `READY`, relax validation or publish a private original
   as an incident shortcut.

Recovery requires successful processing of a fixed rights-valid fixture,
checksum/variant evidence, stable backlog and cleared fast/slow windows.

<a id="cache-purge"></a>

## Cache purge

**Owner role:** `edge-operations`

**Alerts:** `CourtsideCachePurgeTelemetryMissing` and
`CourtsideWithdrawalCachePurgeBreach`.

T083 adds no general publish-purge release SLO. It enforces the existing rights
requirement that a withdrawal must not remain available at the public edge after
60 seconds.

Triage and containment:

1. Treat missing edge verification as unknown; origin denial alone does not
   prove cached copies are no longer served.
2. Verify the bounded surrogate-key operation and an anonymous edge read. Keep
   provider request identifiers and URLs out of metric labels.
3. On a breach, bypass or disable the affected cache path, reduce safe cache
   lifetime if already authorized, and verify origin denial. Do not serve a stale
   withdrawn response while waiting for a provider retry.
4. Escalate provider-specific repair through a separately authorized operational
   change; this repository contains no provider endpoint, receiver or secret.

Recovery requires a fresh public-edge denial observation, healthy heartbeat and
no new 60-second breach. Do not close from a successful purge API response
without a read-after-purge verification.

<a id="dead-letters"></a>

## Dead letters

**Owner role:** `platform-operations`

**Alerts:** `CourtsideDeadLetterTelemetryMissing` and
`CourtsideDeadLettersDetected`.

The safety invariant is zero new dead-lettered durable events. Dead-letter
payload and error text remain in access-controlled state, never metric labels.

Triage and containment:

1. Verify heartbeat and identify only the bounded `event_type` and affected
   environment from metrics.
2. Pause the affected mutation path if continued enqueue would increase harm.
   Do not pause unrelated public reading.
3. Classify the failure as non-retryable input, exhausted retry, missing adapter,
   incompatible application, or dependency failure using controlled logs and
   the durable row.
4. Confirm handler idempotency and the downstream state before any replay. Never
   edit attempt counters, delete rows or bulk replay unknown payload versions.
5. If a dead letter concerns withdrawal or publication, also follow the
   corresponding surface runbook.

Recovery requires an approved repair/replay decision, idempotent terminal proof,
stable queue and a documented disposition for every new dead-letter event.

## Evidence capture

Record a bounded incident receipt with:

- alert name, surface, severity, environment and first/last firing timestamps;
- immutable application release/head and deployment-state fingerprint;
- source heartbeat timestamp and the exact PromQL/rule version;
- aggregate numerator, denominator, latency or breach count for every evaluated
  window;
- containment and rollback command receipt, without credentials or sensitive
  payloads;
- current CI/Security/artifact references when the incident affects a release;
- counter-evidence, remaining unknowns and accountable owner roles.

Store dynamic identifiers and detailed errors only in the authorized log/trace
system with its own retention and access policy. Redact before attaching an
incident excerpt to a public issue or PR.

## Containment and rollback

Use this order unless a rights leak requires immediate route disablement:

1. Stop or gate the smallest harmful mutation while preserving anonymous reads.
2. Bypass affected cache/search presentation when it can serve withdrawn or
   invalid content.
3. Pause the specific worker/event type; preserve durable rows and audit history.
4. Follow `docs/operations/rollback.md` to route to a registered compatible
   application artifact. Do not perform destructive schema rollback.
5. Require separate authorization for provider configuration, production
   credentials, traffic changes outside the existing rollback controller, or a
   changed SLO/privacy contract.

## Closure criteria

An incident may close only when:

- the original alert condition and every linked safety condition are false on
  current, attributable samples;
- all seven required source heartbeats relevant to the release are current, or
  the release remains explicitly HOLD;
- containment did not weaken auth, rights, validation, audit, privacy or
  protected-branch controls;
- any replay/rollback is idempotently verified and the durable state is read
  back;
- evidence, counter-evidence, remaining risk, owner role and follow-up decision
  are recorded;
- T083 completion, provider activation and protected merge remain separate
  release-owner decisions.
