# ADR-0001: Application topology and deployment boundary

**Status**: ACCEPTED — Mark approval recorded 2026-08-06 via PR #4
**Date**: 2026-08-06  
**Owners**: Engineering owner + project owner  
**Scope**: MVP/P1 web reading, editorial workflow, media processing and optional P2 adapters

## Decision

採用「Nuxt SSR/BFF + Spring Boot modular monolith + PostgreSQL/outbox + S3-compatible storage + CDN」的分層拓撲：

- Nuxt 4.5 是公開閱讀、SEO、Studio UI、OIDC callback 與 BFF session 的邊界；Motion for Vue 與 p5.js 只在 client layer 執行。
- Spring Boot 4.1 / Java 21 以一個 modular monolith 提供 public、reader、editorial、publication、media、identity、audit、outbox 與 provenance modules；domain 不直接依賴 provider SDK。
- API 與 worker 使用相同 domain／contract artifact，但以不同 process profile 啟動；transactional outbox 是跨 process 的可靠交接。
- PostgreSQL 18 保存 workflow、revision、audit、outbox 與 provenance metadata；S3-compatible private bucket 保存原始媒體，公開 variants 由可撤回的 origin／CDN 提供。
- Web、API／worker、database、object storage 與 CDN 是可替換部署單元；本地以 Docker Compose + OIDC stub + S3 emulator 重現，不在 MVP 引入 message broker、microservices 或專用搜尋叢集。

## Contract boundary

provider 選擇只能在 adapter／configuration 層決定：

1. OIDC 使用 issuer、audience、JWKS、claim mapping 的標準 contract。
2. Email 使用抽象寄信 port；local profile 使用 Mailpit／stub，production provider 由 ADR-0002 決定。
3. Hosting 只需提供 SSR runtime、container／worker runtime、managed PostgreSQL、S3-compatible API、TLS、secret store、logs 與 health checks。
4. packages/api-client 由 OpenAPI 產生；Nuxt 與 Spring domain 不得自行拼接隱性 API。

## Consequences

正面：保留清楚資料流、低部署複雜度、可測試的模組邊界與未來 provider 替換能力。代價是 API／worker 共用 artifact 必須維持相容 migration，且外部副作用都要經 outbox／idempotency。

若未來流量、團隊 ownership 或可靠性證據達到拆分門檻，必須新增 ADR，證明拆分後仍保留 contract、audit、rights 與 recovery gate；不得因「看起來更雲原生」直接拆服務。

## Approval gate

- [ ] 核准此拓撲作為 T003–T023 的實作邊界。
- [ ] 核准 provider SDK 不進 domain、external write 不進 request transaction。
- [ ] 若要改為付費／token-gated、microservices 或 message broker，先回到 spec／constitution 審查。

## Traceability

Plan: Technical Context、Structure Decision、Runtime Responsibilities、Delivery and Rollback。  
Spec: FR-031、FR-046–FR-053、SC-002、SC-013–SC-016。  
Tasks unlocked after approval: T003–T023。

## Approval record

- **Approver**: Mark
- **Approved**: 2026-08-06 via [T002 PR #4](https://github.com/bynanci/courtside-tw/pull/4)
- **Decision**: Topology accepted; provider-specific deployment choices remain adapter/configuration-level until selected.
- **Evidence**: `.loop/evidence/t002-human-approval.json`
