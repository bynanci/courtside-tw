# Arena Editorial motion system

## Status and authority

- Status: implementation contract for the P1 public reading journey
- Scope: Home, issue archive/detail, and article reader
- Parent decisions: `DESIGN.md` and accepted ADR-0005
- Boundary: this document narrows implementation choices; it does not add a sixth motion pattern, expand p5 usage, or replace accessibility and performance release gates

ADR-0005 的五項 allowlist 是上限，不是每頁都必須使用的效果清單。沒有清楚導航、層級、進度或因果目的時，預設保持靜止。

## Product intent

Motion 的單一命題是：**讓一次閱讀旅程像一個完整回合，從封面交棒到期刊，再安靜落入文章；動態只確認方向，不裝飾閱讀。**

設計語言取自球場，不模仿轉播、投注或 Web3 儀表板：場線負責對齊，投籃弧負責方向，落點負責當前位置，封面負責內容交棒。動態不得引入比分跑馬、粒子尾跡、發光、持續漂浮、游標視差、scroll-jacking 或裝飾性循環。

## Master rule card

| Dimension         | Frozen rule                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Base unit         | `U = 8px`; half-step `4px` 只用於細位移、線寬與緊密間距                                                                                         |
| Grid              | 4 / 8 / 12 欄 responsive editorial grid；幾何必須對齊內容欄或封面邊界                                                                           |
| Primitives        | `line` 場線、`arc` 投籃弧／圓、`cover` 4:5 期刊封面矩形                                                                                         |
| Operators         | `align` 對齊、`crop` 取景、`offset` 建立節奏、`connect` 表達旅程                                                                                |
| Composition limit | 同一 surface 最多三種 primitive、單一主要朱紅 accent；不可為每個容器加裝飾幾何                                                                  |
| Palette           | Arena black `#080808`、bone paper `#F2EEE5` / `#FBF8F1`、vermilion `#E76C3C` / `#B83A18`; muted brass/green 只作有語意的狀態，不參與主要 motion |
| Ratio             | Issue cover 固定 4:5；媒體必須保留明確尺寸以避免 layout shift                                                                                   |
| Journey           | 三段閱讀 rail：`01 封面 → 02 目錄 → 03 閱讀`；只有目前步驟使用落點色與 `aria-current="step"`                                                    |
| Motion verbs      | `orient` 定向、`handoff` 交棒、`reveal` 揭示、`track` 追蹤、`confirm` 確認                                                                      |
| Motion budget     | 每個 viewport 同時最多兩個主要 motion；文章正文密度為零，閱讀進度與按壓回饋不算敘事性大動態                                                     |
| First frame       | SSR 第一個 byte 即輸出完整、可見、可操作內容；不得以 opacity `0`、離屏 transform 或收合 TOC 等待 hydration                                      |
| Prohibitions      | 無無限 CSS animation、無自動播放 hero loop、無 blur/glow trail、無 elastic overshoot、無初次載入 stagger、無 Home/Issue p5                      |

## Approved motion vocabulary

| Verb      | ADR-0005 pattern               | Product purpose                                                           | Full-motion contract                                                                                                                             | Reduced / degraded contract                                         |
| --------- | ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `orient`  | Route fade / slide             | 在已啟動的 client-side navigation 中確認頁面層級改變                      | Enter `220ms`, `8px`, standard enter easing；不延遲 route focus、loading 或 content paint                                                        | `0ms`, `0px`; 直接顯示目的頁                                        |
| `handoff` | Issue-cover shared layout      | 讓同一期封面從 Home/archive 接續到 issue detail，而不是看見第二個無關物件 | 高阻尼 shared-cover spring，`stiffness 320`, `damping 32`, `mass 0.9`, 最長 `360ms`，不可見 overshoot；幾何不相容時最多 `180ms` opacity fallback | 不建立 snapshot、不做 scale/translate；目的頁封面原位可見           |
| `reveal`  | TOC reveal stagger             | 只在使用者觸發後揭示新加入或重新分組的目錄項目                            | 每項 `220ms`, `4px`, 間隔 `32ms`, 最多六項；超過六項同時完成                                                                                     | 初始 SSR TOC 永遠完整展開；reduced、Save-Data 與 no-JS 全部直接完成 |
| `track`   | Reading-progress interpolation | 平滑確認閱讀位置變化，不改變文章位置                                      | `90ms` interpolation；只動進度指示，不自動捲動正文                                                                                               | `0ms`; 數值與可及名稱仍更新                                         |
| `confirm` | Button / gesture feedback      | 確認一次有意圖的按壓或手勢已收到                                          | Press-in `80ms`, scale `0.98`; release `140ms`; hover/focus 使用 CSS                                                                             | `0ms`, scale `1`; focus ring 和狀態文字不變                         |

執行規則：

- 初次 SSR／hydration 不執行 entrance animation；只有後續 client navigation 可使用 `orient`。
- `handoff` 只接受未加 modifier 的 primary navigation，snapshot 一次消耗且必須短時間過期；目的頁只在 Vue Router 套用 Nuxt scroll result 後量測，route unmount 取消未完成 animation。
- TOC 初次顯示不得使用 `reveal`。完整 SSR 清單是 canonical product，不是 animation fallback。
- Route enter 與 cover handoff 可以同時發生，且構成當下唯二的主要 motion；不得再疊加 hero reveal 或幾何循環。
- 一般 hover、focus、press 優先 CSS；尺寸、位置或內容重排才考慮 motion runtime。普通公開 route 不因此增加 p5 或第三方 motion chunk。

## Token architecture

Motion token 與色彩 token 一樣遵循 `primitive → semantic → component`。Primitive 保存量測值；semantic 表達用途；component 不直接散落 duration、easing、distance 或 spring magic number。

### Primitive tokens

| Primitive                    |                         Value | Meaning                    |
| ---------------------------- | ----------------------------: | -------------------------- |
| `motion.duration.none`       |                         `0ms` | 靜態完成                   |
| `motion.duration.press-in`   |                        `80ms` | 按下                       |
| `motion.duration.progress`   |                        `90ms` | 進度追蹤                   |
| `motion.duration.press-out`  |                       `140ms` | 放開／短 exit              |
| `motion.duration.enter`      |                       `220ms` | route／reveal enter        |
| `motion.duration.shared-max` |                       `360ms` | cover handoff 上限         |
| `motion.distance.fine`       |                         `4px` | TOC 細位移                 |
| `motion.distance.route`      |                         `8px` | route 定向位移             |
| `motion.scale.press`         |                        `0.98` | 按壓確認                   |
| `motion.stagger.step`        |                        `32ms` | TOC 相鄰項目間隔           |
| `motion.easing.enter`        | `cubic-bezier(.16, 1, .3, 1)` | 快速定向、安靜 settle      |
| `motion.easing.exit`         |   `cubic-bezier(.4, 0, 1, 1)` | 不拖延離開                 |
| `motion.spring.cover`        |              `320 / 32 / 0.9` | stiffness / damping / mass |
| `space.u`                    |                         `8px` | 幾何與版面基準             |
| `color.arena`                |                     `#080808` | 深色 hero                  |
| `color.paper`                |                     `#F2EEE5` | 閱讀 canvas                |
| `color.vermilion`            |                     `#E76C3C` | 深色 surface 落點／action  |

### Semantic and component mapping

| Semantic token             | Primitive source                     | Component consumers                             |
| -------------------------- | ------------------------------------ | ----------------------------------------------- |
| `motion.route-orient`      | `enter + route + easing.enter`       | Public-page route enter                         |
| `motion.cover-handoff`     | `shared-max + spring.cover`          | Home/archive cover → issue cover                |
| `motion.toc-reveal`        | `enter + fine + stagger.step`        | User-triggered TOC additions only               |
| `motion.reading-track`     | `progress + easing.enter`            | Reading-progress indicator                      |
| `motion.control-confirm`   | `press-in / press-out + scale.press` | Primary/secondary links and buttons             |
| `geometry.journey-line`    | `space.u + semantic divider`         | Three-step journey rail                         |
| `geometry.journey-current` | `semantic action / current text`     | Active journey dot and label                    |
| `geometry.issue-cover`     | `semantic border + 4:5 ratio`        | Featured, archive, and issue-detail cover frame |

實作時由一個 canonical motion module 輸出 semantic values。因 production CSP 禁止 style attribute，stylesheet 以靜態 custom properties 鏡射這些值，並由 contract test 逐項比對；Vue component 不使用 inline style 注入 token。Feature stylesheet 不新增未命名的 `transition: 173ms` 或自訂 spring。

Editorial motion flags 與文章中的 trusted creative runtime 是兩個 policy boundary。單獨關閉 `reading-progress-track` 或整組 editorial motion，不得改變 p5 的 motion preference；creative 只跟隨使用者的 reduced-motion／forced-colors 條件，而自動載入資格另受 Save-Data 與 interactive policy 控制。

## Surface composition and density

| Surface              | Active geometry                                                                         |       Motion density | Allowed emphasis                                                                                      | Explicitly absent                                                       |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------: | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Home                 | Court line/arc at hero edge, 4:5 featured cover, journey step 01                        |                  `2` | Client route orientation and source cover handoff; one primary CTA                                    | p5, looping court animation, feed reveal cascade, crypto/game telemetry |
| Issue archive/detail | Archive 使用 cover grid；detail 使用單一 4:5 cover、journey step 02 與完整 vertical TOC |                  `1` | Archive source／detail destination cover handoff；optional user-triggered TOC reveal within allowlist | Initial TOC stagger, carousel, animated filters, cover tilt             |
| Article              | Narrow paper column, journey step 03, reading-progress line                             | `0` narrative motion | Progress interpolation and control confirmation only                                                  | Shared hero movement, paragraph reveals, parallax, background loop      |

Static court geometry may establish hierarchy but does not move merely to make a page feel active. Pattern breaks in long-form content remain limited to roughly every 3–5 paragraphs and follow the existing article block contract.

## Responsive recomposition

Responsive behavior changes composition, not meaning. The same DOM reading order, three-step journey, cover identity, and primary CTA remain available at every width.

| Width                       | Recomposition contract                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `320px` reflow floor        | Single column, `20px` gutter; journey labels may wrap beneath dots; cover remains 4:5; no page-level horizontal scroll                                                                       |
| `375–412px` mobile baseline | Hero visually becomes cover-first, then issue label/title and CTA; semantic headings and controls keep a logical DOM order; court arc may crop at the edge; all targets at least `44 × 44px` |
| `768px` tablet              | 8-column grid; issue cover and text/TOC may recompose to a 5:7 relationship; reading column stays singular                                                                                   |
| `1024px` desktop            | 12-column grid; asymmetric cover/text layout; article body remains approximately `680–720px`; journey rail may use one horizontal line                                                       |
| `1440px` wide               | Canvas gains margins/metadata rail, not a wider prose column; arc and issue numeral may occupy negative space without crossing controls                                                      |

Additional rules:

- Use available inline size or container queries, not device/user-agent branches.
- Layout changes must not animate on resize or orientation change. Recompute the final geometry immediately.
- Shared-cover handoff runs only when source and destination rectangles are valid. Destination geometry is sampled from a router scroll-settled signal, not a fixed frame-count guess; aspect-ratio or measurement failure uses the destination’s final static layout.
- At 200% and 400% browser zoom, labels reflow, controls remain reachable, and prose does not require two-dimensional scrolling.
- Fixed/sticky controls retain safe-area inset and do not cover the focused target.

## Preference, network, and failure matrix

| Condition                        | Geometry / route                       | Cover handoff                                                             | TOC / progress / press                   | Content and navigation                                                       |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| Full motion                      | Bounded allowlist behavior             | One-shot transform/scale, max `360ms`                                     | Bounded timings above                    | Complete and immediately usable                                              |
| `prefers-reduced-motion: reduce` | No movement or autoplay                | Disabled                                                                  | Instant values; no press scale           | Identical semantics and focus order                                          |
| `Save-Data: on`                  | Static composition                     | No snapshot or animation                                                  | Instant reveal/progress/press            | Images follow existing responsive policy; p5 remains `0B` on ordinary routes |
| No JavaScript                    | SSR final state                        | Not attempted                                                             | Complete TOC; progress may remain static | Home → Issue → Article 的連結與正文維持可用                                  |
| Hydration/runtime failure        | Existing DOM remains final and visible | Target cover remains visible                                              | No hidden pending state                  | Focus, anchors, sharing, previous/next remain native                         |
| Invalid/stale cover snapshot     | No route delay                         | Consume/discard once; optional bounded opacity fallback only in full mode | Unaffected                               | Destination page renders normally                                            |
| Animation API absent             | Static composition                     | Not attempted                                                             | CSS-safe feedback or instant state       | No polyfill required for reading                                             |

The default before client preference detection is static. Client code may promote the document to full motion only after confirming both motion preference and Save-Data policy. Failure must never demote content completeness.

## Accessibility and performance gates

- Every control retains a visible `:focus-visible` treatment independent of motion; color and movement are never the sole state indicators.
- Journey rail is an ordered list; the current item exposes `aria-current="step"`. Decorative line/arc geometry is hidden from the accessibility tree.
- Motion does not move focus, auto-scroll article text, delay route announcement, or trap keyboard navigation.
- Tap/click targets are at least `44 × 44 CSS px`; text zoom and strict Traditional Chinese line breaking remain supported.
- Ordinary Home, issue, and article routes transfer exactly `0B` of p5 implementation code. This motion slice adds no generative runtime to those routes.
- No infinite animation may run on a public reading route. Unmount cancels outstanding shared-cover animation and releases its in-memory snapshot.
- SSR content, image dimensions, and final layout remain authoritative to prevent motion-related CLS.
- A pattern that fails the applicable accessibility or performance gate is disabled while its static state remains shipped.

## Acceptance targets and evidence status

| Gate                         | Target                                                                                                                 | Evidence status for this specification                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Source contract              | Only the five ADR-0005 patterns; centralized tokens; no initial hidden content; no Home/Issue p5                       | Required in unit/source inspection                                                |
| Keyboard                     | Home → Issue → TOC → Article works with native links and visible focus; animation never blocks focus                   | Required browser evidence                                                         |
| Reduced motion               | Route, cover, TOC geometry, press scale, autoplay and progress travel resolve instantly                                | Required computed-style and journey evidence                                      |
| Save-Data                    | Cover/reveal geometry is disabled; ordinary routes retain `0B` p5                                                      | Required browser/network evidence                                                 |
| Responsive                   | `320 / 375 / 412 / 768 / 1024 / 1440px`, plus 200%/400% zoom, no horizontal page overflow or clipped important control | Required browser and visual evidence                                              |
| Motion budget                | No more than two simultaneous major motions; shared cover `<=360ms`; no visible overshoot or infinite loop             | Required animation inspection                                                     |
| Runtime failure              | No-JS, unavailable Animation API, stale snapshot, image failure and hydration failure retain final readable DOM        | Required browser fault-injection evidence                                         |
| Performance                  | No motion-induced CLS; ordinary-route p5 transfer exactly `0B`; public-read budgets continue to pass                   | Required exact-head performance artifacts                                         |
| Native/visual browser review | Actual paint, court geometry, cover continuity, Traditional Chinese wrapping and vestibular disposition                | **NOT_RUN** — no browser/native visual evidence is attached to this specification |

`NOT_RUN` is not a pass. Static analysis, unit tests, rendered source inspection, or build success may support implementation confidence, but they cannot be represented as browser paint, native zoom, assistive-technology, physical-device, or vestibular observation. Release acceptance continues to require the evidence and exact-head binding defined by the quality plans.

## Review checklist

- [ ] Every animated property maps to one approved verb and one semantic token.
- [ ] The first SSR frame is complete and visible before client preference detection.
- [ ] Home, issue, and article preserve the `01 → 02 → 03` reading orientation without adding navigation steps.
- [ ] Reduced-motion, Save-Data, no-JS, API failure, and stale-snapshot paths are static and complete.
- [ ] Responsive recomposition preserves DOM order, 4:5 cover identity, target size, focus visibility, and prose width.
- [ ] No animation waits on or delays route focus, route announcement, data loading, or content paint.
- [ ] Ordinary public routes load no p5 code; the article reading surface remains narratively still.
- [ ] Browser/native/visual evidence remains explicitly `NOT_RUN` until an actual run is bound to the reviewed head.
