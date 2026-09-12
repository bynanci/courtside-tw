# Courtside TW

## 一份屬於台灣籃球的數位雜誌

Courtside TW 是一個以台灣籃球為核心的數位雜誌與文化檔案平台。

我們相信，讀者打開雜誌，不只是想找到一篇文章，而是想進入一種值得信任的觀點：知道這一期為什麼這樣編排、這篇文章與其他內容如何互相呼應，也能在時間過去之後重新回來閱讀。

Courtside TW 的目標，是把台灣籃球的當下報導、人物故事與跨賽季記憶，整理成具有編輯觀點、閱讀節奏與長期價值的內容體驗。

> 先把雜誌做好，再談 Web3。Web3 是未來可選的出版驗證與文化連續性工具，不是閱讀門檻。

## 我們要解決的問題

目前的籃球內容大多分散在即時訊息、社群貼文與短期流量之中。讀者可以很快知道發生了什麼，卻不一定能理解事情為什麼重要、人物如何走到今天，以及一個賽季如何形成完整的故事。

Courtside TW 聚焦三個問題：

- **內容太碎片化**：用一期一期的編輯策展，重新建立閱讀脈絡與內容關係。
- **演算法不等於品味**：推薦可以帶來流量，但編輯觀點才能讓讀者感受到「這是我想讀的雜誌」。
- **記憶缺少延續性**：讓文章、賽季、人物與讀者自己的閱讀歷程，逐步形成可回看的文化檔案。

## 產品願景

Courtside TW 不只是文章集合，也不是把雜誌換成另一種內容管理系統。

我們正在建立一個由三個層次組成的產品：

1. **Magazine**：以 Issue、TOC、Article 為核心的公開閱讀體驗，讓讀者先看見編輯選擇，再進入完整內容。
2. **Taiwan Hoops Archive**：整理中華隊、旅外球員、TPBL、P. LEAGUE+、SBL 與跨賽季的故事、人物與證據脈絡。
3. **Fan Season Passport**：把閱讀、活動與文化貢獻累積成球迷的季節記憶；先從不涉及金融的 Reader Stamp 開始。

## 讀者體驗

| 階段 | 讀者感受 | 產品承諾 | 目前狀態 |
| --- | --- | --- | --- |
| 先看見 | 這一期在談什麼？為什麼值得讀？ | 以 Issue 與編輯策展建立第一眼的方向 | 已完成核心閱讀入口 |
| 讀進去 | 我可以順暢讀完一篇長文嗎？ | 文章、目錄、圖片、引用與閱讀進度保持連續 | 已完成核心長文閱讀 |
| 看懂脈絡 | 這個故事與球員、賽季、球隊有什麼關係？ | 透過內容結構與未來的台灣籃球資料層補足上下文 | P1 已建立基礎；P2 domain 尚未開始 |
| 留下記憶 | 我下次回來，還能接著讀嗎？ | 書籤、跨裝置進度與離線閱讀；Reader Stamp 規劃於 T105–T106 | 閱讀延續已完成；Reader Stamp 尚未開始 |
| 驗證來源 | 我能相信這份出版內容嗎？ | 在不影響公開閱讀的前提下，提供出版版本與來源驗證 | Web3/provenance 尚未開始 |

## 產品原則

- **編輯觀點優先於無止境的資訊流**：我們要讓讀者感受到選擇、節奏與品味。
- **閱讀優先於登入與交易**：公開內容不以帳號、wallet、token 或付費牆作為基本閱讀門檻。
- **連續性高於價格**：Reader Stamp 與 Season Passport 的價值，是留下共同閱讀與球季記憶，不是投機性資產。
- **權利先於發佈**：內容、圖片、公開版本與撤回狀態必須在出版前被清楚管理。
- **來源驗證是加值，不是阻礙**：Provenance 與 Web3 只能強化信任，不能降低匿名讀者的閱讀體驗。
- **自動化證據不冒充人工研究**：瀏覽器測試、效能測試與安全掃描，不能取代真實使用者、原生輔助科技或參與者研究。

## 目前進度

2026-09-12 重新核對 protected `main@ac92f88a7267736325519a8bf12dc6b9ee2bcb86`：`tasks.md` 共 112 項，86 項已完成（`T001–T085`、`T097`），26 項未完成（`T086–T096`、`T098–T112`）。這是已接受的任務收據統計，不代表所有需求缺口或 beta release 驗收均已完成；`T086` 保持未勾選。

Arena Editorial v0.3 已由 [PR #187](https://github.com/bynanci/courtside-tw/pull/187#issuecomment-5613249111) 合併並完成 protected-main read-back；獨立 [UI 任務清單](docs/design/arena-editorial-v3-tasks.md) 的 `UIR-001–UIR-017` 已完成，不加計至 T001–T112。

| 產品階段 | 已完成 | 下一步／狀態 |
| --- | --- | --- |
| 基礎與治理 | T001–T023 | 已完成：產品規則、內容/API/資料基礎與共用能力 |
| 公開閱讀 MVP | T024–T041 | 已完成：Issue、TOC、Article、長文閱讀與媒體權利邊界 |
| 編輯出版 | T042–T056 | 已完成：編輯、審閱、發佈、撤回與可靠性場景 |
| 搜尋與探索 | T057–T063 | 已完成：搜尋、更新、重試、撤回與部分失敗處理 |
| 閱讀延續 | T064–T076 | 已完成：書籤、跨裝置進度與離線閱讀 |
| P1 品質與復原 | T077–T081 | 已完成：first issue、品質驗證、威脅模型、備份與 isolated restore |
| 產品／架構對齊 | T097 | 已完成：台灣籃球、evidence graph、Fan Passport 與 Web3 邊界 |
| 生產準備 | T082–T085 | 已完成：部署、rollback、觀測與隱私分析準備；T086 beta gate 維持 HOLD |
| Provenance／Web3 | T087–T096 | 尚未開始，等待 P1 release gates 與必要決策 |
| 台灣籃球資料與文化延伸 | T098–T112 | 尚未開始，包含 domain、evidence、Passport、credential 與 archive |

### 目前產品狀態摘要

- **可以展示的核心**：從 Home／Issue 進入 TOC、Article、Closure 的公開閱讀旅程。
- **已建立的產品信任基礎**：出版版本、權利判定、撤回、搜尋／快取／離線同步，以及可驗證的備份復原流程。
- **已完成的近期工程**：[PR #189](https://github.com/bynanci/courtside-tw/pull/189) OIDC 修復、PR #187 Arena Editorial，以及 [PR #194](https://github.com/bynanci/courtside-tw/pull/194) T086 release producer 均已合併。PR #161、#171 已關閉為 superseded。
- **下一個 release gate**：[#164](https://github.com/bynanci/courtside-tw/issues/164) 尚缺實際 required context 安裝、安裝後 read-back 與 negative mergeability 證據。現有 ruleset 仍只有 12 個 required contexts。
- **驗證限制**：current-main CI 5/5、Security 8/8 通過；`Recompute trusted T086 gate` 工作成功不等於 `T086 final release decision` PASS。#194 的歷史 Beta Release PASS 僅適用原 candidate 與當時 adjudication。
- **刻意暫緩的方向**：Web3、wallet、IPFS、chain attestation、參與者研究與更深的台灣籃球資料建模。

## 完成證據

### T080｜內容與安全邊界

- [`PR #117`](https://github.com/bynanci/courtside-tw/pull/117) 已合併至 `main@69de82df855c62550458bbf5ea6f8d0620ba19d0`。
- 最終實作版本：`fdfcf7833e7d05a1e29648c0b1eb2b1651fecac7`。
- CI #795、Security #797 通過；release-owner review 為 PASS；review threads 為 0。
- 覆蓋 content、OIDC、CSRF、upload、SSRF/embed、創意內容 payload、授權與 dependency 邊界。

### T081｜備份與獨立復原

- [`PR #118`](https://github.com/bynanci/courtside-tw/pull/118) 已合併至 `main@51ada85022abdcaa8afa2847daece81141d5ce43`。
- 最終版本：`3fcc7f2f29e5c3d41370fffcebd34d925c4c9911`。
- [`CI #816`](https://github.com/bynanci/courtside-tw/actions/runs/32390737392) 與 [`Security #818`](https://github.com/bynanci/courtside-tw/actions/runs/32390737362) 通過。
- Final-head artifact [`9414805375`](https://github.com/bynanci/courtside-tw/actions/runs/32390737392/artifacts/9414805375) 驗證：2/2 metadata rows、2/2 SHA-256 sample、RPO `0.001h <= 24h`、RTO `0.037m <= 240m`、明確的 isolated target，以及 `release_ready=true`。
- 這項能力證明的是資料庫與媒體 metadata 的復原流程；原始媒體檔案的 provider backup、正式排程與 production rollback 仍是後續工作。

### 證據閱讀原則

- 每一項完成證據都必須對應同一個 final version；舊版本與 superseded artifact 只能作為歷史紀錄。
- T078 的原生 OS／輔助科技／裝置／字體驗證仍須依原紀錄標示為 WAIVED 或 NOT_RUN，不將自動化測試寫成人工通過。
- T079 的效能與 Android 證據不取代 T078，也不會自動解除後續 release gate。
- `tasks.md` 是進度索引；PR、驗證紀錄與人工 gate 才是完整完成判定的依據。
- [#160 的 18 項 adjudication](https://github.com/bynanci/courtside-tw/issues/160#issuecomment-5618664464) 記錄的是 `RISK_ACCEPTED_FOR_BETA`，不等於 `RESOLVED_BY_EVIDENCE`。後續修復與驗收收據仍須逐項對帳；T085 audit 完成不代表所有 FR/SC 都已滿足。

## 產品邊界

### 現在承諾的內容

- 任何讀者都能閱讀公開雜誌內容，不必先註冊或連接錢包。
- 內容具有清楚的 issue、文章、版本、權利與撤回脈絡。
- 讀者可以逐步累積書籤、閱讀進度、離線內容與閱讀記憶。
- 編輯可以用一致的內容結構，建立可長期維護的台灣籃球出版物。

### 現在不承諾的內容

- 尚未承諾 chain attestation、IPFS mirror、SIWE、wallet credential 或任何金融／投機用途。
- 尚未承諾完成正式 participant study、使用者採用率、留存率或營收驗證。
- 尚未宣稱 beta/GA release；T082–T085 已有完成收據，T086 producer 已合併，但 #164 enforcement 與完整 release acceptance 尚未完成，beta flag 未移除。

## 下一步路線

1. **#164 required-context enforcement**：完成另行記錄的 owner decision，追加唯一 `T086 final release decision`（GitHub Actions integration `15368`），再核驗既有 12 contexts、strict、main-only、無 bypass 與負向合併證據。
2. **T086 完整驗收**：重新綁定實際 candidate、current base 與 owner evidence，取得完整 release acceptance 後才處理任務勾選及 beta flag；本次對帳不授權這些變更。
3. **後續產品工作**：依 [#121](https://github.com/bynanci/courtside-tw/issues/121) 追蹤 18 項 beta 風險的修復／證據；T087–T096、T098–T112 維持未派遣。
4. **獨立研究**：[#110](https://github.com/bynanci/courtside-tw/issues/110) 仍需六位真實參與者的同意與觀察資料；既有簡報、模擬畫面及自動化測試不作為真人研究結果。

## 給協作者

如果你想了解產品決策，先閱讀：

- [`specs/001-taiwan-basketball-magazine-ebook/spec.md`](./specs/001-taiwan-basketball-magazine-ebook/spec.md)：產品需求與使用者故事。
- [`specs/001-taiwan-basketball-magazine-ebook/plan.md`](./specs/001-taiwan-basketball-magazine-ebook/plan.md)：執行順序與依賴。
- [`specs/001-taiwan-basketball-magazine-ebook/tasks.md`](./specs/001-taiwan-basketball-magazine-ebook/tasks.md)：完整任務與完成狀態。
- [`DESIGN.md`](./DESIGN.md)：Arena Editorial 的體驗與設計原則。
- [`docs/product/`](./docs/product/)：產品願景、台灣籃球內容地圖與 evidence policy。
- [`docs/operations/disaster-recovery.md`](./docs/operations/disaster-recovery.md)：T081 復原能力與限制。
- [`Issue #111`](https://github.com/bynanci/courtside-tw/issues/111)：P1 beta release-gate 計畫。
- [`Issue #97`](https://github.com/bynanci/courtside-tw/issues/97)：main protected ruleset 政策與 read-back。

### 本地驗證

要先看到可操作的公開閱讀流程，可執行：

```sh
make setup
make demo
```

在沒有 `make` 的環境，可改用 `pnpm install --frozen-lockfile --ignore-scripts` 後執行
`pnpm demo`。

`make demo` 只啟動綁定在 `127.0.0.1` 的 read-only reader fixture 與 Nuxt，提供可見的
Home → Issue → Article 範例；它不啟動 Studio、OIDC、publisher 權限或正式資料，也不等於
完整的 PostgreSQL／Spring production-like stack。

一般協作者只需要：

```sh
make setup
make verify
```

完整工具鏈、資料庫與安全驗證規則，請以 repository 的 `Makefile`、`.github/workflows/` 與各 `docs/` 文件為準。

## 研究與 Web3 的位置

研究與 Web3 都是產品的延伸，不是產品的起點。

`docs/research/` 可以保存假設、研究設計與 participant study materials，但研究設計不等於實際使用者結果。只有完成招募、執行、量測、分析與 decision receipt 後，才能把研究結果用於產品方向。

Web3 的正確位置，是在出版內容已經值得閱讀之後，提供來源驗證、文化記憶與可選的身份連續性；它不應該成為讀者進入雜誌前必須理解的技術。

## Status note

本 README 以產品經理視角描述 Courtside TW 的價值、範圍與進度。工程細節不是被忽略，而是被放回正確位置：用來支持產品承諾、風險控制與可驗證交付，而不是取代產品本身。
