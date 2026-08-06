# Feature Specification: 台灣籃球雜誌電子書

**Feature Branch**: `001-taiwan-basketball-magazine-ebook`  
**Created**: 2026-08-06  
**Status**: Draft v0.2  
**Input**: User description:「把台灣籃球雜誌電子書整理成規格、技術計畫與開發任務」，並加入 Web3-ready 架構、Motion 與 p5.js 基礎互動敘事。

## Product Outcome

建立一個以繁體中文為主、Mobile-first 的台灣籃球數位雜誌平台。讀者可以用「期刊 → 目錄 → 文章」的方式閱讀人物、球隊、賽事、戰術、文化與歷史專題；編輯團隊可以在具審稿、媒體授權與排程發布控制的後台中完成一期雜誌。

閱讀體驗以可漸進增強的 editorial motion 與受限的生成式視覺為差異化能力；發布資料則保留可驗證 manifest、內容定址鏡像與鏈上存證的 Web3 adapter 邊界。SSR、公開閱讀與出版交易仍是系統主幹，任何錢包、鏈或 IPFS 故障都不得阻斷核心內容。

本產品的第一目標是證明兩件事：

1. 讀者願意在手機上完成長篇籃球內容閱讀，而非只看短影音或即時新聞。
2. 編輯能以可控、可追溯的流程穩定出版數位期刊，不必請工程師手改頁面。

## MVP Boundary

### MVP 必須交付

- 公開期刊列表、期刊詳情與目錄。
- 適合長篇閱讀的文章頁與期刊內上一篇／下一篇導覽。
- 編輯後台：草稿、送審、核准、排程、發布、下架與修訂。
- 圖片上傳、圖片說明、攝影／來源署名與授權檢核。
- 基礎期刊主題、文章署名、分享與 SEO metadata。
- Motion for Vue 的頁面／目錄／閱讀進度基礎動態，以及一種以 p5.js preset 驅動的生成式視覺區塊。
- 動態與生成式視覺的 SSR poster、文字摘要、reduced-motion 與無 JavaScript fallback。
- 編輯身分驗證、角色權限、稽核紀錄。
- 核心流程的自動化測試、效能與無障礙門檻。

### MVP 明確不做

- 線上付款、訂閱扣款、優惠券、發票與退款。
- DRM 或宣稱能防止截圖、複製的內容保護。
- 留言、論壇、讀者投稿與其他 UGC。
- 即時比分、賽事 Play-by-play、球員即時數據。
- 原生 iOS／Android App；第一版以可安裝 PWA 為主。
- 自動抓取、改寫或未取得授權的第三方新聞與圖片。
- 紙本排版、印刷工作流、任意 PDF 自動轉成文章。
- 多語系內容；資料模型保留未來擴充空間，MVP 僅 `zh-TW`。
- NFT、代幣發行、DAO、加密貨幣付款、token-gated content 或要求讀者連接錢包才能閱讀。
- 讓編輯上傳或執行任意 p5.js／JavaScript 程式碼；互動視覺只能使用已審核 preset 與受 schema 限制的參數。

### Post-MVP 增量

- **P2**: 可管理的聯盟／球隊／球員／賽季 taxonomy、搜尋與篩選、登入讀者收藏與跨裝置續讀。
- **P2**: 可選的 EIP-1193 錢包連接、ERC-4361 Sign-In with Ethereum、公開出版 manifest、IPFS CIDv1 鏡像與 EVM-compatible 存證 adapter；不改變免費閱讀政策。
- **P3**: 具版本、配額與撤回處理的離線期刊。

## User Scenarios & Testing (mandatory)

### User Story 1 - 瀏覽一期並開始閱讀 (Priority: P1)

讀者從首頁看到最新一期與過往期刊，進入期刊詳情後理解主題、封面、出版時間與目錄，並在三次操作內開啟文章。

**Why this priority**: 這是產品最短價值路徑；若讀者無法快速從封面進入內容，其他功能都沒有意義。

**Independent Test**: 在沒有登入、沒有預先快取的手機瀏覽器中，讀者可從首頁進入任一期刊並開啟一篇已發布文章。

**Acceptance Scenarios**:

1. **Given** 系統已有至少一期已發布期刊，**When** 匿名讀者開啟首頁，**Then** 系統顯示最新一期、過往期刊與清楚的閱讀入口。
2. **Given** 讀者進入一期已發布期刊，**When** 頁面載入完成，**Then** 系統顯示封面、期號、主題、出版日期、摘要與依章節排序的目錄。
3. **Given** 目錄包含已發布與未發布文章，**When** 匿名讀者查看目錄，**Then** 只顯示目前可公開閱讀的文章。
4. **Given** 期刊不存在、尚未發布或已下架，**When** 讀者開啟其公開網址，**Then** 系統回傳一致的不可用頁面，不洩漏草稿標題或內容。

---

### User Story 2 - 沉浸式閱讀長篇文章 (Priority: P1)

讀者在手機、平板或桌面裝置上閱讀包含文字、圖片、圖說、引言、數據卡、影片、延伸資料與受限生成式視覺的長篇文章；系統以克制的動態建立雜誌節奏，保留閱讀位置並提供期刊內導覽。

**Why this priority**: 閱讀體驗是數位雜誌的核心差異，不能退化成一般部落格或 PDF 縮放器。

**Independent Test**: 使用一篇包含所有支援內容區塊的測試文章，驗證三種 viewport、鍵盤操作、螢幕閱讀器語意、分享預覽與重整後閱讀位置。

**Acceptance Scenarios**:

1. **Given** 一篇已發布文章，**When** 讀者開啟文章，**Then** 系統顯示標題、副標、作者、發布時間、預估閱讀時間、正文、媒體署名與所屬期刊。
2. **Given** 讀者已閱讀至文章中段，**When** 同一瀏覽器稍後重新開啟文章，**Then** 系統提示並可回到最近閱讀位置。
3. **Given** 文章屬於一期期刊，**When** 讀者到達文章結尾，**Then** 系統提供上一篇、下一篇與返回目錄入口，順序與編輯設定一致。
4. **Given** 圖片載入失敗或網路不穩，**When** 讀者閱讀文章，**Then** 文字內容、替代文字與圖說仍可閱讀，版面不應大幅跳動。
5. **Given** 讀者分享文章，**When** 連結出現在支援 Open Graph 的平台，**Then** 預覽使用該文章的標題、摘要、主圖與正式 canonical URL。
6. **Given** 文章含生成式視覺區塊，**When** 瀏覽器支援 JavaScript 且區塊進入接近 viewport 的範圍，**Then** 系統才載入 p5.js client chunk，以固定 seed 與受限參數建立可重現的互動視覺。
7. **Given** 讀者啟用 reduced motion、瀏覽器不支援 canvas 或 JavaScript 載入失敗，**When** 閱讀同一文章，**Then** 系統顯示 SSR poster、替代文字與資料摘要，不隱藏正文或造成導覽失效。

---

### User Story 3 - 編輯並發布一期雜誌 (Priority: P1)

編輯建立期刊、撰寫或匯入文章、安排目錄、上傳合法媒體、送交審稿，主編核准後立即或定時發布；發布後的修訂留下版本與稽核軌跡。

**Why this priority**: 沒有可維運的出版流程，就無法持續供應內容，也無法控制誤刊、授權與回溯風險。

**Independent Test**: 以 `EDITOR` 與 `PUBLISHER` 兩個測試帳號，從空白資料完成一期兩篇文章的建立、送審、核准、排程、公開驗證與下架。

**Acceptance Scenarios**:

1. **Given** 使用者具 `EDITOR` 權限，**When** 建立或修改草稿，**Then** 系統保存未發布修訂，但不讓公開端讀取。
2. **Given** 文章含缺少署名、授權狀態不明或已過期的媒體，**When** 編輯送審或主編發布，**Then** 系統阻擋操作並列出確切缺件。
3. **Given** 文章已送審，**When** `PUBLISHER` 核准，**Then** 系統記錄操作者、時間、原版本與核准結果。
4. **Given** 期刊設定未來發布時間，**When** 到達該時間，**Then** 系統只公開已核准且通過授權檢核的期刊與文章。
5. **Given** 已發布文章需要修正，**When** 編輯建立新修訂並重新核准發布，**Then** 公開端切換到新版本，舊版本仍可供內部稽核但不可被一般讀者存取。
6. **Given** 主編緊急下架文章，**When** 下架完成，**Then** 公開端與搜尋索引在既定時間內失效，系統保留原因與稽核紀錄。

---

### User Story 4 - 搜尋與探索台灣籃球內容 (Priority: P2)

讀者可用關鍵字、聯盟、球隊、球員、賽季與主題找到文章，不依賴會隨聯盟更名而失效的硬編碼分類。

**Why this priority**: 搜尋與主題探索延長內容壽命，但不阻擋首期雜誌上線。

**Independent Test**: 匯入跨多期、含同名球員與不同賽季的測試資料，驗證關鍵字、組合篩選、無結果與下架內容排除。

**Acceptance Scenarios**:

1. **Given** 多篇已發布文章含標題、摘要、作者與正文，**When** 讀者輸入關鍵字，**Then** 結果依相關度與發布時間排序並標示命中脈絡。
2. **Given** 編輯建立新的聯盟或賽事分類，**When** 讀者篩選內容，**Then** 新分類無須部署程式即可出現。
3. **Given** 文章已下架或仍為草稿，**When** 讀者搜尋，**Then** 結果不顯示該文章及其未公開摘要。
4. **Given** 查無結果，**When** 搜尋完成，**Then** 系統顯示可清除篩選與推薦熱門主題的空狀態。

---

### User Story 5 - 收藏與跨裝置續讀 (Priority: P2)

登入讀者可以收藏文章、查看閱讀紀錄，並在其他裝置繼續閱讀；未登入期間的本機進度可在登入後由使用者選擇合併。

**Why this priority**: 提升回訪與長篇完讀率，但不是匿名閱讀 MVP 的前置條件。

**Independent Test**: 在兩個獨立瀏覽器工作階段以同一帳號登入，驗證收藏同步、進度合併、刪除與下架內容處理。

**Acceptance Scenarios**:

1. **Given** 已登入讀者，**When** 收藏一篇文章，**Then** 收藏清單在另一已登入裝置可見。
2. **Given** 本機與伺服器均有同篇文章進度，**When** 使用者選擇合併，**Then** 系統保留更新時間較新的有效進度且不覆寫較新的資料。
3. **Given** 收藏文章已下架，**When** 讀者查看收藏，**Then** 系統顯示內容不可用，不顯示受限正文。
4. **Given** 讀者要求刪除帳號，**When** 身分再次確認，**Then** 個人收藏、閱讀進度與可識別資料依資料保留政策刪除或匿名化。

---

### User Story 6 - 離線保存一期內容 (Priority: P3)

讀者可在 PWA 中保存允許離線的期刊，系統顯示下載大小、進度、版本與失效狀態，並允許刪除本機資料。

**Why this priority**: 通勤閱讀很有價值，但涉及儲存配額、媒體授權與內容撤回，應在出版核心穩定後交付。

**Independent Test**: 在受限網路與離線模式中下載一期測試期刊，驗證完整閱讀、配額不足、更新、下架失效與本機清除。

**Acceptance Scenarios**:

1. **Given** 一期允許離線且裝置空間足夠，**When** 讀者確認下載，**Then** 系統快取當前發布版本及必要媒體並顯示完成狀態。
2. **Given** 期刊已有新版，**When** 裝置重新連線，**Then** 系統提示更新，不在背景無限制重複下載大型媒體。
3. **Given** 內容因授權或法律原因撤回，**When** 裝置重新連線收到撤回清單，**Then** 系統使該離線內容失效並清除受影響快取。
4. **Given** 空間不足或瀏覽器拒絕持久儲存，**When** 下載失敗，**Then** 系統顯示可理解的原因且不留下被誤認為完整的半成品。

---

### User Story 7 - 驗證出版來源並選擇性連接錢包 (Priority: P2)

讀者可以查看一期公開版本的可驗證 manifest、內容雜湊、IPFS CID 與鏈上存證狀態；若讀者選擇連接錢包，可透過標準簽章建立站內 session，但匿名閱讀不受影響。

**Why this priority**: 可驗證出版來源能強化數位典藏與收藏信任，但不應成為閱讀、SEO 或編輯出版的前置依賴。

**Independent Test**: 對同一期已發布快照重新計算 canonical manifest digest，驗證 CID／鏈上紀錄；再以錢包拒絕、錯誤鏈、切換帳號、RPC 中斷與 nonce replay 測試，確認公開閱讀始終可用。

**Acceptance Scenarios**:

1. **Given** 一期已建立可驗證出版紀錄，**When** 讀者查看來源資訊，**Then** 系統顯示 manifest schema 版本、快照 checksum、CID、chain ID、transaction reference 與驗證時間，且重新計算結果一致。
2. **Given** IPFS gateway、RPC 或鏈上索引暫時不可用，**When** 讀者開啟已發布文章，**Then** origin 內容仍可閱讀，來源狀態降級為「暫時無法驗證」而非誤報失敗或隱藏正文。
3. **Given** 讀者主動選擇連接錢包，**When** 完成 ERC-4361 簽章，**Then** 系統驗證 domain、URI、chain ID、nonce、issued-at 與 expiration，再建立短效 HttpOnly session；系統不得取得私鑰。
4. **Given** 使用者拒絕簽章、切換 account／chain 或 provider 斷線，**When** 錢包狀態事件發生，**Then** 系統清除或降級相關 session，顯示可恢復狀態且不影響匿名閱讀。
5. **Given** 已存證內容後續下架或媒體權利撤回，**When** 查看來源資訊，**Then** 系統保留不可變歷史紀錄並新增 withdrawal／superseded 狀態，不宣稱能刪除已公開的鏈上 digest 或第三方保存副本。

### Edge Cases

- 期刊已發布，但所有文章都被下架時，期刊公開頁應顯示「暫無可閱讀內容」並停止被列為最新一期。
- 排程發布工作重複執行時，發布結果必須具冪等性，不得產生重複版本或通知。
- 同一 slug 在不同期刊或語系中的唯一性衝突，必須在儲存前被拒絕並提供可修正建議。
- 使用者直接猜測草稿、歷史修訂或媒體原檔網址時，不得繞過權限。
- 文章正文含惡意 HTML、JavaScript URL、追蹤像素或未允許 iframe 時，必須在寫入與輸出兩層阻擋。
- 媒體授權在文章排程後、正式發布前過期時，排程必須失敗並通知負責編輯。
- 台灣籃球聯盟、球隊改名、解散或跨賽季時，既有文章關聯與顯示名稱需可保留歷史語境。
- 球員同名時，編輯必須透過獨立識別碼與所屬球隊／賽季辨識，不以名字作主鍵。
- 圖片 EXIF 含位置或個資時，公開衍生圖不得保留非必要 metadata。
- 搜尋查詢過長、只有標點、包含罕見中文字或中英混合時，不得造成錯誤或極慢查詢。
- 登入到期、跨分頁編輯衝突或兩位編輯同時儲存時，系統不得靜默覆蓋較新的修訂。
- 讀者禁用 JavaScript 時，已發布文章的核心文字內容仍應由 SSR 輸出並可閱讀。
- Motion hydration 前不得把可讀內容設為透明或移出可操作範圍；client enhancement 失敗時頁面仍保持完成狀態。
- p5.js canvas 建立後離開 route、切換文章或進入背景分頁時，必須停止 loop、解除 listener 並釋放 instance，避免重複 canvas 與記憶體洩漏。
- 編輯輸入惡意 shader、script、外部 asset URL 或超出範圍的 p5 參數時，schema 與 renderer registry 必須拒絕，不得動態求值。
- 錢包 provider 視為不可信輸入；錯誤 chain、異常 account、超長簽章訊息或重放 nonce 不得建立 session。
- IPFS 只鏡像權利允許長期公開的內容；有限期、可撤回或含個資的媒體不得因 Web3 功能被永久公開。

## Requirements (mandatory)

### Functional Requirements

#### 公開期刊與閱讀

- **FR-001**: 系統 MUST 提供已發布期刊列表，包含封面、期號、主題、出版日期與摘要。
- **FR-002**: 系統 MUST 提供期刊詳情與由編輯排序、可分章節的文章目錄。
- **FR-003**: 系統 MUST 僅在公開端輸出目前已發布且具有效公開權限的期刊、文章與媒體。
- **FR-004**: 系統 MUST 提供支援繁體中文長篇排版的響應式文章閱讀器。
- **FR-005**: 閱讀器 MUST 支援標題、段落、清單、引言、分隔、圖片、圖庫、圖說、數據卡、影片、外部連結與延伸閱讀區塊。
- **FR-006**: 系統 MUST 顯示作者、攝影／媒體署名、發布與更新時間、預估閱讀時間及所屬期刊。
- **FR-007**: 系統 MUST 提供期刊內上一篇、下一篇與返回目錄導覽，並遵循編輯排序。
- **FR-008**: 系統 MUST 以本機方式保存匿名讀者最近閱讀位置；登入讀者可選擇同步。
- **FR-009**: 系統 MUST 為公開期刊與文章提供 canonical URL、Open Graph、結構化資料與 sitemap 收錄控制。
- **FR-010**: 系統 MUST 提供可複製連結與使用裝置原生分享能力的分享操作。

#### 編輯與出版

- **FR-011**: 已授權編輯 MUST 能建立、編輯、預覽與封存期刊、文章、作者、分類與媒體。
- **FR-012**: 系統 MUST 使用版本化內容文件保存文章，歷史修訂不得被後續儲存覆蓋。
- **FR-013**: 文章與期刊 MUST 遵循 `DRAFT → IN_REVIEW → APPROVED → SCHEDULED/PUBLISHED → ARCHIVED` 的受控狀態轉換。
- **FR-014**: 系統 MUST 依角色限制狀態轉換；`EDITOR` 不得自行發布，`PUBLISHER` 才能核准、發布、下架與緊急撤回。
- **FR-015**: 系統 MUST 支援立即發布與以 `Asia/Taipei` 解讀、以 UTC 保存的排程發布時間。
- **FR-016**: 發布操作 MUST 具冪等性，且期刊公開版本只能引用已核准的文章修訂。
- **FR-017**: 編輯 MUST 能以拖放或明確排序值安排期刊章節與文章順序。
- **FR-018**: 系統 MUST 在內容被他人修改後阻止過期版本靜默覆寫，並回報衝突版本資訊。
- **FR-019**: 系統 MUST 為建立、修改、送審、核准、發布、下架、角色變更與權限失敗保留不可變稽核事件。
- **FR-020**: 公開內容修訂 MUST 建立新版本並重新通過檢核；不得直接修改已發布快照。

#### 媒體與權利

- **FR-021**: 編輯 MUST 透過短效簽章上傳流程上傳媒體，應用程式伺服器不得接收未限制大小的檔案串流。
- **FR-022**: 每個公開媒體資產 MUST 有替代文字、署名、來源、授權狀態、允許通路與必要的有效期間。
- **FR-023**: 系統 MUST 阻擋使用 `UNKNOWN`、`EXPIRED`、`REVOKED` 或不允許數位發布之媒體的文章送審與發布。
- **FR-024**: 系統 MUST 產生適合不同 viewport 的媒體衍生尺寸，移除非必要 EXIF，並保留不可公開的原檔。
- **FR-025**: 系統 MUST 能撤回資產並找出受影響的已發布文章與離線包。

#### 分類、搜尋與探索

- **FR-026**: 編輯 MUST 能管理聯盟、賽事、球隊、球員、賽季與主題；這些分類不得硬編碼於前端。
- **FR-027**: 分類實體 MUST 支援名稱變更、別名與有效期間，並保留歷史文章顯示語境。
- **FR-028**: 系統 MUST 支援以標題、摘要、作者、正文擷取文字與分類進行繁體中文關鍵字搜尋。
- **FR-029**: 讀者 MUST 能依期刊、聯盟、球隊、球員、賽季、主題與發布日期篩選搜尋結果。
- **FR-030**: 搜尋索引 MUST 在發布、修訂、下架或撤回後於 60 秒內反映公開狀態。

#### 身分、收藏與續讀

- **FR-031**: 系統 MUST 透過 OIDC 相容身分提供者驗證編輯與登入讀者，不自行保存明文密碼。
- **FR-032**: 系統 MUST 提供 `READER`、`EDITOR`、`PUBLISHER`、`ADMIN` 角色與最小權限授權。
- **FR-033**: 登入讀者 MUST 能新增、移除與列出文章收藏。
- **FR-034**: 登入讀者 MUST 能同步閱讀進度，並以伺服器可驗證的文章修訂識別碼避免套用到錯誤版本。
- **FR-035**: 系統 MUST 讓讀者能匯出或刪除其個人資料，並記錄不含敏感內容的處理結果。

#### 離線與生命週期

- **FR-036**: 系統 SHOULD 允許讀者下載被標示為可離線的已發布期刊版本。
- **FR-037**: 離線包 MUST 有明確 manifest、版本、預估大小、完成狀態與內容雜湊，不得把部分下載標示為完成。
- **FR-038**: 系統 MUST 在重新連線時套用撤回清單，使依法或依授權要求撤回的離線內容失效。
- **FR-039**: 讀者 MUST 能檢視與刪除裝置上的離線期刊資料。

#### 品質、安全與營運

- **FR-040**: 系統 MUST 對內容文件執行 schema 驗證、HTML／URL 白名單與輸出編碼，防止儲存型 XSS。
- **FR-041**: 系統 MUST 對公開 API、登入、上傳、搜尋與後台操作套用個別速率限制與大小上限。
- **FR-042**: 系統 MUST 為所有寫入 API 提供一致的錯誤格式、request ID 與樂觀鎖定版本。
- **FR-043**: 系統 MUST 以自動化 contract、unit、integration、E2E、accessibility 與 performance 測試保護 P1 流程。
- **FR-044**: 系統 MUST 提供健康檢查、結構化日誌、指標、分散式追蹤與發布／排程失敗告警。
- **FR-045**: 系統 MUST 每日備份資料庫與媒體 metadata，且每季以隔離環境驗證還原程序。

#### 互動敘事與 Web3

- **FR-046**: 系統 MUST 將 Motion 動態視為 progressive enhancement；核心內容與操作在 hydration 前可見，並完整尊重 `prefers-reduced-motion`。
- **FR-047**: 系統 MUST 提供一種 `generative-canvas` 內容區塊，只接受已審核 `presetId`、固定 seed、bounded parameters、SSR poster、替代文字與資料摘要；不得接受任意 JavaScript、shader 或遠端程式碼。
- **FR-048**: p5.js MUST 以 client-only dynamic import 載入，只在包含該區塊且接近 viewport 時啟動；離開 viewport／route 或頁面隱藏時 MUST pause／dispose，失敗時回到靜態內容。
- **FR-049**: 系統 MUST 為每個選擇存證的公開期刊快照產生版本化 canonical manifest，至少包含穩定 issue／revision IDs、snapshot checksum、公開媒體 digests、rights scope、published-at 與 schema version。
- **FR-050**: 系統 SHOULD 透過可替換 adapter 將符合資格的 manifest 發布為 IPFS CIDv1，並可將 manifest digest 錨定至經 ADR 核准的 EVM-compatible network；資料庫仍是 workflow system of record。
- **FR-051**: 選用錢包登入時，瀏覽器 provider MUST 遵循 EIP-1193 邊界，session challenge MUST 遵循 ERC-4361 並驗證 domain、URI、chain ID、nonce、時間窗與簽章；私鑰不得進入應用程式、日誌或後端。
- **FR-052**: 匿名公開閱讀 MUST 不依賴錢包、RPC、IPFS、token、NFT 或鏈上交易；錢包拒絕與外部 Web3 服務失效不得降低公開內容可用性。
- **FR-053**: 系統 MUST 禁止將個資、草稿、原始媒體 key、有限期／可撤回媒體內容寫入公鏈；撤回後新增可驗證狀態與 origin deny，不宣稱能刪除既有鏈上紀錄或第三方副本。

### Key Entities

- **PublicationIssue**: 一期雜誌；包含期號、slug、主題、封面、摘要、出版狀態、排程時間、公開版本與目錄。
- **IssueSection**: 一期中的目錄章節；保存標題與排序，不承載正文。
- **Article**: 文章的穩定識別與公開路徑；目前草稿與目前公開修訂透過 revision 指標關聯。
- **ArticleRevision**: 不可變的文章版本；包含標題、副標、摘要、內容文件、純文字擷取、閱讀時間、版本號與審核資料。
- **IssueArticle**: 期刊、章節與文章的關聯；保存顯示順序與期刊限定標題等展示資訊。
- **ContentDocument**: 版本化 block document；每個區塊有穩定 ID、type、schemaVersion 與經驗證 payload。
- **MediaAsset**: 原始媒體與衍生檔 metadata；包含 checksum、尺寸、MIME、儲存鍵、處理狀態、替代文字與 rights record。
- **RightsRecord**: 媒體使用依據；包含權利人、授權類型、來源、署名、允許通路、有效期間與撤回狀態。
- **TaxonomyTerm**: 聯盟、賽事、球隊、球員、賽季或主題；可有別名、父子關係與有效期間。
- **Contributor**: 作者、攝影、插畫、編輯等內容貢獻者及公開署名資訊。
- **ReaderProfile**: 由外部身分主體對應的最小讀者資料與偏好。
- **Bookmark**: 讀者與文章的收藏關聯。
- **ReadingProgress**: 讀者或本機對文章修訂的閱讀位置、完成比例與更新時間。
- **PublicationJob**: 立即／排程發布、下架、索引或媒體處理工作的狀態與冪等鍵。
- **AuditEvent**: 不可變的敏感操作紀錄；保存 actor、action、target、結果、時間與 request ID。
- **PublicationProvenance**: 公開出版快照的 canonical manifest digest、CID、chain／contract／transaction reference、狀態、重試與驗證結果；不承載正文或個資。
- **WalletIdentityLink**: 讀者明確同意後建立的 off-chain wallet address 與 ReaderProfile 關聯；保存 chain namespace、驗證時間與撤銷狀態，不保存私鑰。

## Business Rules

- `PublicationIssue` 與 `ArticleRevision` 都必須通過核准才能公開；核准不是發布，發布也不得自動核准內容。
- 發布快照是不可變的。任何公開修訂都建立新 revision，再以原子操作切換公開指標。
- 目錄順序只由 `IssueSection.position` 與 `IssueArticle.position` 決定，不以建立時間推論。
- 聯盟、球隊、球員等名稱皆為可變屬性，所有關聯使用穩定 ID。
- 所有 MVP 公開內容的 `accessPolicy` 固定為 `FREE`；可先保留欄位，但不得在未完成 entitlement 與付款驗證前顯示「已付費即可閱讀」。
- 撤回優先於快取、搜尋與離線可用性；無法確認撤回狀態時，受影響內容採不可用處理。
- 文章分析資料僅收集達成產品指標所需的事件；未同意分析追蹤的讀者仍可閱讀完整公開內容。
- Motion 與 p5.js 不得改變內容語意、閱讀順序或操作結果；動畫關閉時仍是完整產品，不是次等版本。
- Web3 是可選驗證與身分 adapter，不是新的出版 system of record；鏈上狀態不得直接越過 editorial approval、rights gate 或 origin withdrawal。
- 只有權利允許長期再散布的公開 manifest／asset 才能進入去中心化鏡像；無法證明時只存 digest，不鏡像內容 bytes。
- 錢包位址視為可識別資料；連結帳號需明確同意並可解除 off-chain 關聯，介面需說明公開鏈歷史無法由本站刪除。

## Success Criteria (mandatory)

### Measurable Outcomes

- **SC-001**: 至少 90% 的可用性測試參與者能在首頁起算三次操作內開啟指定文章。
- **SC-002**: 公開文章頁在行動網路條件下，正式環境 p75 Core Web Vitals 達到 LCP ≤ 2.5 秒、INP ≤ 200 毫秒、CLS ≤ 0.1。
- **SC-003**: 匿名讀者在 JavaScript 載入失敗時仍能讀到文章標題、作者、正文文字與媒體替代資訊。
- **SC-004**: 編輯能建立含 20 篇既有草稿的期刊、完成排序與排程發布，操作時間不超過 30 分鐘（不含撰文與審稿）。
- **SC-005**: 100% 的發布文章所引用媒體皆具有有效 rights record；測試中任何缺件都會被發布閘門阻擋。
- **SC-006**: 發布、修訂、下架與撤回後，公開頁面、搜尋與 sitemap 在 60 秒內達到一致狀態。
- **SC-007**: P1 流程達成 WCAG 2.2 AA 自動檢查零重大違規，並通過鍵盤與螢幕閱讀器人工驗收。
- **SC-008**: 公開讀取 API 在 100 RPS、95% cache hit 的基準情境下 p95 ≤ 300 毫秒、錯誤率 < 0.5%。
- **SC-009**: 發布流程對相同冪等鍵重試 10 次，只產生一個公開版本與一組副作用。
- **SC-010**: 每季還原演練可在 4 小時內恢復資料庫與媒體 metadata，資料復原點不超過 24 小時。
- **SC-011**: 上線後首三期，至少 60% 開始閱讀長篇文章的讀者達到 50% 閱讀深度；此為產品驗證指標，不作為單一讀者評價。
- **SC-012**: P1 自動化測試在 CI 中連續 20 次執行無不穩定測試後，才可解除 beta 標記。
- **SC-013**: P1 核心頁在 reduced-motion 與無 JavaScript 測試中，100% 正文、TOC、上一篇／下一篇與分享連結仍可操作，且無非必要自動動態。
- **SC-014**: 不含 `generative-canvas` 的頁面不得下載 p5.js chunk；含該區塊的頁面初始 SSR 必須提供 poster／摘要，且連續切換 20 次文章後不存在遺留 p5 canvas、animation loop 或 global listener。
- **SC-015**: 100% 已標記 `VERIFIED` 的出版存證可由 manifest 重新計算出相同 digest／CID，且自動掃描確認鏈上 payload 不含個資、草稿或媒體原始位置。
- **SC-016**: 錢包拒絕、錯誤 chain、account change、provider disconnect、過期 challenge 與 nonce replay 測試全部安全失敗；相同期間匿名閱讀成功率不低於未啟用 Web3 feature flag 的基準。

## Assumptions

- 第一版為單一品牌、單一編輯團隊與單一台灣時區，不做 multi-tenant。
- MVP 每月不超過 4 期、每期不超過 50 篇文章；首年公開文章量低於 10,000 篇。
- 所有文章與媒體由取得權限的編輯團隊提供，不自動抓取第三方內容。
- 公開文章可免費閱讀；帳號用於收藏、續讀與後台權限，不是付費牆。
- 正式環境使用 CDN 與 S3 相容物件儲存；原始媒體與公開衍生圖分開存放。
- 編輯器使用結構化 block document，而非任意 HTML；特殊版型需先建立受測試的 block type。
- 產品擁有可設定的 OIDC 身分提供者與寄信服務；供應商名稱在部署前以 ADR 確認。
- Motion for Vue 與 p5.js 僅在 Nuxt client layer 使用；server render 不執行 canvas 或依賴瀏覽器全域。
- P2 Web3 預設使用 EVM-compatible testnet／L2 adapter 驗證，正式 network、RPC、pinning 與 signer provider 必須經成本、權利、安全與退出能力 ADR 核准。

## Open Decisions (non-blocking for MVP specification)

1. **商業模式**: 首三期全免費、會員制或單期付費。預設先全免費；若改為付費，必須新增 entitlement、付款、退款、稅務與客服規格，不可只加前端遮罩。
2. **既有內容來源**: 目前未提供既有 PDF、Word、Notion 或 CMS。預設首期由編輯後台建立；大量移轉需另立 migration feature。
3. **品牌與視覺方向**: 尚未定義雜誌名稱、Logo、字體授權與攝影風格。這不阻擋架構，但會影響設計 token、封面模板與內容區塊最終驗收。
4. **動態與生成式視覺**: 需選定 3–5 組允許的 motion pattern、首個 p5 preset、靜態 poster 產生方式與低階 Android 效能基準；未定稿前不得開放任意創意程式碼。
5. **Web3 provider 與治理**: 需決定是否只做 manifest／CID，或再加入鏈上 registry 與 SIWE；同時核准 network、contract owner、signer custody、gas 預算、RPC／pinning 退出方案及永久公開風險。
