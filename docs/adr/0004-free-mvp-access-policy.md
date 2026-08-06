# ADR-0004: Free MVP access policy

**Status**: ACCEPTED — Mark approval recorded 2026-08-06 via PR #4
**Date**: 2026-08-06

## Decision

首三期與 P1 MVP 維持完全免費、匿名可讀、無付費牆、無 token／NFT／持有量 gate。帳號只服務收藏、續讀與後台權限，不是閱讀 entitlement。

- Public issue/article routes、SEO、分享、SSR、no-JS 與 reduced-motion fallback 不要求登入。
- OIDC reader session 是 optional enhancement；wallet／SIWE 絕不能變成 editorial role、閱讀資格或付款替代品。
- Analytics、cookie、wallet、provenance 與 external provider 失效都不得降低匿名閱讀。
- 不在 T003–T086 內實作付款、訂閱、退款、稅務、客服、entitlement、token gating 或 DRM。

## Change trigger

若產品 owner 要把免費 MVP 改為付費、會員、單期購買或 token gate，必須先：

1. 修改 spec 的 access policy 與 user scenarios。
2. 新增 entitlement、payment、refund、tax、support、privacy、fraud 與 account recovery contracts。
3. 更新 threat model、rights policy、offline／cache semantics、success criteria 與 task dependencies。
4. 由 product owner、legal／rights owner 與 engineering owner 核准後，重新建立 implementation tasks。

不得只在前端隱藏文章、增加 checkout route 或依 wallet address 判斷資格。

## Acceptance

- Anonymous public-read E2E 在沒有 session、wallet、RPC、IPFS、analytics consent 時通過。
- Feature flags web3.provenance=false、web3.wallet=false 不改變 P1 行為。
- 任一付費／token-gated需求在未完成上述 spec／ADR 更新前，視為 blocked，不得開始實作。

## Approval gate

- [ ] Mark 核准首三期免費與 anonymous-first。
- [ ] 確認此政策適用於 public article、issue、SEO、offline 與 provenance UI。
- [ ] 確認未來商業模式變更必須走 spec-first change control。

## Traceability

Plan: MVP scope、Constitution Check、Implementation Strategy、Delivery and Rollback。  
Spec: US1–US2、FR-001–FR-010、FR-052、SC-003、SC-013、Open Decisions #1。  
Tasks: T002、T009–T041、T071–T076、T087–T096。

## Approval record

- **Approver**: Mark
- **Approved**: 2026-08-06 via [T002 PR #4](https://github.com/bynanci/courtside-tw/pull/4)
- **Decision**: Free anonymous MVP policy accepted; any paid, membership or token-gated change requires the documented spec/ADR re-approval.
- **Evidence**: `.loop/evidence/t002-human-approval.json`
