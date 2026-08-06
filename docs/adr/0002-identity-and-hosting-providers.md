# ADR-0002: Identity, email and hosting provider boundary

**Status**: ACCEPTED — Mark approval recorded 2026-08-06 via PR #4
**Date**: 2026-08-06  
**Decision type**: Architecture, cost, privacy and operations

## Decision packet

先核准 provider-neutral contract，再選 production vendor；任何候選 provider 都不得滲入 domain。

| Capability | Recommended MVP candidate | Alternative | Non-negotiable contract |
| --- | --- | --- | --- |
| OIDC | Managed OIDC provider with issuer/audience/roles/JWKS and local stub parity | Self-hosted Keycloak | Authorization Code + PKCE, BFF HttpOnly session, issuer/audience validation, role mapping, logout and deletion support |
| Email | Transactional email API with verified domain and webhook/event receipt | SMTP relay | Abstract EmailPort, template IDs, retry/dead-letter, bounce/complaint handling, no password storage |
| Web hosting | Nuxt SSR-capable managed runtime/CDN | Container behind reverse proxy | SSR output, TLS, cache headers, preview isolation, logs, rollback and no browser secrets |
| API/worker | Managed container runtime with separate API and worker profiles | VM/container platform | Java 21, health checks, secret injection, autoscaling limits, graceful shutdown and log/trace export |
| Data/media | Managed PostgreSQL 18 + S3-compatible private object storage | Self-managed equivalents | PITR/backup, restore test, signed upload, private originals, checksum and lifecycle policies |

## Proposed default

若沒有既有企業帳號、法務或成本限制，採 managed OIDC + transactional email API + Nuxt managed runtime + managed Java container + managed PostgreSQL/S3-compatible storage。這只是 T002 的建議 default，不代表已購買或已授權任何 vendor。

Local／CI 必須完全使用 OIDC stub、Mailpit／email stub、PostgreSQL Testcontainers 與 S3 emulator；不能因 production vendor 尚未選定而阻塞 contract、schema 或安全測試。

## Security and exit conditions

- OIDC provider 必須支援 key rotation、issuer/audience restriction、role claims、session revocation 與 data export/deletion。
- Email provider 必須支援 verified sending domain、bounce／complaint suppression、rate limit、idempotency 與資料保留政策。
- Hosting provider 必須能在 60 秒內完成 public purge／origin pointer 更新的驗證；做不到時降低 CDN TTL 或停用 article cache。
- Provider outage 只能阻塞登入、寄信、preview 或背景工作；匿名公開閱讀與已發布 origin 不得被阻斷。
- 退出時先停新寫入、保留 contract-compatible export、驗證 restore，再切換 adapter；不得把 provider ID 寫成 domain primary key。

## Approval gate and questions

- [ ] Mark 是否有偏好的 OIDC、email、web hosting、API hosting、database 或 object storage provider？
- [ ] 是否接受上述 managed-provider default 與月度成本／資料區域審查？
- [ ] 是否需要台灣／特定區域資料駐留、企業 SSO、DPA 或自管部署？

在這三項未核准前，保持 provider-neutral implementation、所有 production external write 關閉，不開始 vendor-specific SDK integration。

## Traceability

Plan: Decisions Required Before Implementation #2、Runtime Responsibilities、Security and Privacy Plan、Delivery and Rollback。  
Spec: FR-031–FR-032、SC-008、SC-010、Open Decisions #2–#3。  
Tasks: T002、T003、T007、T008、T013、T015–T021。

## Approval record

- **Approver**: Mark
- **Approved**: 2026-08-06 via [T002 PR #4](https://github.com/bynanci/courtside-tw/pull/4)
- **Decision**: Provider-neutral identity, email and hosting contracts accepted; production vendor selection remains a follow-up.
- **Evidence**: `.loop/evidence/t002-human-approval.json`
