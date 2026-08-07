# ADR-0007: Basketball Domain and Evidence Graph

**Status**: PROPOSED — alignment draft; runtime implementation not authorized  
**Date**: 2026-08-07  
**Owners**: Product owner + engineering owner + Taiwan basketball domain owner  
**Scope**: P2A Taiwan Basketball Domain、P2B Evidence Layer、P2C Data Adapters

## Context

Courtside TW 的 `TaxonomyTerm` 可以支援文章分類與搜尋 facet，但它不能可靠地表達聯盟改名、球隊解散、跨聯盟、球員同名、旅外時間線或國家隊 roster。若直接把姓名、目前球隊或最新抓取值當作 canonical identity，歷史內容會被靜默改寫，來源衝突也無從審核。

產品需要一個台灣籃球 domain，涵蓋中華隊、旅外球員、TPBL、P. LEAGUE+／PLG、SBL 與未來可擴充的聯賽；同時需要 immutable source snapshots、evidence status、freshness 與 contradiction handling。這個需求與既有 modular monolith 相容，不足以證明要拆 microservices。

## Decision

### 1. Separate taxonomy from basketball facts

`taxonomy` 只負責內容分類、導覽與 search facet。`basketball` bounded context 負責 canonical facts、關係與時間線；content 可以 reference basketball IDs，但不能把 taxonomy label 當作 source of truth。

### 2. Use stable identity and temporal relationships

Canonical entities 至少包含：

- `League`、`LeagueAlias`、`Season`。
- `Team`、`TeamAlias`、`TeamSeason`。
- `Player`、`PlayerAlias`、`PlayerTeamStint`。
- `NationalTeamCampaign`、`NationalTeamRoster`、`RosterEntry`。
- `Competition`、`Tournament`、`Game`。
- `Source`、`SourceSnapshot`、`EvidenceRef`。

Player primary identity 不使用姓名。球隊／聯盟名稱、縮寫與語系 label 使用 alias 與 valid period；team join、exit、rename、dissolution、cross-league 與 season label 以 append-only relationship 表示。

球員完整生涯由 `PlayerTeamStint` 表示，至少有 team、league、season、startDate、endDate、status 與 evidence。不得用單一 `player.teamId` 代表完整 career。

國家隊以 `NationalTeamCampaign` + `NationalTeamRoster` + `RosterEntry` 表示男籃、女籃、青年、3x3、FIBA／亞洲盃／資格賽／國際賽窗口，並保留徵召、傷病、退出、替補與角色的有效時間。

### 3. Make evidence first-class

Canonical claim 不只保存 value，必須可回到 immutable `SourceSnapshot` 與 `EvidenceRef`。`EvidenceRef` 包含 sourceId、sourceType、sourceUrl、retrievedAt、publishedAt、effectiveAt、confidence、status、freshness 與 snapshot reference。

Claim status 至少為 `CONFIRMED`、`REPORTED`、`ANALYSIS`、`RUMOR`、`UNKNOWN`；freshness／condition 至少為 `fresh`、`stale`、`expired`、`disputed`。來源衝突時保留所有 snapshots 與 refs，canonical projection 標記 disputed／待審，禁止 silent overwrite 或 last-write-wins。

### 4. Put adapters behind ports inside the monolith

未來 `FibaAdapter`、`CtbaAdapter`、`TpblAdapter`、`PlgAdapter`、`SblAdapter` 與 overseas league adapters 位於 `apps/api/basketball/{domain,application,ports,adapters}`。資料流為：

```text
External Source → Adapter → SourceSnapshot → Normalize
→ Evidence validation → Canonical Basketball Domain
```

External source 不得直接 overwrite production entity；adapter 不得把 provider SDK 滲入 domain。資料庫、outbox、audit 與 rights gate 仍是既有 modular monolith 的 boundary。

### 5. Preserve deployment topology

維持 Nuxt SSR/BFF → Spring Boot modular monolith → PostgreSQL → Transactional Outbox／Worker，以及 S3-compatible storage／CDN。`basketball`、`evidence` 與 adapter 是 logical modules，不是 deployment services。拆 service 必須有新的 ADR 與可量化 scaling、ownership、reliability evidence。

## Alternatives rejected

- 以 `TaxonomyTerm` 取代 domain：無法表達事實關係、時間線與 evidence。
- 以姓名或 `player.teamId` 作 primary career model：同名與跨隊歷史會被混淆或覆寫。
- 外部來源直接更新 canonical tables：無法回溯、處理衝突或重現 ingest。
- `last-write-wins`：會把 stale／錯誤資料誤標成 current。
- 為每個聯賽建立 microservice：目前沒有 scaling evidence，且違反 ADR-0001 的簡化 topology。

## Consequences

正面：歷史名稱與旅外時間線可讀、來源可追溯、衝突可顯示，未來 adapter 可以替換而不污染 domain。代價是需要 domain owner、identity resolution、source freshness policy 與較多 contract／fixture tests；P2A～P2C 不能以單一大 ticket 交付。

本 ADR 不授權資料庫 migration、API、抓取器或 runtime implementation。先完成 spec／contract、source owner、rights／privacy review 與測試策略，再由獨立 task 開始實作。

## Acceptance gate for future activation

- [ ] Product owner 核准正式 coverage、名稱與 archive editorial policy。
- [ ] Domain owner 核准 stable identity、alias、valid period、stint／roster semantics。
- [ ] Evidence owner 核准 source precedence、freshness window、status transition 與 contradiction workflow。
- [ ] Contract tests proof external source cannot direct overwrite canonical entity。
- [ ] Architecture tests proof taxonomy／basketball／evidence module boundaries。
- [ ] Rights／privacy review proof source URLs、photos、likeness、contract／injury data 的使用邊界。
- [ ] 若要改 topology，先提出新的 scaling evidence ADR；本 ADR 不自動拆 service。

## Traceability

Product: `docs/product/vision.md`、`taiwan-basketball-content-map.md`、`basketball-domain.md`、`evidence-policy.md`。  
Spec: US8、US9；FR-054–FR-064；SC-017–SC-020。  
Plan: Product / Architecture Alignment Addendum v0.3。  
Tasks: T097 alignment receipt；T098–T104 future P2A／P2B／P2C tasks。  
Future tests: identity／alias fixtures、timeline invariants、snapshot immutability、freshness downgrade、conflict preservation、adapter no-overwrite and module-boundary tests。
