# 籃球數位雜誌 × Web3 實驗性使用者研究方法

**Status**：EXPERIMENTAL／RESEARCH PLAN  
**Version**：v0.1.0  
**As of**：2026-08-09  
**研究類型**：混合方法（質性探索 → 隨機原型比較 → 真實使用 pilot）  
**前置條件**：P1 `Home → Issue → TOC → Article → Closure` vertical slice 可操作

> 本文件是研究方法，不是研究結果。所有門檻是事前定義的 provisional gates；執行後必須附樣本、原始觀察、統計不確定性與偏差限制。

## 1. 研究問題

### 1.1 主要研究問題

Web3 是否能在不降低「一本為台灣籃球而生的數位雜誌」鮮明度與閱讀完成率的前提下，增加：

1. 閱讀後的記憶連續性。
2. 跨期回訪與故事線追蹤。
3. 對出版版本與來源的可理解信任。
4. 對內容、作者或出版計畫的實際支持。

### 1.2 次要問題

- 使用者何時開始需要版本與來源資訊？
- Reader Stamp 是有意義的文化記憶，還是只有徽章收集？
- Season Passport 是否像球迷年鑑，還是被理解成資產／排行榜頁面？
- Email／OIDC-first 與 optional wallet delivery 是否能降低排斥？
- 哪些價值由一般產品能力即可提供，不需要 Web3？

### 1.3 核心成功命題

```text
Magazine-first
→ Account/off-chain-first
→ Provenance after reading
→ Optional Web3 last
```

如果必須依靠 wallet、token、交易或投機敘事才能產生興趣，則不算驗證 Courtside TW 的核心產品價值。

## 2. 概念與研究邊界

| 概念 | 研究中的操作定義 | 不代表 |
| --- | --- | --- |
| Magazine | 有封面、期號、主題、TOC、編輯順序、長文與 closure 的閱讀單位 | PDF viewer、無限 feed 或新聞卡片牆 |
| Edition Provenance | 讓讀者理解 snapshot、revision、digest、rights scope 與驗證狀態 | 內容必然正確、版權保證或永久可用 |
| Reader Stamp | 完成閱讀／期刊條件後，以 Email／OIDC 取得的 off-chain 閱讀記憶 | NFT、投資資產或閱讀門票 |
| Season Passport | 跨期閱讀、活動與貢獻形成的球迷年鑑 | 排行榜、錢包資產頁或持幣權力 |
| Optional Web3 | 在 off-chain eligibility 成立後，由使用者主動選擇的 credential delivery | 閱讀前 onboarding、token gate 或交易市場 |

研究範圍內禁止：token speculation、secondary marketplace、staking、yield、governance token、wallet-only identity、把私人閱讀歷史直接上鏈。

## 3. 目前證據基線

| 判定 | 內容 |
| --- | --- |
| 文件已定義 | Magazine-first、free／anonymous reading、provenance 不阻塞閱讀、Passport 分離、Web3 optional |
| 設計已推演 | 首頁、Issue、TOC、Article、Provenance、Reader Stamp、Season Passport 的目標流程與文案方向 |
| 實作可證明 | 目前 repository baseline 只能證明既有 scaffold／文件契約；不能證明完整閱讀流程已可測 |
| 尚無資料 | 真實任務成功率、理解率、D7／D28 回訪、付款、退款、毛利、wallet abandon |

因此本研究的第一個 gate 是先完成可測的 P1 vertical slice，而不是直接驗證 Web3。

## 4. 研究假設

| ID | 假設 | 要觀察的行為 | 反駁／失敗條件 |
| --- | --- | --- | --- |
| H1 | Issue-first 能建立雜誌認知 | 使用者在三次操作內找到指定文章，並說出「台籃數位雜誌／檔案」 | 先記得錢包、徽章或功能，說不出期刊主題 |
| H2 | Reader Stamp 能增加記憶連續性 | 完讀後主動收藏，之後能找回自己讀過的期刊或故事線 | 有領取但沒有回訪、記憶或再使用行為 |
| H3 | Provenance 能提升版本信任 | 使用者能分辨「版本一致」與「內容必然正確」 | 把 hash／鏈上紀錄誤解為真理、版權或永久保存保證 |
| H4 | Account-first 能降低 Web3 排斥 | Email／OIDC 完成率不低於控制流程，wallet 為後置選項 | wallet、簽名、gas 或隱私疑慮阻斷閱讀／收藏 |
| H5 | Passport 能形成留存價值 | 使用者在 D7／D28 回訪並找回跨期故事線 | Passport 只是徽章牆，沒有內容回訪或記憶效用 |
| H6 | 支持型產品能產生真實收入 | 使用者完成預購、訂閱或一次性付款 | 只有「願意付費」回答，沒有 checkout／付款行為 |

## 5. 研究分階段設計

### P0：6 人 pretest，先驗證 P1 可測性

**目的**：找出資訊架構、文案、操作與研究腳本的致命問題。P0 不作統計推論。

- 招募：深度台籃讀者 2、人一般球迷 2、泛體育讀者 1、Web3 熟悉者 1。
- 範圍：只測 `Home → Issue → TOC → Article → Closure`。
- 不顯示 wallet、token、marketplace；不先告知「這是 Web3 產品」。
- 通過條件：能完成任務、問題可被觀察、研究員能記錄 evidence；不以 6 人百分比宣稱市場結論。

### P1：20 人質性使用研究

**目的**：探索 mental model、操作阻力、信任誤解與商業語意。

| Segment | 建議人數 | 招募判準 |
| --- | ---: | --- |
| 高頻台籃球迷 | 5 | 固定看球、進場或追蹤聯盟賽事 |
| 深度籃球內容讀者 | 5 | 會閱讀長文、戰術、人物或歷史內容 |
| 泛體育／偶爾看球者 | 5 | 非核心球迷，但有數位內容使用經驗 |
| Web3 熟悉者 | 5 | 作為壓力測試，不代表主要客群 |

訪談採 moderated task-based session；每人先自由探索，再完成固定任務，最後才詢問 Web3／付費感受。

### P2：三組隨機原型比較，n=120–180

此階段只作方向性因果實驗；正式樣本數需在取得控制組基準後依主要 endpoint、最小可接受效果、power 與 attrition 重算。

| 組別 | 功能差異 | 研究目的 |
| --- | --- | --- |
| A 控制組 | 公開閱讀、Issue／TOC、來源、書籤／續讀 | 建立 Magazine baseline |
| B 記憶組 | A + off-chain Reader Stamp + Season Passport mock／prototype | 驗證記憶與回訪價值，不混入 wallet |
| C Web3 組 | B + 人話版 Provenance + 完成後 optional wallet／credential delivery | 驗證 Web3 增量價值與排斥成本 |

三組使用相同期刊、文章、圖片、載入速度與內容品質；差異只能來自研究變項。

### P3：28 天真實使用 pilot

**目的**：觀察回訪、故事線、支持與故障降級，不把一次 session 的新奇感當成留存。

建議收集：D0、D7、D14、D28 行為；實際人數與權力分析在 P2 基準後決定。若 provider／wallet 故障，文章、TOC、來源與既有閱讀位置仍必須可用。

## 6. 使用者任務與量測

| ID | 任務 | 主要指標 | provisional gate |
| --- | --- | --- | --- |
| T1 | 首次訪客找到指定文章 | 成功率、操作次數、迷路點 | P1 目標 ≥90%；P0 僅診斷 |
| T2 | 閱讀 5 分鐘後描述產品 | Magazine recognition | ≥80% 說是台籃數位雜誌／檔案 |
| T3 | 解讀版本與來源面板 | Provenance comprehension | ≥80% 理解為版本一致，不是內容必真 |
| T4 | 完讀後領取 Reader Stamp | claim success、完成時間、放棄原因 | Email／OIDC 可完成；不得 wallet-first |
| T5 | 一週後回訪 Passport | D7 return、故事線找回率 | 方向性目標 ≥50%；需附樣本與 CI |
| T6 | 模擬 provider 故障 | fallback completion | 文章、TOC、來源仍可讀；不得被 Web3 阻塞 |
| T7 | 看到支持方案 | checkout start、purchase、refund | 以實際付款，不採純意向回答 |

補充保護門檻：B／C 組文章完成率不得比 A 組下降超過 5 個百分點；若下降，先修正資訊架構與出場時機，再談 Web3 增量。

## 7. 研究執行腳本

### 7.1 開場與中性說明

研究員只說：

> 這是一個台灣籃球數位雜誌原型。請依你平常看內容的方式使用；我們測試的是產品，不是在考你。

不要在任務前說「Web3」、「NFT」、「錢包」或預期答案。

### 7.2 固定任務順序

1. 從首頁找到指定文章。
2. 閱讀五分鐘，說出你認為這個產品是什麼。
3. 找到本期目錄、下一篇與上一篇。
4. 打開版本與來源，解釋畫面上每個狀態。
5. 完成閱讀後，選擇是否留下本期記憶。
6. 看到 Passport 後說明它對你有沒有用。
7. 在免費、Supporter、Patron Edition 之間做選擇；若願意，完成真實或模擬 checkout。
8. Web3 組才進入 optional wallet／credential delivery；拒絕、斷線或錯誤不得影響回到文章。

### 7.3 追問原則

- 問「你剛才想完成什麼？」而不是「你覺得這個功能好不好？」
- 先記錄自然行為，再問原因。
- 不用技術詞替使用者補答案。
- 使用者說「可以」時，追問「你會在什麼情況下實際使用／付費？」

## 8. 商業價值驗證

產品價值階梯：

| 層級 | 使用者價值 | 商業假設 | Web3 角色 |
| --- | --- | --- | --- |
| Public Magazine | 免費讀到深度台籃內容 | 拉新、SEO、品牌 | 無 |
| Reader Stamp | 保留「我讀過這一期」 | 啟動帳號與回訪 | off-chain 優先 |
| Season Passport | 看見自己跟過的賽季故事 | 留存、分眾、CRM | 可後置 |
| Supporter | 支持編輯與創作者 | 月費／年費 recurring revenue | 不需要 token |
| Patron Edition | 限定期刊、實體刊、活動或作者交流 | 高 ARPU、預購現金流 | 可選 credential |
| B2B | 贊助專題、出版版本、權利清單 | 贊助、合作、授權服務 | provenance 可作輔助 |

價格只作待驗證假設，例如 `Supporter NT$99／月、NT$990／年`、`Patron NT$490–990／期`；不得在沒有 checkout evidence 前宣稱定價成立。

商業 evidence 依強度排序：

```text
口頭興趣 < 問卷意向 < 點擊方案 < 啟動 checkout < 完成付款 < D28 留存與續付
```

至少記錄 conversion、退款／取消、貢獻毛利、回訪、分享帶來的新訪客，以及作者／攝影／贊助商是否願意付費試點。

## 9. 事件與資料規則

建議事件：

```text
issue_view
article_start
article_complete
provenance_open
stamp_claim_started
stamp_claim_success
passport_view
passport_storyline_open
share_click
supporter_offer_view
checkout_started
purchase_completed
wallet_intent
wallet_abandon
provider_failure
privacy_concern
```

每筆事件至少包含：

```ts
type ResearchEvent = {
  eventName: string
  participantKey: string // pseudonymous; not email or wallet address
  sessionKey: string
  variant: 'A' | 'B' | 'C'
  issueId: string
  occurredAt: string
  success: boolean | null
  elapsedMs: number | null
  reasonCode: string | null
}
```

禁止收集或公開：email、姓名、精確閱讀歷史、精確觀看時間、location、IP、device ID、private media、rights contract、storage key 與未經明確 opt-in 的 wallet address。研究資料與產品 credential 資料分離保存。

## 10. 分析方法

### 10.1 質性分析

採兩輪 coding：

1. 開放編碼：記錄使用者自然語句、迷路點、錯誤理解、信任語句、付費理由與拒絕理由。
2. 軸心編碼：歸納為 Magazine、Memory、Trust、Identity、Support、Web3 friction 六類，再與 H1–H6 對照。

每個結論至少要有：participant segment、任務上下文、原始觀察摘要、反例與研究員解釋。單一參與者的漂亮引言不能當成市場比例。

### 10.2 定量分析

- 使用 intention-to-treat；按照隨機分組分析，不只分析完成者。
- 主要比較：A vs B 的記憶／回訪差異；B vs C 的 provenance／Web3 增量與閱讀成本。
- 報告絕對差異、相對差異、95% 信賴區間與 attrition；不只報 p-value。
- 若樣本不足或事件稀疏，標記為方向性結果，不宣稱因果確定。
- 先固定主要 endpoint，避免看到結果後任意挑選最漂亮指標。

### 10.3 反例檢查

每次分析都要回答：

- 是否只有 Web3 熟悉者受益？
- B 組是否已經解釋全部效果，C 組沒有增量？
- 回訪是否只是通知或折扣造成，而非 Passport 的記憶價值？
- 完成閱讀的人是否本來就更投入，造成 selection bias？
- 付費是否來自投機／轉售期待，而非支持內容？

## 11. Go／Hold／Cancel 判準

### Go：進入下一個產品實驗

必須同時滿足：

- T1、T2 未顯示 Magazine identity 崩壞。
- Article completion 沒有因 Passport／Provenance 顯著下降。
- T3 多數使用者理解 provenance 的有限語意。
- Reader Stamp／Passport 的回訪或故事線結果有可重現方向，且不是只有徽章點擊。
- 故障降級仍保留文章、TOC、來源與安全返回。

### Hold：保留假設，暫停擴大

- 研究訊號混合、樣本不足或 segment 間差異過大。
- 使用者喜歡概念但沒有重複使用或付款行為。
- B 組有效、C 組無增量；先做 off-chain product value，不增加 Web3 複雜度。

### Cancel／撤下 public Web3 UI

符合任一項即停止 public Web3 expansion：

- 使用者先記得 wallet、NFT、徽章或積分，卻說不出本期主題。
- Provenance 造成「鏈上＝內容必真／版權已保證」的錯誤信任。
- Passport 增加操作成本但沒有回訪、記憶或支持改善。
- 主要付款動機是轉售、升值或投機。
- 一般台籃球迷明顯排斥，而只有 Web3 熟悉者有興趣。
- 內容、肖像、攝影或影像權利尚未確認。

## 12. 風險與控制

| 風險 | 控制 |
| --- | --- |
| 新奇效果 | 延長至 28 天，觀察 D7／D28，不只看首次 session |
| 招募偏差 | 分層招募，報告 segment；Web3 熟悉者不代表總體市場 |
| 引導偏差 | 任務前不說 Web3；先觀察再追問 |
| 研究員解釋偏差 | 保留原始觀察摘要、反例與第二輪 review |
| 隱私／鏈上永久性 | 不把精確行為與 PII 上鏈；wallet 只在明確 opt-in 後處理 |
| 權利撤回 | credential、poster、鏡像與 presentation 都受 rights withdrawal precedence |
| 產品阻塞 | provider／wallet／RPC 故障只能降級 provenance／passport，不阻塞 Article |
| 偽收入 | 以付款、退款、毛利與續付判定，不以 willingness-to-pay 代替 |

## 13. 研究完成條件與交付物

研究不能以「訪談做完」結束，必須交付：

- 招募與排除條件；不得提交可識別個資。
- 已版本化的任務腳本、分組與事件字典。
- 匿名化或 pseudonymized 的 observation／event dataset。
- 質性 codebook、反例清單與研究限制。
- A／B／C 的主要 endpoint、差異、CI、attrition 與故障結果。
- 真實 checkout／退款／回訪結果（若有）。
- Go／Hold／Cancel decision receipt。

在上述證據完成前，本專案只能說「研究方法已建立」，不能說「使用者已證明 Web3 有商業價值」。
