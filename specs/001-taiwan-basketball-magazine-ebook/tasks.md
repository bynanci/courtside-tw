# Tasks: 台灣籃球雜誌電子書

**Input**: `spec.md` and `plan.md` from `/specs/001-taiwan-basketball-magazine-ebook/`  
**Prerequisites**: `spec.md`, `plan.md`  
**Tests**: Required. The specification explicitly makes contract, unit, integration, E2E, accessibility and performance tests release gates. Tests for each User Story must be written first and observed failing for the intended reason.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it writes different files and has no unfinished dependency.
- **[US1]…[US7]**: Traceability to the user story in `spec.md`.
- Every task names the main file path(s); generated files are never edited by hand.
- Check a task only when its described verification passes and evidence is attached to the PR or task record.

## Phase 1: Setup and Governance

**Purpose**: Establish the repository, project rules and reproducible development baseline.

- [x] T001 Write and approve the provisional engineering gates from `plan.md` as the project constitution in `.specify/memory/constitution.md`; include contract-first development, immutable publication, rights-before-release, tests, accessibility, performance, progressive enhancement, Web3 least agency, least privilege and recovery gates.
- [ ] T002 Resolve the remaining pre-implementation decisions and record them in `docs/adr/0001-application-topology.md`, `docs/adr/0002-identity-and-hosting-providers.md`, `docs/adr/0003-content-document-and-media-policy.md`, `docs/adr/0004-free-mvp-access-policy.md`, `docs/adr/0005-motion-and-generative-runtime.md`, and `docs/adr/0006-web3-provenance-boundary.md`; include the brand/font asset owner, allowed motion patterns, first p5 preset, poster/reduced-motion policy, Web3 scope/provider/signer/gas/rights exit conditions, and stop implementation if paid or token-gated access replaces the free MVP assumption.
- [x] T003 Create the monorepo and root commands in `pnpm-workspace.yaml`, `package.json`, `.node-version`, `.npmrc`, `Makefile`, and `README.md`; provide deterministic `setup`, `dev`, `lint`, `typecheck`, `test`, `contract`, and `verify` commands.
- [ ] T004 [P] Scaffold the Nuxt 4.5 application with Node.js 24 LTS in `apps/web/package.json`, `apps/web/nuxt.config.ts`, `apps/web/tsconfig.json`, and `apps/web/app/app.vue`; verify SSR returns HTML from a smoke route.
- [x] T005 [P] Scaffold the Java 21/Spring Boot 4.1 application and `api`/`worker` profiles in `apps/api/build.gradle.kts`, `apps/api/settings.gradle.kts`, `apps/api/src/main/java/tw/basketball/magazine/MagazineApplication.java`, and `apps/api/src/main/resources/application.yml`; verify both profiles boot. Completion proof: PR #10 merged and read back from `main` in `.loop/evidence/t005-completion-receipt.json`.
- [ ] T006 [P] Configure shared formatting, linting and strict type checks in `eslint.config.mjs`, `prettier.config.mjs`, `packages/tsconfig/base.json`, `apps/api/config/checkstyle/checkstyle.xml`, and `apps/api/config/spotbugs/exclude.xml`; make warnings fail CI where deterministic.
- [ ] T007 Create reproducible local dependencies in `infra/compose/compose.yaml`, `infra/compose/.env.example`, and `scripts/dev/check-dependencies.sh` for PostgreSQL 18, S3 emulator and OIDC stub; add health checks and no production secrets.
- [ ] T008 Create CI pipelines in `.github/workflows/ci.yml`, `.github/workflows/security.yml`, and `.github/dependabot.yml` that cache dependencies, run contract/lint/type/unit/integration checks, scan secrets/dependencies/containers and preserve test reports.

**Checkpoint**: A clean clone can run `make setup && make verify`; T001 and T002 are approved, not merely drafted.

---

## Phase 2: Foundational Contracts and Infrastructure

**Purpose**: Build the blocking infrastructure shared by every user story.

> **CRITICAL**: No User Story implementation begins until T009–T023 pass in CI.

- [ ] T009 Define `ContentDocument` v1 and the allowed MVP blocks in `contracts/content-document.schema.json`, `packages/content-schema/fixtures/valid/`, and `packages/content-schema/fixtures/invalid/`; cover paragraph with inline links, heading, list, quote, divider, image, gallery, stat, video, related-reading and `generative-canvas`, whose payload is limited to approved `presetId`, seed, bounded parameters, `posterAssetId`, alt text and data summary—never code, shader or arbitrary URL.
- [ ] T010 Implement schema validation and generated TypeScript types in `packages/content-schema/src/index.ts`, `packages/content-schema/scripts/generate-types.ts`, `apps/api/src/main/java/tw/basketball/magazine/content/validation/ContentDocumentValidator.java`, and their tests; run the same valid/invalid fixtures in TypeScript and Java to prove parity.
- [ ] T011 Define the full planned API v1 contract, auth schemes, pagination, idempotency, optimistic locking and Problem Details models in `contracts/openapi.yaml`; include the public, reader, editorial, offline, provenance and optional SIWE operations from `plan.md`, then lint examples and stable error codes for `400`, `401`, `403`, `404`, `409`, `422`, and `429`.
- [ ] T012 Generate—not hand-edit—the TypeScript client from `contracts/openapi.yaml` into `packages/api-client/src/generated/`, expose a stable wrapper from `packages/api-client/src/index.ts`, and add `packages/api-client/tests/generated-client.test.ts` plus a CI diff check.
- [ ] T013 Create the database foundation in `apps/api/src/main/resources/db/migration/V001__foundation.sql`: required extensions, OIDC subject mapping, role assignments, media asset/rights/variant tables, audit events and outbox events; application DB role must not update/delete `audit_event` rows.
- [ ] T014 Implement common IDs, clocks, actor context, optimistic version handling and RFC 9457 mapping in `apps/api/src/main/java/tw/basketball/magazine/shared/`; add deterministic unit tests under `apps/api/src/test/java/tw/basketball/magazine/shared/`.
- [ ] T015 [P] Implement Spring Security OIDC resource-server validation and role policies in `apps/api/src/main/java/tw/basketball/magazine/identity/` and `apps/api/src/test/java/tw/basketball/magazine/identity/`; test issuer, audience, missing role, expired token and privilege-escalation rejection.
- [ ] T016 [P] Implement the Nuxt BFF OIDC authorization-code/PKCE session in `apps/web/server/auth/`, `apps/web/server/middleware/auth.ts`, and `apps/web/tests/integration/auth-session.test.ts`; use Secure/HttpOnly/SameSite cookies, session rotation, CSRF protection and no browser token storage.
- [ ] T017 [P] Implement append-only audit writing and sanitized actor/target metadata in `apps/api/src/main/java/tw/basketball/magazine/audit/`; add integration tests proving sensitive tokens, article bodies and signed URLs are never recorded.
- [ ] T018 Implement the transactional outbox claim/lease/retry/dead-letter worker in `apps/api/src/main/java/tw/basketball/magazine/outbox/` with Testcontainers tests under `apps/api/src/test/java/tw/basketball/magazine/outbox/`; prove crash recovery and duplicate-delivery idempotency.
- [ ] T019 [P] Implement the S3-compatible storage port and signed upload constraints in `apps/api/src/main/java/tw/basketball/magazine/media/storage/`; integration-test key binding, expiry, maximum size, MIME allowlist and private original objects.
- [ ] T020 Implement media completion validation and variant processing in `apps/api/src/main/java/tw/basketball/magazine/media/processing/`; verify magic bytes/checksum, remove unnecessary EXIF, create configured variants, and transition only valid assets to `READY`.
- [ ] T021 [P] Configure OpenTelemetry, Micrometer, JSON logging, trace/request IDs and actuator health groups in `apps/api/src/main/java/tw/basketball/magazine/shared/observability/`, `apps/api/src/main/resources/logback-spring.xml`, and `apps/web/server/plugins/observability.ts`; include non-identifying motion/p5 lifecycle and provenance job signals, and test log/metric-label redaction.
- [ ] T022 Create shared Testcontainers, OIDC stub, S3 emulator, Playwright and seed fixtures in `apps/api/src/test/java/tw/basketball/magazine/testsupport/`, `apps/web/tests/fixtures/`, and `scripts/test/seed-e2e.ts`; provide published, draft, withdrawn, expired-rights, reduced-motion and valid/invalid fixed-seed generative-canvas cases.
- [ ] T023 Add module boundary, HTTP security header, CSP, payload limit and route-specific rate-limit tests in `apps/api/src/test/java/tw/basketball/magazine/architecture/`, `apps/api/src/test/java/tw/basketball/magazine/security/`, and `apps/web/tests/integration/security-headers.test.ts`; enforce module dependencies with ArchUnit and prove content payload cannot enable `eval`, remote modules, user shaders or arbitrary canvas fetches.

**Checkpoint**: Contracts compile on both runtimes, auth and upload boundaries reject invalid inputs, outbox replay is idempotent, and local/CI integration environments are reproducible.

---

## Phase 3: User Story 1 — Browse an Issue and Start Reading (P1 / MVP)

**Goal**: An anonymous reader can browse published issues, inspect an ordered table of contents and open an article route within three interactions.

**Independent Test**: Start from a clean mobile browser with no session/cache, open the latest issue and reach the selected published article header; draft/withdrawn content never appears.

### Tests for User Story 1 — write first

- [ ] T024 [P] [US1] Write failing public issue contract/integration tests for FR-001–FR-003 in `apps/api/src/test/java/tw/basketball/magazine/publication/api/PublicIssueApiIT.java`; cover cursor pagination, ordered sections, draft filtering, withdrawn issue and unknown slug.
- [ ] T025 [P] [US1] Write a failing mobile Playwright journey in `apps/web/tests/e2e/us1-browse-issue.spec.ts` and accessibility assertions in `apps/web/tests/e2e/us1-browse-issue.a11y.spec.ts`; require three-or-fewer interactions from `/` to an article and prove route／TOC motion never hides SSR links before hydration or under reduced-motion.

### Implementation for User Story 1

- [ ] T026 [US1] Add issue, section, article identity, article revision and issue ordering tables with publication-state constraints in `apps/api/src/main/resources/db/migration/V002__publication_content_core.sql`; include stable UUIDs, unique slugs, positions and optimistic versions.
- [ ] T027 [US1] Implement issue aggregates, ordering invariants and published read repositories in `apps/api/src/main/java/tw/basketball/magazine/publication/domain/` and `apps/api/src/main/java/tw/basketball/magazine/publication/persistence/`; repository queries must not expose draft fields to public projections.
- [ ] T028 [US1] Implement `GET /api/v1/public/issues` and `/api/v1/public/issues/{issueSlug}` in `apps/api/src/main/java/tw/basketball/magazine/publication/api/PublicIssueController.java` and application services under `publication/application/`; add ETag and bounded cursor validation.
- [ ] T029 [P] [US1] Build issue cover, issue card, section TOC and article-summary components with component tests in `apps/web/app/features/issues/components/` and `apps/web/tests/component/issues/`; preserve image aspect ratio and semantic heading order, and use centralized `motion-v` variants only for approved cover／TOC patterns with CSS or no-motion fallback.
- [ ] T030 [US1] Build SSR routes `/`, `/issues`, `/issues/[issueSlug]`, and a minimal `/articles/[articleSlug]` article-header handoff in `apps/web/app/pages/`, using only `packages/api-client`; handle empty catalog, not-found and withdrawn states without leaking draft metadata.
- [ ] T031 [US1] Implement issue canonical URLs, Open Graph, JSON-LD, robots decisions and issue sitemap entries in `apps/web/app/features/issues/seo/`, `apps/web/server/routes/sitemap.xml.ts`, and `apps/web/tests/integration/issue-seo.test.ts`.

**Checkpoint**: T024/T025 pass; US1 works independently. This is a deployable catalog slice even before rich article blocks are enabled.

---

## Phase 4: User Story 2 — Read a Long-form Article (P1 / MVP)

**Goal**: A reader can consume a responsive, accessible, shareable article and navigate within its issue while retaining local reading position.

**Independent Test**: Render one fixture containing every supported content block across phone/tablet/desktop, with JavaScript enabled and disabled, then reload and resume from the last stable block anchor.

### Tests for User Story 2 — write first

- [ ] T032 [P] [US2] Write failing article projection and authorization tests for FR-004–FR-010 in `apps/api/src/test/java/tw/basketball/magazine/content/api/PublicArticleApiIT.java`; cover published revision selection, withdrawn/draft/history denial, media rights and issue navigation.
- [ ] T033 [P] [US2] Write failing reader E2E tests in `apps/web/tests/e2e/us2-read-article.spec.ts`, `apps/web/tests/e2e/us2-no-js.spec.ts`, `apps/web/tests/e2e/us2-reduced-motion.spec.ts`, and visual fixtures in `apps/web/tests/fixtures/content-document-v1.json`; include image failure, reload resume, previous/next navigation, SSR generative poster, lazy p5 load, fixed-seed output, visibility pause and route-unmount disposal.

### Implementation for User Story 2

- [ ] T034 [US2] Implement immutable revision, contributor credit, content extraction and published-article projection logic in `apps/api/src/main/java/tw/basketball/magazine/content/domain/`, `content/application/`, and `content/persistence/`; compute reading time and plain text server-side.
- [ ] T035 [US2] Implement `GET /api/v1/public/articles/{articleSlug}` with ETag, canonical metadata, visible media variants and snapshot-based issue navigation in `apps/api/src/main/java/tw/basketball/magazine/content/api/PublicArticleController.java`.
- [ ] T036 [US2] Create a total, deny-by-default block renderer registry in `apps/web/app/components/content-blocks/ContentDocumentRenderer.vue`, `apps/web/app/components/content-blocks/registry.ts`, and `apps/web/tests/component/content-blocks/registry.test.ts`; unknown block/preset versions render poster + summary fallback and telemetry code without dynamic module resolution from content.
- [ ] T037 [P] [US2] Implement and component-test the v1 text blocks in `apps/web/app/components/content-blocks/text/`, media/data blocks in `apps/web/app/components/content-blocks/media/`, and the `generative-canvas` host/preset registry in `apps/web/app/components/content-blocks/creative/` plus `packages/creative-runtime/`; use p5.js 2.x instance mode, client-only dynamic import, fixed seed, bounded parameters, `noLoop()`／`remove()` lifecycle and no unrestricted `v-html` or remote code.
- [ ] T038 [US2] Build the complete article SSR route, magazine typography, byline/rights credits, progress indicator, responsive media and centralized Motion system in `apps/web/app/pages/articles/[articleSlug].vue`, `apps/web/app/features/reader/`, `apps/web/app/features/motion/`, and `apps/web/app/assets/css/article.css`; content is final-visible before hydration and all patterns have reduced-motion variants.
- [ ] T039 [US2] Implement stable block-anchor local reading progress and explicit resume behavior in `apps/web/app/features/reader/composables/useLocalReadingProgress.ts`; unit-test viewport/font-size changes and stale revision invalidation in `apps/web/tests/unit/reader/`.
- [ ] T040 [P] [US2] Implement previous/next/TOC navigation, native share fallback and related metadata in `apps/web/app/features/reader/components/ArticleNavigation.vue`, `ShareArticleButton.vue`, and their component tests.
- [ ] T041 [US2] Add article SEO/no-JS output, axe checks, animation interruption tests and Lighthouse/bundle budgets in `apps/web/app/features/reader/seo/`, `apps/web/tests/e2e/us2-read-article.a11y.spec.ts`, `apps/web/tests/e2e/us2-creative-lifecycle.spec.ts`, and `apps/web/lighthouserc.cjs`; enforce LCP/CLS/INP, fixed media dimensions, no p5 chunk on ordinary pages and zero leaked canvas/loop/listener after 20 route switches.

**Checkpoint**: US1 and US2 pass independently and together; public P1 reading is beta-ready, but editorial production is not ready until US3.

---

## Phase 5: User Story 3 — Edit, Review and Publish an Issue (P1 / MVP)

**Goal**: Editors can create content and media, publishers can review and atomically publish/schedule/withdraw it, and every sensitive action is auditable.

**Independent Test**: Use separate `EDITOR` and `PUBLISHER` accounts to create a two-article issue, trigger a rights failure, fix it, submit, approve, schedule, publish, revise and withdraw it without database intervention.

### Tests for User Story 3 — write first

- [ ] T042 [P] [US3] Write failing state-machine and rights-decision unit tests for FR-011–FR-025 in `apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java` and `apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java`.
- [ ] T043 [P] [US3] Write failing editorial API integration tests for role boundaries, `If-Match`, idempotency, scheduling and Problem Details in `apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java` and `apps/api/src/test/java/tw/basketball/magazine/media/api/EditorialMediaApiIT.java`.
- [ ] T044 [P] [US3] Write the failing two-role Studio E2E workflow in `apps/web/tests/e2e/us3-editorial-publication.spec.ts`; include concurrent edit conflict, missing rights, Asia/Taipei schedule, retry, revision and emergency withdrawal.

### Implementation for User Story 3

- [ ] T045 [US3] Add workflow reviews, rights references, publication snapshots, jobs, idempotency records and impact links in `apps/api/src/main/resources/db/migration/V003__editorial_publication_workflow.sql`; enforce immutable snapshot and unique idempotency constraints.
- [ ] T046 [US3] Implement allowed state transitions, role checks, frozen review revisions and conflict responses in `apps/api/src/main/java/tw/basketball/magazine/publication/domain/` and `publication/application/EditorialWorkflowService.java`.
- [ ] T047 [US3] Implement the content/media publication gate in `apps/api/src/main/java/tw/basketball/magazine/media/domain/RightsPolicy.java` and `publication/application/PublicationReadinessService.java`; return exact stable blocking codes for missing, expired, revoked or wrong-channel rights.
- [ ] T048 [US3] Implement signed upload intent/completion endpoints and worker dispatch in `apps/api/src/main/java/tw/basketball/magazine/media/api/EditorialMediaController.java` and `media/application/`; re-check size, checksum, magic bytes and processing state server-side.
- [ ] T049 [P] [US3] Build the media library, upload state UI, alt text, credit and rights form in `apps/web/app/features/studio/media/` with component tests in `apps/web/tests/component/studio/media/`; prevent submission while processing or invalid.
- [ ] T050 [US3] Implement issue/article/revision editorial CRUD endpoints with optimistic locking in `apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialIssueController.java`, `content/api/EditorialArticleController.java`, and their application services.
- [ ] T051 [US3] Build the schema-constrained article editor and preview in `apps/web/app/features/studio/editor/` and `/studio/articles/[id].vue`; serialize only valid `ContentDocument` v1, expose only approved generative preset controls with bounded inputs and poster/summary requirements, surface server field/block errors and preserve unsaved-work conflict recovery.
- [ ] T052 [P] [US3] Build the issue editor, section management and accessible sortable TOC in `apps/web/app/features/studio/issues/` and `/studio/issues/[id].vue`; persist explicit positions and offer keyboard reordering.
- [ ] T053 [US3] Build review queue, readiness report and publisher-only actions in `apps/web/app/features/studio/review/`, `/studio/review/index.vue`, and authorization tests under `apps/web/tests/integration/studio-rbac.test.ts`.
- [ ] T054 [US3] Implement atomic publish/schedule execution, snapshot checksum, audit/outbox writes and worker processing in `apps/api/src/main/java/tw/basketball/magazine/publication/application/PublicationService.java`, `publication/worker/PublicationJobHandler.java`, and integration tests; retries must return one publication result.
- [ ] T055 [US3] Implement new-revision correction, republish, archive, emergency withdrawal, asset revocation impact and audit query endpoints in `apps/api/src/main/java/tw/basketball/magazine/publication/api/PublisherController.java`, `media/api/PublisherMediaController.java`, and `audit/api/AuditController.java`; add Studio views under `apps/web/app/features/studio/audit/`.
- [ ] T056 [US3] Complete concurrency, expired-rights-at-execution, duplicate-worker, partial-external-failure and cache/search invalidation integration tests in `apps/api/src/test/java/tw/basketball/magazine/publication/PublicationReliabilityIT.java`; verify public origin denies withdrawn content before external purge succeeds.

**Checkpoint**: P1 is feature-complete. Editors can continuously publish real issues without engineer intervention, and public content, search placeholder, caches and audit state remain consistent under retry/failure.

---

## Phase 6: User Story 4 — Search and Explore Taiwan Basketball (P2)

**Goal**: Readers can find public content by Traditional Chinese keywords and data-managed basketball taxonomy.

**Independent Test**: Use a curated cross-issue dataset with aliases, renamed teams and same-name players; validate query/filter results and prove drafts/withdrawn revisions are absent.

### Tests for User Story 4 — write first

- [ ] T057 [P] [US4] Write failing search contract, freshness and E2E tests in `apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java` and `apps/web/tests/e2e/us4-search.spec.ts`; include empty, punctuation-only, zh-TW/English mixed, alias and withdrawn cases.

### Implementation for User Story 4

- [ ] T058 [US4] Add taxonomy terms/aliases/validity, article taxonomy and public search projection with `pg_trgm` indexes in `apps/api/src/main/resources/db/migration/V004__taxonomy_and_search.sql`.
- [ ] T059 [P] [US4] Implement taxonomy domain/API and Studio taxonomy management in `apps/api/src/main/java/tw/basketball/magazine/taxonomy/` and `apps/web/app/features/studio/taxonomy/`; names are attributes, never identifiers.
- [ ] T060 [US4] Implement versioned search projection updates from publication/withdrawal outbox events in `apps/api/src/main/java/tw/basketball/magazine/search/worker/SearchProjectionHandler.java`; reject any draft source and record source checksum.
- [ ] T061 [US4] Implement normalized, weighted, cursor-based `GET /api/v1/public/search` and taxonomy filter endpoints in `apps/api/src/main/java/tw/basketball/magazine/search/api/PublicSearchController.java` and `search/application/SearchService.java`.
- [ ] T062 [US4] Build SSR search/filter/result/empty-state UI in `apps/web/app/pages/search.vue` and `apps/web/app/features/search/`; synchronize accessible filters with URL query state and cancel stale requests.
- [ ] T063 [US4] Create the curated relevance set and performance/freshness gate in `apps/api/src/test/resources/search/zh-tw-relevance.json`, `apps/api/src/test/java/tw/basketball/magazine/search/SearchRelevanceTest.java`, and `tests/performance/search.js`; report NDCG@10 and escalation conditions.

**Checkpoint**: US4 works without a dedicated search cluster and meets relevance, p95 and 60-second freshness targets.

---

## Phase 7: User Story 5 — Bookmark and Continue Across Devices (P2)

**Goal**: Logged-in readers can bookmark articles and synchronize revision-aware reading progress with an explicit local/server merge.

**Independent Test**: Use two independent browser sessions with the same reader; verify bookmark sync, newer-progress resolution, withdrawn content handling and account deletion.

### Tests for User Story 5 — write first

- [ ] T064 [P] [US5] Write failing reader-library contract, merge property tests and cross-device E2E tests in `apps/api/src/test/java/tw/basketball/magazine/readerlibrary/`, `apps/web/tests/e2e/us5-reader-library.spec.ts`, and `apps/web/tests/e2e/us5-account-deletion.spec.ts`.

### Implementation for User Story 5

- [ ] T065 [US5] Add reader profile, bookmarks, revision-aware progress and erasure-job tables in `apps/api/src/main/resources/db/migration/V005__reader_library.sql`; enforce unique bookmarks and bounded progress.
- [ ] T066 [US5] Implement idempotent bookmark and progress APIs in `apps/api/src/main/java/tw/basketball/magazine/readerlibrary/api/` and `readerlibrary/application/`; do not return withdrawn article bodies or stale revision positions.
- [ ] T067 [US5] Implement local/server merge preview and apply logic in `apps/api/src/main/java/tw/basketball/magazine/readerlibrary/domain/ProgressMergePolicy.java` and `apps/web/app/features/library/composables/useProgressMerge.ts`; preserve the newer valid update and require explicit user confirmation.
- [ ] T068 [P] [US5] Add bookmark and signed-in progress controls to `apps/web/app/features/reader/` and build `/library` in `apps/web/app/pages/library.vue` with components under `apps/web/app/features/library/`; include unavailable-content states.
- [ ] T069 [US5] Implement verified export/deletion orchestration and audit-safe status in `apps/api/src/main/java/tw/basketball/magazine/identity/application/AccountDataService.java`, `identity/api/AccountController.java`, and `apps/web/app/pages/settings/privacy.vue`.
- [ ] T070 [US5] Run and stabilize revision-change, concurrent-device, logout, session-expiry and withdrawn-bookmark scenarios in `apps/web/tests/e2e/us5-reader-library.spec.ts`; document the merge contract in `docs/product/reading-progress.md`.

**Checkpoint**: US5 is independently deployable behind reader-login feature flags and does not alter anonymous reading availability.

---

## Phase 8: User Story 6 — Save an Issue Offline (P3)

**Goal**: A reader can reliably download an offline-eligible published issue, verify completion, update it and remove or invalidate it after withdrawal.

**Independent Test**: Download an issue under throttled network, go offline and read it; then reconnect to test update, rights withdrawal, quota failure and cleanup.

### Tests for User Story 6 — write first

- [ ] T071 [P] [US6] Write failing manifest contract and browser offline tests in `apps/api/src/test/java/tw/basketball/magazine/publication/api/OfflineManifestApiIT.java` and `apps/web/tests/e2e/us6-offline-issue.spec.ts`; simulate interruption, corruption, quota denial, update and withdrawal.

### Implementation for User Story 6

- [ ] T072 [US6] Implement signed/versioned issue and withdrawal manifests with revision IDs, rights expiry, asset bytes and checksums in `apps/api/src/main/java/tw/basketball/magazine/publication/api/OfflineManifestController.java` and `publication/application/OfflineManifestService.java`.
- [ ] T073 [US6] Configure the PWA app-shell service worker separately from issue content caches in `apps/web/nuxt.config.ts`, `apps/web/app/service-worker/`, and `apps/web/tests/integration/service-worker-policy.test.ts`; never precache editorial or preview routes.
- [ ] T074 [US6] Implement temporary-download, checksum verification and atomic install/update/delete in `apps/web/app/features/offline/services/OfflineIssueManager.ts`; store manifest state in IndexedDB and never mark partial content complete.
- [ ] T075 [P] [US6] Build storage estimate, download progress, update, expiry and removal UI in `apps/web/app/features/offline/components/` and integrate it with issue/library pages; communicate that web offline is not DRM or permanent availability.
- [ ] T076 [US6] Implement online withdrawal reconciliation and bounded retry in `apps/web/app/features/offline/services/WithdrawalReconciler.ts`; pass T071 across Chromium mobile emulation and at least one supported Android browser smoke test.

**Checkpoint**: US6 meets the product's withdrawal limitation. If immediate revocation on permanently offline devices is required, cancel this phase rather than shipping a false guarantee.

---

## Phase 9: Production Readiness and Cross-Cutting Quality

**Purpose**: Complete the release gates for whichever User Story phases are selected. P1 beta requires all applicable T077–T086 tasks; they are not optional polish.

- [ ] T077 [P] Create a realistic first-issue seed pack and editorial operations guide in `apps/api/src/test/resources/fixtures/first-issue/`, `scripts/content/import-seed.ts`, and `docs/operations/editorial-publishing.md`; include rights-valid and intentionally blocked examples.
- [ ] T078 Complete manual keyboard, screen-reader, zoom, reduced-motion, vestibular-safety and Traditional Chinese typography review using `docs/quality/accessibility-test-plan.md`; verify every Motion pattern and generative block poster/summary fallback, fix findings in `apps/web/app/` and archive evidence in `artifacts/accessibility/`.
- [ ] T079 Enforce public performance, bundle and lifecycle budgets in `apps/web/lighthouserc.cjs`, `tests/performance/public-read.js`, and `docs/quality/performance-baseline.md`; test large 20-article issue, representative imagery, cache hit/miss, a generative block on representative Android hardware, no-p5 ordinary routes and background/offscreen pause.
- [ ] T080 Run threat modeling and harden content, OIDC, CSRF, upload, SSRF/embed, p5 preset/payload, EIP-1193 provider, SIWE replay/phishing, signer, RPC/IPFS, authorization and dependency boundaries in `docs/security/threat-model.md`, `apps/api/src/test/java/tw/basketball/magazine/security/`, and `apps/web/tests/integration/security/`; zero critical/high exploitable findings before release of the applicable slice.
- [ ] T081 Implement database/media-metadata backup and isolated restore verification in `infra/deployment/backup/`, `scripts/operations/restore-verify.sh`, and `docs/operations/disaster-recovery.md`; capture evidence for RPO 24h/RTO 4h and sampled checksum validation.
- [ ] T082 Create production deployment, expand/migrate/contract migration and rollback runbooks in `infra/deployment/`, `infra/docker/`, `docs/operations/deployment.md`, and `docs/operations/rollback.md`; test application rollback without destructive schema rollback.
- [ ] T083 Configure SLO dashboards and alerts for public reads, publication jobs, withdrawal, search freshness, media processing, cache purge and dead letters in `infra/observability/dashboards/`, `infra/observability/alerts/`, and `docs/operations/incident-response.md`.
- [ ] T084 Implement consent-aware minimal product analytics and privacy documentation in `apps/web/app/features/analytics/`, `apps/api/src/main/java/tw/basketball/magazine/analytics/`, and `docs/privacy/data-inventory.md`; never make non-essential analytics consent a condition of public reading.
- [ ] T085 Run cross-artifact traceability and scope analysis, recording every FR/SC → task → test mapping and unresolved deviation in `specs/001-taiwan-basketball-magazine-ebook/traceability.md`; update `spec.md`, `plan.md`, or `tasks.md` instead of accepting silent divergence.
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
- [ ] T090 [US7] Add `publication_provenance`, `wallet_identity_link` and single-use `siwe_challenge` tables plus domain/application ports in `apps/api/src/main/resources/db/migration/V006__publication_provenance.sql` and `apps/api/src/main/java/tw/basketball/magazine/provenance/`; enforce immutable manifest versions, normalized address uniqueness, hashed nonce TTL and append-only status history.
- [ ] T091 [P] [US7] Implement `DecentralizedMirrorPort` and worker adapter in `apps/api/src/main/java/tw/basketball/magazine/provenance/ipfs/`; create `CIDv1 + raw multicodec + sha2-256` directly from rights-eligible canonical bytes without provider-default UnixFS/chunking, verify upload/download block and digest round-trip, support bounded retry/two gateway reads and degrade to digest-only when pinning is unavailable.
- [ ] T092 [P] [US7] Implement `ChainAttestationPort`, allowlisted minimal registry contract interface and managed-signer worker in `packages/web3-adapter/src/chain/`, `contracts/evm/`, and `apps/api/src/main/java/tw/basketball/magazine/provenance/chain/`; pin network/contract/method/gas ceiling, use idempotency keys and verify confirmations without exposing signer material.
- [ ] T093 [P] [US7] Implement ERC-4361 challenge/verify/unlink endpoints and BFF session bridge in `apps/api/src/main/java/tw/basketball/magazine/provenance/identity/`, `apps/web/server/api/auth/siwe/`, and `packages/web3-adapter/src/siwe/`; validate domain, URI, chain, nonce, issued-at, expiration and signature, and never make wallet identity an editor authorization source.
- [ ] T094 [US7] Implement `GET /api/v1/public/issues/{issueSlug}/provenance` plus verification UI in `apps/api/src/main/java/tw/basketball/magazine/provenance/api/PublicProvenanceController.java` and `apps/web/app/features/provenance/`; show `PENDING/VERIFIED/FAILED/SUPERSEDED/WITHDRAWN`, source references and last verification without gating the article route.
- [ ] T095 [US7] Implement opt-in wallet connect/link/unlink UI using an EIP-1193 adapter and `viem` in `packages/web3-adapter/src/provider/` and `apps/web/app/features/wallet/`; request accounts only after explicit action, handle account/chain/disconnect events, avoid durable browser token/address storage and provide clear signature consent copy.
- [ ] T096 [US7] Complete rights withdrawal/supersession, external outage, duplicate worker, signer denial, provider failover, feature-flag rollback and runbook tests in `apps/api/src/test/java/tw/basketball/magazine/provenance/PublicationProvenanceReliabilityIT.java`, `apps/web/tests/e2e/us7-wallet-provenance.spec.ts`, and `docs/operations/web3-provenance.md`; prove origin reading remains at baseline and document that public-chain/IPFS copies cannot be guaranteed deleted.

**Checkpoint**: US7 is independently deployable behind `web3.provenance` and `web3.wallet`; manifest-only mode is valid, chain/IPFS writes require approved ADR, and disabling both flags leaves P1/P2 reading behavior unchanged.

---

## Dependencies and Execution Order

### Phase Dependencies

| Phase | Depends on | Blocks |
| --- | --- | --- |
| Phase 1 Setup | none | all later work |
| Phase 2 Foundation | Phase 1, especially T001/T002 | all User Stories |
| US1 | Phase 2 | US2, US3 public integration |
| US2 | Phase 2 + US1 public identity/TOC | US3 preview/publication, US5 progress |
| US3 | Phase 2 + US1 + US2 | production MVP, US4 freshness, US6 manifests |
| US4 | US3 publication/outbox events | none; can run beside US5 |
| US5 | US2 + identity foundation | none; can run beside US4 |
| US6 | US3 snapshots/withdrawal; optionally US5 library UI | none |
| US7 | T002 Web3 ADR + Phase 2 contracts + US3 immutable snapshots; SIWE also needs identity foundation | none; optional after P1 |
| Production readiness | selected stories complete | beta/GA release |

### User Story Dependency Rules

- **US1 (P1)**: First independently deployable public slice.
- **US2 (P1)**: Uses US1 article identity and TOC, but its renderer and reader tests are isolated.
- **US3 (P1)**: Depends on the content model exercised by US1/US2. P1 MVP is not operationally complete without it.
- **US4 (P2)**: Reads only published projection events from US3; it must never query drafts.
- **US5 (P2)**: Depends on OIDC and stable article/revision IDs, not on US4.
- **US6 (P3)**: Depends on immutable publication snapshots and withdrawal behavior from US3.
- **US7 (P2)**: Depends on US3 immutable publication snapshots and rights/outbox behavior; wallet linking additionally depends on identity. External attestation never enables publication or anonymous reading.

### Critical Path for P1 Beta

`T001 → T002 → T003 → T005 → T009/T011 → T013 → T018 → T023 → T026 → T028 → T030 → T034 → T038 → T041 → T045 → T047 → T050 → T054 → T056 → T078/T080/T081/T086`

### Safe Parallel Opportunities

- T004 and T005 after T003.
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
| SC-001–SC-012 | T025, T041, T044, T056, T063, T078–T086 |
| SC-013–SC-014 | T025, T029, T033, T036–T041, T078–T079 |
| SC-015–SC-016 | T080, T087–T096 |

## Task Completion Rules

- Observe new tests fail for the intended missing behavior before implementation; a syntax/setup failure is not valid red evidence.
- Do not check generated output changes without checking the source contract and reproducible generation command.
- Include migration forward verification and application rollback evidence; never solve task failures with destructive database reset outside local fixtures.
- Do not mark publication, withdrawal, cache or offline work complete from a happy-path UI screenshot; attach API/database/job evidence.
- Do not mark Motion/p5 work complete from a screen recording; attach reduced-motion, no-JS, bundle, lifecycle and representative-device evidence.
- Do not mark provenance `VERIFIED` from a submitted transaction alone; attach canonical manifest digest/CID recomputation, confirmation/read-back and no-sensitive-data evidence. External outage must prove origin-first degradation.
- Any scope change affecting access policy, rights, personal data, supported block types or release gates must update `spec.md` first, then re-derive plan/tasks.
- Avoid same-file parallel work. `[P]` indicates possible parallelism, not a command to ignore merge conflicts or dependencies.
