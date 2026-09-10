# Arena Editorial v0.3

Status: owner-authorized implementation contract \
Authority: [GitHub issue #186](https://github.com/bynanci/courtside-tw/issues/186) \
Authorization base: 2cc2cc5acac03af3667126ad28c1e80a58edb7b9 \
Branch: feat/arena-editorial-v3

## Purpose

Classification: style-reference / draft-only

Arena Editorial v0.3 translates the supplied courtside montage into a production-safe public
reading system. The direction combines an “Arena Night” discovery surface with an “Editorial
Paper” reading surface. It strengthens visual hierarchy without changing publication, rights,
identity, API, research, Web3, or release contracts.

The direction images are references for composition and mood only. Their photography, marks,
people, typefaces, dates, and editorial copy are not authorized production assets.

## Reference fingerprints

| Reference                | Observed format   | SHA-256                                                          | Use                                 |
| ------------------------ | ----------------- | ---------------------------------------------------------------- | ----------------------------------- |
| 11379.png                | JPEG, 1536 × 1024 | 58aff6b6b3444f01b349bf1ca8579a430e5692591445d32d161408fb84f30453 | Composition and visual tone only    |
| courtside-montage(1).png | PNG, 2096 × 1044  | Not used as a production binding                                 | Multi-surface layout reference only |

The reference bitmap is intentionally absent from production and from this change set. Only the
exact first fingerprint is used as a review note; neither attachment acts as production authority.

## Product interpretation

| Observed in the reference                          | Bounded production interpretation                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Cinematic full-height mobile cover                 | Recompose the single rights-valid current issue cover as the Home mobile scene         |
| Condensed masthead and issue numbering             | Use the existing local font stack, strong scale contrast, and editorial utility labels |
| White issue and story sheets                       | Preserve the existing paper surface and readable long-form measure                     |
| Home, Issue, Story, People, and Menu concepts      | Ship only current routes: Home, Issues, Search, Library, Privacy, and Article          |
| Portraits, players, city photography, and logo art | Do not copy; render only current API media that already passed rights checks           |
| Persistent mobile navigation                       | Use a four-destination dock on non-article public surfaces only                        |
| Reader story screen                                | Keep article controls, metadata, and previous/next navigation in document flow         |

## Non-goals

- No new People, Culture, Stories, About, or placeholder route.
- No supplied bitmap, player likeness, third-party mark, unverified font, or copied wording.
- No API, database, CMS lifecycle, analytics payload, authentication, offline, or withdrawal change.
- No workflow, branch-protection, deployment, provider, secret, research, or Web3 change.
- No mutation of canonical T001–T112 task bytes; T086 remains HOLD.

## Arena Editorial rule card

The construction unit is U = 8px. Layout derives from a four-column mobile grid and a
twelve-column desktop grid. The system uses five repeatable operations:

1. Frame: a hairline bounds each public navigation or editorial grouping.
2. Split: desktop discovery pairs one text plane with one media plane.
3. Stack: mobile collapses content into one vertical reading sequence.
4. Crop: the existing cover becomes a full scene only below 48rem.
5. Breakout: selected article media may expand to 64rem while prose remains 42rem.

No decorative geometry may obscure content, become the only state indicator, or introduce
horizontal overflow at the validation widths.

## Token architecture

The required dependency chain is primitive → semantic → component.

Primitive tokens define ink, paper, stone, vermilion, navy, sky, and scrim values. Semantic
tokens then express page, surface, hero, text, action, border, focus, and scene roles. Component
tokens consume only semantic tokens:

- Public Header: surface-public-header, size-public-header, size-control-min.
- Mobile Dock: surface-public-dock, size-public-dock, safe-area inset.
- Hero Scene: color-scene-scrim, color-scene-scrim-soft.
- Editorial details: stroke-hairline, radius-control, type-utility, type-navigation.
- Spacing: space-1, space-2, space-3, space-4, space-6, space-8, space-12.

Dark mode changes semantic values. Forced-colors removes decorative layers and relies on
Canvas, CanvasText, and LinkText. Focus uses color-focus and a visible three-pixel outline.

## Shared navigation contract

| Surface                                | Desktop                                | Mobile                                        | Current-state signal                    | No-JS                                     |
| -------------------------------------- | -------------------------------------- | --------------------------------------------- | --------------------------------------- | ----------------------------------------- |
| Home, Issues, Search, Library, Privacy | Shared header, at most four live links | Native details menu plus four-item fixed dock | aria-current plus line or underline     | Summary, links, and reading remain usable |
| Article                                | Reader header with contextual return   | Same reader header; no global dock            | Context label names issue or all issues | Plain link remains usable                 |

The mobile menu uses native details semantics. Enhancement adds Escape handling, focus
containment, focus return, and breakpoint cleanup. The enhanced close button is not rendered
until JavaScript is ready, so no dead control appears in the server or no-JS result. Scroll lock
applies only at or below 48rem.

## Surface contracts

### Home

Claim first: the existing H1 and current CMS issue establish why to read. Context follows through
the issue label and deck. One existing rights-valid cover is the only media request. On mobile it
becomes the scene behind a strong scrim; content and CTA reserve the dock plus safe-area height.
On desktop it returns to the split cover-and-copy composition.

### Issue index and issue detail

The archive keeps existing issue-card data and failure states. Issue detail preserves the cover
carry motion, issue number, summary, table-of-contents anchor, offline panel, and analytics. At
mobile width the compact cover, shortened gaps, and reserved dock space keep the TOC action
reachable. Loading, missing, and error outcomes each expose a page-level H1.

### Article

The article shell is deliberately quieter than discovery surfaces. Identity order is signal,
title, deck, metadata, then journey rail. Prose remains at 42rem. Image, gallery, and generative
canvas blocks alone may break out to 64rem at wide viewports. There is no inferred hero, duplicate
media, sticky global dock, or empty navigation link. If issue context is unavailable, the reader
header says “返回所有期數”.

### Search, Library, and Privacy

These are current routes, not future placeholders. Their forms, guest and signed-in states,
offline behavior, deletion confirmation, analytics, and data contracts remain intact. Each has a
single skip link, main landmark, stable H1, and mobile-dock clearance. Privacy intentionally has
no selected global destination.

## Responsive matrix

| Validation width | Composition                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| 320px            | One column, 16px gutters, compact brand/menu, four dock targets                   |
| 375px            | Full-height Home scene; CTA and Issue TOC action clear the dock and safe area     |
| 768px            | Mobile composition through 48rem; menu closes cleanly when crossing to desktop    |
| 1024px           | Desktop header and split discovery layout                                         |
| 1440px           | Twelve-column rhythm; selected article media break out while prose stays readable |
| 200% zoom        | Reflow without clipping, hidden controls, overlap, or horizontal scrolling        |

## Accessibility and resilient states

- One skip link targets one focusable main landmark.
- Interactive targets are at least 44 CSS pixels; dock targets are 48 pixels or larger.
- Current navigation is conveyed by aria-current and a non-color line or underline.
- Menu Escape, Tab containment, focus return, and mobile-to-desktop resize are deterministic.
- Reduced motion reduces all animation and transition duration.
- Forced colors hides the full-color mobile Home media and preserves CanvasText contrast.
- Broken or withdrawn images use existing fallbacks; no content depends on decoration.
- SSR and no-JS preserve the reading path and native menu links.
- Print removes navigation overlays and dock spacers.
- Anonymous reading remains the default; OIDC, wallet, or third-party service is never required.

## Rights, withdrawal, and privacy

Only media returned by the current public API is rendered. The existing rights and withdrawal
pipeline remains authoritative: expired or withdrawn media is not substituted from the mockup.
Attribution, alt text, and image failure handling remain attached to the current content model.
Navigation introduces no third-party network request and no new analytics dimension.

## Performance constraints

The redesign adds no font or bitmap payload. It reuses the existing cover request and CSS
recomposition. The implementation must remain within repository bundle budgets and keep the
local reader demo, SSR build, API-client contracts, and no-JS reading path green.

## Verification and merge gate

The independent task ledger is in arena-editorial-v3-tasks.md. Merge requires:

- exact path closure and linear history descending from the authorization base;
- documentation commit before the contract-test and production commits;
- formatting, typecheck, lint, unit, validator, build, reader-demo, schema, OpenAPI,
  observability, analytics-privacy, and bundle-budget checks;
- exact-head CI, Security, responsive browser, keyboard, no-JS, reduced-motion,
  forced-colors, broken-image, and 200% zoom evidence;
- zero unresolved current-head P1/P2 findings and a rubric score of at least 17/20;
- one exact-head squash merge, followed by protected-main readback.

## Rubric

| Dimension                           | Maximum | Merge floor |
| ----------------------------------- | ------: | ----------: |
| Construction                        |       4 |           2 |
| Artifact                            |       4 |           2 |
| Accessibility                       |       4 |           2 |
| Responsive                          |       4 |           2 |
| Visual system / editorial alignment |       4 |           2 |
| Total                               |      20 |          17 |

The supplied style reference creates direction, not authority. When it conflicts with current
product behavior, rights, accessible reading, or governance, the current production contract
wins.
