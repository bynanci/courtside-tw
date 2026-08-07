# Fan Season Passport

**Status**: Product / architecture alignment draft v0.3  
**As of**: 2026-08-07  
**Bounded context**: `fanpassport`

## Separate semantics

`Edition Provenance` 與 `Fan Season Passport` 不是同一個產品：

| Concept | Answers | Owns |
| --- | --- | --- |
| Edition Provenance | 這個出版版本是否與原始發布 snapshot 一致？ | manifest、revision、digest、checksum、publishedAt、rights scope、CID、attestation status |
| Fan Season Passport | 這個球迷在某個 season 的閱讀／活動／貢獻 credential 是什麼？ | Reader Stamp、Issue Stamp、Event Credential、Archive Contributor、Creator Credential、Season Recap |

Edition Provenance 不宣稱內容真實、著作權一定合法或內容永遠可用。Fan Passport 不宣稱金融價值、投資報酬或 ownership。

## Passport model

```text
Fan
 └─ Season Passport
     ├─ Reader Stamp
     ├─ Issue Stamp
     ├─ Event Credential
     ├─ Archive Contributor
     ├─ Creator Credential
     └─ Season Recap
```

第一階段的 passport 是 off-chain product record。`Reader Stamp` 不是 token gate，也不是閱讀的前置條件。

## Reader Stamp flow

```text
Read article / complete issue
        ↓
Claim condition verified by server
        ↓
OIDC / email identity
        ↓
Off-chain entitlement
        ↓
Idempotent Reader Stamp claim
        ↓
Optional user-initiated credential delivery
```

Server verification 必須以 immutable publication、claim condition、season、identity 與 evidence／rights rules 為基礎。相同 reader、season、issue 與 condition 的重複 claim 只能得到一個有效 entitlement；retry 不得重複發行或重複扣除配額。

## Optional Web3 delivery

只有在 off-chain entitlement 穩定且使用者明確 opt-in 後，才可評估：

```text
Reader Stamp
    ↓ user opt-in
Embedded / external wallet
    ↓
Credential adapter
    ↓
Sponsored transaction (optional)
    ↓
Non-transferable credential / attestation
```

Wallet address 是 identifiable information。WalletIdentityLink 只能是可撤銷的輔助 identity link，wallet 不是身份唯一來源，也不能取代 OIDC／email account lifecycle。必須支援 wallet unlink、account delete、provider failure、wrong chain、signer denial、gas ceiling 與 feature-flag rollback。

P2E 預設：non-transferable、no secondary marketplace、no token speculation、no staking、no yield、no governance token、no investment representation。embedded wallet、sponsored transaction、signer custody 與 chain registry 都需要額外 security／rights／operations gate。

## Lifecycle

Off-chain stamp／entitlement 必須能表示 `CLAIMABLE`、`CLAIMED`、`REVOKED`、`SUPERSEDED` 與 `EXPIRED`，並保存 reason、actor、effectiveAt、source claim 與 audit event。撤銷或 supersede 不可透過刪除歷史來掩蓋曾經發生的 claim。

Account deletion 與 wallet unlink 必須移除或匿名化可識別的 off-chain link；不得承諾可以刪除已由使用者選擇發布到公鏈的 public digest。任何對外 credential presentation 都必須有 revocation／status mechanism，且 rights withdrawal 高於 presentation、CDN、cache、search、offline 與 IPFS mirror。

## Privacy boundary

以下資料不得公開上鏈，也不得為了 credential 而默認公開：

- Email、姓名、精確閱讀歷史、精確觀看時間。
- Location、原始活動 check-in、IP、device ID。
- Draft、private media、rights contract、storage key。

推薦資料流為：

```text
Private behavior
      ↓
Server verification
      ↓
Credential eligibility
      ↓
User claim
      ↓
Minimal credential
```

鏈上或公開 presentation 最多放 minimal opaque identifier、season、credential type、必要的 issuance／revocation reference 與 digest；不得把 private behavior 當作公開內容 bytes。

## Scope boundaries

- **P1**：只交付 Magazine reading／publication；不交付 passport claim、wallet、token 或 credential。
- **P2D**：Reader Stamp、OIDC／email、off-chain entitlement、idempotency、revoke、supersede、unlink、delete。
- **P2E**：optional wallet link、credential adapter、sponsored transaction、chain attestation、revocation registry。
- **P3**：Season Recap、Archive Contributor、歷史照片／票根／口述歷史；每個 asset 仍受 Rights Gate。

任何 Web3、RPC、wallet、IPFS 或 provider 故障，Article 公開閱讀必須回到 P1 baseline。
