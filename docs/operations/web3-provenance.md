# Edition Provenance operations

Edition Provenance verifies that a versioned publication manifest matches its digest. It does not establish factual truth, legal ownership, or permanent availability. PostgreSQL publication snapshots remain authoritative. Anonymous issue/article reads do not call a wallet, RPC, gateway, signer, or provenance service.

## Current implementation

- Manifest v1 is a closed, string-only RFC 8785 JCS profile. IDs and revisions are strings; revision `9007199254740993` is a shared precision fixture. Objects sort keys in UTF-16 order; arrays retain their declared order; the UTF-8 SHA-256 digest and `CIDv1/raw/sha2-256` are deterministic across Java and TypeScript. Unknown fields, duplicate assets, private content, numeric revisions, and unsupported rights scope fail validation.
- `V022__publication_provenance.sql` follows existing migrations. T090's original `V007` filename is obsolete; V007 already implements media upload. Wallet identity and SIWE persistence are owned by `fanpassport/identity`, as required by ADR-0008.
- A snapshot insertion queues one durable `provenance.snapshot` outbox event in its publication transaction. Existing snapshots receive an idempotent backfill event. The worker appends immutable manifests and status history; duplicate delivery cannot create a second manifest version.
- Public cover variant checksums are frozen when new snapshot impact links are inserted. Historical snapshots have no retroactively asserted asset-byte proof. A legacy snapshot with media impact links but no frozen asset proof stays `PENDING`, including in the public endpoint, until a reviewed publication supplies new immutable evidence; it cannot silently become a complete verified manifest. Schema v1 asset digests refer to the public `cover` variant, never the private original.
- Existing rights records have finite validity, so the application generates `DIGEST_ONLY` manifests by default. An exact publication ID/checksum entry in `publication_provenance_mirror_approval` is required for `PERMANENT_PUBLIC`; the application role can only read that approval table. Removing that approval never rewrites an issued manifest and immediately blocks its presentation and further delivery. `PUBLIC_WEB` permission does not establish permanent redistribution rights. No production IPFS, RPC, chain, signer, or contract is selected or activated.
- The opt-in public verification panel independently downloads the manifest and recomputes its hash in the browser. `VERIFIED` without local proof is not displayed as a locally verified result. Public responses are `no-store`; current withdrawal/expiry overrides the stored status and suppresses the manifest.

## Default configuration and rollback

| Control | Default | Effect |
| --- | --- | --- |
| `courtside.web3.provenance` | `false` | Public provenance endpoint hidden |
| `NUXT_PUBLIC_WEB3_PROVENANCE_ENABLED` | `false` | No panel, no provenance request on reading routes |
| `NUXT_PUBLIC_WEB3_WALLET_ENABLED` | `false` | No wallet feature on privacy settings |
| `courtside.web3.ipfs-enabled` | `false` | Digest only; no byte upload |
| `courtside.web3.chain-enabled` / `courtside.web3.gas-ceiling` | `false` / `0` | No signing or chain write |

Enable manifest-only display by configuring both the server property and Nuxt public flag; deploy the database migration and worker first. Roll back display with those two flags. Never roll back the schema destructively. Outbox processing remains internal and can finish or retry while presentation is hidden.

The concrete `KuboHttpMirrorAdapter` uses Kubo `block/put` multipart uploads with `cid-codec=raw`, `mhtype=sha2-256`, `mhlen=32` and pinning, then separately reads a gateway raw block. Gateway reads never receive upload credentials. Two distinct routes, explicit permanent rights and the live write flag are checked before every upload; a failed configured mirror remains `PENDING` for the durable outbox retry policy. Corrupt or unavailable gateways yield `UNAVAILABLE` and retain digest-only origin information. The concrete `ManagedSignerHttpAdapter` calls an isolated signing broker over HTTP using a durable idempotency key and a minimal calldata command. It independently checks EVM JSON-RPC network, transaction hash, destination, exact ABI calldata, zero value, transaction gas and gas used, receipt success, canonical block hash, confirmations and registry `digestOf` at the receipt block before accepting a receipt. The live write/rights guard is rechecked after the RPC preflight and immediately before the signing POST. An unconfigured boundary cannot sign. Implementing these injectable boundaries is not evidence of a live provider trial or production operational approval.

## Withdrawal and incidents

1. Withdraw at the origin. Publication/rights triggers mark affected persisted receipts `WITHDRAWN`; every read also rechecks live rights, including time expiry.
2. Disable optional display/write capabilities if a signer denies policy, gas exceeds approval, a destination changes, or a rights owner objects.
3. Preserve append-only receipt/status history. A replacement snapshot supersedes prior versions; a withdrawn receipt cannot return to verified.
4. Existing public-chain/IPFS third-party copies cannot be guaranteed deleted. Correct status and presentation rather than claiming a rollback of public history.
5. Inspect the existing outbox retry/dead-letter state for `provenance.snapshot`; repair an invalid source under the ordinary publication workflow. Do not rewrite a canonical manifest to make a checksum pass.

## Verification and remaining operational evidence

Run adapter manifest tests, shared Java fixture parity, `PublicationProvenanceIT`, `PublicationProvenanceReliabilityIT`, wallet unit/browser scenarios, and anonymous reading regressions. `artifacts/provenance/development-evidence.json` distinguishes executed local checks from checks still requiring Java 21, PostgreSQL/Testcontainers and CI. No live provider, network, signer or permanent-rights acceptance is claimed by synthetic port tests.

## Transport configuration contract (inactive until separately configured)

Mirror configuration requires `ipfs-first-rpc`, `ipfs-first-gateway`, `ipfs-second-rpc`, and `ipfs-second-gateway` under `courtside.web3`. Kubo RPC roots end in `/api/v0/`; gateway roots are separate. Chain configuration requires `signer-endpoint`, `chain-rpc`, `network` (`eip155:<id>`), `contract`, positive `gas-ceiling` and `confirmations`. The implementation creates these capabilities only in the worker profile. All origins must use HTTPS and match the configured host allowlist; redirects are refused, requests time out after 10 seconds and response bodies are bounded to 160 KB. The loopback HTTP seam exists only for explicit local test construction, never the runtime configuration.

The managed broker receives `{network,to,method,data,gasCeiling,value,idempotencyKey}` and an `Idempotency-Key` header, returning `{transactionId}`. It must durably retain the key and request fingerprint across restarts, replay the original result for an identical command and reject key reuse with different bytes. Signing keys remain inside the broker/KMS. This repository contains real HTTP transport and local HTTP contract tests, not a deployed signer or an operational provider approval.

Protocol references checked 2026-09-12: [Kubo block RPC](https://docs.ipfs.tech/reference/kubo/rpc/#api-v0-block-put), [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/). Local transport tests use synthetic localhost servers; no external chain/IPFS/signing writes were made.
