# Fan Season Passport

**Status**: Product / architecture alignment draft v0.3  
**As of**: 2026-08-07  
**Bounded context**: `fanpassport`

## Separate semantics

`Edition Provenance` 與 `Fan Season Passport` 不是同一個產品：

| Concept             | Answers                                                      | Owns                                                                                               |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Edition Provenance  | 這個出版版本是否與原始發布 snapshot 一致？                   | manifest、revision、digest、checksum、publishedAt、rights scope、CID、attestation status           |
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

## Development implementation: ISSUE_PROGRESS_ACK_V1

The initial machine-verifiable condition is named `ISSUE_PROGRESS_ACK_V1`. It records acknowledged completion, not proof that a person read or understood an article. The server loads the latest immutable published issue snapshot, requires explicit article and revision IDs in every frozen entry, checks each current published revision against that snapshot, and requires the authenticated reader's stored progress acknowledgement to equal 100 for every entry. Clients cannot submit an eligibility boolean or a snapshot/digest to trust. Missing, empty, legacy unbound or withdrawn publication data is ineligible. The season is the UTC year of the issue publication date; stamps expire at the start of the second following year.

Claims are private OIDC reader operations. A unique reader/issue/season/condition entitlement plus a database reader-row lock serializes concurrent retries; request keys are hashed and bound to the claim parameters. Replays return the existing stamp's current status, including a revoked/expired state. They never revive a terminal entitlement. Publisher status changes require the current quoted version via `If-Match`; superseding requires a newly published immutable snapshot and fresh condition verification, while expiry cannot occur before the stored deadline. Status changes append only sanitized reason enums, actor role and timestamps. No raw OIDC subject, email, wallet, article history or free-form reason enters that audit stream.

Wallet challenge/verify now require recent OIDC reader authentication. This closes the earlier planned anonymous SIWE contract because wallet identity is an auxiliary account link. The BFF forwards the existing OIDC bearer token after CSRF validation and never creates a separate wallet session. Exact-message digest, reader, domain, URI, chain, issued time and five-minute nonce TTL are bound at challenge creation. Only nonce and message digests are persisted; successful challenge retry responses are temporarily cached in memory. A replay after a process restart or consumption returns 409 and the user starts a new challenge. Local EIP-191 EOA signature recovery verifies the signed message; no external provider, signer or RPC participates in backend verification.

Private routes: `GET /api/v1/me/passport`, `POST /api/v1/me/passport/claims`, `POST /api/v1/me/passport/{stampId}/credential`, and publisher-only `POST /api/v1/publisher/passport/{stampId}/status`. Optional delivery returns `DISABLED` with gas ceiling zero and a permanence disclosure. No production activation or external write is implied by these development endpoints. Java 21/Spring/PostgreSQL CI and owner acceptance remain separate evidence gates.

## Reader interface and completion acknowledgement

Signed-in readers use `/settings/privacy` to view live stamp status, choose a public issue and explicitly consent to a claim. The catalog's publication UTC year supplies the request season; candidates are never labelled claimable before the server verifies eligibility. Retry reuses an in-memory idempotency key for the same issue and season; reloading still cannot duplicate the database entitlement. Wallet linking is optional and not required for the panel. Session expiry clears the displayed private stamps and offers normal account sign-in.

Each authenticated article footer has an explicit completion acknowledgement. Scrolling alone does not acknowledge completion. The write uses the current published revision and its actual final block after prior progress writes finish. An accepted 100% acknowledgement remains 100% for that same revision when the reader revisits; the resume block and timestamp still update. A new published revision starts from its own supplied progress and cannot inherit completion. This is an acknowledged action, not proof of reading comprehension. Anonymous reading and local resume behavior remain available.
