# ADR-0005: Motion and generative runtime baseline

**Status**: PROPOSED — accessibility, performance and publisher approval required  
**Date**: 2026-08-06

## Decision

### Approved pattern allowlist

Motion for Vue (motion-v) 只允許五組有產品目的的 pattern：

1. route fade／slide
2. issue-cover shared layout
3. TOC reveal stagger
4. reading-progress interpolation
5. button／gesture feedback

尺寸、位置或內容重排才使用 Motion；單純 hover／focus 優先 CSS。所有 variants、duration、easing、spring 與 reduced-motion 分支集中在 motion system，不散落 magic numbers。

### p5 preset

第一個候選 preset 定為 court-pulse-v1：以球場線條、投籃落點與非個資文章數據生成抽象視覺。允許參數固定為 density、tempo、lineWeight、paletteId 與 server-validated numeric sequence；禁止 source code、shader、callback、remote URL 或 arbitrary JavaScript。

p5.js 2.x 使用 instance mode、fixed seed、client-only dynamic import 與 IntersectionObserver lazy load。document hidden、離開 viewport 時 noLoop()；route unmount 時 remove()；未知 preset／參數失敗時使用 SSR poster、alt text 與 data summary。

### Poster and reduced-motion

- 發布時用同一 seed、preset version 與 bounded parameters 產生 poster，poster 是 canonical fallback。
- prefers-reduced-motion 預設只顯示 poster；若互動有實質資訊，提供明確「啟用互動」按鈕與 keyboard-accessible data summary。
- JavaScript、canvas、dynamic import 或 hydration 失敗時，文章正文、TOC、分享與上一頁／下一頁保持可用。
- 不含 generative-canvas 的 route 不得下載 p5 chunk。

### Performance baseline

以 Pixel 6／Chrome stable 作可重現 baseline，再套用 4x CPU slowdown、1.5 Mbps mobile profile 與 reduced-motion matrix；這是工程測試基線，不是產品支援範圍宣告。T041 必須補上實測設備、LCP／INP／CLS、active canvas、route-switch 20 次與 battery／long-task receipt。

## Kill switches

若任一 P1 route 無法同時通過 SC-002、SC-007、SC-013、SC-014，立即關閉該 Motion pattern／p5 preset feature flag，保留 SSR poster 與正文，不降低 accessibility／performance gate。

## Approval gate

- [ ] 核准五組 Motion pattern。
- [ ] 核准 court-pulse-v1、poster pipeline 與 reduced-motion default。
- [ ] 核准 Pixel 6 throttled profile 作 baseline，或指定其他代表 Android 裝置。
- [ ] 核准未通過 proof 時只交付 poster、不啟動 animation。

## Traceability

Plan: Editorial experience direction、Motion system、p5.js creative runtime、Testing Strategy。  
Spec: US2、FR-046–FR-048、SC-002、SC-007、SC-013–SC-014。  
Tasks: T002、T025、T029、T033、T036–T041、T051、T078–T079。
