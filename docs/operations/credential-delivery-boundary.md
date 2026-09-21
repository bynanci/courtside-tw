# Optional credential delivery operational boundary

Implementation status: development candidate; external delivery disabled.

The shipped `DisabledCredentialAdapter` has no RPC client, signer, sponsor or network transport. Its caller sends only an opaque stamp ID, season and `READER_STAMP` type. Email, wallet address, issue ID, content bytes, reading progress, viewing timestamps and rights contracts are absent from that payload. The authenticated off-chain passport response is private and never cacheable.

| Control | Shipped default | Activation requirement |
| --- | --- | --- |
| External writes | false | Separate approved operational record and reviewed adapter |
| Gas ceiling | 0 | Chain-specific cap, simulation, timeout and budget owner |
| Sponsored transaction | false | Sponsor budget and refusal/failure handling |
| Signer custody | NONE | Named owner, isolation and revocation runbook |
| Transferability | false | Remains non-transferable; no marketplace or financial representation |
| Revocation registry | Off-chain stamp lifecycle | Adapter must recheck off-chain status before presentation/write |
| Consent | Explicit authenticated request | Reconfirm network and permanence disclosure |

Provider, signer, wrong-chain or RPC failure must leave the stamp off-chain and must never change OIDC authority or anonymous article rendering. Unlink deletes the off-chain address association and outstanding challenges. Account deletion removes passport-to-reader, issue and snapshot links while retaining an unidentifiable append-only status history. A public-chain copy, if separately enabled and explicitly selected in future, cannot be guaranteed deletable; revocation and rights withdrawal still suppress presentation.

Local EOA signatures are recovered using pinned `org.web3j:crypto:6.0.0`; this operation has no RPC or chain write. ERC-1271 smart-contract wallets are not supported by the shipped EOA verifier and require a separately reviewed adapter.

Wallet-link rollback is enforced server-side: `COURTSIDE_WEB3_WALLET_ENABLED` defaults to false and `COURTSIDE_SIWE_CHAIN_ID` has no implicit chain. Both challenge and verify reject before resolving persistence unless wallet linking is enabled and a nonempty `eip155:<chain>` binding is configured. Private listing and explicit unlink continue to work after disabling. UI `web3WalletEnabled` cannot enable the server capability.
