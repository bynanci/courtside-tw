# ADR-0003: Content document, media and rights policy

**Status**: PROPOSED — publisher and rights-owner approval required  
**Date**: 2026-08-06

## Decision

首期採版本化 ContentDocument v1；最多 11 種 block，固定第 11 種為受限 generative-canvas：

1. paragraph
2. heading
3. list
4. quote
5. divider
6. image
7. gallery
8. stat
9. video
10. related-reading
11. generative-canvas

每種 block 必須同時有 JSON Schema、Nuxt renderer、editor extension、valid／invalid fixtures 與 migration evidence。Canonical source 是結構化 JSON，不接受任意 HTML、v-html、內容自帶 script 或遠端 module。

## Media defaults

- 原始圖片上限 20 MiB；伺服器驗證 magic bytes、MIME、checksum、尺寸與 EXIF，並產生 AVIF/WebP/JPEG variants。
- 原始媒體永遠在 private bucket；公開文章只引用 rights-valid 的衍生 variant。
- video block 只保存已核准 provider 的 canonical embed reference；T002 不預先承諾任何 provider，初始 allowlist 由 publisher／rights owner 提供，未核准時降級為外部連結或摘要。
- iframe／embed 使用 protocol、host、path allowlist；無法驗證時拒絕或安全降級。
- 首期 fixture 建議為一期、三個 sections、兩篇文章，覆蓋所有 11 種 block；這是測試樣本，不代表真實內容已授權。

## Rights and ownership

- 每個 public media asset 必須有 rights owner、授權依據、channel、territory、開始／結束時間、credit 與撤回條件。
- 至少一位 PUBLISHER content owner 負責首期內容與媒體權利；沒有指定 owner 前不允許 production publish。
- rights 缺件、過期、矛盾或撤回 impact 未處理時，送審與發布皆阻擋。
- 含個資、有限期、可撤回或無法證明長期再散布權的 bytes 不得送往 permissionless network；最多保存 off-chain digest。

## Approval gate

- [ ] 確認首期實際內容 owner 與合法品牌／字體／攝影素材來源。
- [ ] 確認首期圖片上限 20 MiB、影片 embed policy 與初始 provider allowlist。
- [ ] 確認 11 block 上限；超出時刪除版型或另立 ADR，不擴大 editor。
- [ ] 確認 rights withdrawal 高於 cache、search、offline 與 provenance availability。

## Traceability

Plan: Content Document Contract、Media and Rights、Publication Lifecycle、Decisions Required #3–#4。  
Spec: FR-009、FR-021–FR-025、FR-046–FR-050、SC-005、SC-014–SC-015。  
Tasks: T002、T009–T010、T019–T020、T036–T038、T048–T049、T087–T096。
