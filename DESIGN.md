# DESIGN.md — Taiwan Basketball Digital Magazine

**Status**: PROVISIONAL / REVIEW-READY v0.1 — implementation preflight, not approved  
**Date**: 2026-08-06  
**Working title**: `Courtside TW` is a repository label, not an approved brand name  
**Primary platform**: Mobile-first SSR web; installable/offline PWA behavior remains roadmap-gated  
**Implementation stack**: Nuxt 4.5, Motion for Vue, bounded p5.js preset  
**Owners**: Product owner, design owner, engineering owner, PUBLISHER content owner  

## 0. Decision summary

Courtside TW 採用「當代運動編輯設計」：

- **Editorial Grid / Magazine** 提供長篇內容、封面、引言、圖說與媒體的閱讀節奏。
- **Swiss Modernism 2.0** 提供 4／8／12 欄網格、數學化間距、單一主強調色與清楚資訊層級。
- **Courtside signals** 只在封面、章節標記、數據卡與 court-pulse-v1 中加入球場線、計分板節奏與比賽能量。

不採用搜尋建議中的完整 Neo Brutalism：厚黑框、硬陰影、貼紙堆疊與高飽和粉色會增加長篇閱讀噪音，也不符合 plan 已核准的「內容優先、非 crypto-neon dashboard」方向。可保留的是非對稱構圖、強烈標題比例與少量色塊，不保留重邊框、隨機旋轉或機械式視覺負擔。

此文件是 UI／UX implementation contract，不是品牌資產授權書，也不得覆蓋 constitution、spec、plan 或 ADR。品牌名稱、Logo、最終色票、字體檔與攝影素材仍須由指定 owner 提供合法使用依據。

## 1. Authority and change control

設計決策的優先順序如下：

1. feature spec 與可量測 success criteria
2. 已 ACCEPTED 的 ADR-0001 至 ADR-0006
3. implementation plan
4. 本 DESIGN.md
5. 頁面或元件層 override

任何 override 若改變匿名免費閱讀、rights gate、WCAG 2.2 AA、Core Web Vitals、reduced-motion、SSR fallback、Web3 least agency 或 11 種內容 block 上限，必須先回到 spec／ADR，不得只用 CSS 或 feature flag 偷渡。

每個設計變更 PR 必須附：

- 受影響 route、viewport 與 component
- light theme 截圖；若啟用 dark theme，需另附 dark 截圖
- keyboard、screen reader、reduced-motion、no-JS 影響
- loading、empty、error 與 degraded state
- 對 SC-001、SC-002、SC-007、SC-013、SC-014 的驗證結果

## 2. Product promise and design principles

### 2.1 Product promise

讓讀者在手機上感受到「一本為台灣籃球而生的數位雜誌」，從封面到文章不超過三次操作，並能安靜地完成長篇閱讀；讓編輯不需工程師手改頁面，也能以可追溯、可撤回、rights-valid 的流程出版。

### 2.2 Eight principles

1. **內容先於介面**：標題、封面、正文、媒體與目錄永遠比錢包、技術狀態或裝飾重要。
2. **不對稱但不失去方向**：Hero 與媒體可以突破網格；正文、表單、導覽與狀態訊息保持穩定、線性、可掃讀。
3. **節奏不是特效**：Motion 必須表達導航、層級、進度或因果；沒有目的就不動。
4. **Mobile 是主場**：375px 是起始設計寬度，Pixel 6 是 representative Android；桌面是擴展，不是把手機版放大。
5. **失敗仍可閱讀**：無 JavaScript、慢網路、圖片錯誤、canvas 失敗、reduced-motion 與 Web3 outage 都不能遮住正文或導覽。
6. **信任來自證據與界線**：署名、rights、revision 與 provenance 用清楚文字說明；不使用 crypto-neon 或「上鏈即真實」的誤導視覺。
7. **靜態版本就是完整產品**：Motion 與 canvas 是 progressive enhancement；SSR poster、資料摘要與語意導覽不是次等 fallback。
8. **Rights 是設計條件**：沒有 owner、license、credit、有效期間與撤回方式的素材，不得進入 production surface。

## 3. Audience and usage context

| Persona | Context | Primary job | Design implication |
| --- | --- | --- | --- |
| 匿名讀者 | 通勤、休息、行動網路 | 快速找到一期並開始閱讀 | 首屏清楚 CTA、無登入牆、媒體可降級 |
| 深度讀者 | 10–30 分鐘長文 | 保持閱讀位置與理解脈絡 | 穩定字級、窄正文欄、anchor-based progress |
| 回訪讀者 | 同裝置續讀 | 回到上次位置、找下一篇 | 非阻塞 resume prompt、期刊內導覽 |
| EDITOR | 桌面為主、平板／手機輔助 | 建稿、排版、補 rights、送審 | autosave、明確錯誤、單一 renderer |
| PUBLISHER | 桌面／行動審核 | 核准、排程、發布、下架 | publish checklist、不可略過 rights gate |

## 4. Core experience map

~~~mermaid
flowchart TD
  H["首頁／最新一期"] --> I["期刊詳情與 TOC"]
  H --> A["直接開始精選文章"]
  I --> A
  A --> E["文章結尾：上一篇／下一篇／目錄"]
  A -. "次要入口" .-> P["Edition Passport"]
~~~

閱讀節奏沿用簡報設計的單一敘事弧線，但不做 slide carousel：

`Hook → Orientation → Reading → Closure / Next article`

- 每個 surface 只有一個主命題：首頁是最新一期、期刊頁是目錄、文章頁是閱讀。
- 首屏最多一個 primary CTA 與兩個 secondary links。
- 約每 3–5 個閱讀段落才允許一次 pattern break；寬幅攝影、pull quote、stat 或 generative poster 不得連續堆疊。
- 文章結尾必須完成 closure：來源、上一篇／下一篇與返回目錄。

### 4.1 Three-action budget

一次操作定義為一次 tap、click 或鍵盤 Enter／Space 啟用；頁面載入、捲動與 history restoration 不計入。SC-001 的固定驗收路徑是：

1. 首頁選擇最新一期「查看本期」。
2. 期刊頁選擇「前往目錄」；這是指向同頁 `#toc` 的原生 anchor。
3. 從完整 SSR TOC 選擇指定文章。

補充規則：

- `/issues/[issueSlug]` 本身承載完整 TOC，不新增獨立 TOC route。
- TOC 不得預設收合文章連結；讀者直接捲動時，實際路徑可以少於三次。
- 375×812 viewport 的最新一期 CTA 與期刊 TOC CTA 必須在各自首屏可見。
- 測試 fixture 至少包含三個 section、每個 section 多篇文章，不得只證明第一篇可達。
- 搜尋、登入、錢包、分析同意與 Passport 不得插入這條 P1 路徑。

### 4.2 Return and resume

- 同站本期 TOC 進站時，Back 可使用 history 並還原 scroll、filter 與焦點；直接連結或外站進站時，必須回到 canonical issue `#toc` URL，不依賴不存在的 history。
- Resume key 為 `articleId + revisionId + blockAnchor`，百分比只作輔助；有效進度在 10%–95% 才於 article header 下顯示非 modal prompt。
- Prompt 顯示文章與章節名稱，提供「繼續上次閱讀」與「從頭開始」；未經選擇不得自動跳到文章中段。
- Revision 改變時只可對應仍存在的 stable block ID；無安全對應就從頂端開始。下架、撤回或無效 revision 必須清除本機 pointer。

## 5. Information architecture and navigation

| Route / surface | Primary content | Primary action | Navigation contract |
| --- | --- | --- | --- |
| / | 最新一期、精選文章、過往期刊入口 | 開始閱讀 | Mobile compact app bar；Hero CTA 在首屏或第一個 scroll segment |
| /issues | 期刊封面與摘要 | 查看一期 | 單欄起始，較大 viewport 才擴成 grid |
| /issues/[issueSlug] | 封面、期號、主題、分章 TOC | 開啟文章 | TOC 為垂直語意清單，不使用水平 carousel |
| /articles/[articleSlug] | 長篇正文與 11 種 block | 繼續閱讀 | 返回 issue、閱讀進度、分享；mobile 用 contextual Reader Dock 取代 global bottom nav |
| /search（P2） | 關鍵字、filters、結果 | 開啟結果 | Flag 啟用後才出現在導覽；預設顯示最近／熱門主題 |
| /library（P2） | 收藏與續讀 | 繼續閱讀 | Flag 啟用後才出現；未登入時不影響公開閱讀 |
| /studio/* | 建稿、審稿、rights、發布 | 儲存／送審／核准 | Desktop split view；mobile 採單欄與 explicit controls |

### 5.1 Public shell

- 手機 app bar 只保留當前已啟用的品牌／返回與必要 actions；每個 icon 都有文字替代與 44×44 CSS px hit area。
- P1 未啟用的搜尋／書庫 route 必須完全隱藏，不顯示 disabled 或「即將推出」的 nav item。Desktop primary nav 上限四項。
- Article route 採 distraction-reduced shell：top bar 提供「返回本期目錄」與分享；mobile Reader Dock 提供目錄／上一篇／下一篇，並取代 global bottom nav。
- Reader Dock 與 app bar 不得依捲動方向自動隱藏；top bar 高度至少 56px，dock 操作預設 48×48 CSS px，內容底部需加 dock + safe-area inset。
- 第一篇／最後一篇缺少的方向顯示非互動文字，不保留空 anchor；存在的 SSR links 使用 `rel="prev"`／`rel="next"`。
- 不混用同層級的 sidebar、tabs 與 bottom nav；P2 至少有三個啟用目的地後才評估 global bottom nav，文章頁仍不得同時顯示兩套 bottom navigation。
- 分享以普通 canonical link 為 SSR／no-JS 基線；Web Share API 只能 progressive enhance，不能是唯一分享方式。

## 6. Responsive layout contract

### 6.1 Breakpoints and grid

| Class | Test width | Grid | Gutter | Intended behavior |
| --- | ---: | ---: | ---: | --- |
| Reflow floor | 320px | 4 columns | 16px | 公開 route 不失去內容／操作；不是獨立視覺稿 |
| Mobile baseline | 375px | 4 columns | 16px | 單欄；contextual Reader Dock；TOC 在正常文件流 |
| Representative Android | 412px / Pixel 6 | 4 columns | 20px | Motion／p5、safe area、文字放大與行動網路基準 |
| Tablet | 768px | 8 columns | 24px | Reader 仍單一主欄；Issue cover／TOC 可 5:7 排列 |
| Desktop | 1024px | 12 columns | 32px | Sticky TOC rail、680–720px body、完整 Studio authoring 起點 |
| Wide | 1440px | 12 columns | 48px | App canvas 約 1320–1360px；可加 metadata rail，正文不加寬 |

### 6.2 Layout rules

- 以可用 inline size／container query 決定 layout，不以裝置名稱或 user agent 硬編碼。
- 可使用 min-block-size: 100dvh，但不可用固定 100vh 鎖死主內容；不可停用 zoom。
- 任何 route 在 320–1440px 不得產生 page-level horizontal scroll。
- Fixed／sticky UI 必須加上 env(safe-area-inset-*) 與對應 content inset。
- 正文 mobile 約 28–36 個繁中字元寬；desktop 約 36–42 個，最大 inline size 約 42rem。
- Desktop article 使用 12 欄：正文主要落在 4–9 欄；寬媒體可擴至 2–11 欄；caption 仍對齊正文邏輯。
- 不使用 nested vertical scroll 作為主要閱讀容器。
- 667×375 等低高度 landscape 的 toolbar 可縮至 48–52px，但 target 仍至少 44×44px；sheet／dialog 必須自身可捲動且 close 保持可見。
- Tablet portrait 維持單一閱讀主欄；available inline size 達 1024px 才可啟用 sticky TOC rail。
- p5 poster／canvas 在 orientation change 保持比例並 resize 原 instance，不得建立第二個 canvas。

## 7. Visual language

### 7.1 Composition

- 封面與 Issue Hero：大幅 4:5 cover、非對稱標題、期號與日期形成明確 editorial lockup。
- 文章：平靜、線性、窄正文；圖片、引言、數據卡與 generative insert 才打破欄位。
- Studio：高密度但不「卡片化一切」；使用 section、divider、table 與 split pane 建立層級。
- Court geometry 只能作為低頻輔助：半場弧線、罰球線、shot path、scoreboard labels；不可變成每張卡片的背景。

### 7.2 Provisional semantic colors

品牌 owner 未核准最終色票前，元件只使用 semantic token；不得把 provisional hex 寫死在 feature component。

| Token | Light fallback | Dark preview | Use |
| --- | --- | --- | --- |
| canvas | #F6F2E8 | #101418 | 紙張／頁面背景 |
| surface | #FFFDF8 | #171C22 | Sheet、toolbar、Studio panels |
| ink | #11100E | #F4F1EA | 主要文字 |
| ink-muted | #475467 | #B8C0CC | 次要資訊 |
| accent | #B54708 | #FFB36B | 閱讀 CTA、章節標記、focus accent |
| info | #22577A | #8AC6E8 | 來源／provenance 資訊 |
| success | #166534 | #86D39A | 已核准／verified |
| warning | #9A3412 | #FDBA74 | rights 即將過期／pending |
| danger | #B42318 | #FDA29B | blocked／failed／withdrawn |
| border | #D8D1C4 | #343C46 | Divider 與 control boundary |

已驗證的主要 light contrast：

- ink / canvas：約 17:1
- ink-muted / surface：約 7.7:1
- accent / surface：約 5.4:1
- info / canvas：約 6.9:1

Dark theme 是 token contract 的預留能力，不是 P1 必交項。若啟用，必須逐頁重跑 contrast、media treatment、focus、disabled 與 scrim QA，不能只反轉顏色。

~~~css
:root {
  --color-canvas: #f6f2e8;
  --color-surface: #fffdf8;
  --color-ink: #11100e;
  --color-ink-muted: #475467;
  --color-accent: #b54708;
  --color-on-accent: #ffffff;
  --color-info: #22577a;
  --color-success: #166534;
  --color-warning: #9a3412;
  --color-danger: #b42318;
  --color-border: #d8d1c4;
}
~~~

### 7.3 Typography

採兩個角色，不超過兩個實際載入 font families：

- **Editorial serif**：Noto Serif TC 候選，用於 issue title、feature headline、pull quote 與有限的文章標題。
- **UI／reading sans**：Noto Sans TC 候選，用於 navigation、metadata、forms、Studio 與正文預設。

合法字體檔、subset 與 self-hosting 方案未核准前，使用 system fallback：

- Serif：Songti TC、PMingLiU、serif
- Sans：PingFang TC、Microsoft JhengHei、system-ui、sans-serif

規則：

- 正文 mobile 18px／1.8 line-height；desktop 18–20px／1.75。
- 每個 screen 最多四個主要 type sizes、兩個 weight levels；hero display 可作為明確例外。
- 日期、期號、統計與 digest 使用 font-variant-numeric: tabular-nums，不為此額外載入 monospace。
- 不以全大寫處理繁中；英文 eyebrow 可 uppercase 並保留可讀 tracking。
- Webfont 採 font-display: swap 或 optional，預載只限 above-the-fold 必要字重。
- 正式核准前禁止透過 Google Fonts CSS、CDN、npm package 或執行期 `@import` 下載字體；fallback stack 中出現 Noto 不代表 repository 已擁有字體檔或 redistribution 權。

### 7.4 Spacing, radius, elevation and z-index

| System | Tokens | Rule |
| --- | --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64, 80 | 以 8 為主、4 為微調；相關元素距離小於不同群組 |
| Radius | 0, 8, 16, 24, pill | Editorial media 可直角；controls 8；cards 16；sheet 24 |
| Elevation | none, 1, 2, overlay | 主要靠 spacing／tone；soft shadow 僅給 floating UI |
| Z-index | 0, 10, 20, 40, 50, 60 | base、sticky、nav、sheet、modal、toast；禁止 9999 |

避免厚黑框、硬 offset shadow、隨機 radius、三層巢狀 cards 與純裝飾 blur。

### 7.5 Icons and imagery

- 結構 icon 使用單一 SVG family；Vue 候選為 Phosphor Vue，dependency 加入前仍需記錄 package version 與 license，並統一 outline／filled hierarchy 與 stroke。
- Emoji 不作為 navigation、status 或 system control。
- 圖片必須使用正式 brand／rights asset，不猜 Logo、不拉未授權球員或賽事照片。
- Issue cover 預設 4:5；feature landscape 16:9 或 3:2；profile 1:1。所有媒體保存 focal point、width、height、alt、caption、credit 與 rights status。
- 圖片宣告 aspect-ratio／尺寸，提供 AVIF、WebP、JPEG variants 與 dominant placeholder。
- 不生成或使用看似真實球員、球隊或賽事紀實的 AI 圖像；生成素材只能是明確標示的抽象／概念視覺，且仍須有 owner 與 rights record。

### 7.6 Brand and asset activation gate

正式品牌決策前，header 只顯示可設定的 working title，不建立、描摹或臆造 Logo，也不使用未授權的球隊、聯盟、贊助商或媒體標誌。任何品牌、字體、攝影、插畫或生成資產啟用前，repository 必須保留：

- asset owner、核准人、正式名稱、版本與來源
- 商用、web embedding、修改與重新散布權
- 核准 weights／styles／subset 或圖片使用範圍
- 必要 attribution、有效期間、撤回方式與 license receipt

## 8. Surface specifications

### 8.1 Home

- 首屏只回答三件事：這一期是什麼、為什麼值得讀、如何開始。
- Hero 最多一個 primary CTA 與兩個 secondary links。
- Mobile 先顯示 cover／title／CTA，再顯示摘要；desktop 才允許 cover 與標題不對稱並排。
- 最新一期後依序為精選文章、過往期刊、主題入口；不使用無限 carousel。

### 8.2 Issue detail and TOC

- 期號、主題、日期與簡介在 cover 附近，不埋在 drawer。
- TOC 使用 section heading + article rows；每列包含 title、article type、作者與閱讀時間。
- 未發布內容完全不出現在 public DOM。
- court-pulse-v1 預設只顯示 poster，互動版需通過 feature flag 與效能 gate。

### 8.3 Article reader

- Header：section、title、dek、作者、發布／更新時間、閱讀時間、issue link。
- Top bar：左側「返回本期目錄」、右側分享／更多；窄螢幕可省略中間期號，但不可截斷核心標題。返回 control 必須有包含「本期目錄」的 accessible name。
- Reading progress：頂部視覺條 + 可讀文字；不把 percentage 當唯一恢復定位，也不在每次 scroll 用 `aria-live` 播報。
- Body：paragraph rhythm 優先，不讓 sticky UI、分享工具或動畫打斷段落。
- Media breakout 在 desktop 擴欄，在 mobile 回到 viewport width 並保留 gutter／caption。
- Figure：`figure`／`figcaption`／credit／source 各有清楚語意；credit 不塞進 alt，heading 不因視覺尺寸跳級。
- End state：上一篇、下一篇、返回目錄、相關閱讀與「本篇已讀」closure；prev／next end card 顯示 article title + section。

### 8.4 Studio

- 1440px 以上：navigation／editor／public-renderer preview 三欄工作區。
- 1024–1439px：完整 issue／article authoring、block editing、media、taxonomy、排序與 audit；inspector／preview 可切換。
- 768–1023px：review、approve、rights checklist、preview 與 metadata form；Editor／Preview 以 tabs 切換，不做複雜 side-by-side authoring。
- 320–767px：查看 publication 狀態、blocking rights、preview；PUBLISHER 可在二次確認且必填原因後緊急撤回。不可 block authoring 或 drag reorder。
- `<1024px` 開啟不支援的 authoring route 時，保留已保存／conflict 狀態並顯示「使用較大螢幕繼續」，不得留下破版 editor。
- Autosave 狀態固定可見：saving、saved、conflict、offline、failed。
- Publish checklist 依序顯示 schema、required fields、media rights、credit、preview、schedule；blocked item 可直接跳到問題欄位。
- Responsive capability 不是 authorization；API 仍執行 RBAC 與 workflow gate。Mobile emergency withdrawal 是唯一要求完整手機支援的敏感 mutation。

## 9. Content block visual contract

| Block | Reader behavior | Studio requirement |
| --- | --- | --- |
| paragraph | 穩定 measure 與 paragraph rhythm | plain structured text |
| heading | 保持正確 h2–h4 hierarchy | 禁止跳級並即時提示 |
| list | ordered／unordered 語意 | 不用手打符號模擬 |
| quote | 文字優先、可選來源 | source field 明確 |
| divider | 表示章節節奏，不作裝飾濫用 | accessible separator |
| image | alt、caption、credit、rights | 缺任一必要 rights 欄位即 blocked |
| gallery | mobile 垂直或明確分頁，不橫向 scroll-jack | 圖片順序與 alt 可編輯 |
| stat | value、unit、context 同時存在 | 數字格式與來源欄位 |
| video | allowlisted provider 或 external link fallback | canonical reference + rights |
| related-reading | 語意連結清單 | 避免循環／失效 reference |
| generative-canvas | poster、alt、data summary 永遠先存在 | trusted preset + bounded params |

### 9.1 Component taxonomy

| Layer | Components |
| --- | --- |
| Foundations | ThemeProvider、Typography、Surface、Divider、FocusRing、Icon |
| Primitives | Button、IconButton、Link、Field、Select、Checkbox、Dialog、Sheet、Tooltip、Badge、Skeleton |
| Editorial | IssueMasthead、IssueCover、IssueCard、SectionTOC、ArticleDeck、Byline、CreditLine、Figure、Gallery、PullQuote、StatBlock、RelatedReading |
| Reader | ReadingProgress、ResumePrompt、ReaderDock、ArticleNavigation、ShareButton、BlockRenderer |
| Creative | GenerativePoster、P5CanvasHost、MotionBoundary |
| Studio | StudioShell、WorkflowStepper、StatusChip、EditorToolbar、BlockInspector、MediaRightsPanel、ConflictBanner、PreviewSplit |
| Trust | EditionPassportDrawer、ProvenanceStatusRow、DigestCopyAction |

無領域語意的 primitive 才能放進共用 UI layer；Issue、Article、Rights、Creative 與 Provenance 元件歸各自 feature。每個互動元件都需定義 default、hover、focus-visible、pressed、selected、disabled、loading、error、empty、reduced-motion 與 no-JS 行為。

## 10. Motion contract

### 10.1 Motion tokens

| Token | Value | Use |
| --- | ---: | --- |
| `motion.duration.none` | 0ms | reduced-motion／fallback |
| `motion.duration.pressIn` | 80ms | 按下 |
| `motion.duration.pressOut` | 140ms | 放開 |
| `motion.duration.exit` | 140ms | 離場 |
| `motion.duration.enter` | 220ms | 進場 |
| `motion.duration.sharedMax` | 360ms | cover shared layout 上限 |
| `motion.duration.progress` | 90ms | 閱讀進度平滑 |
| `motion.stagger.step` | 32ms | TOC 每項；最多 6 項／192ms |
| `motion.distance.xs/sm` | 4px／8px | TOC／route |
| `motion.scale.press` | 0.98 | 按壓回饋；不得縮得更小 |

Enter 使用 `cubic-bezier(.16, 1, .3, 1)`，exit 使用 `cubic-bezier(.4, 0, 1, 1)`；shared cover 採 `stiffness 320 / damping 32 / mass 0.9` 且不得可見 overshoot。所有值由單一 motion variant module 匯出，component 不得自訂 duration／spring／transform magic number。同一 viewport 最多同時運動兩個主要元素。

### 10.2 Five allowed patterns

| Pattern | Purpose | Default | Reduced / failure |
| --- | --- | --- | --- |
| route fade／slide | 僅 client-side 同層導覽 | opacity + 8px，enter 220ms／exit 140ms | 立即顯示完成 DOM；focus 仍移至新頁 h1 |
| issue-cover shared layout | 同一期 card → hero 的空間連續性 | 高阻尼 spring，最長 360ms | 180ms crossfade；圖片／比例／route error 時直接切換 |
| TOC reveal stagger | 只對使用者展開後新增的 rows | 4px → 0，32ms step，最多 6 項 | 全部立即可見；初始 SSR TOC 永不重播 |
| reading-progress interpolation | 平滑顯示閱讀位置 | `scaleX()`，90ms；ARIA 值獨立更新 | 數值立即更新；no-JS 不顯示 progress |
| button／gesture feedback | 確認 tap、press、drag | 80／140ms，scale 0.98 | background／outline／text state；gesture 有按鈕替代 |

SSR DOM 必須從第一個 byte 就是可讀完成狀態；不得先 opacity: 0、移出 viewport 或以 `v-cloak` 隱藏正文。初次 hydration 採 `initial: false`，server 不猜 motion preference；client 讀取 preference 後才可 import Motion／p5。Route focus、scroll restoration、錯誤與資料載入不等待動畫，狀態完成也不得依賴 `animationComplete`。

## 11. court-pulse-v1 contract

- 內容：球場線、shot locations、文章內非個資數值與 issue palette 的可重現抽象圖。
- Input 僅限以下 bounded schema；所有值先由 server normalize：

| Field | Bound |
| --- | --- |
| `presetId` | 固定 `court-pulse-v1` |
| `presetVersion` | versioned integer／semver |
| `seed` | 從發布 snapshot 穩定導出，不接受 code |
| `density` | integer 8–48；default 24 |
| `tempo` | number 0.25–1.0；default 0.55 |
| `lineWeight` | number 1–3；default 1.5 |
| `paletteId` | allowlist enum，只引用 design token |
| `sequence` | 最多 64 個非個資數值，附 unit／source |

- 禁止 source code、shader、callback、remote URL、arbitrary JavaScript 與個資。
- p5 與 preset 皆 client-only dynamic import；只在含 block 且接近一個 viewport 時下載。
- Lifecycle 為 `SSR_POSTER → NEAR_VIEWPORT → LOADING → READY → PLAYING ⇄ PAUSED → DISPOSED`。
- `rootMargin: 100% 0` 才可 dynamic import；intersection ≥25% 且 document visible 才 mount／loop。intersection <10% 持續 250ms、document hidden 或手動 pause 時執行 `noLoop()`。
- instance mode；route unmount 依序停止 loop、取消 RAF／timer、disconnect observer、解除 listener，再 `remove()`。
- 全頁最多一個 active loop；ResizeObserver debounce；devicePixelRatio 上限 1.5；canvas bitmap 上限 1.5M pixels。
- Poster、alt text、data summary 與「查看靜態圖」永遠存在；reduced-motion 預設不自動播放。
- Poster 由發布時相同 `seed + presetVersion + params` 產生；client screenshot 不算 canonical poster。建議 source 1600×1000，再輸出 responsive AVIF／WebP／JPEG。
- Data summary 必須列資料來源、期間、單位與 normalized sequence；若純裝飾，明示「不代表即時比分或預測」。
- 若互動有額外資訊或持續超過 5 秒，提供 48px「啟用互動／暫停／播放」按鈕；canvas 不可成為唯一資訊來源。`saveData=true`、flag off、reduced-motion 未手動啟用或 runtime guard 觸發時維持 poster-only，p5 transfer 必須為 0 B。

### 11.1 Provisional creative performance budget

| Metric | Gate |
| --- | ---: |
| Non-generative route p5 transfer | 0 B |
| p5 + host + preset incremental JS | ≤450 KiB gzip |
| Mobile poster variant | ≤160 KiB |
| Active loop | ≤1 |
| Frame-rate target | 30 fps |
| p95 sketch frame work | ≤12ms |
| p5-attributable long task >50ms | 0 in 30 seconds |
| Canvas block attributable CLS | ≤0.02 |
| After 20 article switches | 0 canvas／loop／observer／global listener |

Kill switch：

- 非 generative route 下載 p5 chunk
- Pixel 6 出現持續 long task、scroll jank 或明顯耗電
- 文章切換後遺留 canvas、animation loop、observer 或 global listener
- poster／摘要與 fixed seed 結果不一致
- accessibility、SC-002、SC-013 或 SC-014 失敗

任一條件成立先關閉互動、保留 poster，不提高效能 budget 來掩蓋問題。

Flags 必須可分別關閉 `creative.motion.enabled`、五種 motion pattern、`creative.p5.enabled` 與 `creative.p5.courtPulseV1`。任一 P1 route 未通過 SC-002／007／013／014，即關閉造成失敗的 enhancement。

## 12. Edition Passport and Web3 UX

Edition Passport 是 publication evidence panel，不是首頁主角，也不是閱讀資格。

### 12.1 Placement and hierarchy

- 入口位於 issue／article metadata 的「出版來源」次要連結。
- Mobile 使用 bottom sheet；desktop 使用 side panel。都必須有明確 close、Escape、focus trap 與回焦。
- 先顯示 human-readable summary，再顯示 manifest version、digest、published-at、rights scope 與 copyable reference。
- CID／chain／wallet 欄位在 feature 關閉時顯示「未啟用」，不是錯誤或信任不足。

### 12.2 Status semantics

狀態拆成三個軸，不使用單一 `VERIFIED` 混合 origin current、manifest digest、CID availability 與 chain confirmation：

| Axis | Status | Reader copy |
| --- | --- | --- |
| Origin publication | CURRENT／SUPERSEDED／WITHDRAWN | 目前發布版本／已有較新版本／此版本已撤回 |
| Manifest | VERIFIED／PENDING／UNAVAILABLE／FAILED:DIGEST_MISMATCH | 版本一致／處理中／暫時無法驗證／版本不一致 |
| External adapter | DISABLED／PENDING／VERIFIED／UNAVAILABLE／FAILED | 未啟用／處理中／已確認指定紀錄／不可用／失敗 |

固定說明：「雜湊一致只證明資料版本相符，不代表文章內容真實、合法或永久可用。」CID 代表相同 bytes，不保證 gateway 永久可取；chain record 不代表區塊鏈背書內容或權利；wallet signature 只證明當時控制位址，不等於真實身份或編輯權限。Digest、CID、network、transaction 與 schema version 使用可換行 code，並提供「複製完整值」。

### 12.3 Default-off boundary

- T003／P1：manifest UI 在 P2 slice 前關閉；IPFS mirror、chain attestation、SIWE／wallet 全關；signer capability 不存在；`externalWrites=false`；gas ceiling = 0。
- P1 不顯示 wallet CTA，不要求 RPC、IPFS、token、NFT 或鏈上交易。Flag off 時不得載入 wallet／IPFS／RPC SDK，不得 request accounts、呼叫 gateway／RPC 或顯示假的 disabled CTA。
- Wallet 只能由讀者明確操作啟動；拒絕、錯 chain、disconnect 或 outage 不能影響匿名閱讀。
- 不使用霓虹、coin、chain animation 或「Verified on-chain」大徽章製造虛假權威感。

## 13. Interaction states

| State | Required behavior |
| --- | --- |
| SSR／initial loading | 首屏直接顯示完成 HTML，不使用全頁 skeleton；client navigation >300ms 才顯示保留最終尺寸、`aria-hidden` 的 skeleton，container 設 `aria-busy` |
| Empty catalog／issue | 顯示「首期準備中」或「本期暫無可閱讀內容」與安全返回；不得洩漏 draft／schedule，empty issue 不列為 latest |
| Recoverable error | 顯示簡短原因、Retry、返回安全頁；request ID 可收在 details，不顯示 stack／SQL／draft metadata |
| Network degraded | 先文字、後低解析圖片；提供 retry，不重置閱讀位置 |
| Offline after render | 保留已渲染正文，只顯示非阻塞 offline status；不得用 error page 取代文章 |
| Uncached offline route | Retry／Back；只有 P3 完整離線包成功安裝且 flag on 才顯示「開啟已下載版本」 |
| Media／p5 failed | 保留 aspect ratio、poster、alt、data summary、caption、credit；正文與導覽繼續 |
| Unpublished／unknown／withdrawn | 統一 `CONTENT_UNAVAILABLE` UI，不洩漏 draft。已知曾公開且撤回可回 410；draft／unknown 回 404；withdrawn 移除正文與媒體並返回本期目錄 |
| Offline rights withdrawal | 重連後優先清除；說明永久離線裝置無法保證即時撤回，不宣稱 DRM |
| Rights blocked | Studio 列出缺少的 owner、license、credit 或日期並連到欄位 |
| Save conflict | 保留兩版本、顯示差異與 resolve path；不 silent overwrite |
| Web3 outage／digest mismatch | Outage 顯示上次驗證時間且不阻斷文章；mismatch 移除 verified badge 並顯示 critical text alert |

## 14. Accessibility contract

- WCAG 2.2 AA；normal text contrast ≥4.5:1，large text／large glyph ≥3:1。
- Skip link、語意 landmark、順序正確的 h1–h4、figure／figcaption、list 與 nav。
- 所有 controls keyboard 可用；route change 將 focus 移到 main heading；Back 還原原焦點。
- Focus ring 2–4px，不能被 overflow 或 sticky layer 裁掉。
- Touch target：Web 最低 44×44 CSS px；Android representative QA 以 48dp 評估；targets 間至少 8px。
- 不以顏色作唯一狀態；icon 必須搭配 text 或 accessible label。
- 支援 200% text resize、400% browser zoom、320 CSS px reflow、系統文字放大與繁中換行；不可用 fixed height 截斷正文或 labels。
- Modal／sheet 支援 Escape、focus trap、明確 close、unsaved change confirmation。
- Gesture 必須有可見替代；drag reorder 另提供上移／下移。
- Canvas 同層有可聚焦描述、data summary、poster 與 pause control。
- prefers-reduced-motion 下取消非必要位移、parallax、stagger 與 autoplay。
- 每頁提供 skip-to-main；article 可另提供 skip-to-TOC／body。TOC 使用具 label 的 `nav` + ordered list。
- 人工驗收至少涵蓋 TalkBack／Chrome、VoiceOver／Safari 與 NVDA／Firefox 或 Chrome；reading progress 不得持續 live announce。

### 14.1 No-JS contract

No-JS 時必須保留 Home → issue → `#toc` → article SSR links、完整 heading／byline／正文／figcaption／credit、返回目錄、上一篇／下一篇、canonical share link，以及 p5 poster／alt／data summary。Resume、native share 與 canvas controls 無法工作時不得渲染假控制項。

## 15. Performance and progressive enhancement

設計 QA 直接採用產品 success criteria：

- Mobile p75：LCP ≤2.5s、INP ≤200ms、CLS ≤0.1。
- 不含 generative-canvas 的 route 不得下載 p5 chunk。
- 圖片固定尺寸／aspect ratio，above-the-fold responsive image 有明確 fetch priority；其餘 lazy load。
- 每個 view 同時只允許 1–2 個關鍵 motion；每 frame 主執行緒工作應留在約 16ms frame budget 內。
- Tap 在 100ms 內得到 visual feedback。
- p5 offscreen／hidden CPU 必須趨近 idle；route unmount 後零 canvas、零 loop、零 global listener。
- 連續切換 20 篇文章後，DOM、observer 與 animation lifecycle 無遺留。
- no-JS 與 hydration failure 仍提供 title、author、body、TOC、prev／next、share 與 poster。
- `prefers-reduced-motion` 或 `saveData=true` 未經手動啟用前不得下載 p5；普通 CSS hover／focus 不引入 Motion runtime。

## 16. Validation matrix

本矩陣是 T025、T033、T041、T078 等 UI slices 的共同 release gate；截圖本身不算功能完成。

| ID | Scenario | Pass condition | Proof |
| --- | --- | --- | --- |
| UX-01 | 375×812 anonymous cold start | Home 到指定文章 ≤3 activations | Playwright trace + recording |
| UX-02 | JavaScript disabled | Home／issue／TOC／article／return／prev-next／share links 可操作 | no-JS E2E + HTML assertions |
| UX-03 | Hydration delay／failure | SSR title、TOC、body 與 links 第一幀可見可聚焦 | E2E + screenshot |
| UX-04 | 375／412／768／1024／1440 | 無 page-level overflow，reader measure 符合 contract | visual regression |
| UX-05 | 320 CSS px／400% zoom | 內容、navigation、CTA 不重疊、裁切或失去功能 | manual receipt |
| UX-06 | 200% text／OS font scaling | Toolbar、prompt、labels 可增高換行 | Android／iOS manual |
| UX-07 | Safe-area device | Top bar、Reader Dock、最後正文與 focus ring 不被遮住 | device／simulator screenshots |
| UX-08 | Mobile article | Global bottom nav 與 Reader Dock 不同時存在 | DOM assertion |
| UX-09 | First／middle／last article | Prev／next 依 snapshot；缺少方向不可聚焦 | fixture + E2E |
| UX-10 | Direct article URL | 返回 canonical issue `#toc`，不依賴 history | E2E |
| UX-11 | Valid／changed／withdrawn resume | 不 auto-scroll；revision 安全對應；withdrawn pointer 清除 | unit + integration |
| UX-12 | Touch audit | Non-inline controls ≥44×44px；Pixel 6 primary controls 48×48px | bounding-box audit |
| UX-13 | Keyboard only | Skip link、TOC、drawer、article、prev-next 可完成；focus 不被 sticky UI 擋住 | Playwright + manual |
| UX-14 | Screen reader | Landmarks、heading、TOC、figure、names 正確，無 progress spam | TalkBack／VoiceOver／NVDA receipt |
| UX-15 | Reduced motion／Save-Data | 無 geometry／stagger／autoplay；未手動啟用前 p5 transfer 0 B | E2E + HAR |
| UX-16 | Image／Motion／p5 failure | 尺寸不塌、poster／alt／summary 存在，CLS ≤0.1 | E2E + Lighthouse |
| UX-17 | Offline after render／uncached URL | 已讀正文保留；uncached 不假稱已下載 | browser offline E2E |
| UX-18 | Draft／unknown／withdrawn | 不洩漏 draft；withdrawn 移除正文媒體並安全返回 | API + E2E |
| UX-19 | 667×375 landscape／tablet rotation | Dialog、toolbar、canvas lifecycle 正常，無 100vh crop 或第二 canvas | visual + lifecycle counters |
| UX-20 | Studio 375／768／1024／1440 | 能力符合 responsive boundary；API RBAC 不變 | role-based E2E |
| UX-21 | Studio keyboard reorder | ≥1024px authoring 不使用 pointer 仍能排序 | keyboard E2E |
| UX-22 | Core routes axe | Home、issue、article、unavailable、Studio review 無 serious／critical violations | CI axe report |
| UX-23 | Pixel 6 throttled | SC-002 通過；普通文章 p5 0 B；20 route switches 零 leak | Lighthouse + bundle + trace |
| UX-24 | Web3 flags off | 無 wallet／RPC／gateway／chain request；external write receipt = 0 | HAR + audit receipt |
| UX-25 | Light theme／optional dark | 所有使用組合達 WCAG contrast；dark 未啟用時不納入 P1 UI | contrast report + screenshots |

### 16.1 Design acceptance

- 90% usability participants can open a target article within three actions.
- Reader and TOC remain complete at 375px without horizontal scroll or clipped controls.
- Article body, metadata, navigation and media alternatives work without JavaScript.
- Keyboard and screen reader order matches visual order.
- Every asynchronous, empty, failed and withdrawn state has cause + recovery.
- Motion and p5 pass Pixel 6, reduced-motion and lifecycle gates.
- Edition Passport never blocks reading and never overstates what digest／CID proves.

## 17. Anti-patterns

- Crypto-neon dashboard、wallet-first onboarding、giant chain badges
- PDF viewer、page-flip gimmick、scroll-jacking 或強制 parallax
- Neo Brutalism 的厚框／硬陰影全面套用到正文與 Studio
- Card inside card inside card、每個 section 都有 rounded container
- Hero、TOC、正文與 nav 同時做 entrance animation
- opacity: 0 等 hydration、無 poster 的 canvas、continuous decorative loop
- Mobile horizontal TOC carousel、gesture-only controls、fixed bar 遮住最後一段
- 低對比 gray-on-gray、移除 focus ring、用顏色單獨表示 rights／status
- 未授權 Logo、字體或球員照片；猜測 brand asset URL
- 任意 z-index、magic spacing、page-specific raw color hex

## 18. Open decisions and owners

| Decision | Current baseline | Owner / gate | Blocks |
| --- | --- | --- | --- |
| 雜誌正式名稱與 Logo | Courtside TW 為 working title | Product / brand owner | Production brand acceptance |
| 最終色票 | semantic fallback tokens | Brand owner + accessibility proof | Visual sign-off |
| 字體檔與授權 | system fallback；Noto Serif/Sans TC 候選 | Brand／legal／rights owner | Webfont shipping |
| 攝影與 cover style | rights-valid editorial photography | PUBLISHER content owner | First issue publishing |
| Video allowlist | 未指定 provider 時 external link fallback | PUBLISHER + security | Video embed |
| Dark theme | token preview，非 P1 必交 | Product owner + full QA | Dark-mode release |

## 19. Implementation gate

開始 T003 root baseline 或任何 UI scaffold 前，必須完成：

- DESIGN.md 已加入 PR 並完成 traceability read-back。
- Mark 核准本 baseline，或提出 bounded amendment。
- 未決品牌／字體／媒體項目保留為 named gate，不被假設為已解決。
- T003 graph 將 design preflight 標為 done，implementation frontier 才能回到 root baseline。

下一個 implementation action 僅能是 T003 的 root workspace baseline；T004 Nuxt、T005 Spring 與後續 UI implementation 仍分開 dispatch。
