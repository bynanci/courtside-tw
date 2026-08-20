# Courtside TW

Courtside TW 是以台灣籃球為核心的 mobile-first 數位雜誌與文化檔案平台，採 anonymous-first、free-first、SSR-first 的公開閱讀邊界，並以 immutable publication、rights-before-release、可驗證 evidence 與 progressive enhancement 作為工程基線。

> 本文件是 repository orientation 與 current-state summary；完整 task checkbox 以 [`tasks.md`](./specs/001-taiwan-basketball-magazine-ebook/tasks.md) 為準，PR、CI/Security run 與 release artifact 才是可歸因的 completion proof。

## Current status

- Current `main`：`51ada85022abdcaa8afa2847daece81141d5ce43`，已包含 PR #118 的 T081 backup/isolated-restore implementation。
- `tasks.md` 目前標記 82 個完成項：`T001–T081` 與 `T097`。
- 下一個 ready frontier 是 T082；尚未 dispatch 的工作為 `T082–T096` 與 `T098–T112`。
- Web3、wallet、participant research 與台灣籃球 P2 domain work 不會因 P1 task 完成而自動啟動。
- README 的完成狀態不代表 production/GA release；仍須依 Issue #111 的 release-gate、人工驗證、ruleset read-back 與 beta checklist 執行。

## Completed task ledger

`tasks.md` 的 `[x]` 完成清單依工作流整理如下：

| Workstream | Completed tasks | Result |
| --- | --- | --- |
| Setup and governance | T001–T008 | Repository constitution、ADR、toolchain、workspace baseline 與 CI/Security foundation |
| Foundational contracts and infrastructure | T009–T023 | Content/API/database/security/media 基礎契約與共享邊界 |
| User Story 1 — browse and start reading | T024–T031 | Issue discovery、TOC、public reading entry 與 anonymous-first surface |
| User Story 2 — long-form article | T032–T041 | Article identity、revision、renderer、reading-time、media/rights projection |
| User Story 3 — editorial publication | T042–T056 | Draft/review/publish、withdrawal、outbox、cache/search freshness 與 reliability seams |
| User Story 4 — search and explore | T057–T063 | Search projection、freshness、retry、withdrawal 與 partial-failure behavior |
| User Story 5 — bookmark and continue | T064–T070 | OIDC reader library、email/reader stamp、cross-device progress 與 privacy boundary |
| User Story 6 — offline issue | T071–T076 | Offline contract、manifest、staging、checksum、expiry、withdrawal 與 fail-closed behavior |
| Production readiness | T077–T081 | First-issue seed、accessibility/performance gates、T080 threat hardening、T081 restore verification |
| Product / architecture alignment | T097 | Taiwan basketball、evidence graph、Fan Passport 與 Web3 boundary 的 spec-only alignment |

### Not yet completed

- `T082–T086`：deployment、rollback、observability、privacy analytics 與 staged beta release gate。
- `T087–T096`：optional provenance、IPFS/chain、SIWE、wallet 與 Web3 delivery；必須等 P1 gate 與前置 ADR/rights 條件。
- `T098–T112`：Taiwan basketball domain、evidence layer、data adapters、Fan Passport、optional credential 與 archive recap。

## Final release-gate evidence

### T080 — threat model and hardening

- [`PR #117`](https://github.com/bynanci/courtside-tw/pull/117) 已合併至 `main@69de82df855c62550458bbf5ea6f8d0620ba19d0`。
- Final implementation head：`fdfcf7833e7d05a1e29648c0b1eb2b1651fecac7`。
- CI #795、Security #797 通過；release-owner review 為 PASS/no findings；review threads 為 0。
- T081+、Web3 與 participant research 維持 out of scope。

### T081 — backup and isolated restore

- [`PR #118`](https://github.com/bynanci/courtside-tw/pull/118) 已由 Draft 轉 Ready，並合併至 `main@51ada85022abdcaa8afa2847daece81141d5ce43`。
- Final exact head：`3fcc7f2f29e5c3d41370fffcebd34d925c4c9911`。
- [`CI #816`](https://github.com/bynanci/courtside-tw/actions/runs/32390737392) 與 [`Security #818`](https://github.com/bynanci/courtside-tw/actions/runs/32390737362) 通過；12 個 required contexts 全部成功，Android offline smoke 為額外成功 job。
- Final-head dependency artifact [`9414805375`](https://github.com/bynanci/courtside-tw/actions/runs/32390737392/artifacts/9414805375)，digest：`sha256:2572e7202c4f8b5429654c7f052ebea5e88e20650c845863925ea54e1264a5b7`。
- Isolated PostgreSQL drill：2 media assets/2 variants、2/2 metadata rows、2/2 SHA-256 sample、RPO `0.001h <= 24h`、RTO `0.037m <= 240m`、explicit isolated target、`release_ready=true`。
- Restore receipt 不保存 database URL、password、token、private key 或 participant PII；original media bytes 的 provider backup 與 production scheduler proof 仍是明確限制。

### Evidence interpretation

- CI/Security 與 artifact 必須綁定同一個 final head；舊 head、舊 run 或 superseded artifact 只能作歷史紀錄。
- T078 的 native OS/AT/device/font execution 必須維持 WAIVED/NOT_RUN 分類，不能被自動化 browser proof 冒充人工 Pass。
- T079 的 performance/bundle/Android evidence 必須使用其 final-head artifact；T079 不取代 T078，也不解除 T080/T081 以外的 release gate。
- README 與 tasks checkbox 是狀態索引，不取代 PR review、ruleset read-back 或人工 gate。

## Product contract

- **Magazine**：Issue → TOC → Article → Closure 的公開閱讀流程；不以登入、wallet 或 token gate 阻擋 anonymous reading。
- **Editorial publication**：draft/review/publish、immutable revision、rights decision、withdrawal、cache/search/offline invalidation 與 audit/outbox。
- **Taiwan Hoops Archive**：中華隊、旅外球員、TPBL、P. LEAGUE+、SBL 與跨賽季 evidence timeline。
- **Fan Season Passport**：先以 off-chain Reader Stamp、活動與文化貢獻建立非金融的球迷季節年鑑。
- **Web3**：只作 optional provenance verification 與 credential delivery 基礎設施，不是閱讀門檻、金融資產或產品本身。

## System shape

```text
Editorial source
  → contract/schema validation
  → draft/review/publish + rights decision
  → immutable publication snapshot
  → public SSR/read model
  → cache/search/offline projections
  → withdrawal and audit/outbox propagation
```

- `apps/web`：Nuxt SSR、public reader、editorial UI 與 progressive enhancement。
- `apps/api`：Java 21/Spring Boot modular monolith、domain/application/ports、API 與 worker profiles。
- `packages`：content schema、API client、creative runtime、Web3 adapter 等可獨立契約。
- `contracts`：OpenAPI、JSON Schema、fixtures 與 provenance/content contracts。
- `infra`：Compose、database migration、backup/restore、deployment 與 security image baseline。
- `docs`：ADR、product、quality、security、operations、research 與 evidence policy。
- `specs`：Spec Kit 的 spec/plan/tasks；task checkbox 與 completion proof 的主要索引。

## Repository map

```text
apps/web/                         Nuxt web application
apps/api/                         Spring Boot modular monolith
packages/                         Shared schemas, clients and adapters
contracts/                        OpenAPI and JSON Schema contracts
infra/compose/                    Local PostgreSQL, S3 and OIDC dependencies
infra/deployment/backup/          T081 backup and metadata export
scripts/operations/               Restore and operational verification
scripts/test/                     Deterministic integration/acceptance drills
docs/                             Product, ADR, quality, security and operations
specs/001-taiwan-basketball-.../  Spec, plan and task ledger
.github/workflows/                CI and Security required checks
```

## Local development

固定 toolchain：Node.js `24.14.0`、pnpm `11.7.0`。在 repository root 執行：

| Command | Contract |
| --- | --- |
| `make setup` | 驗證 pinned toolchain；依 lockfile 執行 deterministic install，停用 install scripts |
| `make dev` | 執行 workspace `dev` scripts；尚未有 app 時允許 no-op |
| `make lint` | 執行 workspace lint |
| `make typecheck` | 執行 strict type checks |
| `make test` | 執行 unit/integration tests |
| `make contract` | 驗證 schema、OpenAPI 與 contract fixtures |
| `make verify` | 依序執行 root contract、lint、typecheck、test、contract |

```sh
make setup
make verify
```

`make verify` 不會自動啟動 dev server，也不會取得 production secrets。依賴 lockfile 加入後，`setup` 使用 frozen resolution，避免未審查的 dependency drift。

## Engineering rules

1. **Contract first**：先寫 schema、fixture、API contract 與失敗測試，再實作。
2. **RED → GREEN → PROVE**：測試必須先以預期原因失敗；修正後綁定 exact-head proof。
3. **Immutable publication**：已發佈 revision 不就地覆寫；withdrawal 必須優先於 cache、search、offline 與任何外部投影。
4. **Rights before release**：private/public storage key、rights status、validity 與 allowed channels 必須可追溯。
5. **Least agency**：wallet、IPFS、chain、signer 與外部 provider 皆為 opt-in、allowlisted、可 rollback 的邊界。
6. **No sensitive receipts**：artifact/receipt 不得保存 production URL、secret、private key、token 或 participant PII。
7. **Scope discipline**：完成一個 task 不得順手 dispatch 後續 task；tasks.md 的 unchecked state 是硬邊界。

## Merge and release gate

每個可合併 PR 必須具備：

- current exact head 與 current-base mergeability。
- required CI/Security checks 全部成功，且 artifact/receipt 綁定同一 head。
- changed-file scope 與 task/issue 一致。
- 0 unresolved review threads；review findings 已處理或明確記錄。
- main protected ruleset 的 PR-only、required checks、conversation resolution、禁止 deletion/force-push 與 bypass policy read-back。
- draft PR 必須在 release evidence 完整後才轉 Ready；未經明確授權不得 merge。

Repository 的 main ruleset evidence 與 release-gate policy 維護於 [Issue #97](https://github.com/bynanci/courtside-tw/issues/97) 與 [Issue #111](https://github.com/bynanci/courtside-tw/issues/111)。

## Next execution order

1. **T082**：建立 production deployment、expand/migrate/contract migration 與 application rollback runbook；先完成 tests-first 與 non-destructive verification。
2. **T083–T086**：observability、privacy-aware analytics、reliability/readiness 與 staged beta checklist。
3. 完成 T078–T086 release-gate read-back 後，才重新評估 T087+ provenance/Web3。
4. T098+ basketball domain、evidence、Fan Passport 與 archive work 必須維持各自的 dependency、rights、privacy 與 human approval gate。

## Research boundary

`docs/research/` 保存籃球雜誌 × Web3 hypothesis、research design 與 future participant study materials。研究設計不等於 participant result，也不等於 adoption、retention 或 revenue evidence；只有完成研究、量測、adjudication 與 decision receipt 後，才能更新產品方向。

## Documentation index

- [`DESIGN.md`](./DESIGN.md)：Arena Editorial 與 system-adaptive UI contract。
- [`docs/adr/`](./docs/adr/)：架構與產品邊界決策。
- [`docs/security/threat-model.md`](./docs/security/threat-model.md)：T080 threat model。
- [`docs/operations/disaster-recovery.md`](./docs/operations/disaster-recovery.md)：T081 backup/restore contract。
- [`specs/001-taiwan-basketball-magazine-ebook/spec.md`](./specs/001-taiwan-basketball-magazine-ebook/spec.md)：product/spec contract。
- [`specs/001-taiwan-basketball-magazine-ebook/plan.md`](./specs/001-taiwan-basketball-magazine-ebook/plan.md)：execution plan。
- [`specs/001-taiwan-basketball-magazine-ebook/tasks.md`](./specs/001-taiwan-basketball-magazine-ebook/tasks.md)：authoritative task ledger。
- [`Issue #111`](https://github.com/bynanci/courtside-tw/issues/111)：T078–T086 P1 beta release-gate plan。
- [`Issue #97`](https://github.com/bynanci/courtside-tw/issues/97)：main protected ruleset policy/read-back。

## Status note

本 README 描述的是目前 repository 的工程狀態與邊界，不宣稱所有產品願景、Web3 能力、participant research 或 production operations 已完成。任何新 task 都必須先更新 spec/plan/tasks 的依賴與 acceptance，再建立可驗證的 execution loop。
