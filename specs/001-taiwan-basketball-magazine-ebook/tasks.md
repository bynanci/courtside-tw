# Tasks: 台灣籃球雜誌電子書

**Input**: `spec.md` and `plan.md` from `/specs/001-taiwan-basketball-magazine-ebook/`
**Prerequisites**: `spec.md`, `plan.md`
**Tests**: Required. The specification explicitly makes contract, unit, integration, E2E, accessibility and performance tests release gates. Tests for each User Story must be written first and observed failing for the intended reason.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it writes different files and has no unfinished dependency.
- **[US1]…[US12]**: Traceability to the user story in `spec.md`.
- Every task names the main file path(s); generated files are never edited by hand.
- Check a task only when its described verification passes and evidence is attached to the PR or task record.

## Phase 1: Setup and Governance

**Purpose**: Establish the repository, project rules and reproducible development baseline.

- [x] T001 Write and approve the provisional engineering gates from `plan.md` as the project constitution in `.specify/memory/constitution.md`; include contract-first development, immutable publication, rights-before-release, tests, accessibility, performance, progressive enhancement, Web3 least agency, least privilege and recovery gates.
- [x] T002 Resolve the remaining pre-implementation decisions and record them in `docs/adr/0001-application-topology.md`, `docs/adr/0002-identity-and-hosting-providers.md`, `docs/adr/0003-content-document-and-media-policy.md`, `docs/adr/0004-free-mvp-access-policy.md`, `docs/adr/0005-motion-and-generative-runtime.md`, and `docs/adr/0006-web3-provenance-boundary.md`; include the brand/font asset owner, allowed motion patterns, first p5 preset, poster/reduced-motion policy, Web3 scope/provider/signer/gas/rights exit conditions, and stop implementation if paid or token-gated access replaces the free MVP assumption. Completion proof: PR #4 merged the six ADRs as ACCEPTED; this reconciliation binds current-main status drift without rewriting historical evidence.
- [x] T003 Create the monorepo and root commands in `pnpm-workspace.yaml`, `package.json`, `.node-version`, `.npmrc`, `Makefile`, and `README.md`; provide deterministic `setup`, `dev`, `lint`, `typecheck`, `test`, `contract`, and `verify` commands.
- [x] T004 [P] Scaffold the Nuxt 4.5 application with Node.js 24 LTS in `apps/web/package.json`, `apps/web/nuxt.config.ts`, `apps/web/tsconfig.json`, and `apps/web/app/app.vue`; verify SSR returns HTML from a smoke route. Completion proof: PR #15 merged to `main` as `dec6368`, PR #16 recorded checkbox completion at `bf00db7`, and final status read-back is in `.loop/evidence/t004-main-readback.json`.
- [x] T005 [P] Scaffold the Java 21/Spring Boot 4.1 application and `api`/`worker` profiles in `apps/api/build.gradle.kts`, `apps/api/settings.gradle.kts`, `apps/api/src/main/java/tw/basketball/magazine/MagazineApplication.java`, and `apps/api/src/main/resources/application.yml`; verify both profiles boot. Completion proof: PR #10 merged and read back from `main` in `.loop/evidence/t005-completion-receipt.json`.
- [x] T006 [P] Configure shared formatting, linting and strict type checks in `eslint.config.mjs`, `prettier.config.mjs`, `packages/tsconfig/base.json`, `apps/api/config/checkstyle/checkstyle.xml`, and `apps/api/config/spotbugs/exclude.xml`; make warnings fail CI where deterministic. Completion proof: PR #20 merged at `6ab687e`; Java quality receipt is `.loop/evidence/t006-java-quality-proof.json`; final completion/read-back receipts are recorded under `.loop/evidence/t006-completion-receipt.json` and `.loop/evidence/t006-main-readback.json`.
- [x] T007 Create reproducible local dependencies in `infra/compose/compose.yaml`, `infra/compose/.env.example`, and `scripts/dev/check-dependencies.sh` for PostgreSQL 18, S3 emulator and OIDC stub; add health checks and no production secrets. Completion proof: PR #24; static proof PASS; runtime health proof explicitly accepted by Mark as a bounded follow-up for T008 CI revalidation.
- [x] T008 Create CI pipelines in `.github/workflows/ci.yml`, `.github/workflows/security.yml`, and `.github/dependabot.yml` that cache dependencies, run contract/lint/type/unit/integration checks, scan secrets/dependencies/containers and preserve test reports. Completion proof: PR #25 merged at `e857d50`; CI run #14 (`31165512729`) and Security run #14 (`31165512727`) passed, including PostgreSQL, S3 and OIDC image scans; final runtime receipt is `.loop/evidence/t008-runtime-verification-final.json`; completion receipt is `.loop/evidence/t008-completion-receipt.json`.

**Checkpoint**: A clean clone can run `make setup && make verify`; T001 and T002 are approved, not merely drafted.

**Alignment gate**: T005 must be checked before T004. Product/domain/passport alignment T097 must be merged and read back from `main` before T004 is dispatched. T004 remains a Nuxt scaffold task only.

---

## Phase 2: Foundational Contracts and Infrastructure

**Purpose**: Build the blocking infrastructure shared by every user story.

> **CRITICAL**: No User Story implementation begins until T009–T023 pass in CI.

- [x] T009 Define `ContentDocument` v1 and the allowed MVP blocks in `contracts/content-document.schema.json`, `packages/content-schema/fixtures/valid/`, and `packages/content-schema/fixtures/invalid/`; cover paragraph with inline links, heading, list, quote, divider, image, gallery, stat, video, related-reading and `generative-canvas`, whose payload is limited to approved `presetId`, seed, bounded parameters, `posterAssetId`, alt text and data summary—never code, shader or arbitrary URL.
- [x] T010 Implement schema validation and generated TypeScript types in `packages/content-schema/src/index.ts`, `packages/content-schema/scripts/generate-types.ts`, `apps/api/src/main/java/tw/basketball/magazine/content/validation/ContentDocumentValidator.java`, and their tests; run the same valid/invalid fixtures in TypeScript and Java to prove parity. Completion proof: PR #37 merged to `main` at `4946c8d`; GitHub CI/Security run #78 passed, including TypeScript/Java fixture parity and Java quality checks.
- [x] T011 Define the full planned API v1 contract, auth schemes, pagination, idempotency, optimistic locking and Problem Details models in `contracts/openapi.yaml`; include the public, reader, editorial, offline, provenance and optional SIWE operations from `plan.md`, then lint examples and stable error codes for `400`, `401`, `403`, `404`, `409`, `422`, and `429`.
- [x] T012 Generate—not hand-edit—the TypeScript client from `contracts/openapi.yaml` into `packages/api-client/src/generated/`, expose a stable wrapper from `packages/api-client/src/index.ts`, and add `packages/api-client/tests/generated-client.test.ts` plus a CI diff check. Completion proof: PR #38 merged to `main` at `4c20ba2`; GitHub CI/Security run #80 passed, and local frozen install, audit, and `make verify` passed.
- [x] T013 Create the database foundation in `apps/api/src/main/resources/db/migration/V001__foundation.sql`: required extensions, OIDC subject mapping, role assignments, media asset/rights/variant tables, audit events and outbox events; application DB role must not update/delete `audit_event` rows. Completion proof: PR #40 merged to `main` at `7737099`; GitHub CI/Security run #84 passed, including isolated PostgreSQL forward migration and negative application-audit privilege checks.
- [x] T014 Implement common IDs, clocks, actor context, optimistic version handling and RFC 9457 mapping in `apps/api/src/main/java/tw/basketball/magazine/shared/`; add deterministic unit tests under `apps/api/src/test/java/tw/basketball/magazine/shared/`. Completion proof: PR #43 merged to `main` at `79b89d6`; exact-head CI/Security #96 passed on `1a207684`; Unicode-control and canonical-ETag review findings were repaired with regression tests; completion/read-back is recorded in `.loop/evidence/t014-completion-receipt-20260808.json`.
- [x] T015 [P] Implement Spring Security OIDC resource-server validation and role policies in `apps/api/src/main/java/tw/basketball/magazine/identity/` and `apps/api/src/test/java/tw/basketball/magazine/identity/`; test issuer, audience, missing role, expired token and privilege-escalation rejection. Completion proof: PR #45 merged at `2e364d42`; bounded hardening PR #46 merged at `35d5d6a`; exact-head CI/Security #120 passed on `59ffd879`; review threads were empty; and the completion/main read-back receipts are recorded in `.loop/evidence/t015-completion-reconciliation-20260808.json` and `.loop/evidence/t015-post-receipt-main-readback-20260808.json`.
- [x] T016 [P] Implement the Nuxt BFF OIDC authorization-code/PKCE session in `apps/web/server/auth/`, `apps/web/server/middleware/auth.ts`, and `apps/web/tests/integration/auth-session.test.ts`; use Secure/HttpOnly/SameSite cookies, session rotation, CSRF protection and no browser token storage. Completion proof: [PR #53](https://github.com/bynanci/courtside-tw/pull/53) merged at `dde0907`; exact-head [CI #200](https://github.com/bynanci/courtside-tw/actions/runs/31290581944) and [Security #200](https://github.com/bynanci/courtside-tw/actions/runs/31290581945) passed. Production IdP activation and durable session-store selection remain out of scope.
- [x] T017 [P] Implement append-only audit writing and sanitized actor/target metadata in `apps/api/src/main/java/tw/basketball/magazine/audit/`; add integration tests proving sensitive tokens, article bodies and signed URLs are never recorded. Completion proof: [PR #54](https://github.com/bynanci/courtside-tw/pull/54) merged at `aca6e90`; exact-head [CI #201](https://github.com/bynanci/courtside-tw/actions/runs/31290582448) and [Security #201](https://github.com/bynanci/courtside-tw/actions/runs/31290582449) passed.
- [x] T018 Implement the transactional outbox claim/lease/retry/dead-letter worker in `apps/api/src/main/java/tw/basketball/magazine/outbox/` with Testcontainers tests under `apps/api/src/test/java/tw/basketball/magazine/outbox/`; prove crash recovery and duplicate-delivery idempotency. Completion proof: PR #49 merged at `61265f5`; exact-head CI/Security #151 passed on `0e1fb06`; bounded lease cleanup, concurrent claim race, durable idempotency and credential-redaction regressions were verified; main read-back confirms the implementation is present.
- [x] T019 [P] Implement the S3-compatible storage port and signed upload constraints in `apps/api/src/main/java/tw/basketball/magazine/media/storage/`; integration-test key binding, expiry, maximum size, MIME allowlist and private original objects. Completion proof: [PR #55](https://github.com/bynanci/courtside-tw/pull/55) merged at `b407afb`; exact-head [CI #183](https://github.com/bynanci/courtside-tw/actions/runs/31266675498) and [Security #183](https://github.com/bynanci/courtside-tw/actions/runs/31266675493) passed. Provider credentials and production activation remain out of scope.
- [x] T020 Implement media completion validation and variant processing in `apps/api/src/main/java/tw/basketball/magazine/media/processing/`; verify magic bytes/checksum, remove unnecessary EXIF, create configured variants, and transition only valid assets to `READY`. Completion proof: [PR #58](https://github.com/bynanci/courtside-tw/pull/58) merged at `855dcda`; exact-head [CI #203](https://github.com/bynanci/courtside-tw/actions/runs/31290771668) and [Security #203](https://github.com/bynanci/courtside-tw/actions/runs/31290771670) passed.
- [x] T021 [P] Configure OpenTelemetry, Micrometer, JSON logging, trace/request IDs and actuator health groups in `apps/api/src/main/java/tw/basketball/magazine/shared/observability/`, `apps/api/src/main/resources/logback-spring.xml`, and `apps/web/server/plugins/observability.ts`; include non-identifying motion/p5 lifecycle and provenance job signals, and test log/metric-label redaction. Completion proof: [PR #56](https://github.com/bynanci/courtside-tw/pull/56) merged at `79c3284`; exact-head [CI #199](https://github.com/bynanci/courtside-tw/actions/runs/31290536061) and [Security #199](https://github.com/bynanci/courtside-tw/actions/runs/31290536076) passed. Exporter activation and credentials remain out of scope.
- [x] T022 Create shared Testcontainers, OIDC stub, S3 emulator, Playwright and seed fixtures in `apps/api/src/test/java/tw/basketball/magazine/testsupport/`, `apps/web/tests/fixtures/`, and `scripts/test/seed-e2e.ts`; provide published, draft, withdrawn, expired-rights, reduced-motion and valid/invalid fixed-seed generative-canvas cases. Completion proof: [PR #57](https://github.com/bynanci/courtside-tw/pull/57) merged at `37fe4b6`; exact-head [CI #182](https://github.com/bynanci/courtside-tw/actions/runs/31266550050) and [Security #182](https://github.com/bynanci/courtside-tw/actions/runs/31266550063) passed. Fixtures remain opt-in and contain no production data or external writes.
- [x] T023 Add module boundary, HTTP security header, CSP, payload limit and route-specific rate-limit tests in `apps/api/src/test/java/tw/basketball/magazine/architecture/`, `apps/api/src/test/java/tw/basketball/magazine/security/`, and `apps/web/tests/integration/security-headers.test.ts`; enforce module dependencies with ArchUnit and prove content payload cannot enable `eval`, remote modules, user shaders or arbitrary canvas fetches. Completion proof: [PR #59](https://github.com/bynanci/courtside-tw/pull/59) merged at `a24482e`; exact-head [CI #205](https://github.com/bynanci/courtside-tw/actions/runs/31290898465) and [Security #205](https://github.com/bynanci/courtside-tw/actions/runs/31290898464) passed. Production rate-limit provider and rollout remain out of scope.

**Checkpoint**: Contracts compile on both runtimes, auth and upload boundaries reject invalid inputs, outbox replay is idempotent, and local/CI integration environments are reproducible.

---

## Phase 3: User Story 1 — Browse an Issue and Start Reading (P1 / MVP)

**Goal**: An anonymous reader can browse published issues, inspect an ordered table of contents and open an article route within three interactions.

**Independent Test**: Start from a clean mobile browser with no session/cache, open the latest issue and reach the selected published article header; draft/withdrawn content never appears.

### Tests for User Story 1 — write first

- [x] T024 [P] [US1] Write failing public issue contract/integration tests for FR-001–FR-003 in `apps/api/src/test/java/tw/basketball/magazine/publication/api/PublicIssueApiIT.java`; cover cursor pagination, ordered sections, draft filtering, withdrawn issue and unknown slug.
- [x] T025 [P] [US1] Write a failing mobile Playwright journey in `apps/web/tests/e2e/us1-browse-issue.spec.ts` and accessibility assertions in `apps/web/tests/e2e/us1-browse-issue.a11y.spec.ts`; require three-or-fewer interactions from `/` to an article and prove route／TOC motion never hides SSR links before hydration or under reduced-motion.

### Implementation for User Story 1

- [x] T026 [US1] Add issue, section, article identity, article revision and issue ordering tables with publication-state constraints in `apps/api/src/main/resources/db/migration/V002__publication_content_core.sql`; include stable UUIDs, unique slugs, positions and optimistic versions.
- [x] T027 [US1] Implement issue aggregates, ordering invariants and published read repositories in `apps/api/src/main/java/tw/basketball/magazine/publication/domain/` and `apps/api/src/main/java/tw/basketball/magazine/publication/persistence/`; repository queries must not expose draft fields to public projections.
- [x] T028 [US1] Implement `GET /api/v1/public/issues` and `/api/v1/public/issues/{issueSlug}` in `apps/api/src/main/java/tw/basketball/magazine/publication/api/PublicIssueController.java` and application services under `publication/application/`; add ETag and bounded cursor validation.
- [x] T029 [P] [US1] Build issue cover, issue card, section TOC and article-summary components with component tests in `apps/web/app/features/issues/components/` and `apps/web/tests/component/issues/`; preserve image aspect ratio and semantic heading order, and use centralized `motion-v` variants only for approved cover／TOC patterns with CSS or no-motion fallback.
- [x] T030 [US1] Build SSR routes `/`, `/issues`, `/issues/[issueSlug]`, and a minimal `/articles/[articleSlug]` article-header handoff in `apps/web/app/pages/`, using only `packages/api-client`; handle empty catalog, not-found and withdrawn states without leaking draft metadata.
- [x] T031 [US1] Implement issue canonical URLs, Open Graph, JSON-LD, robots decisions and issue sitemap entries in `apps/web/app/features/issues/seo/`, `apps/web/server/routes/sitemap.xml.ts`, and `apps/web/tests/integration/issue-seo.test.ts`.

**Checkpoint**: T024/T025 pass; US1 works independently. This is a deployable catalog slice even before rich article blocks are enabled.

---

## Phase 4: User Story 2 — Read a Long-form Article (P1 / MVP)

**Goal**: A reader can consume a responsive, accessible, shareable article and navigate within its issue while retaining local reading position.

**Independent Test**: Render one fixture containing every supported content block across phone/tablet/desktop, with JavaScript enabled and disabled, then reload and resume from the last stable block anchor.

### Tests for User Story 2 — write first

- [x] T032 [P] [US2] Write failing article projection and authorization tests for FR-004–FR-010 in `apps/api/src/test/java/tw/basketball/magazine/content/api/PublicArticleApiIT.java`; cover published revision selection, withdrawn/draft/history denial, media rights and issue navigation.
- [x] T033 [P] [US2] Write failing reader E2E tests in `apps/web/tests/e2e/us2-read-article.spec.ts`, `apps/web/tests/e2e/us2-no-js.spec.ts`, `apps/web/tests/e2e/us2-reduced-motion.spec.ts`, and visual fixtures in `apps/web/tests/fixtures/content-document-v1.json`; include image failure, reload resume, previous/next navigation, SSR generative poster, lazy p5 load, fixed-seed output, visibility pause and route-unmount disposal.

### Implementation for User Story 2

- [x] T034 [US2] Implement immutable revision, contributor credit, content extraction and published-article projection logic in `apps/api/src/main/java/tw/basketball/magazine/content/domain/`, `content/application/`, and `content/persistence/`; compute reading time and plain text server-side.
- [x] T035 [US2] Implement `GET /api/v1/public/articles/{articleSlug}` with ETag, canonical metadata, visible media variants and snapshot-based issue navigation in `apps/api/src/main/java/tw/basketball/magazine/content/api/PublicArticleController.java`.
- [x] T036 [US2] Create a total, deny-by-default block renderer registry in `apps/web/app/components/content-blocks/ContentDocumentRenderer.vue`, `apps/web/app/components/content-blocks/registry.ts`, and `apps/web/tests/component/content-blocks/registry.test.ts`; unknown block/preset versions render poster + summary fallback and telemetry code without dynamic module resolution from content.
- [x] T037 [P] [US2] Implement and component-test the v1 text blocks in `apps/web/app/components/content-blocks/text/`, media/data blocks in `apps/web/app/components/content-blocks/media/`, and the `generative-canvas` host/preset registry in `apps/web/app/components/content-blocks/creative/` plus `packages/creative-runtime/`; use p5.js 2.x instance mode, client-only dynamic import, fixed seed, bounded parameters, `noLoop()`／`remove()` lifecycle and no unrestricted `v-html` or remote code.
- [x] T038 [US2] Build the complete article SSR route, magazine typography, byline/rights credits, progress indicator, responsive media and centralized Motion system in `apps/web/app/pages/articles/[articleSlug].vue`, `apps/web/app/features/reader/`, `apps/web/app/features/motion/`, and `apps/web/app/assets/css/article.css`; content is final-visible before hydration and all patterns have reduced-motion variants.
- [x] T039 [US2] Implement stable block-anchor local reading progress and explicit resume behavior in `apps/web/app/features/reader/composables/useLocalReadingProgress.ts`; unit-test viewport/font-size changes and stale revision invalidation in `apps/web/tests/unit/reader/`.
- [x] T040 [P] [US2] Implement previous/next/TOC navigation, native share fallback and related metadata in `apps/web/app/features/reader/components/ArticleNavigation.vue`, `ShareArticleButton.vue`, and their component tests.
- [x] T041 [US2] Add article SEO/no-JS output, axe checks, animation interruption tests and Lighthouse/bundle budgets in `apps/web/app/features/reader/seo/`, `apps/web/tests/e2e/us2-read-article.a11y.spec.ts`, `apps/web/tests/e2e/us2-creative-lifecycle.spec.ts`, and `apps/web/lighthouserc.cjs`; enforce LCP/CLS/INP, fixed media dimensions, no p5 chunk on ordinary pages and zero leaked canvas/loop/listener after 20 route switches.

**Checkpoint**: US1 and US2 pass independently and together; public P1 reading is beta-ready, but editorial production is not ready until US3.

---

## Phase 5: User Story 3 — Edit, Review and Publish an Issue (P1 / MVP)

**Goal**: Editors can create content and media, publishers can review and atomically publish/schedule/withdraw it, and every sensitive action is auditable.

**Independent Test**: Use separate `EDITOR` and `PUBLISHER` accounts to create a two-article issue, trigger a rights failure, fix it, submit, approve, schedule, publish, revise and withdraw it without database intervention.

### Tests for User Story 3 — write first

- [x] T042 [P] [US3] Write failing state-machine and rights-decision unit tests for FR-011–FR-025 in `apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java` and `apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java`.
- [x] T043 [P] [US3] Write failing editorial API integration tests for role boundaries, `If-Match`, idempotency, scheduling and Problem Details in `apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java` and `apps/api/src/test/java/tw/basketball/magazine/media/api/EditorialMediaApiIT.java`.
- [x] T044 [P] [US3] Write the failing two-role Studio E2E workflow in `apps/web/tests/e2e/us3-editorial-publication.spec.ts`; include concurrent edit conflict, missing rights, Asia/Taipei schedule, retry, revision and emergency withdrawal.

### Implementation for User Story 3

- [x] T045 [US3] Add workflow reviews, rights references, publication snapshots, jobs, idempotency records and impact links in `apps/api/src/main/resources/db/migration/V004__editorial_publication_workflow.sql`; enforce immutable snapshot and unique idempotency constraints.
- [x] T046 [US3] Implement allowed state transitions, role checks, frozen review revisions and conflict responses in `apps/api/src/main/java/tw/basketball/magazine/publication/domain/` and `publication/application/EditorialWorkflowService.java`.
- [x] T047 [US3] Implement the content/media publication gate in `apps/api/src/main/java/tw/basketball/magazine/media/domain/RightsPolicy.java` and `publication/application/PublicationReadinessService.java`; return exact stable blocking codes for missing, expired, revoked or wrong-channel rights.
- [x] T048 [US3] Implement signed upload intent/completion endpoints and worker dispatch in `apps/api/src/main/java/tw/basketball/magazine/media/api/EditorialMediaController.java` and `media/application/`; re-check size, checksum, magic bytes and processing state server-side.
- [x] T049 [P] [US3] Build the media library, upload state UI, alt text, credit and rights form in `apps/web/app/features/studio/media/` with component tests in `apps/web/tests/component/studio/media/`; prevent submission while processing or invalid.
- [x] T050 [US3] Implement issue/article/revision editorial CRUD endpoints with optimistic locking in `apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialIssueController.java`, `content/api/EditorialArticleController.java`, and their application services.
- [x] T051 [US3] Build the schema-constrained article editor and preview in `apps/web/app/features/studio/editor/` and `/studio/articles/[id].vue`; serialize only valid `ContentDocument` v1, expose only approved generative preset controls with bounded inputs and poster/summary requirements, surface server field/block errors and preserve unsaved-work conflict recovery.
- [x] T052 [P] [US3] Build the issue editor, section management and accessible sortable TOC in `apps/web/app/features/studio/issues/` and `/studio/issues/[id].vue`; persist explicit positions and offer keyboard reordering.
- [x] T053 [US3] Build review queue, readiness report and publisher-only actions in `apps/web/app/features/studio/review/`, `/studio/review/index.vue`, and authorization tests under `apps/web/tests/integration/studio-rbac.test.ts`.
- [x] T054 [US3] Implement atomic publish/schedule execution, snapshot checksum, audit/outbox writes and worker processing in `apps/api/src/main/java/tw/basketball/magazine/publication/application/PublicationService.java`, `publication/worker/PublicationJobHandler.java`, and integration tests; retries must return one publication result.
- [x] T055 [US3] Implement new-revision correction, republish, archive, emergency withdrawal, asset revocation impact and audit query endpoints in `apps/api/src/main/java/tw/basketball/magazine/publication/api/PublisherController.java`, `media/api/PublisherMediaController.java`, and `audit/api/AuditController.java`; add Studio views under `apps/web/app/features/studio/audit/`.
- [x] T056 [US3] Complete concurrency, expired-rights-at-execution, duplicate-worker, partial-external-failure and cache/search invalidation integration tests in `apps/api/src/test/java/tw/basketball/magazine/publication/PublicationReliabilityIT.java`; verify public origin denies withdrawn content before external purge succeeds. Completion proof: the final candidate head must show production `PublicationExternalInvalidator` delivery through the durable outbox, one retry with the same idempotency key, origin denial before purge completion, and CI/Security artifacts containing an `exact-head.json` manifest whose `source_head_sha` equals that candidate head.

**Checkpoint**: P1 is feature-complete. Editors can continuously publish real issues without engineer intervention, and public content, search placeholder, caches and audit state remain consistent under retry/failure.

---

## Phase 6: User Story 4 — Search and Explore Taiwan Basketball (P2)

**Goal**: Readers can find public content by Traditional Chinese keywords and data-managed basketball taxonomy.

**Independent Test**: Use a curated cross-issue dataset with aliases, renamed teams and same-name players; validate query/filter results and prove drafts/withdrawn revisions are absent.

### Tests for User Story 4 — write first

- [x] T057 [P] [US4] Write failing search contract, freshness and E2E tests in `apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java` and `apps/web/tests/e2e/us4-search.spec.ts`; include empty, punctuation-only, zh-TW/English mixed, alias and withdrawn cases. Completion proof: the RED contract was authored in candidate `892313640f2b80aa8680341c58882a12c283a7d3`; the final PR #94 head `22d1fdbefad9e94f52f5580fae78f7340a38d97f` passed CI #520 and Security #521, including the full browser regression and US4 search cases.

### Implementation for User Story 4

- [x] T058 [US4] Add taxonomy terms/aliases/validity, article taxonomy and public search projection with `pg_trgm` indexes in `apps/api/src/main/resources/db/migration/V012__taxonomy_and_search.sql` (V005 is already occupied by editorial publication gate hardening).
- [x] T059 [P] [US4] Implement taxonomy domain/API and Studio taxonomy management in `apps/api/src/main/java/tw/basketball/magazine/taxonomy/` and `apps/web/app/features/studio/taxonomy/`; names are attributes, never identifiers. Completion additionally requires a production article-revision taxonomy assignment path, transactional audit events for taxonomy mutations, and rejection of empty patches. Completion proof: PR #98 implementation head `bac1659367468ac682b921709c36d6cfa96d2afd` passed exact-head CI #546 and Security #547, including the article-taxonomy assignment, rollback, immutable audit and empty-patch integration cases.
- [x] T060 [US4] Implement versioned search projection updates from publication/withdrawal outbox events in `apps/api/src/main/java/tw/basketball/magazine/search/worker/SearchProjectionHandler.java`; reject any draft source and record source checksum. Completion additionally requires linked article publication to project without requiring the containing issue to have already reached `PUBLISHED`. Completion proof: PR #98 implementation head `bac1659367468ac682b921709c36d6cfa96d2afd` passed exact-head CI #546 and Security #547, including projection before containing-Issue publication and origin visibility after Issue publication.
- [x] T061 [US4] Implement normalized, weighted, cursor-based `GET /api/v1/public/search` and taxonomy filter endpoints in `apps/api/src/main/java/tw/basketball/magazine/search/api/PublicSearchController.java` and `search/application/SearchService.java`. Completion additionally requires either implementing issue results or removing the advertised issue type, plus aligning public `person` and `venue` taxonomy types across server and OpenAPI clients. Completion proof: PR #98 implementation head `bac1659367468ac682b921709c36d6cfa96d2afd` passed exact-head CI #546 and Security #547 with issue search removed from the contract, fail-closed server validation, and aligned `person`/`venue` client types.
- [x] T062 [US4] Build SSR search/filter/result/empty-state UI in `apps/web/app/pages/search.vue` and `apps/web/app/features/search/`; synchronize accessible filters with URL query state, cancel stale requests, and expose subsequent cursor pages. Completion proof: PR #98 implementation head `bac1659367468ac682b921709c36d6cfa96d2afd` passed exact-head CI #546 and Security #547, including accessible taxonomy URL synchronization and opaque next-cursor browser coverage.
- [x] T063 [US4] Create the curated relevance set and performance/freshness gate in `apps/api/src/test/resources/search/zh-tw-relevance.json`, `apps/api/src/test/java/tw/basketball/magazine/search/SearchRelevanceTest.java`, and `tests/performance/search.js`; report NDCG@10 and escalation conditions.

**Checkpoint**: US4 works without a dedicated search cluster and meets relevance, p95 and 60-second freshness targets.

---

## Phase 7: User Story 5 — Bookmark and Continue Across Devices (P2)

**Goal**: Logged-in readers can bookmark articles and synchronize revision-aware reading progress with an explicit local/server merge.

**Independent Test**: Use two independent browser sessions with the same reader; verify bookmark sync, newer-progress resolution, withdrawn content handling and account deletion.

### Tests for User Story 5 — write first

- [x] T064 [P] [US5] Write failing reader-library contract, merge property tests and cross-device E2E tests in `apps/api/src/test/java/tw/basketball/magazine/readerlibrary/`, `apps/web/tests/e2e/us5-reader-library.spec.ts`, and `apps/web/tests/e2e/us5-account-deletion.spec.ts`. Completion proof: tests-first subject `98e039c54e7d2f92ec5e1a1c3c0393b280b53941` defined the API/property/browser contracts; implementation head `0ff6e2119fa344bae908e306f8701325e173ebd0` passed exact-head CI #556 and Security #557, including 5/5 reader-library API integration tests, 2/2 merge-policy tests and all 6 US5 browser scenarios.

### Implementation for User Story 5

- [x] T065 [US5] Add reader profile, bookmarks, revision-aware progress and erasure-job tables in `apps/api/src/main/resources/db/migration/V014__reader_library.sql` (V006 is already occupied); enforce unique bookmarks and bounded progress. Completion proof: exact-head CI #556 applied V014 through PostgreSQL/Testcontainers and passed the five reader-library integration cases.
- [x] T066 [US5] Implement idempotent bookmark and progress APIs in `apps/api/src/main/java/tw/basketball/magazine/readerlibrary/api/` and `readerlibrary/application/`; do not return withdrawn article bodies or stale revision positions. Completion proof: `ReaderLibraryApiIT` passed 5/5 on implementation head `0ff6e2119fa344bae908e306f8701325e173ebd0`, including duplicate bookmark, withdrawn metadata-only response and stale-revision denial.
- [x] T067 [US5] Implement local/server merge preview and apply logic in `apps/api/src/main/java/tw/basketball/magazine/readerlibrary/domain/ProgressMergePolicy.java` and `apps/web/app/features/library/composables/useProgressMerge.ts`; preserve the newer valid update and require explicit user confirmation. Completion proof: 2/2 generated merge-policy tests plus the API and two-device browser merge paths passed exact-head CI #556.
- [x] T068 [P] [US5] Add bookmark and signed-in progress controls to `apps/web/app/features/reader/` and build `/library` in `apps/web/app/pages/library.vue` with components under `apps/web/app/features/library/`; include unavailable-content states. Completion proof: exact-head browser verification passed the complete 43-test regression, including bookmark synchronization and withdrawn-content UI.
- [x] T069 [US5] Implement verified export/deletion orchestration and audit-safe status in `apps/api/src/main/java/tw/basketball/magazine/identity/application/AccountDataService.java`, `identity/api/AccountController.java`, and `apps/web/app/pages/settings/privacy.vue`. Completion proof: stale-auth rejection, verified deletion, immutable non-identifying receipt, export/privacy UI and account-deletion browser paths passed CI #556; Security #557 passed all eight security contexts.
- [x] T070 [US5] Run and stabilize revision-change, concurrent-device, logout, session-expiry and withdrawn-bookmark scenarios in `apps/web/tests/e2e/us5-reader-library.spec.ts`; document the merge contract in `docs/product/reading-progress.md`. Completion proof: all 6 US5 browser scenarios passed inside the 43-test exact-head browser suite on `0ff6e2119fa344bae908e306f8701325e173ebd0`; the merge contract is checked in and T071+ remains untouched.

**Checkpoint**: US5 is independently deployable behind reader-login feature flags and does not alter anonymous reading availability.

---

## Phase 8: User Story 6 — Save an Issue Offline (P3)

**Goal**: A reader can reliably download an offline-eligible published issue, verify completion, update it and remove or invalidate it after withdrawal.

**Independent Test**: Download an issue under throttled network, go offline and read it; then reconnect to test update, rights withdrawal, quota failure and cleanup.

### Tests for User Story 6 — write first

- [x] T071 [P] [US6] Write failing manifest contract and browser offline tests in `apps/api/src/test/java/tw/basketball/magazine/publication/api/OfflineManifestApiIT.java` and `apps/web/tests/e2e/us6-offline-issue.spec.ts`; simulate interruption, corruption, quota denial, update and withdrawal. Completion proof: exact head `7890229a5e6e91bb859445d2932cd7dc89281995`; CI #570 browser job `95088190283` ran the complete suite with all five US6 scenarios passing (`48 passed`), and Security #571 passed all required checks. The historical RED attribution is retained in `.loop` evidence; T073+ remains untouched.

### Implementation for User Story 6

- [x] T072 [US6] Implement signed/versioned issue and withdrawal manifests with revision IDs, rights expiry, asset bytes and checksums in `apps/api/src/main/java/tw/basketball/magazine/publication/api/OfflineManifestController.java` and `publication/application/OfflineManifestService.java`. Completion proof: implementation head `e2436f0d5c063d029c66226cd01afdd43fee99d3`; CI #567 Java quality/unit, frontend/contract and Compose health passed; Security #568 dependency audit, CodeQL and all Trivy image/filesystem scans passed. The downstream T071 browser contracts now pass on the bounded implementation head `7890229a5e6e91bb859445d2932cd7dc89281995`; T073+ remains untouched.
- [x] T073 [US6] Configure the PWA app-shell service worker separately from issue content caches in `apps/web/nuxt.config.ts`, `apps/web/app/service-worker/`, and `apps/web/tests/integration/service-worker-policy.test.ts`; never precache editorial or preview routes. Completion proof: tests-first RED at `1886a8816092151c70b925249746dc91eeff4e6e` failed only at the missing `offline-app-shell.ts` seam; implementation head `3170b86f2b9d1fd1022969be2c3d54dd1a5cd224` passed exact-head CI #579 (browser job `95103122322`) and Security #580; final receipt-head verification is attached to PR #101. T074+ remains unchanged.
- [x] T074 [US6] Implement temporary-download, checksum verification and atomic install/update/delete in `apps/web/app/features/offline/services/OfflineIssueManager.ts`; store manifest state in IndexedDB and never mark partial content complete. Completion proof: tests-only head `1ad03e6a5f05c5966c09c7ec234f5e7ccc2df731` produced attributable CI #595 RED (`104` tests, `103` passed); review-driven concurrency head `374cad4a12fed29d73975c1153cee34eabd8d223` produced attributable CI #598 RED (`104` tests, `103` passed) for a same-issue candidate-cache race. Final implementation head `d2eeffc0c038991493e1b7fd859ecce6ee9b844e` passed exact-head CI #599 and Security #600, including `104/104` web tests, the complete `54/54` browser regression and Lighthouse budgets. A receipt-only head will be verified on PR #104 before merge; T075+ remains unchanged.
- [x] T075 [P] [US6] Build storage estimate, download progress, update, expiry and removal UI in `apps/web/app/features/offline/components/` and integrate it with issue/library pages; communicate that web offline is not DRM or permanent availability. Completion proof: tests-only head `7ba74531b13a44942523433eaa2142c6df9f7f15` produced attributable CI #602 RED (`56` browser tests, `54` passed, only the two new T075 surface contracts failed). Final implementation head `abd4456564b39797c85ef98ec158a198dabdf2f7` passed exact-head CI #604 and Security #605, including `106/106` web tests, both T075 browser scenarios and Lighthouse budgets; the green browser job recorded one unrelated existing creative-lifecycle retry. A receipt-only head will be reverified on PR #105 before merge; T076+ remains unchanged.
- [x] T076 [US6] Implement online withdrawal reconciliation and bounded retry in `apps/web/app/features/offline/services/WithdrawalReconciler.ts`; pass T071 across Chromium mobile emulation and at least one supported Android browser smoke test. Completion proof: tests-only head `fd988ed35be97d751d0d0317279526dadf751520` produced attributable RED on the same-head browser rerun (job `95187951373`): 56 tests ran, 55 passed, and only the new reconnect contract failed on both attempts (`expected 3 withdrawal calls, received 0`). Final implementation head `2d1063c5b7f623708c8585f8c1333219d4602b59` passed exact-head CI #613 and Security #614, including `112/112` web tests, `57/57` complete Chromium-mobile browser tests, Lighthouse budgets and Android Chrome job `95194959102`; the Android evidence recorded three bounded attempts, cache removal and null IndexedDB install authority. Review found 0 P0/P1; a receipt-only head will be reverified on PR #106 before merge. T078+ remains unchanged.

**Checkpoint**: US6 meets the product's withdrawal limitation. If immediate revocation on permanently offline devices is required, cancel this phase rather than shipping a false guarantee.

---

## Phase 9: Production Readiness and Cross-Cutting Quality

**Purpose**: Complete the release gates for whichever User Story phases are selected. P1 beta requires all applicable T077–T086 tasks; they are not optional polish.

- [x] T077 [P] Create a realistic first-issue seed pack and editorial operations guide in `apps/api/src/test/resources/fixtures/first-issue/`, `scripts/content/import-seed.ts`, and `docs/operations/editorial-publishing.md`; include rights-valid and intentionally blocked examples. Completion proof: deterministic dry-run seed validation and the public Home → Issue → TOC → Article → Closure browser journey.
- [x] T078 Complete the release-owner-authorized six-layer agent roundtable using `docs/quality/accessibility-test-plan.md`; bind exact-head machine evidence, classify native OS/AT/device/font execution as WAIVED / NOT_RUN rather than PASS, verify every Motion pattern and generative block poster/summary fallback, fix findings in `apps/web/app/`, and archive `artifacts/accessibility/t078-agent-roundtable.json`. T078 acceptance still requires a green exact-head Security gate; native waiver does not waive Security, protected merge approval, T079 rebase/rerun, or T080+/Web3 scope. Completion proof: the archived adjudication binds reviewed implementation head `6c4dd60ffabecb7dbc8c87eb8ed66907bb230aa3`; PR #112's protected conversation must bind its immutable final head to green CI/Security runs and artifact hashes immediately before merge.
- [x] T079 Enforce public performance, bundle and lifecycle budgets in `apps/web/lighthouserc.cjs`, `tests/performance/public-read.js`, and `docs/quality/performance-baseline.md`; test large 20-article issue, representative imagery, cache hit/miss, a generative block on representative Android hardware, no-p5 ordinary routes and background/offscreen pause. Completion proof: tests-first head `d8517886543fb3b79c06b42dffcf15632e501c22` failed at the missing deterministic performance-fixture seam; reviewed implementation parent `5f9a7f037ab0cdf5aa713841f41a8b2fec33ceef` is rebuilt on T078-integrated main `e2a105a8d6596aa0d2a06db3aa4e3525a4338ade`. PR #114's protected conversation must bind its immutable final head to fresh CI 5/5, Security 8/8, downloaded performance/bundle/Lighthouse/Android artifact hashes, zero unresolved threads and current-base mergeability before merge. Evidence from superseded head `ea8777a4bfe3d7204acc08a2b02b0829bd78e179` is historical only; T079 does not replace T078 and T080+ remains untouched.
- [x] T080 Run threat modeling and harden content, OIDC, CSRF, upload, SSRF/embed, p5 preset/payload, EIP-1193 provider, SIWE replay/phishing, signer, RPC/IPFS, authorization and dependency boundaries in `docs/security/threat-model.md`, `apps/api/src/test/java/tw/basketball/magazine/security/`, and `apps/web/tests/integration/security/`; zero critical/high exploitable findings before release of the applicable slice. Completion proof: PR #117 merged at 69de82df855c62550458bbf5ea6f8d0620ba19d0 from exact head fdfcf7833e7d05a1e29648c0b1eb2b1651fecac7; CI #795 and Security #797 passed; release-owner review PASS/no findings; 0 unresolved review threads; T081+ remained out of scope.
- [x] T081 Implement database/media-metadata backup and isolated restore verification in `infra/deployment/backup/`, `scripts/operations/restore-verify.sh`, and `docs/operations/disaster-recovery.md`; capture evidence for RPO 24h/RTO 4h and sampled checksum validation. Completion proof: PR #118 merged to `main@51ada85022abdcaa8afa2847daece81141d5ce43` from final exact head `3fcc7f2f29e5c3d41370fffcebd34d925c4c9911`; CI #816 (run `32390737392`) and Security #818 (run `32390737362`) passed; current final-head artifact `9414805375` digest `sha256:2572e7202c4f8b5429654c7f052ebea5e88e20650c845863925ea54e1264a5b7`; isolated PostgreSQL drill verified 2 media assets/2 variants, 2/2 metadata rows, 2/2 SHA-256 sample, RPO 0.001h <=24h, RTO 0.037m <=240m, explicit target confirmation, and `release_ready=true`; T082+ remained out of scope.
- [x] T082 Create production deployment, expand/migrate/contract migration and rollback runbooks in `infra/deployment/`, `infra/docker/`, `docs/operations/deployment.md`, and `docs/operations/rollback.md`; test application rollback without destructive schema rollback. Completion receipt (2026-08-25): release owner lifted HOLD after PR #136 exact head `771c8dadf42261c7fbb5e62288f058f04598a9de` remediated the four current-main findings tests-first (`6767bfb189ce4a2a612c2516742270398285d501`) and squash-merged to protected `main@769856c626c74b7e5469cfb2351a24879971da1c`; CI #922 (run `32792618336`) passed 5/5, Security #925 (run `32792618080`) passed 8/8, deployment artifact `9543702216` digest `sha256:b27996f374aa362ec56eebd6c218e828a8a43767f911b99c5cf042f9ee94e628` read back 25/25 tests, `release_ready=true`, schema 10→10, `schema_rollback_performed=false` and `destructive_schema_action=false`; Android artifact `9543765105` and browser artifact `9543806359` were exact-head PASS; PR #129 read back 0 unresolved/11 total threads and PR #136 read back 0 unresolved. T083/T084 remain unchecked and undispatched; production activation, provider configuration, secrets, Web3 and participant research remain separate gates.
- [x] T083 Configure SLO dashboards and alerts for public reads, publication jobs, withdrawal, search freshness, media processing, cache purge and dead letters in `infra/observability/dashboards/`, `infra/observability/alerts/`, and `docs/operations/incident-response.md`. Completion proof (2026-08-25): PR #138 implementation head `9dfedfd295cdb6b76f023b68a392ec458de926d5` was marked ready and squash-merged to protected `main@c780abdeac1ee7aaf0f5e1403a36ec262acb4344`; CI #930 passed 5/5, Security #933 passed 8/8, exact-head artifacts and zero unresolved review threads were read back. Provider/receiver/synthetic activation remains off; T084+ and all separately gated research, Web3, production and secret boundaries remain untouched.
- [x] T084 Implement consent-aware minimal product analytics and privacy documentation in `apps/web/app/features/analytics/`, `apps/api/src/main/java/tw/basketball/magazine/analytics/`, and `docs/privacy/data-inventory.md`; never make non-essential analytics consent a condition of public reading. Completion receipt (2026-08-25): PR #141 final head `d405e422a844bbac8a4140c7e5fbf0735c3287d1` passed CI #950 5/5 and Security #953 8/8 and squash-merged to protected `main@93cdb517b348626a38a9a75ef4a8665e0a6aa6f3`; PR #142 remediated its three post-merge contract findings tests-first (RED `34ec2dc1039663eabd01aec374f117202f78e40c`, final head `87f74918dfafa0afde66e89d41bb63922697c20b`), passed CI #954 5/5, Security #957 8/8 and 14/14 exact-head checks, and squash-merged to protected `main@9e3971114d498952b09ae98c3e59d351cd915910`. The receipt HOLD finding—missing runtime producers—was remediated tests-first in PR #144 (RED `c384d292870e13aeb5b794ecbb1266b94ce2040d`, final head `44c23db97097b607ef2c5b32d8cc16ece3334782`) by wiring four public frontend surfaces to an inert consent-aware Nuxt runtime, passing only bounded data, preserving share user activation, and rejecting stale or superseded search results. PR #144 passed CI #959 5/5, Security #962 8/8 and 14/14 exact-head checks, had zero review threads, and squash-merged to protected `main@ac8164cb19a6be1e25668e7604b7550b2044cb05`; PR #141's three threads were resolved and PR #142/#144 read back zero unresolved. Default consent remains `unknown` with no provider, SDK, sink, endpoint, receiver, persistence, production configuration, or secret. T085 remains unchecked and undispatched; participant research, Web3 and production activation remain separately gated.
- [x] T085 Run cross-artifact traceability and scope analysis, recording every FR/SC → task → test mapping and unresolved deviation in `specs/001-taiwan-basketball-magazine-ebook/traceability.md`; update `spec.md`, `plan.md`, or `tasks.md` instead of accepting silent divergence.
- [ ] T086 Execute the staged beta release checklist and 20-run flaky-test gate in `docs/release/beta-checklist.md` and `.github/workflows/release.yml`; verify public read, two-role publish, retry, revision, withdrawal, backup restore and rollback before removing the beta flag.

---

## Phase 10: User Story 7 — Verifiable Publication and Optional Wallet (P2)

**Goal**: A reader can independently verify a published snapshot and may use a standard wallet signature for an optional session, while the magazine remains origin-first and fully readable without Web3 dependencies.

**Independent Test**: Recompute a fixture manifest digest/CID and verify its attestation, then exercise wallet rejection, wrong chain, account change, expired/replayed nonce, RPC/IPFS outage, rights withdrawal and feature-flag rollback without reducing anonymous-read availability.

### Tests for User Story 7 — write first

- [ ] T087 [P] [US7] Write failing canonical manifest, CID and provenance contract/integration tests in `packages/web3-adapter/tests/manifest.test.ts`, `apps/api/src/test/java/tw/basketball/magazine/provenance/PublicationProvenanceIT.java`, and `contracts/provenance-manifest.schema.json`; prove RFC 8785/I-JSON canonical bytes are byte-for-byte identical in TypeScript and Java, exclude draft/PII/original keys, and recompute the same SHA-256 digest plus `CIDv1/raw/sha2-256`.
- [ ] T088 [P] [US7] Write failing EIP-1193/SIWE security and browser tests in `apps/web/tests/e2e/us7-wallet-provenance.spec.ts`, `apps/web/tests/unit/wallet/provider.test.ts`, and `apps/api/src/test/java/tw/basketball/magazine/provenance/SiweAuthenticationIT.java`; cover `4001/4100/4900/4901`, wrong domain/URI/chain, account change, disconnect, expiry, nonce replay, unlink and anonymous fallback.

### Implementation for User Story 7

- [ ] T089 [US7] Implement versioned canonical manifest schema/types and RFC 8785 JCS over I-JSON UTF-8 bytes in `contracts/provenance-manifest.schema.json`, `packages/web3-adapter/src/manifest/`, and `apps/api/src/main/java/tw/basketball/magazine/provenance/manifest/`; include stable snapshot/revision IDs, public asset digests, rights scope and published timestamp, represent precision-sensitive values as schema-defined strings, then run the same fixtures in TypeScript and Java.
- [ ] T090 [US7] Add `publication_provenance`, `wallet_identity_link` and single-use `siwe_challenge` tables plus domain/application ports in `apps/api/src/main/resources/db/migration/V007__publication_provenance.sql` and `apps/api/src/main/java/tw/basketball/magazine/provenance/`; enforce immutable manifest versions, normalized address uniqueness, hashed nonce TTL and append-only status history.
- [ ] T091 [P] [US7] Implement `DecentralizedMirrorPort` and worker adapter in `apps/api/src/main/java/tw/basketball/magazine/provenance/ipfs/`; create `CIDv1 + raw multicodec + sha2-256` directly from rights-eligible canonical bytes without provider-default UnixFS/chunking, verify upload/download block and digest round-trip, support bounded retry/two gateway reads and degrade to digest-only when pinning is unavailable.
- [ ] T092 [P] [US7] Implement `ChainAttestationPort`, allowlisted minimal registry contract interface and managed-signer worker in `packages/web3-adapter/src/chain/`, `contracts/evm/`, and `apps/api/src/main/java/tw/basketball/magazine/provenance/chain/`; pin network/contract/method/gas ceiling, use idempotency keys and verify confirmations without exposing signer material.
- [ ] T093 [P] [US7] Implement ERC-4361 challenge/verify/unlink endpoints and BFF session bridge in `apps/api/src/main/java/tw/basketball/magazine/provenance/identity/`, `apps/web/server/api/auth/siwe/`, and `packages/web3-adapter/src/siwe/`; validate domain, URI, chain, nonce, issued-at, expiration and signature, and never make wallet identity an editor authorization source.
- [ ] T094 [US7] Implement `GET /api/v1/public/issues/{issueSlug}/provenance` plus verification UI in `apps/api/src/main/java/tw/basketball/magazine/provenance/api/PublicProvenanceController.java` and `apps/web/app/features/provenance/`; show `PENDING/VERIFIED/FAILED/SUPERSEDED/WITHDRAWN`, source references and last verification without gating the article route.
- [ ] T095 [US7] Implement opt-in wallet connect/link/unlink UI using an EIP-1193 adapter and `viem` in `packages/web3-adapter/src/provider/` and `apps/web/app/features/wallet/`; request accounts only after explicit action, handle account/chain/disconnect events, avoid durable browser token/address storage and provide clear signature consent copy.
- [ ] T096 [US7] Complete rights withdrawal/supersession, external outage, duplicate worker, signer denial, provider failover, feature-flag rollback and runbook tests in `apps/api/src/test/java/tw/basketball/magazine/provenance/PublicationProvenanceReliabilityIT.java`, `apps/web/tests/e2e/us7-wallet-provenance.spec.ts`, and `docs/operations/web3-provenance.md`; prove origin reading remains at baseline and document that public-chain/IPFS copies cannot be guaranteed deleted.

**Checkpoint**: US7 is independently deployable behind `web3.provenance` and `web3.wallet`; manifest-only mode is valid, chain/IPFS writes require approved ADR, and disabling both flags leaves P1/P2 reading behavior unchanged.

## Phase 11: Product / Architecture Alignment (spec-only)

**Goal**: Formally align the product vision, Taiwan basketball domain, evidence graph, Edition Provenance and Fan Season Passport without implementing runtime behavior.

- [x] T097 [ALIGN] Reconcile repository state, compatibility matrix, product docs, ADR-0007/0008, spec／plan／tasks traceability and strict Graphify evidence in `docs/product/`, `docs/adr/0007-basketball-domain-and-evidence-graph.md`, `docs/adr/0008-fan-passport-and-credential-boundary.md`, `specs/001-taiwan-basketball-magazine-ebook/`, `README.md`, `DESIGN.md`, and `.loop/courtside-product-alignment-*`; prove no `apps/`, `packages/`, `contracts/` or infrastructure runtime implementation changed. Completion evidence: `.loop/evidence/courtside-product-alignment-review.json` and `.loop/evidence/courtside-product-alignment-main-readback.json` after the alignment PR is merged.

**Checkpoint**: T097 is merged before T004 dispatch. ADR-0007 and ADR-0008 remain `PROPOSED` drafts until their independent approval gates pass. T004 is not part of this slice.

## Phase 12: P2A — Taiwan Basketball Domain

**Goal**: Define and then implement stable basketball facts and historical relationships inside the modular monolith.

- [ ] T098 [P] [US8] Write basketball domain contract fixtures and glossary for `League`, `LeagueAlias`, `Season`, `Team`, `TeamAlias`, `TeamSeason`, `Player`, and `PlayerAlias` in `docs/product/basketball-domain.md`, `contracts/basketball-domain.schema.json`, and `apps/api/src/test/resources/basketball/`; cover TPBL／P. LEAGUE+／PLG／SBL, league/team rename, alias, dissolve, join／exit, cross-league and valid periods without UI hard-coding.
- [ ] T099 [P] [US8] Write timeline invariants for `PlayerTeamStint`, stable player identity, same-name separation, overseas dimensions and `NationalTeamCampaign`／`NationalTeamRoster`／`RosterEntry` in `apps/api/src/test/java/tw/basketball/magazine/basketball/domain/` and `apps/api/src/test/resources/basketball/`; prove career history never depends on a single `player.teamId`.
- [ ] T100 [US8] Implement the canonical basketball domain aggregates and application ports in `apps/api/src/main/java/tw/basketball/magazine/basketball/{domain,application,ports}/` plus migration review evidence; preserve historical labels and append-only relationships, and keep public content readable when the domain projection is unavailable.

## Phase 13: P2B — Evidence Layer

**Goal**: Make source snapshots, evidence status, freshness and contradictions explicit before canonical facts are published.

- [ ] T101 [P] [US9] Define `Source`, immutable `SourceSnapshot` and `EvidenceRef` contract／fixtures in `contracts/evidence.schema.json`, `docs/product/evidence-policy.md`, and `apps/api/src/test/resources/evidence/`; require sourceId, sourceType, sourceUrl, retrievedAt, publishedAt, effectiveAt, confidence, status, freshness and snapshotId.
- [ ] T102 [P] [US9] Write claim-status and freshness tests for `CONFIRMED`, `REPORTED`, `ANALYSIS`, `RUMOR`, `UNKNOWN`, `fresh`, `stale`, `expired` and `disputed` in `apps/api/src/test/java/tw/basketball/magazine/evidence/`; prove model output cannot promote a claim and stale facts are not presented as current without as-of context.
- [ ] T103 [US9] Implement immutable snapshot persistence, evidence validation, contradiction review and append-only audit boundary in `apps/api/src/main/java/tw/basketball/magazine/evidence/`; preserve every conflicting snapshot and prohibit silent overwrite／last-write-wins.

## Phase 14: P2C — Data Adapters

**Goal**: Ingest external sources through ports and snapshots without coupling providers to canonical domain or splitting services.

- [ ] T104 [P] [US9] Define and test `FibaAdapter`, `CtbaAdapter`, `TpblAdapter`, `PlgAdapter`, `SblAdapter` and overseas adapter ports／normalization fixtures in `apps/api/src/main/java/tw/basketball/magazine/basketball/{ports,adapters}/` and `apps/api/src/test/`; prove External Source → Adapter → SourceSnapshot → Normalize → Evidence validation → Canonical Domain and reject direct production overwrite.

## Phase 15: P2D — Fan Passport Off-chain

**Goal**: Establish a non-financial, off-chain-first Fan Season Passport after P1 identity and publication boundaries are stable.

- [ ] T105 [P] [US10] Write Reader Stamp claim-condition, OIDC／email identity, off-chain entitlement and idempotency contracts in `docs/product/fan-season-passport.md`, `contracts/fan-passport.schema.json`, and `apps/api/src/test/`; prove duplicate requests yield one effective stamp and never gate anonymous Article reading.
- [ ] T106 [US10] Implement claim、revoke、supersede、expire、wallet unlink、account delete／anonymization and sanitized audit behavior in `apps/api/src/main/java/tw/basketball/magazine/fanpassport/`; classify wallet address as identifiable information and exclude private behavior from public payloads.

## Phase 16: P2E — Optional Web3 Credential

**Goal**: Add user-initiated credential delivery only after P2D and ADR-0008 activation gates pass.

- [ ] T107 [P] [US11] Write WalletIdentityLink consent／unlink、EIP-1193 provider failure、wrong-chain、account-change and OIDC fallback tests in `apps/web/tests/` and `apps/api/src/test/`; prove wallet is not the sole identity source and public reading is unchanged.
- [ ] T108 [P] [US11] Define credential adapter、sponsored transaction、gas ceiling、signer custody、non-transferable default and revocation registry contracts in `contracts/`, `packages/` and `docs/operations/`; keep all external write flags off until a separate approval record exists.
- [ ] T109 [US11] Verify rights withdrawal、credential supersede、public-chain permanence disclosure、privacy payload exclusion and provider／RPC／signer outage rollback in `apps/api/src/test/`, `apps/web/tests/` and `docs/product/fan-season-passport.md`; no content bytes or private reading history may be published.

## Phase 17: P3 — Archive / Season Recap

**Goal**: Turn rights-eligible season signals into a reproducible recap without exposing private reading behavior.

- [ ] T110 [P] [US12] Define Season Recap projection and controlled `season-recap-v1` p5 preset with fixed seed, bounded schema, server validation, SSR poster, no remote code／asset URL and deterministic fixtures in `packages/creative-runtime/`, `contracts/`, and `apps/web/tests/`.
- [ ] T111 [US12] Define Archive Contributor、歷史照片、票根與口述歷史 contribution records with consent、credit、rightsOwner、license、allowedChannels、validity and withdrawal policy in `docs/product/` and the future archive contract; keep private drafts and rights contracts out of public output.
- [ ] T112 [US12] Run reduced-motion、no-JS、dispose、privacy、access control and rights-withdrawal acceptance tests for recap／poster presentation in `apps/web/tests/`, `apps/api/src/test/` and `docs/quality/`; prove fallback remains complete and withdrawal outranks cache／search／offline／IPFS presentation.

---

## Dependencies and Execution Order

### Phase Dependencies

| Phase | Depends on | Blocks |
| --- | --- | --- |
| Phase 1 Setup | none | all later work |
| T097 Alignment | T001, T003, T005, repository read-back | T004 dispatch and all new P2 domain／passport work |
| Phase 2 Foundation | Phase 1, especially T001/T002 | all User Stories |
| US1 | Phase 2 | US2, US3 public integration |
| US2 | Phase 2 + US1 public identity/TOC | US3 preview/publication, US5 progress |
| US3 | Phase 2 + US1 + US2 | production MVP, US4 freshness, US6 manifests |
| US4 | US3 publication/outbox events | none; can run beside US5 |
| US5 | US2 + identity foundation | none; can run beside US4 |
| US6 | US3 snapshots/withdrawal; optionally US5 library UI | none |
| US7 | T002 Web3 ADR + Phase 2 contracts + US3 immutable snapshots; SIWE also needs identity foundation | none; optional after P1 |
| US8 | T097 + Phase 2 contracts + domain owner | US9, archive projections |
| US9 | US8 identity contracts + source／rights policy | US10 eligibility and adapters |
| US10 | P1 publication + identity foundation + T097 | US11 |
| US11 | US10 off-chain entitlement + ADR-0008 activation gate | none; optional after P2D |
| US12 | US8／US9 + rights owner + ADR-0005 runtime controls | none; P3 |
| Production readiness | selected stories complete | beta/GA release |

### User Story Dependency Rules

- **US1 (P1)**: First independently deployable public slice.
- **US2 (P1)**: Uses US1 article identity and TOC, but its renderer and reader tests are isolated.
- **US3 (P1)**: Depends on the content model exercised by US1/US2. P1 MVP is not operationally complete without it.
- **US4 (P2)**: Reads only published projection events from US3; it must never query drafts.
- **US5 (P2)**: Depends on OIDC and stable article/revision IDs, not on US4.
- **US6 (P3)**: Depends on immutable publication snapshots and withdrawal behavior from US3.
- **US7 (P2)**: Depends on US3 immutable publication snapshots and rights/outbox behavior; wallet linking additionally depends on identity. External attestation never enables publication or anonymous reading.
- **US8 (P2)**: Depends on T097 alignment and Phase 2 contracts; domain facts remain inside the modular monolith.
- **US9 (P2)**: Depends on US8 stable IDs and evidence policy; conflicts are preserved rather than overwritten.
- **US10 (P2)**: Depends on P1 immutable publication, OIDC／email identity and T097; off-chain claim never gates public reading.
- **US11 (P2)**: Depends on US10 idempotent off-chain eligibility and ADR-0008 security／rights acceptance; all Web3 delivery is opt-in.
- **US12 (P3)**: Depends on US8／US9 source and timeline contracts, controlled p5 runtime and rights／privacy review.

### Critical Path for P1 Beta

`T001 → T002 → T003 → T005 → T097 → T004 → T009/T011 → T013 → T018 → T023 → T026 → T028 → T030 → T034 → T038 → T041 → T045 → T047 → T050 → T054 → T056 → T078/T080/T081/T086`

### Safe Parallel Opportunities

- T004 follows T097; T005 is already complete and must remain read-back verified.
- T009 and T011 after T002; T010 follows T009, T012 follows T011.
- T015, T017, T019 and T021 after T013 where applicable; they write separate modules.
- T024 and T025; T029 can proceed after the public issue response example stabilizes.
- T032 and T033; text/media block implementations in T037 can be split by directory.
- T042, T043 and T044 before US3 implementation.
- After P1: US4 and US5 can run concurrently with separate teams.
- After P1: T087 and T088 can run in parallel; T091, T092 and T093 can proceed in parallel only after T089/T090 and the T002 provider/signer gate.
- T077, T079 and T083 can begin once representative endpoints exist, but final evidence waits for the selected release scope.

## Implementation Strategy

### P1 MVP First

1. Complete Setup and Foundation.
2. Complete US1 and validate issue discovery independently.
3. Complete US2 and validate the reader independently.
4. Complete US3 and validate two-role publication/withdrawal independently.
5. Complete the applicable Production Readiness tasks.
6. Stop and publish one real beta issue before starting US4/US5/US6/US7.

### Incremental Delivery

- **Increment A**: US1 catalog demo.
- **Increment B**: US1 + US2 public reading beta.
- **Increment C**: US1 + US2 + US3 operational MVP with real editorial workflow.
- **Increment D**: US4 search and US5 reader library, independently feature-flagged.
- **Increment E**: US6 offline only after rights owner accepts its revocation limitations.
- **Increment F**: US7 manifest-only verification first; IPFS, chain attestation and SIWE are three separately approved feature flags, not an all-or-nothing bundle.

## Requirement Traceability Summary

| Requirements | Primary tasks |
| --- | --- |
| FR-001–FR-003 | T024–T031 |
| FR-004–FR-010 | T032–T041 |
| FR-011–FR-020 | T042–T056 |
| FR-021–FR-025 | T019–T020, T042–T049, T055–T056 |
| FR-026–FR-030 | T057–T063 |
| FR-031–FR-032 | T011–T016, T023 |
| FR-033–FR-035 | T064–T070 |
| FR-036–FR-039 | T071–T076 |
| FR-040–FR-042 | T009–T016, T023, T080 |
| FR-043–FR-045 | T008, story test tasks, T078–T086 |
| FR-046–FR-048 | T002, T009–T010, T022–T023, T025, T029, T033, T036–T041, T051, T078–T080 |
| FR-049–FR-053 | T002, T011, T017–T018, T021, T080, T087–T096 |
| FR-054–FR-060 | T097, T098–T100 |
| FR-061–FR-064 | T097, T101–T104 |
| FR-065–FR-074 | T097, T105–T112 |
| SC-001–SC-012 | T025, T041, T044, T056, T063, T078–T086 |
| SC-013–SC-014 | T025, T029, T033, T036–T041, T078–T079 |
| SC-015–SC-016 | T080, T087–T096 |
| SC-017–SC-020 | T098–T104 |
| SC-021–SC-022 | T105–T109 |
| SC-023 | T110–T112 |

## Task Completion Rules

- Observe new tests fail for the intended missing behavior before implementation; a syntax/setup failure is not valid red evidence.
- Do not check generated output changes without checking the source contract and reproducible generation command.
- Include migration forward verification and application rollback evidence; never solve task failures with destructive database reset outside local fixtures.
- Do not mark publication, withdrawal, cache or offline work complete from a happy-path UI screenshot; attach API/database/job evidence.
- Do not mark Motion/p5 work complete from a screen recording; attach reduced-motion, no-JS, bundle, lifecycle and representative-device evidence.
- Do not mark provenance `VERIFIED` from a submitted transaction alone; attach canonical manifest digest/CID recomputation, confirmation/read-back and no-sensitive-data evidence. External outage must prove origin-first degradation.
- Any scope change affecting access policy, rights, personal data, supported block types or release gates must update `spec.md` first, then re-derive plan/tasks.
- Avoid same-file parallel work. `[P]` indicates possible parallelism, not a command to ignore merge conflicts or dependencies.
