# ADR-0006: Origin-first Web3 provenance boundary

**Status**: PROPOSED — product, rights, security and cost approval required  
**Date**: 2026-08-06

## Decision

採 progressive decentralization，T002 預設只核准「manifest-only verification」作為可實作邊界；IPFS、chain attestation 與 SIWE 是三個獨立、預設關閉的後續 flags，不因 ADR 草案而自動啟用。

### Default scope

- PostgreSQL publication snapshot 是 system of record。
- Canonical manifest 使用 versioned schema、I-JSON、RFC 8785 JCS、UTF-8 bytes、SHA-256 與 CIDv1/raw/sha2-256 verification profile。
- Public API 可以顯示 digest、manifest version、rights scope 與 verification status；不顯示 draft、PII、original storage key 或不具長期公開權的 bytes。
- 匿名閱讀不要求 wallet、RPC、IPFS、token、NFT 或鏈上交易。

### Deferred external adapters

| Adapter | Proposed boundary | Default |
| --- | --- | --- |
| IPFS／mirror | DecentralizedMirrorPort；兩個可替換 gateway／pinning routes；round-trip digest verification；不採 provider-default UnixFS／chunking | Off；digest-only |
| Chain | ChainAttestationPort；EVM-compatible testnet／L2 先 shadow write；allowlisted registry method、network、gas ceiling | Off |
| Signer | 隔離 managed signer／KMS；只准 allowlisted network／contract／method；request path 不得取得 signer capability | Off |
| SIWE | EIP-1193 browser boundary + ERC-4361 domain／URI／chain／nonce／time validation；wallet identity 不得成為 editor authorization | Off |

T002 不選 production network、RPC、pinning、contract owner 或 signer custody；選擇任一項都必須附成本、權利、security、exit 與 testnet evidence addendum。External write 的 gas ceiling 在未核准前為 0（禁止寫入）。

### Rights and exit conditions

- 只有權利明確允許長期公開再散布的 manifest／asset 才可鏡像；有限期、可撤回、含個資或 rights 不足時只保留 digest。
- rights withdrawal 優先於 cache、search、offline 與 provenance status；permissionless copy 無法保證刪除，UI 必須明確揭露。
- RPC、gateway、pinning、signer、chain confirmation 或 provider outage 只能讓 provenance 降級為 PENDING／FAILED／UNAVAILABLE，不得隱藏 origin article。
- signer denial、gas breach、unexpected contract、security incident 或 rights-owner objection 立即停用 external-write flags；既有鏈上紀錄以 SUPERSEDED／WITHDRAWN 修正，不偽造 rollback。

## Approval gate

- [ ] 核准 manifest-only 作為 P2 起始 scope。
- [ ] 明確選擇是否後續啟用 IPFS、chain attestation、SIWE；三者分開核准。
- [ ] 若啟用，指定 network、RPC、pinning、contract owner、signer custody、gas ceiling、data retention 與退出方案。
- [ ] 確認 public-chain／IPFS 永久公開風險由 rights owner 接受。

## Traceability

Plan: Optional provenance adapters、Web3 Boundary、Security and Privacy Plan、Delivery and Rollback。  
Spec: US7、FR-049–FR-053、SC-015–SC-016、Open Decisions #5。  
Tasks: T002、T080、T087–T096。
