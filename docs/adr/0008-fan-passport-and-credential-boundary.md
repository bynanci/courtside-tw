# ADR-0008: Fan Passport and Credential Boundary

**Status**: PROPOSED — alignment draft; product, privacy, rights and security approval required  
**Date**: 2026-08-07  
**Owners**: Product owner + engineering owner + privacy／rights owner  
**Scope**: P2D Fan Passport Off-chain、P2E Optional Web3 Credential、P3 Season Recap

## Context

既有 provenance 方向回答的是「出版 snapshot 的 digest 是否與原始版本一致」，而新的 Fan Season Passport 回答的是「讀者在某個 season 的閱讀、活動與貢獻 credential」。兩者若共用 Passport 名稱或 domain，會混淆出版證據、讀者身份、金融資產與內容真實性。

Reader Stamp 需要 identity、claim condition、idempotency、revocation 與 account lifecycle，但這些不應成為 P1 Article reading 的前置條件。Wallet address 也屬 identifiable information，不能當作身份唯一來源或默認公開資料。

## Decision

### 1. Split provenance from fan passport

- `Edition Provenance` 只屬於 `provenance` module，保存 publication manifest、revision、digest、checksum、publishedAt、rights scope、CID 與 attestation／verification status。
- `Fan Season Passport` 只屬於 `fanpassport` module，保存 Reader Stamp、Issue Stamp、Event Credential、Archive Contributor、Creator Credential 與 Season Recap 的 eligibility／claim／lifecycle。
- Edition Provenance 不宣稱內容是真實的、著作權一定合法或內容永遠可用。
- Fan Passport 不代表 token、金融資產、投資報酬、版權或球員 likeness rights。

### 2. P2D is off-chain first

Reader Stamp flow：

```text
Reading / issue completion → server claim-condition verification
→ OIDC / email identity → off-chain entitlement
→ idempotent claim → Reader Stamp
```

同一 identity、season、issue／condition 的重試必須冪等；每個 entitlement 只有一個有效 claim。Off-chain lifecycle 支援 `CLAIMABLE`、`CLAIMED`、`REVOKED`、`SUPERSEDED`、`EXPIRED`，保存 reason、effectiveAt、actor 與 audit trail。P2D 必須支援 revoke、supersede、wallet unlink 與 account delete／anonymization。

### 3. P2E is optional user-initiated delivery

只有使用者明確 opt-in 且 off-chain eligibility 成立後，才可將 Reader Stamp 送到 embedded／external wallet 或 credential adapter。Sponsored transaction、signer custody、chain attestation、gas ceiling、revocation registry、non-transferable default 與 feature-flag rollback 都是獨立 acceptance gates。

預設禁止 token speculation、secondary marketplace、staking、yield、governance token 與 investment representation。WalletIdentityLink 是可撤銷的輔助 link；OIDC／email 是 P2D identity boundary，wallet 不能取代 account lifecycle 或 editor authorization。

### 4. Apply privacy and rights boundaries

不得公開上鏈或放入 public credential payload：email、姓名、閱讀歷史、精確觀看時間、location、原始 check-in、IP、device ID、draft、private media、rights contract、storage key。Private behavior 只能經 server verification 轉成 minimal eligibility／credential data。

Rights withdrawal 高於 credential presentation、CDN、cache、search、offline 與 IPFS mirror。若已被使用者選擇發布至 permissionless chain，系統只能撤回／supersede off-chain presentation 並明確說明無法保證刪除 public copy；不得因永久性而跳過 rights gate。

### 5. Preserve P1 reading

P1 不包含 claim、wallet、token、NFT、payment、marketplace、staking 或 chain write。Provider、RPC、IPFS、wallet、sponsor、signer 或 credential outage 只能使 Passport／Provenance 降級，Article 必須依既有 anonymous／free／SSR baseline 正常閱讀。

## Alternatives rejected

- 將 Fan Passport 與 Edition Provenance 合併：語意、資料權責、privacy 與撤回風險不同。
- Wallet-only identity：排除沒有 wallet 的讀者，並將 address 與 account lifecycle 混為一談。
- 先上鏈再驗證：不可接受的 privacy、rights、replay、cost 與 permanence risk。
- Token-gated reading：違反 ADR-0004、既有 free MVP 與 P1 reading-first rule。
- 以 NFT／marketplace／staking 作為第一階段 Passport：超出產品目標，且引入投機與監管風險。

## Consequences

正面：讀者可在不理解 Web3 的情況下取得文化 credential；P1 不受外部 provider 影響；provenance 與 passport 各自可審查。代價是需要 identity／privacy／rights／security owner、claim idempotency、revoke／supersede model 與清楚的 public presentation policy。

本 ADR 不授權 API、database migration、wallet SDK、smart contract、sponsored transaction 或 deployment。P2D、P2E、P3 必須各自完成 future task 與 acceptance evidence。

## Acceptance gate for future activation

- [ ] P1 anonymous reading、SEO、SSR、rights gate baseline 已通過且未依賴 Passport。
- [ ] Product owner 核准 claim condition、season semantics、Reader Stamp language 與 no-investment copy。
- [ ] Privacy owner 核准 data inventory、deletion／unlink、minimal public payload 與 chain permanence disclosure。
- [ ] Rights owner 核准 credential／poster／archive asset 的 owner、license、allowed channels、validity、withdrawal policy。
- [ ] Security owner 核准 OIDC、wallet link、signer custody、gas ceiling、replay／phishing／provider failure matrix。
- [ ] P2D off-chain idempotency／revoke／supersede 先通過，再評估 P2E optional delivery。
- [ ] Web3 external write flags 預設 off；任何 production network 或 signer 需另有 approved operational record。

## Traceability

Product: `docs/product/vision.md`、`fan-season-passport.md`、`alignment.md`。  
Spec: US10、US11、US12；FR-065–FR-074；SC-021–SC-023。  
Plan: Product / Architecture Alignment Addendum v0.3。  
Tasks: T097 alignment receipt；T105–T112 future P2D／P2E／P3 tasks。  
Future tests: claim idempotency、revocation／supersede、unlink／delete、privacy payload scan、rights withdrawal presentation、provider outage fallback、non-transferable／no-investment contract tests。
