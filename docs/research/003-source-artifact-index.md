# Research Source Artifact Index

**Status**：整理完成；附件是研究輸入，不是實測證據  
**As of**：2026-08-09

## 1. Artifact inventory

| Repository path | 原始輸入 | 用途 | 證據等級 | 限制 | Size / SHA-256 |
| --- | --- | --- | --- | --- | --- |
| [`assets/taiwan-hoops-archive-product-brief.md`](./assets/taiwan-hoops-archive-product-brief.md) | 上傳的 `README.md` | 產品定位、內容範圍、Evidence before opinion、Web3 boundary 的 source brief | Product hypothesis／design input | 不是市場調查，也不是使用者驗證 | 37,878 B · `87cc9137c8a9465004321b019b7c911ac9252088c2c27490be18eb5c6231ab60` |
| [`assets/courtside-user-immersion-review-2026-08-08.pptx`](./assets/courtside-user-immersion-review-2026-08-08.pptx) | 使用者沉浸模擬簡報 | Journey map、模擬畫面、UX guardrails、T1–T6 驗證計畫 | Design simulation | 分數與任務門檻是建議值，不是已測量結果 | 721,148 B · `5a54d681fcb696fb8f774e5b75f247a1efe75b68fb3acb29ac12a9f9f617c1e3` |
| [`assets/courtside-user-immersion-montage-2026-08-08.png`](./assets/courtside-user-immersion-montage-2026-08-08.png) | UI montage | 研究訪談與 prototype review 的視覺參照 | Visual reference | 截圖不能證明操作成功、效能或留存 | 642,768 B · `eb4929c2564a9096cf6d08ddca8b2a6bd0d8551178a2b04d4c41bed156af8ad8` |

## 2. Source-to-decision mapping

| Source observation | Research implication | Must be verified by |
| --- | --- | --- |
| 使用者來讀台籃，不是來用 Web3 | 任務前不暴露 Web3，先測 Magazine recognition | T1／T2 qualitative + prototype test |
| Web3 應在閱讀完成後出場 | Stamp／Provenance CTA 只放在 closure 後 | task trace + article completion |
| Provenance 只證明版本一致 | 必須測 overclaim 與信任語意 | T3 comprehension + counter-evidence |
| Passport 應像球迷年鑑 | 測故事線找回與 D7／D28 回訪 | T5 + pilot retention |
| Wallet 不是閱讀身份中心 | Email／OIDC-first，wallet optional | T4 + wallet abandon reasons |
| 外部服務故障不能阻塞文章 | 注入故障並驗證 fallback | T6 + failure receipt |

## 3. Relationship with existing project documents

本索引只整理研究素材，不取代既有契約：

- `docs/adr/0006-web3-provenance-boundary.md`：manifest-only、origin-first、external adapter default-off。
- `docs/adr/0008-fan-passport-and-credential-boundary.md`：Fan Passport 與 Edition Provenance 分離；P2D off-chain first；P2E optional。
- `docs/product/fan-season-passport.md`：Reader Stamp、season passport、privacy 與 rights withdrawal。
- `DESIGN.md`：Editorial Paper、Issue／TOC／Article、progressive enhancement、no-JS、accessibility 與 performance gates。
- `specs/001-taiwan-basketball-magazine-ebook/`：User Story、FR／SC、tasks-first 與 future test traceability。

## 4. Evidence ledger rule

任何引用附件的報告必須標記其來源類型：

```text
DESIGN_INPUT
SIMULATED_EXPERIENCE
IMPLEMENTATION_EVIDENCE
PARTICIPANT_OBSERVATION
BEHAVIORAL_EVENT
PAYMENT_EVIDENCE
```

目前本資料夾新增的附件最多只能標記為 `DESIGN_INPUT` 或 `SIMULATED_EXPERIENCE`。在實際招募與執行前，不得將它們升級為 `PARTICIPANT_OBSERVATION`、`BEHAVIORAL_EVENT` 或 `PAYMENT_EVIDENCE`。

## 5. Reproducibility metadata

原始檔案納入 repository 後，應在 PR description 與 merge read-back 記錄：

- repository commit／tree SHA
- 檔案路徑與大小
- SHA-256
- 來源檔名與取得日期
- 是否為原始檔、轉檔檔或整理後摘要

這些 metadata 用於確認研究輸入沒有被靜默替換；它們不代表內容已被外部權威驗證。
