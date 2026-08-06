# Courtside TW Project Constitution

**Status**: RATIFIED  
**Version**: 0.1.0  
**Proposed on**: 2026-08-06  
**Ratified on**: 2026-08-06  
**Last amended**: 2026-08-06

## Purpose and authority

本憲章將「台灣籃球雜誌電子書」的工程底線轉為可執行、可驗證的專案規則。任何規格、計畫、任務、程式碼、內容發布、資料處理、Motion／p5.js 體驗或 Web3 adapter 都必須遵守本憲章。

權威順序為：已核准的本憲章 → `spec.md` → `plan.md` → `tasks.md` → 實作與測試。下層產物若與上層衝突，工作必須停止；不得用 task、PR 或程式碼暗中改寫產品範圍或治理規則。

## Core principles

### I. Specification traceability and bounded scope

- 每個 API、資料表、畫面、內容區塊、背景工作與測試，MUST 可追溯到 User Story、FR、SC 與 task。
- 影響 access policy、rights、個資、內容區塊、release gate 或 MVP 邊界的變更，MUST 先修改 `spec.md`，再重新推導 `plan.md` 與 `tasks.md`。
- PR MUST 說明需求來源、非目標、驗收證據與未解決偏差。無法追溯的工作不得進入 main。

### II. Contract-first, generated boundaries

- OpenAPI 3.1 與版本化 Content JSON Schema MUST 先於依賴它們的前後端功能。
- TypeScript client 與其他 generated artifacts MUST 由可重現命令產生，不得手改；來源 contract、fixtures、產生器與 CI diff check 必須一起維護。
- TypeScript 與 Java 共享的 schema／canonicalization 行為 MUST 使用相同 valid／invalid fixtures 證明一致；破壞性 contract 變更需要明確版本、相容策略與 migration evidence。

### III. Immutable publication and auditable lifecycle

- 已發布 revision 與 publication snapshot MUST immutable；修訂建立新版本，不得原地覆寫公開歷史。
- 發布、排程、撤回與下架 MUST 原子化、冪等，並留下 append-only audit 與 outbox receipt。
- 公開投影、搜尋、快取、sitemap、離線 manifest 與 provenance 都由權威 publication state 推導，不得反向越過 editorial approval。

### IV. Rights before reach

- 媒體缺少有效 rights record、署名、適用 channel 或有效期間時，MUST 阻擋送審與發布；技術便利不得凌駕權利證據。
- 撤回優先於快取、搜尋、離線與外部鏡像可用性。無法確認撤回狀態時，受影響內容採不可用處理。
- 只有權利明確允許長期公開再散布的 bytes 才可進入 IPFS 或其他去中心化鏡像；不確定、有限期、可撤回、含個資或原始媒體位置的內容只允許本地 digest，不得外送。

### V. Tests are delivery gates

- 每個 User Story MUST 先有可重現、為預期缺口而失敗的 contract／integration／E2E 或相應層級測試，再實作最小通過變更。
- Schema、unit、architecture、contract、integration、component、E2E、accessibility、performance、security 與 recovery 證據依風險納入 release gate；不得以「之後補測試」發布 P1。
- 不得弱化 assertion、略過失敗測試或只用截圖／錄影聲稱完成。每個 task 只有在描述的 verification 通過且 PR 或 task record 附證據後才能勾選。

### VI. Accessible, fast, progressively enhanced experience

- P1 核心流程 MUST 達到 WCAG 2.2 AA，並通過鍵盤、螢幕閱讀器、200% zoom、reduced-motion 與繁體中文排版驗證。
- 正式環境行動版 p75 Core Web Vitals gate 為 LCP ≤ 2.5 秒、INP ≤ 200 毫秒、CLS ≤ 0.1；公開 API 的已定義負載 gate 不得降級為發布後 backlog。
- SSR DOM MUST 是最終可讀、可操作狀態。無 JavaScript、hydration failure、Motion interruption、canvas failure 或 `prefers-reduced-motion` 都必須保留完整內容與主要操作。
- Motion 僅作有目的的 progressive enhancement，不得改變語意、閱讀順序或把動畫完成事件作為唯一狀態轉換。
- p5.js 僅能 client-only dynamic import、instance mode、fixed seed、trusted preset 與 schema-bounded parameters；普通頁面不得下載 p5 chunk，離開 viewport／背景／route 時 MUST pause／dispose，且永遠提供 poster、alt text 與資料摘要 fallback。

### VII. Least privilege and secure defaults

- 身分採 OIDC Authorization Code + PKCE；瀏覽器使用 Secure／HttpOnly／SameSite BFF session，不保存可重用 access token。
- RBAC、method authorization、CSRF、防重放、短效且綁定 key／size／MIME 的 upload URL 與 private originals MUST deny by default。
- 草稿、原始媒體、signed URL、token、完整正文、email、wallet link 與 storage key 不得進入公共投影或普通日誌。
- 每項 process、DB role、worker、provider 與 signer 僅取得完成單一職責所需能力；request path 不得取得 chain signer capability。

### VIII. Web3 least agency and origin-first operation

- 匿名公開閱讀 MUST 不依賴錢包、RPC、IPFS、token、NFT 或鏈上交易；`web3.provenance` 與 `web3.wallet` 預設關閉，外部故障只能降低驗證能力。
- 系統不得要求錢包、持有讀者私鑰或以 wallet／SIWE 取代 editorial authorization。地址視為可識別資料，連結需明確同意且 off-chain 關聯可解除。
- Canonical manifest MUST 使用版本化 schema、I-JSON、RFC 8785 JCS UTF-8 bytes、SHA-256 與已定義的 `CIDv1/raw/sha2-256` profile；CID 與鏈上 digest 是 bytes／時間證據，不是合法性或真實性的自動背書。
- IPFS、chain、RPC、pinning、contract 與 signer 都在可替換 adapter、transactional outbox、bounded retry、feature flag 與核准 ADR 後方。所有 external writes MUST 經 rights scan、exact digest receipt 與人工核准的 provider boundary。

### IX. Operational recovery, observability, and safe rollback

- Worker MUST 有 idempotency key、claim／lease、bounded retry、dead-letter 與 crash-recovery proof；不可用無限重試掩蓋故障。
- Logs、metrics、traces 與產品分析只收集達成可靠性與已核准產品指標所需資料，標籤不得含高基數個資或敏感內容。
- GA 前 MUST 完成隔離還原演練，證明 RPO ≤ 24 小時、RTO ≤ 4 小時；migration 採 expand → migrate → contract，應用回滾不得依賴破壞性 schema rollback。
- Motion／p5 或 Web3 發生 a11y、CWV、安全或可靠性退化時，MUST 可用 feature flag 停用增強能力，且 SSR 正文與 origin publication 保持可用。

### X. Simplicity budget

- MVP MUST 維持 Nuxt SSR/BFF + Spring Boot modular monolith + PostgreSQL/outbox + S3-compatible storage 的已核准邊界。
- 未達記錄在 ADR 的退出條件前，不引入 microservices、message broker、專用搜尋叢集、付款、付費牆、NFT 或 token gate。
- 每個新 framework、provider、network 或 runtime MUST 說明現有邊界不能滿足的證據、成本、退出方案與失敗降級；能以較小且受支援的變更完成時，MUST 選擇較小方案。

## Required engineering gates

| Gate | Minimum evidence | Blocking point |
| --- | --- | --- |
| Traceability | User Story／FR／SC → task → test／proof mapping | PR review and release |
| Contract first | schema lint, shared fixtures, generated-client diff | dependent implementation |
| Immutable publication | transaction, idempotency, revision and audit receipts | publication |
| Rights before reach | rights decision and withdrawal impact tests | review and publication |
| Testable slices | valid red baseline plus green acceptance/regression proof | task completion |
| Accessibility and performance | automated budgets plus named manual smoke evidence | beta／release |
| Progressive enhancement | SSR／no-JS／reduced-motion／failure fallback and p5 lifecycle proof | reader release |
| Least privilege | authorization, CSRF, upload, log-redaction and boundary tests | protected feature release |
| Web3 least agency | canonical recomputation, rights scan, outage degradation and approved ADR | any external write |
| Recovery | worker recovery, backup restore and rollback evidence | GA |
| Simplicity | ADR with exit evidence for added infrastructure | architecture change |

## Development and review workflow

1. Reconcile the authoritative `spec.md`, `plan.md`, `tasks.md`, branch and PR state.
2. Select only a dependency-satisfied, bounded task; preserve a reproducible baseline before modification.
3. Implement the smallest supported change and its required tests／evidence.
4. Verify acceptance, regression, accessibility, performance, security and recovery proportional to the task risk.
5. Attach proof receipts to the PR or task record. Human-gated work remains incomplete until explicit approval and remote read-back.
6. If evidence contradicts the plan, update the graph and return to the smallest affected action; do not create endless work to remain active.

PRs MUST declare: requirement trace, scope／non-goals, contracts or migrations touched, tests and proof receipts, security／rights／a11y／performance impact, rollback or feature-flag path, and unresolved human gates.

## Governance

- 本憲章經專案 accountable owner 明確核准並 merge 後生效。自動化檢查、draft PR 或無回覆都不是核准。
- 修訂 MUST 以 PR 提案，說明動機、受影響原則、規格／計畫／任務 diff、migration／rollback 與核准人。
- 版本採 semantic versioning：移除或重新定義 principle／gate 為 MAJOR；新增具約束力的 principle／gate 為 MINOR；不改變語意的澄清為 PATCH。
- 每個 PR 與 release MUST 做 constitution compliance review。違反 MUST 的變更必須被阻擋；若規則不再適用，先修憲，不以例外留言繞過。
- T001 只有在本提案獲明確核准、merge 並由遠端回讀確認後才能勾選完成；其前不得把 T002 視為已解鎖。

## Ratification record

| Field | Value |
| --- | --- |
| Ratified version | 0.1.0 |
| Constitution status | RATIFIED |
| Accountable approver | Human project owner (Mark) |
| Approval evidence | Explicit Mark approval on 2026-08-06; recorded in GitHub PR #2 |
| Effective date | 2026-08-06 upon merge of PR #2 |
| T001 completion | Tracked in tasks.md after merge read-back |
