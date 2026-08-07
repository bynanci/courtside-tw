# Basketball Evidence Policy

**Status**: Product / architecture alignment draft v0.3  
**As of**: 2026-08-07  
**Applies to**: Taiwan Basketball Domain、Taiwan Hoops Archive、editorial claims

## Evidence contract

籃球 domain 不只儲存 `value`。每一個會影響 canonical entity、文章敘事或讀者理解的 claim，都必須能指向 source snapshot 與其取得時間。概念 schema 如下：

```text
EvidenceRef {
  sourceId
  sourceType
  sourceUrl
  retrievedAt
  publishedAt
  effectiveAt
  confidence
  status
  freshness
  snapshotId
  note
}
```

欄位意義：

- `sourceId`：穩定來源主體識別，不把 URL 當作唯一身份。
- `sourceType`：官方協會／聯盟／球隊、比賽資料、可信媒體、訪談、社群或內部分析等。
- `sourceUrl`：可供編輯追溯的來源位置；若來源不可公開，需保存受控 reference 與權利說明。
- `retrievedAt`：系統取得 snapshot 的時間。
- `publishedAt`：來源對外發布時間；未知時為 `UNKNOWN`，不可自行推算。
- `effectiveAt`：claim 生效時間，例如轉隊、傷病或 roster 異動；與 published time 分離。
- `confidence`：針對此 claim 的信心，而非對整個來源的永久評分。
- `status`：claim 的證據等級。
- `freshness`：來源相對於 claim effective period 的新鮮度。
- `snapshotId`：不可變 `SourceSnapshot` 的 stable ID。
- `note`：衝突、範圍與人工審核備註，不得放入秘密或完整私人內容。

## Claim status

Canonical data 與 editorial analysis 必須區分下列狀態：

| Status | Meaning | Publication posture |
| --- | --- | --- |
| `CONFIRMED` | 有足夠可追溯來源，且沒有未處理的同等衝突 | 可作為明確事實，但仍顯示 as-of／來源 |
| `REPORTED` | 可信來源報導，尚未達到 canonical confirmation | 必須標示 reported，不得改寫成 confirmed |
| `ANALYSIS` | 編輯／作者根據資料提出的推論或戰術觀察 | 必須以分析語氣與 input evidence 呈現 |
| `RUMOR` | 未充分驗證的傳聞 | 不得當作事實或用於 credential eligibility |
| `UNKNOWN` | 尚無足夠證據或欄位未確認 | 不補值、不由模型猜測 |

`RUMOR` 不能因不同來源重複轉載而自動升級。AI 或 adapter 也不能自行改變 status。

## Freshness and contradiction

`fresh`、`stale`、`expired`、`disputed` 是 freshness／evidence condition，不是內容真偽的替代欄位：

- `fresh`：在 claim 的有效期間內，來源仍足以支撐目前顯示。
- `stale`：來源可能仍正確，但已超過預期更新窗口，讀者需看到 as-of 或提示。
- `expired`：來源或 claim 已超過有效期間；不得不加說明地呈現為當前狀態。
- `disputed`：來源彼此衝突，或 canonical normalization 尚未完成裁決。

若來源衝突：

1. 每個 `SourceSnapshot` 保留原始內容與 metadata，不刪除較舊來源。
2. 建立多個 `EvidenceRef`，記錄各自時間、狀態與範圍。
3. canonical claim 進入 `DISPUTED`／待審狀態，或維持上一個已確認值並明確標記可能變更。
4. editorial projection 不能 silently overwrite、last-write-wins 或用最新抓取時間假裝已解決。
5. 人工裁決必須留下 `AuditEvent` 與 rationale；若仍未知，顯示 `UNKNOWN` 或 `REPORTED`。

## Source precedence

來源優先序是 context-specific policy，不是無條件真理。通常官方協會／聯盟／球隊的 roster、賽程與公告優先於二手整理；球員本人或經核實訪談可能補充身份與意圖；媒體報導可支援 `REPORTED`；社群內容通常只能作為 lead。不同來源描述的欄位可能不同，不能因一個來源權重較高就丟掉其他 evidence。

合約、傷病、轉隊與國家隊異動需要 `effectiveAt` 與 freshness。戰術與角色分析需要 `ANALYSIS` 標記及其資料／影片 input。資料缺少必要時間或來源時，不能假裝是 current fact。

## Source snapshots and adapters

`SourceSnapshot` 是 ingest 的不可變邊界。FIBA、CTBA、TPBL、PLG、SBL 與海外來源的 adapter 先產生 snapshot，再經 normalize、evidence validation 與人工／規則審核，最後才形成 canonical domain proposal。外部來源不可直接寫入 production entity，adapter 不得繞過 rights、privacy 或 audit policy。

## Rights and privacy controls

Evidence URL 不等於再散布權利。來源、照片、影片、球員 likeness、合約與票根仍受 Rights Gate；只保存必要 metadata 與受控 reference。私人 email、精確行為、IP、device ID、private media、storage key 與未公開 draft 不可進入公開 evidence 或鏈上 payload。

## Future tests

P2B 應驗證：每個 canonical fact 有 snapshot／evidence reference；status transition 不會提升證據等級；freshness 超期會降級；兩個衝突 snapshot 不會被覆寫；adapter retry 具冪等性；public projection 顯示 as-of／disputed 狀態；source rights withdrawal 能影響展示與鏡像 eligibility。
