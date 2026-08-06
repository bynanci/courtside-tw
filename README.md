# Courtside TW

台灣籃球雜誌電子書的 monorepo。產品先以公開閱讀、SSR、可追溯出版與媒體權利為核心；付費牆、token gate、錢包登入與公鏈寫入不屬於 MVP。

## T003 root baseline

這一輪只建立根目錄的可重現命令契約，尚未建立 Nuxt、Spring Boot、資料庫、合約、基礎設施或 CI。這些工作依序由 T004 及後續票據負責，避免在 root scaffold 偷渡實作。

根目錄固定：

- Node.js `24.14.0`（Node 24 LTS line）
- pnpm `11.7.0`
- workspace packages：`apps/*`、`packages/*`
- strict engines、strict peer dependencies、exact dependency saves

目前 workspace 尚無 app/package，因此 workspace scripts 會安全地 no-op；T004／T005 加入 package script 後，同一組 root commands 會遞迴執行各 package 的同名命令。

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

## T003 scope

本輪允許的 implementation files 是：`pnpm-workspace.yaml`、`package.json`、`.node-version`、`.npmrc`、`Makefile`、`README.md`。T003 完成前不應 dispatch T004；完成後仍需獨立 review／merge，再進入 Nuxt 或 Spring scaffold。
