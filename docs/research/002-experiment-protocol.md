# P1 Prototype 與使用者研究執行協議

**Status**：READY FOR PRETEST，尚未執行  
**Version**：v0.1.1<br>
**Related method**：[`001-web3-magazine-user-research-method.md`](./001-web3-magazine-user-research-method.md)<br>
**Stage A runnable kit**：[`stage-a-pretest/`](./stage-a-pretest/)

## 1. 執行前置條件

研究開始前必須有一個可點擊、可回復、可觀察的 P1 vertical slice：

```text
Home → Issue → TOC → Article → Closure
```

### P1 minimum acceptance

- 首頁直接呈現最新一期、主題與「閱讀本期」主 CTA。
- Issue 頁保留期號、封面、主題與完整垂直 TOC。
- Article 可進行穩定的垂直閱讀；正文、byline、media alternative、source、上一頁／下一頁與回到 TOC 可用。
- Closure 位於內容價值之後，才顯示來源、下一篇與 Reader Stamp 入口。
- 無 JavaScript 或 hydration 延遲時，文章與導覽仍可讀。
- 不要求登入、wallet、token、付款或 external provider 才能閱讀。
- `reduced-motion`、provider failure 與 media failure 不會移除正文。

若 P1 未滿足上述條件，先修 prototype，不得用 Web3 功能掩蓋閱讀流程缺陷。

## 2. 原型分組

Issue #110 Stage A 只使用一個 frozen baseline：六位 retained participants 全部為 Variant `A`。不得在六人內切分 A／B／C，也不得依個別結果換 variant。下列 participant assignment 與 A／B／C 比較規則只適用後續 P2 隨機原型比較；不適用 Stage A。

| Variant | 開啟能力 | 關閉能力 | 主要比較 |
| --- | --- | --- | --- |
| A | Magazine、TOC、Article、source、bookmark／resume | Stamp、Passport、wallet delivery | Magazine baseline |
| B | A + off-chain Reader Stamp + Season Passport | wallet、chain write、token、marketplace | 記憶／回訪增量 |
| C | B + human-readable Provenance + optional wallet delivery | wallet-first、public behavior、token gate | Web3 增量與摩擦 |

分組原則：

- 相同 `issueId`、文章內容、素材、載入條件與研究腳本。
- P2 才在 participant assignment 後依預先登錄的隨機規則決定 variant；研究員不能依興趣手動挑組。
- 研究員不在前置說明中暴露 variant 名稱或預期結果。
- C 組拒絕 wallet、錯 chain、provider outage、簽名失敗都必須可回到 P1 閱讀流程。

## 3. 任務卡

Stage A T1/T2 的逐字提示、timing、assistance 與 coding 以 [`stage-a-pretest/03-t1-t2-task-cards.md`](./stage-a-pretest/03-t1-t2-task-cards.md) 為準；以下為跨階段摘要。

### Task T1：找到指定文章

**Prompt**：請找到「指定主題」的文章，並開始閱讀。  
**記錄**：成功／失敗、activations、迷路位置、是否誤進功能頁。

### Task T2：說明產品

**Prompt**：使用約五分鐘後，請用自己的話說明這個產品是什麼。  
**記錄**：Magazine、news feed、archive、membership、NFT／wallet 等自然分類。

### Task T3：理解本期結構

**Prompt**：請找到本期目錄、上一篇與下一篇。  
**記錄**：是否理解編輯順序、是否把 carousel／推薦當作完整目錄。

### Task T4：理解 provenance

**Prompt**：請說明「版本與來源」畫面告訴你什麼、沒有告訴你什麼。  
**記錄**：是否理解 digest／revision 的有限證明範圍。

### Task T5：留下閱讀記憶

**Prompt**：你讀完這一期後，想不想把它留在自己的賽季記憶裡？請依你的選擇操作。  
**記錄**：claim start／success、Email／OIDC friction、拒絕理由。

### Task T6：回訪故事線

**Prompt**：一週後，請找出你之前讀過的期刊與一條相關故事線。  
**記錄**：D7 return、find success、是否能說出為何這條線有用。

### Task T7：支持內容

**Prompt**：如果這是正式產品，你會選擇免費閱讀、Supporter 或 Patron Edition 哪一個？若願意，請完成 checkout。  
**記錄**：offer comprehension、checkout start、payment、refund／cancel intent；不得只記「願意」。

## 4. P1+／cross-stage moderated session runbook

本節的開場、追問與結束問題只適用後續 P1+／T3–T7 研究，不得混入 issue #110 Stage A。Stage A 必須逐字使用 [`stage-a-pretest/02-moderator-script.md`](./stage-a-pretest/02-moderator-script.md)，並在 T2 鎖定前後遵守該腳本的 bounded diagnostics 與禁止提示規則。

### 開場

```text
你今天要使用的是一個數位內容原型。
我們測試產品，不測試你的籃球知識，也沒有標準答案。
請邊做邊說出你想找什麼；如果卡住，先告訴我你原本期待發生什麼。
```

### 研究員規則

- 不替使用者點擊，除非該任務已明確結束或正在做無障礙協助。
- 不用「這裡其實是 Passport」修正使用者；先記錄其自然理解。
- 不在操作前展示完整產品架構圖。
- 追問「你下一步想做什麼？」、「你以為會發生什麼？」、「什麼讓你停下來？」。
- 先問價值，再問 Web3；先問實際使用場景，再問支付意願。

### 結束問題

1. 你會把這個產品推薦給哪一種台籃讀者？為什麼？
2. 哪個部分最像雜誌？哪個部分最像一般網站或 crypto product？
3. 如果只能保留一個功能，你會保留什麼？
4. 你願意在什麼情況下付費？你實際會做哪一步？
5. 什麼資訊會讓你不信任或不願意留下身份？

## 5. 事件契約

### 事件名稱

```text
issue_view
article_start
article_complete
toc_open
reader_dock_use
provenance_open
provenance_understood
stamp_claim_started
stamp_claim_success
stamp_claim_abandon
passport_view
passport_storyline_open
share_click
supporter_offer_view
checkout_started
purchase_completed
purchase_cancelled
wallet_intent
wallet_abandon
provider_failure
fallback_reading_success
privacy_concern
```

### 事件最小欄位

```json
{
  "eventName": "article_complete",
  "participantKey": "p_014",
  "sessionKey": "s_014_d0",
  "variant": "B",
  "issueId": "issue-07",
  "occurredAt": "2026-08-09T12:00:00Z",
  "success": true,
  "elapsedMs": 312000,
  "reasonCode": null
}
```

`participantKey` 必須是研究專用 pseudonym，不能由 email、姓名或 wallet address 可逆推出。研究 event log 不公開上鏈，也不直接餵給 public credential。

Issue #110 Stage A 不建立這種逐事件 log，也不保存精確 `occurredAt`／`elapsedMs`。Stage A 僅保存 restricted 的 T1 五秒取整 task duration、activation/wrong-turn／prompt counts、T2 prompt timing band、categorical response-window disposition、consent-covered 的最小逐字 T2 第一回答與必要 outcome/coding fields；公開輸出依 kit 的 withdrawal-cutoff aggregate allowlist，且不含逐字回答。

### Reason code 建議

| Code | 意義 |
| --- | --- |
| `NAVIGATION_CONFUSION` | 找不到期刊、TOC 或下一篇 |
| `CONTENT_TOO_THIN` | 不願繼續閱讀，認為內容不足 |
| `PROVENANCE_OVERCLAIM` | 誤以為 verified 代表內容必真／權利已保證 |
| `IDENTITY_FRICTION` | 登入、Email 或身份說明造成阻力 |
| `WALLET_FRICTION` | wallet、簽名、錯 chain 或 gas 造成阻力 |
| `PRIVACY_CONCERN` | 不願留下閱讀、身份或 wallet 資料 |
| `NO_RELEVANT_VALUE` | 不理解 Stamp／Passport 的實際用途 |
| `PAYMENT_RESISTANCE` | 不願付費或不接受方案 |
| `PROVIDER_FAILURE` | 外部服務故障 |

## 6. 觀察記錄格式

每位參與者只在 approved restricted research store 保留研究必要資料；completed participant row 不得提交到 repository。Issue #110 Stage A 使用 [`stage-a-pretest/04-observation-sheet.template.md`](./stage-a-pretest/04-observation-sheet.template.md)，下列格式只作跨階段摘要：

```md
# Participant p_014

- Segment: deep-basketball-reader
- Variant: B
- Session: D0 / D7
- Participation consent verified: true / false
- Consent version: [private consent version only]
- Optional-permission version: [private version only]
- Audio recording: NOT_ASKED / DECLINED / GRANTED / REVOKED
- Screen recording: NOT_ASKED / DECLINED / GRANTED / REVOKED
- De-identified report-quote use: NOT_ASKED / DECLINED / GRANTED / REVOKED

## Task observations

| Task | Observed behavior | User words (paraphrased) | Outcome | Reason |
| --- | --- | --- | --- | --- |
| T1 |  |  |  |  |
| T2 |  |  |  |  |

## Mental model codes

- Magazine:
- Memory:
- Trust:
- Identity:
- Support:
- Web3 friction:

## Counter-evidence

-

## Researcher note

- Separate observation from interpretation.
```

不得將可識別個資、完整錄音、付款資料或 wallet address 提交到公開 repository。若需要保存原始錄音，應放在具權限控管的研究儲存，不在本 repo 建立副本。

## 7. 分析與 decision receipt

### 定量摘要欄位

- `n_assigned`／`n_completed`／`n_retained`
- T1 success rate、median activations
- T2 Magazine recognition rate
- T3 provenance comprehension rate
- article completion rate
- Stamp claim success／abandon reasons
- D7／D28 return and storyline retrieval
- checkout／purchase／refund
- provider failure fallback success

每個比例都要附分母、缺失值規則、variant、segment、時間窗與不確定性；不把小樣本百分比寫成市場真理。

### Decision receipt 最小格式

```json
{
  "researchId": "courtside-web3-user-research-v0.1",
  "asOf": "2026-08-09",
  "status": "NEEDS_HUMAN",
  "participants": {
    "p0": 0,
    "p1": 0,
    "p2": 0,
    "p3": 0
  },
  "evidence": [],
  "decision": "HOLD",
  "reasons": ["No participant data collected yet"],
  "nextAction": "Build P1 vertical slice and run six-person pretest"
}
```

未執行前只能是 `NEEDS_HUMAN`／`HOLD`；不可以預填 PASS、GO 或「商業價值已證明」。

## 8. 故障與降級驗證

| 故障 | 必須仍可用 | 可降級 |
| --- | --- | --- |
| Provenance provider unavailable | Article、TOC、source summary、返回與下一篇 | Provenance 狀態顯示 unavailable |
| Wallet rejected／wrong chain | Article、Passport off-chain path、回到 closure | wallet delivery 顯示 declined |
| RPC／IPFS outage | Origin publication 與人話版版本資訊 | external proof pending／unavailable |
| Analytics blocked | 閱讀、TOC、文章與手動研究記錄 | product event 不上傳 |
| Image／motion failed | alt、caption、poster／資料摘要與正文 | media enhancement |

任何 failure 讓使用者無法閱讀，研究結果應標記為 P1 regression，不得歸因給「使用者不懂 Web3」。

## 9. Research stop gate

以下任一項發生，停止擴大樣本或停止 C 組 public Web3 flow，先修正原型：

- T1／T2 顯示 Magazine identity 明顯崩壞。
- C 組 article completion 比 A 組低超過 5 個百分點。
- T3 出現大量 provenance overclaim。
- P2D／P2E 的身份流程讓沒有 wallet 的讀者無法完成任務。
- 外部服務故障時文章不可讀。
- 研究資料含未經同意的 PII、wallet 或 private behavior。

## 10. 研究交付清單

- [ ] P1 prototype link／commit／環境版本
- [ ] Research script 與 task cards
- [ ] Screening／consent policy
- [ ] Variant assignment record
- [ ] Event dictionary 與 instrumentation proof
- [ ] P0 observation set
- [ ] P1 qualitative codebook
- [ ] P2 analysis table with denominators and uncertainty
- [ ] P3 retention／support／refund summary（若執行）
- [ ] Counter-evidence and limitations
- [ ] Go／Hold／Cancel decision receipt
