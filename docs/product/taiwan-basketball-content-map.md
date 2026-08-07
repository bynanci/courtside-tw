# Taiwan Basketball Content Map

**Status**: Product scope alignment v0.3  
**As of**: 2026-08-07  
**Editorial rule**: `Taiwan-first`, `league-neutral`, `evidence before opinion`

## Coverage map

### Chinese Taipei / 中華隊

正式內容域包含：

- 男籃、女籃、青年代表隊、5-on-5 與 3x3。
- FIBA 國際賽、亞洲盃、世界盃資格賽、奧運資格賽與國際賽窗口。
- 國家隊 campaign、培訓／正式名單、徵召、傷病、異動與 roster status。
- 球員在國內聯賽、旅外聯賽與國家隊之間的角色、負荷與戰術連結。
- 對手偵察、戰術、輪替、攻防角色與比賽脈絡。
- 歷屆名單、經典比賽、教練／球員／隊職員與球迷口述歷史。

國家隊不是單一 `teamId`。一次國際賽週期應由 `NationalTeamCampaign`、`Competition`、`Tournament`、`NationalTeamRoster` 與 `RosterEntry` 表示。

### Taiwan Abroad / 旅外球員

資料範圍涵蓋：

- 日本、美國、中國、澳洲、歐洲與亞洲其他聯賽。
- NCAA / College、G League 與其他發展／職業體系。
- 試訓、訓練營、短期合約、登錄、傷病、轉隊、返台與結束 stint。

每個旅外經歷至少回答：

| Dimension | Required meaning |
| --- | --- |
| Team / League / Season | 當時所屬組織與賽季，不以目前名稱回填歷史 |
| Contract / identity status | `CONFIRMED`、`REPORTED`、`TRIAL`、`ENDED` 或 `UNKNOWN`，不是法律合約判定 |
| Role / minutes | 上場角色、輪替位置、上場時間與可驗證統計 |
| Tactical position | 教練使用方式、攻防定位與分析備註；分析不得冒充官方事實 |
| Transfer / timeline | 轉隊、生效日、結束日、來源與衝突狀態 |
| National team relation | 徵召、名單、窗口、傷病與國家隊角色關聯 |

旅外名單與聯賽名稱不放在前端程式常數；資料層必須保存 `asOf`、source snapshot、有效期間與顯示 alias。

### Taiwan leagues / 台灣聯賽

#### TPBL

涵蓋賽季、球隊、球員、外援、選秀、自由球員、轉隊、傷病、戰術、主場文化、應援、轉播、票房、制度與聯盟治理。聯盟或球隊改名不應改寫歷史文章的原始語境。

#### P. LEAGUE+ / PLG

涵蓋屬地主義、球隊品牌、賽制、選秀、球員市場、主場體驗、球星角色、經典系列賽與跨國合作。`P. LEAGUE+`、`PLG` 與歷史顯示名稱應是 alias／label，不是硬編碼 UI branch。

#### SBL

涵蓋企業隊、球員培育、教練與裁判養成、職涯延續、地方場館、經典賽季，以及 SBL、UBA、HBL、國家隊與職業聯盟的人才供應鏈。

### Future compatible coverage

WSBL、UBA、HBL、基層、企業聯賽、街頭／社區籃球可由同一 domain 擴充；本輪只正式承諾中華隊、旅外、TPBL、PLG、SBL，避免把未驗證資料假裝已支援。

## Editorial content types

| Content type | Example questions | Required evidence posture |
| --- | --- | --- |
| News / roster | 誰被徵召、誰轉隊、何時生效？ | Official / reported source + effectiveAt |
| Player profile | 球員經歷與跨聯盟時間線？ | Stable player ID + stints + aliases |
| Tactical analysis | 球隊如何使用球員？ | Mark as `ANALYSIS`; cite game/video/stat inputs |
| Culture / oral history | 主場、球迷、球衣、場館的記憶？ | Rights and contributor consent |
| Archive | 歷史名稱、照片、票根、賽季脈絡？ | Source snapshot + rights validity |
| Passport activity | 閱讀、活動、貢獻是否達成 claim？ | Private verification; minimal public credential |

## Naming and historical rules

- Canonical identity uses stable IDs; display names are localized labels with valid periods.
- `TeamAlias`、`PlayerAlias` 與 `LeagueAlias` 保存歷史名稱、語系、來源與有效期間。
- `TeamSeason` records membership／participation for a specific season; a team can join, leave, dissolve, rename or cross leagues without deleting its identity.
- A league may change name, pause, merge, split or run different season labels; historical `Season` remains immutable.
- A player may have overlapping evidence reports but canonical stints require explicit status and contradiction handling.
- Taxonomy is for navigation and editorial classification only. It cannot be used as the source of truth for team membership, player career or national-team roster facts.

## Editorial safety

- `RUMOR` never becomes `CONFIRMED` through repetition or model output.
- Injury, contract and roster changes require source freshness and effective date; stale facts are not silently presented as current.
- Sponsorship, passport ownership or wallet linkage cannot change editorial ranking or conclusion.
- Images, logos, uniforms, likenesses, video and ticket scans remain behind Rights Gate.
