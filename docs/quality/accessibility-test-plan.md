# T078 Accessibility Release Test Plan

## Status and Scope

- Task: T078
- Parent plan: Issue #111
- Implementation: PR #112
- Simulated review remediation: Issue #113
- Baseline main: `5cc54f43a9c6dc191d2620939ef98bf2589a3ec9` (Security #115 integrated through PR #116)
- Current decision: **AGENT-ASSESSMENT FINALIZATION**; native rows are WAIVED / NOT_RUN, while final-head machine and Security gates remain required
- Boundary: P1 public reading surfaces only; this plan does not start T079 or any Web3 task

Automated Playwright, axe and Chromium accessibility-tree output are machine evidence. In the release-owner-authorized agent roundtable mode, agents adjudicate those artifacts against the six contracts; native OS/AT/device/font execution is explicitly WAIVED / NOT_RUN, never represented as PASS.

## Release Cancellation Conditions

T078 remains `HOLD` when any condition below is true:

1. Home, issue TOC, article reading, reader library, or enabled offline controls cannot be completed by keyboard.
2. Reduced-motion mode retains sustained or large non-essential movement.
3. Browser zoom causes horizontal prose scrolling, clipped content, or an unreachable important control.
4. A generative poster and its data summary fail to replace the creative runtime completely.
5. The creative runtime duplicates or contradicts the poster/summary in the accessibility tree.
6. An attributable serious or critical WCAG finding remains unresolved.

A green CI run does not waive a cancellation condition.

## Agent Roundtable Mode

This release-owner-authorized mode replaces the six native operator reviews as the T078 acceptance method. It does **not** claim that an OS, assistive-technology API, device, GPU/display, or font engine was physically operated.

The roundtable is an exact-head, evidence-classified review with these roles:

| Agent role | Review boundary |
| --- | --- |
| Evidence provenance | PR/base/head, workflow runs, artifact source-head and scope |
| Keyboard focus | skip-link, sequential Tab/Shift+Tab/Enter and focus contracts |
| Desktop AT bridge | landmarks, names, hidden creative runtime and accessibility-tree shape |
| Android TalkBack | Android DOM contract and offline smoke; native node/gesture claims remain waived |
| Zoom/layout/paint | 320/640 reflow, scroll metrics, clipping and focus geometry |
| Vestibular motion | reduced-motion emulation, lifecycle pause and bounded runtime |
| zh-Hant shaping | language, CSS line-break/wrapping and mixed-script machine contracts |
| Adversarial reviewer | unsupported inference, stale artifacts, scope drift and dissent |
| Chair/release recorder | applies the decision rules; does not use majority vote to waive Security |

Evidence classes are machine_observed, agent_inference, native_observed, and not_run. agent_inference can never be promoted to native_observed. A layer may be MACHINE_PASS_WITH_LIMITATIONS; it is not a native runtime PASS.

The native claims intentionally waived in this mode are recorded as WAIVED / NOT_RUN: real keyboard focus-ring operation, NVDA/VoiceOver/Orca bridge and TTS, AccessibilityNodeInfo/TalkBack gestures, real 200%/400% browser zoom, full-motion vestibular disposition, and OS/font glyph-shaping screenshots. Missing artifacts, source-head mismatch or critical dissent remains HOLD.

The archived roundtable JSON binds the reviewed implementation parent, the six layer verdicts, waived claims, dissent and residual risk. The final PR head, CI/Security run IDs, artifact identifiers and hashes are bound by a release-recorder receipt in the protected PR conversation after both workflows complete. Both records are required. This two-stage binding avoids the impossible requirement for a committed file to contain the hash of the commit that contains that same file. This mode does not waive the exact-head Security gate, protected merge approval, T079 rebase/rerun, or any T080+/Web3 work.

## Surfaces

| Surface | Required journey or control |
| --- | --- |
| Home | Skip to main content; open featured issue |
| Issue archive | Skip to main content; find and open an issue |
| Issue detail | Read cover/title; traverse TOC; focus download/update/remove controls |
| Article | Skip to article; read title/byline/body; use article TOC and previous/next navigation |
| Reader library | Skip to main content; inspect offline issues; remove an issue; preview/apply progress |
| Creative block | Read poster alt text and data summary; enable runtime without duplicate announcements |

## Automated Exact-Head Preflight

Test file: `apps/web/tests/e2e/t078-accessibility-release.spec.ts`

Required results:

- One visible-on-focus skip link and one focusable `#main-content` target on each core surface.
- Sequential Tab/Enter navigation through Home → Issue → TOC → Article without using programmatic focus in the claimed keyboard path.
- Sequential Tab reachability and visible focus for the enabled offline download control.
- Zero serious or critical axe findings for selected WCAG A/AA tags.
- Reviewable accessibility-tree snapshots for every core route.
- No literal implementation escape such as `\\n` in the homepage heading accessible name.
- Reflow checks at 640 and 320 CSS px, representing 200% and 400% zoom regression guards from a 1280 CSS px reference width.
- No horizontal document overflow or clipped interactive control.
- `lang="zh-Hant-TW"`, `line-break: strict`, `overflow-wrap: anywhere`, and `word-break: normal`.
- No sustained animation or transition under `prefers-reduced-motion: reduce`.
- Creative canvases remain paused under reduced motion.
- One assistive-technology image representation per generative block; poster and summary remain accessible while the visual runtime is hidden from the accessibility tree.
- Repeated creative controls expose concise, block-specific accessible names.
- Repeated return navigation exposes contextual labels instead of indistinguishable duplicate names.

Evidence directory: `artifacts/web-e2e/accessibility/`.

The required browser job must upload this directory together with the exact-head receipt, Playwright report, traces, screenshots and existing browser evidence.

## Simulated Human-Review Remediation

Issue #113 records a source-and-evidence review of the prior exact head `ace9cd3cb3307ba9eee2ab7c0f5638eb1166c0e6`.

The simulation found four attributable code/evidence defects:

1. The keyboard journey used `locator.focus()` and therefore proved focusability rather than sequential keyboard order.
2. The homepage heading exposed the literal source sequence `\\n` in its accessible name.
3. Two generative blocks exposed the same `顯示互動視覺` button name.
4. End-of-article return navigation used an indistinguishable label already present elsewhere on the page.

The remediation replaces programmatic focus with Tab-driven traversal, renders a real visual line break, adds trusted block context to creative-control names, and gives the footer return link an end-of-article label.

This section is a review receipt only. It does not change any native-screen-reader, TalkBack, browser-zoom, vestibular, or Traditional Chinese visual-review row from `NOT_RUN / HOLD` to `PASS`.

## Optional Native Keyboard Procedure (Waived in Agent Mode)

Environment: desktop Chromium, 1280 × 800 CSS px, browser zoom 100%, no mouse or touch.

1. Load `/` and press `Tab` once.
2. Confirm `跳到主要內容` becomes visible and Enter moves focus to main content.
3. Continue with Tab, Shift+Tab and Enter through the featured issue, issue TOC, first article, article TOC, previous/next navigation and return-to-issue link.
4. On the issue page, focus every enabled offline download/update/remove control.
5. On `/library`, reach the offline list, removal button, login button, progress preview/apply buttons and privacy link.
6. Confirm there is no keyboard trap, unexpected focus reset, hidden focus, or focus loss after client navigation.

| Browser | Operator | Commit | Result | Evidence |
| --- | --- | --- | --- | --- |
| Chromium desktop | Not run | Pending final head | HOLD | Pending |

## Optional Native Screen-Reader Procedure (Waived in Agent Mode)

Run at least one desktop and one mobile combination:

- macOS Safari with VoiceOver, or Windows Chrome/Firefox with NVDA.
- Android Chrome with TalkBack.

For each combination:

1. Navigate by landmarks and headings from Home to an article.
2. Confirm page title, main landmark, headings, TOC lists, links, buttons, status messages, images, captions and errors are announced in a meaningful order.
3. Confirm issue covers and article media have useful alternative text without unnecessary caption repetition.
4. With reduced motion enabled, enable a generative block. Confirm poster alternative text and data summary remain available once, while the canvas adds no duplicate image announcement.
5. Trigger or inspect an offline status/error state. Confirm polite status updates do not interrupt reading and alerts are announced once.
6. Record mixed Traditional Chinese/English pronunciation issues separately from semantic defects.

| Screen reader | Browser/device | Operator | Commit | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| Desktop native AT | Not run | Not run | Pending final head | HOLD | Pending |
| TalkBack | Android Chrome | Not run | Pending final head | HOLD | Pending |

Chromium `ariaSnapshot()` files are supporting evidence only and must not be entered as a native screen-reader pass.

## Optional Native Browser-Zoom Procedure (Waived in Agent Mode)

Reference viewport: 1280 CSS px wide.

1. Use browser zoom controls at 200% and 400%; do not substitute a dedicated mobile URL.
2. Repeat Home, issue detail, article and library journeys.
3. Confirm text reflows, controls remain visible, prose does not require two-dimensional scrolling, and sticky elements do not cover focused controls.
4. Confirm long URLs, English identifiers, dates and mixed-language labels wrap without breaking Chinese reading order.
5. Capture one screenshot per surface and zoom level.

| Zoom | Browser | Operator | Commit | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 200% | Not run | Not run | Pending final head | HOLD | Pending |
| 400% | Not run | Not run | Pending final head | HOLD | Pending |

The automated 640/320 CSS px checks are regression guards, not substitutes for browser zoom controls and visual inspection.

## Optional Native Vestibular Procedure (Waived in Agent Mode)

1. Enable operating-system reduced motion before loading an article.
2. Confirm reading progress changes without animated travel.
3. Confirm route transitions and content reveals do not slide, scale, parallax, flash, or auto-scroll.
4. Confirm generative blocks default to poster/summary and remain paused after explicit enable.
5. Disable reduced motion and verify at most one visible creative loop runs; backgrounded/offscreen loops must pause under the existing lifecycle gate.

| Mode | Operator | Commit | Result | Evidence |
| --- | --- | --- | --- | --- |
| Reduced motion | Not run | Pending final head | HOLD | Pending |
| Full-motion vestibular review | Not run | Pending final head | HOLD | Pending |

## Optional Native Typography Procedure (Waived in Agent Mode)

Review Home, issue summary, TOC, article prose, captions, offline states and library controls.

Pass criteria:

- Document language is `zh-Hant-TW`.
- Line breaking follows strict CJK behavior.
- Long English tokens and identifiers wrap instead of forcing horizontal scrolling.
- Opening and closing punctuation do not produce obvious isolated marks at line edges.
- Text remains readable at 200% and 400%.
- Labels do not depend on uppercase English alone to convey state.

| Reviewer | Commit | Result | Evidence |
| --- | --- | --- | --- | --- |
| Not run | Pending final head | HOLD | Pending |

## Motion and Generative Fallback Inventory

| Pattern | Reduced-motion expectation | No-JS/runtime-failure expectation | Required evidence |
| --- | --- | --- | --- |
| Reading progress | No transition duration | Progress element remains present | Computed-style record and screenshot |
| Route/content transition | No sustained movement | Completed DOM remains readable | Playwright trace and manual review |
| Generative poster | Always visible | Poster/placeholder and summary remain complete | No-JS test, screenshot and AT snapshot |
| p5 canvas | Paused in reduced motion | Not mounted or removed on failure | Runtime-status evidence |
| Offscreen/background canvas | Paused and bounded to one loop | Poster/summary unaffected | Existing lifecycle gate |

## Completion Receipt

Do not mark T078 complete until the protected PR conversation contains the final exact-head binding receipt and every required row below is satisfied. The immutable run IDs and artifact hashes live in that external receipt so recording them does not mutate the head they attest.

| Evidence | Status |
| --- | --- |
| Tests-first RED attribution | Captured on `f77a8f1a98aef408c3dc6b4370c7c5f3ac21104e` |
| Simulated review remediation | Issue #113; must pass final-head regression |
| Final exact-head CI and Security | Required in protected PR receipt |
| T078 Playwright release contracts | Required in final-head browser artifact |
| Axe serious/critical result | Required in final-head browser artifact |
| Keyboard manual run | WAIVED / NOT_RUN — agent mode |
| Native desktop screen reader | WAIVED / NOT_RUN — agent mode |
| Android TalkBack | WAIVED / NOT_RUN — agent mode |
| Browser zoom 200%/400% | WAIVED / NOT_RUN — agent mode |
| Reduced/full-motion manual review | WAIVED / NOT_RUN — agent mode |
| Traditional Chinese typography review | WAIVED / NOT_RUN — agent mode |
| Review threads | Must be zero at merge readback |
| Protected mergeability | Must be true at merge readback |

Final decision: **AGENT-ASSESSMENT ONLY**; native rows are WAIVED / NOT_RUN, never PASS. T078 remains blocked until the external receipt binds the final head, both exact-head workflows are green, critical dissent is absent, review threads are zero and protected mergeability is true.
