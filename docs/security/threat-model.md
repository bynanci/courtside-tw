# T080 — P1 threat model and hardening

Status: implementation in progress on the T080 branch. This document is the
executable release contract for the current P1 slice, not a promise that the
future Web3 product domain is already implemented.

## Scope and sequencing

The in-scope slice is the public reader, the authenticated reader account, the
Editorial Studio API, OIDC-backed sessions, bounded ContentDocument/p5
rendering and the S3-compatible original-media upload boundary. The threat
model covers the server, web BFF and browser/runtime boundary. It does not
introduce a new identity provider, wallet, chain, RPC or IPFS integration.

The following work is intentionally unchanged and remains gated separately:

- T081–T086: backup/restore, deployment/rollback, observability, privacy,
  reconciliation and staged beta release.
- T087–T096 and T098+: provenance/Web3, basketball domain, evidence layer,
  adapters, Fan Passport, archive and participant research.

No task checkbox is changed by this document. T080 can be accepted only from a
final exact source head with passing CI and Security checks, zero unresolved threads (that is, zero unresolved review threads), attributable evidence and a
protected merge. The RED tests must be present before the hardening
implementation; a green local run is not an exact-head release receipt.

## Assets, actors and trust boundaries

| Boundary | Asset at risk | Untrusted input | Required control |
| --- | --- | --- | --- |
| Browser → web BFF | session, CSRF token, reader data | cookies, paths, query, request body, headers | same-origin session cookies, CSRF double-submit, path allowlists, no-store account responses |
| Web BFF → API | bearer access token, role claims | runtime API URL, upstream response, client headers | trusted-origin validation, redirect-error fetches, selected-header forwarding, exact route allowlists |
| OIDC provider → API/web | identity and authorization | issuer metadata, JWKS, ID/access token, roles | explicit issuer/JWKS, HTTPS, issuer/audience/subject/expiry/nonce/PKCE checks, canonical roles, no hierarchy |
| Studio → content store | immutable publication | JSON block payload, revision and media intent | canonical schema, duplicate/control checks, server-owned media keys, immutable revision rules |
| Studio → object storage | original media confidentiality | MIME, size, object key, signer URL | allowlisted image MIME, 20 MiB cap, 1–5 minute private signed PUT, server-generated key |
| Published content → browser runtime | reader device and origin | p5 parameters, preset id, links, embed/provider reference | deny-by-default schema, local preset registry, bounded numeric envelope, CSP, no eval/remote modules |
| Future provider/SIWE/signer adapter | wallet identity and signing key | provider URL, chain id, nonce, domain, RPC/IPFS URL, signer response | isolated adapter contract, public HTTPS policy, nonce/expiry/replay checks, chain/domain binding, KMS/HSM signer and egress ACL |

## Threats, controls and residual acceptance

| Threat / abuse case | Preventive control | Executable evidence | Residual / owner |
| --- | --- | --- | --- |
| Content injection, duplicate block identity or control-character smuggling | `ContentDocument` is versioned and `additionalProperties: false`; runtime validator rejects duplicate ids and ISO control characters | `ContentPayloadBoundaryTest`, `packages/content-schema/tests/content-document.test.ts`, schema fixtures | Content owners must revalidate before persistence and publication |
| OIDC issuer/JWKS substitution or privilege-shaped roles | explicit issuer/JWKS; HTTPS unless explicit local test; issuer, audience, subject and expiry validators; exact canonical roles with no role hierarchy | `OidcSecurityFoundationTest`, `auth-session.test.ts`, `ExternalReferencePolicyTest` | Provider operations own key rotation and availability; no metadata discovery fallback |
| CSRF on cookie-authenticated unsafe requests | SameSite session/CSRF cookies; BFF requires `x-csrf-token`; API ignores CSRF only when a Bearer token is present; logout is POST-only | `auth-session.test.ts`, `OidcSecurity*Test`, middleware route tests | CORS and deployment origin policy remain part of T082/T083 evidence |
| Upload overwrite, MIME confusion or oversized object | server-owned `media/originals/{asset}/{upload}` key; MIME allowlist; 20 MiB max; private signed PUT; 1–5 minute TTL | `S3SignedUploadIntegrationTest`, `StorageUploadPolicy` | Malware scanning and restore/retention evidence remain T081 |
| SSRF through embed/provider/RPC/signer URL or redirect | server-side references require `ExternalReferencePolicy`: HTTPS, no credentials/fragments, bounded URI, no loopback/private/link-local/metadata host; all fetches use `redirect: error` | `ExternalReferencePolicyTest`; BFF trusted-origin tests; `apps/web/server/api/*` fetch options | DNS rebinding cannot be solved by string validation; each adapter must pin resolution and enforce network egress ACLs |
| p5 payload escapes the trusted runtime or exhausts the browser | schema fixes preset/parameters, rejects shader/remote code fields; runtime registry is a finite local allowlist; p5 is lazy, bounded and one-loop | content boundary tests, creative registry tests, T079 lifecycle/performance tests | New presets require a new reviewed contract; no dynamic import from content |
| Authorization confusion or route widening | API matcher order is public GET → exact role prefixes → deny-all; method security enabled; web BFF has separate reader/studio path allowlists and forwards only selected headers | `OidcSecurityConfiguration`, `OidcSecurityFallbackTest`, reader/studio proxy tests | Resource-level ownership checks remain required in each mutating service |
| Dependency or build supply-chain compromise | exact manifest versions and lockfile; CI runs frozen install, pnpm audit, Gradle dependency resolution, Trivy and CodeQL; action refs are pinned | `.github/workflows/ci.yml`, `.github/workflows/security.yml`, exact-head artifact | A high/critical finding blocks acceptance; Security owner records remediation issue |
| Future provider/SIWE replay, phishing or signer misuse | no runtime feature in T080; boundary contract requires provider allowlist, SIWE domain/chain/nonce/expiry binding, single-use nonce store, explicit RPC/IPFS allowlist and signer isolation | this section plus `ExternalReferencePolicy` tests; future implementation must add tests-first RED | T087–T096 are out of scope and cannot be implied complete |

## Hardening invariants

1. Public published content stays readable without an OIDC provider, but every
   protected route fails closed when authentication is absent or malformed.
2. A URL supplied by content or a client is never used as a server fetch target
   without a typed policy check. Browser navigation links are not server-side
   embeds.
3. CSP never grants `unsafe-inline`, `unsafe-eval`, remote modules or arbitrary
   frames. A configured API origin is copied into CSP only after the trusted
   origin check; loopback/private origins require the explicit `COURTSIDE_E2E=1`
   local test opt-in.
4. Provider and signer adapters receive opaque, bounded contracts. They do not
   receive browser bearer tokens, arbitrary object keys or raw content code.
5. Any changed source after CI/Security evidence invalidates the receipt. The
   final receipt must name the exact head, test commands/artifacts, CI run,
   Security run, review-thread count and protected-merge result.

## Acceptance record (filled at release review)

| Field | Required value |
| --- | --- |
| Source head | exact commit SHA under review |
| Tests-first RED | commit/test output proving the contract failed before implementation |
| Targeted checks | API security tests, web integration security tests, schema/creative tests |
| CI | successful exact-head CI run URL/ID |
| Security | successful exact-head Security run URL/ID; no untracked high/critical finding |
| Review | zero unresolved threads; scope limited to T080 |
| Merge gate | protected branch reports mergeable and merge performed only by release owner |
