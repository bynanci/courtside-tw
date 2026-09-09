# ADR-0009: Publication cache invalidation transport

**Status**: Implemented provider-neutral boundary under ADR-0002; production provider remains unconfigured.

**Date**: 2026-09-09

## Problem and scope

The worker had a fail-closed invalidation interface, but its configuration always selected the unavailable implementation. Article publish and schedule deliveries completed without invoking that interface. Sitemap responses also advertised a 300-second lifetime, exceeding the plan's 60-second positive-cache ceiling.

This change supplies the optional transport and durable publication ordering. It does not select, deploy or acknowledge a production CDN. DEV-T085-016 still requires a receipt covering every public page, search and sitemap surface after publish, revision, archive and withdrawal. DEV-T085-026 still requires its separate 100 RPS benchmark with measured cache hits.

## Worker ordering and retry

Article and issue workers commit the current origin state, immutable snapshot and applicable search projection before invoking external invalidation. A cache refilling during invalidation therefore reads committed state. Only a successful acknowledgement allows a second transaction to mark the publication job `SUCCEEDED`.

If the provider is unavailable, the origin remains committed and the publication job remains pending. The existing durable outbox owns bounded attempts, backoff and dead-letter handling; the HTTP adapter makes one request per delivery. Defaults remain five attempts, five-second initial backoff and five-minute maximum backoff. These retry settings are not a claim that all external caches converge within 60 seconds during an outage.

External idempotency keys are `article-publication:<job UUID>` and `issue-publication:<job UUID>`. They remain stable across delivery retries and cannot collide when callers reuse a key for a different article, actor or operation. The provider must replay an acknowledgement only for the same key and exact surrogate-key list. A timeout may occur after a successful purge, so repeated requests must be safe. Late publish deliveries after archive or withdrawal invalidate the current state without reopening the origin or creating a second snapshot.

A pending withdrawal or archive job is itself durable proof that the removal transition committed. A new draft, later publication, or subsequent archive cannot cancel its original purge. Late deliveries preserve the current revision, article version, snapshots and newer search projection. Search reconciliation runs only for a matching retired revision that was previously published; a withdrawal before first publication still purges without requiring a nonexistent search source.

Search reconciliation for an already committed publication or removal can race with another committed revision. Such a source-state failure remains retryable, so the next delivery re-reads current state and can purge without replaying obsolete projection work. Fresh publication validation keeps its original failure rules. The provider acknowledgement is still required before success, and bounded retries/dead-letter handling remain unchanged.

## Opt-in HTTP contract

Worker configuration uses the `courtside.publication.invalidation` prefix:

| Property       | Contract                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`     | HTTPS URL without credentials, query or fragment; plain HTTP is accepted only for a literal loopback address used in local tests. |
| `bearer-token` | Required with the endpoint, injected as a server secret; never included in diagnostics or configuration `toString()`.             |
| `timeout`      | Total request/response deadline, default `3s`, allowed `100ms` through `5s`.                                                      |

No endpoint keeps `PublicationExternalInvalidator.unavailable()`. Partial or invalid configuration fails startup. The API profile and disabled worker do not activate this client. The application never invents credentials or installs a vendor SDK.

Each request is an authenticated JSON POST. The body carries `idempotencyKey` and `surrogateKeys`, and the `Idempotency-Key` header carries the same key. The only success is HTTP 200 with a JSON acknowledgement containing exactly:

```json
{
  "status": "PURGED",
  "idempotencyKey": "article-publication:<job UUID>",
  "surrogateKeys": [
    "article:<id>",
    "article:<id>:revision:<revision id>",
    "search:article:<id>",
    "sitemap:articles"
  ]
}
```

The response key and ordered list must equal the request. Missing, duplicate or extra fields, malformed JSON, a body larger than 16 KiB, a different status, redirects and a deadline expiry all fail the delivery. The client never follows redirects or forwards its token to another endpoint.

The configured provider owns the mapping from these stable keys to every affected cached representation, including containing issue pages, search result pages and sitemap documents. `PURGED` means those representations were actually invalidated, rather than merely queued. A receipt from a protocol fixture cannot satisfy that production obligation. Any provider using a different API needs a separate reviewed adapter or gateway implementing this contract.

## Cache lifetime and evidence

Sitemap positive responses use `public, max-age=30, must-revalidate`, leaving margin within the 60-second budget for origin and worker propagation. Article responses retain mandatory origin revalidation. This header alone does not establish multi-layer convergence: deployment validation must account for upstream response age, worker/search delay and every additional cache layer.

The adapter tests use real loopback HTTP sockets to exercise serialization, authentication, acknowledgement validation, timeout and response limits. The PostgreSQL integration tests verify that a separate database connection can see publication before invalidation, failed purges remain pending, retries produce one snapshot and delayed deliveries cannot reopen withdrawn content. These are engineering mechanism tests, not production purge receipts. Their execution status is recorded by CI; merely committing tests does not constitute a pass.

Before production activation, validate real key-to-route coverage and fresh unauthenticated HTTP observations across all lifecycle/surface permutations from the durable enqueue timestamp. Record deployment identities, cache status and response age, response hashes, first consistent timestamps, failed attempts and the exact source commit. Keep the production provider disabled until its configuration and evidence are available.

## References

- ADR-0002: Identity, email and hosting provider boundary.
- Plan: Caching and Consistency; Observability and SLOs.
- Specification: FR-030, SC-006 and SC-008.
- Frozen deviations: DEV-T085-016 and DEV-T085-026.
