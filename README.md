# Courtside TW

Courtside TW 是以台灣籃球為核心的 mobile-first 數位雜誌與文化檔案平台。產品能力分成：

- **Magazine**：Issue → TOC → Article 的 anonymous-first、free-first、SSR-first 公開閱讀。
- **Taiwan Hoops Archive**：中華隊、旅外球員、TPBL、P. LEAGUE+、SBL 與跨賽季證據時間線。
- **Fan Season Passport**：以 off-chain Reader Stamp、活動與文化貢獻形成球迷季節年鑑。

Web3 是可選的出版來源驗證與 credential delivery 基礎設施，不是閱讀門檻、金融資產或產品本身。

## Current status

- T001、T002、T003、T005、T097 已完成並由歷史 merge/read-back 或本輪 reconciliation evidence 驗證；T002 ADR merge 為 PR #4，狀態修復 PR #18 已於 `main@52e159e` 完成 final read-back。
- T005 canonical implementation 為 PR #10；completion receipt 為 PR #11。
- T004 Nuxt SSR scaffold 已完成；PR #15 已合併至 `main`，PR #16 已完成 T004 checkbox／Graphify terminal state，最終 read-back receipt 為 `.loop/evidence/t004-main-readback.json`。
- ADR-0001～0006 的既有 decision content 維持不變；T002 approval／status reconciliation 由 PR #4 與本輪 `.loop/evidence/t002-current-main-reconciliation.json` 留下可追溯紀錄。ADR-0007、0008 為本輪 draft。
- T006 已完成：PR #20 合併 shared quality gates，PR #21 完成 T006 checkbox／Graphify completion；最终 main read-back 见 `.loop/evidence/t006-main-readback.json`。T007 implementation PR #24 以 Mark 明確核准的 bounded follow-up 方式進入合併流程：static proof PASS，Docker container health proof 保留為 T008 CI 的重驗項目。
- T008 已完成：implementation PR #25 已合併至 `main@e857d50`，completion PR #28 已合併至 `main@65f406c`；CI run #14 與 Security run #14 全部通過，包含 PostgreSQL、S3 與 OIDC image security gate；最終 main read-back receipt 為 `.loop/evidence/t008-main-readback.json`，runtime receipt 為 `.loop/evidence/t008-runtime-verification-final.json`。T009 仍未 dispatch。

根目錄固定：

- Node.js `24.14.0`（Node 24 LTS line）
- pnpm `11.7.0`
- workspace packages：`apps/*`、`packages/*`
- strict engines、strict peer dependencies、exact dependency saves

目前 workspace 已有 T005 Spring Boot bootstrap；Nuxt app 與其餘 domain/runtime implementation 仍依 tasks.md 的 ticket 順序建立。root commands 會遞迴執行各 package 的同名命令。

## Commands

所有命令都可在 repository root 執行：

| Command | Contract |
| --- | --- |
| `make setup` | 驗證 pinned toolchain；有 lockfile 或 workspace dependencies 時使用 deterministic install，初始無依賴時跳過安裝，並停用 install scripts |
| `make dev` | 執行 workspace `dev` scripts；尚未有 app 時成功 no-op |
| `make lint` | 執行所有 workspace `lint` scripts |
| `make typecheck` | 執行所有 workspace `typecheck` scripts |
| `make test` | 執行所有 workspace `test` scripts |
| `make contract` | 執行所有 workspace `contract` scripts |
| `make verify` | 驗證根契約，再依序執行 lint、typecheck、test、contract |

對應的 `pnpm run <command>` aliases 也保留，方便 CI 或 IDE 使用。`make verify` 不會自動啟動 dev server，也不會取得 production secrets。

## Reproducible setup

```sh
make setup
make verify
```

`.node-version` 與 `packageManager` 是 single source of truth；toolchain 不符合時命令會立即停止。依賴 lockfile 加入後，`setup` 會改用 `--frozen-lockfile`，防止未審查的解析漂移；尚未有 lockfile 但已有 workspace dependency 時會使用固定的暫存 store。T003 沒有 runtime dependency，所以乾淨檢出不需要網路或 secrets。

## Design and boundaries

[`DESIGN.md`](./DESIGN.md) 是已核准的 Arena Editorial／system-adaptive light-dark UI implementation contract。它要求 SSR 可讀、reduced-motion／no-JS fallback、bounded Motion／p5 progressive enhancement 與不可繞過的 rights gate。T003 只保存 workspace baseline；不在 root 建立 UI、p5、Motion 或 Web3 adapter。

已核准的 constitution、ADR 與 feature spec 位於：

- `.specify/memory/constitution.md`
- `docs/adr/`
- `specs/001-taiwan-basketball-magazine-ebook/`

任何 implementation task 都必須維持 contract-first、immutable publication、rights-before-release、WCAG 2.2 AA、Core Web Vitals、progressive enhancement 與 Web3 least-agency 邊界。

## Documentation

### Product

- [`docs/product/vision.md`](./docs/product/vision.md)
- [`docs/product/taiwan-basketball-content-map.md`](./docs/product/taiwan-basketball-content-map.md)
- [`docs/product/basketball-domain.md`](./docs/product/basketball-domain.md)
- [`docs/product/evidence-policy.md`](./docs/product/evidence-policy.md)
- [`docs/product/fan-season-passport.md`](./docs/product/fan-season-passport.md)
- [`docs/product/alignment.md`](./docs/product/alignment.md)

### Architecture and governance

- [`DESIGN.md`](./DESIGN.md)
- [`docs/adr/`](./docs/adr/)
- [`docs/adr/0007-basketball-domain-and-evidence-graph.md`](./docs/adr/0007-basketball-domain-and-evidence-graph.md)
- [`docs/adr/0008-fan-passport-and-credential-boundary.md`](./docs/adr/0008-fan-passport-and-credential-boundary.md)
- [`specs/001-taiwan-basketball-magazine-ebook/`](./specs/001-taiwan-basketball-magazine-ebook/)
- [`.loop/`](./.loop/)

任何新 implementation 都必須先對應 User Story、FR、ADR、task 與 future test；本輪 alignment 不建立 UI、migration、API、wallet 或 provider SDK。
