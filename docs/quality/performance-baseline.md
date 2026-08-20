# T079 Public Performance, Bundle and Lifecycle Baseline

## Status and evidence boundary

- Task: T079
- Parent plan: Issue #111
- Implementation PR: #114
- Rebuild base (`main` after Security #115 and T078): `e2a105a8d6596aa0d2a06db3aa4e3525a4338ade`
- Reviewed implementation parent: `5f9a7f037ab0cdf5aa713841f41a8b2fec33ceef`
- Decision: **conditionally accepted for final exact-head verification**
- Scope: P1 public reading performance only. T080+, Web3 and post-MVP product work are not part of this gate.

The final PR head cannot name its own commit SHA inside this file. The release-owner receipt in the protected PR conversation MUST bind the immutable final head to fresh CI, Security and artifact hashes after this document is committed. Evidence from the superseded head `ea8777a4bfe3d7204acc08a2b02b0829bd78e179` is historical only and MUST NOT be reused to accept or merge the rebuilt head.

## Tests-first attribution

The tests-only head `d8517886543fb3b79c06b42dffcf15632e501c22` failed at the intended missing seam:

```text
T079 RED: deterministic 20-article performance fixture server is missing at tests/performance/start-server.mjs
```

The RED run was `T079 RED probe` #1 (`32325360573`) with artifact `9391154676`. The temporary probe workflow is absent from the final scope.

## Fixed workload

`tests/performance/start-server.mjs` provides a deterministic public-read environment:

- one published issue with exactly 20 ordered article links;
- four sections with five articles each;
- an ordinary article with fixed Traditional Chinese prose, one 1600 x 900 image and a two-item 1200 x 800 gallery;
- a creative article with the same representative content, a supported `court-pulse-v1` generative block and a 1200 x 675 poster;
- explicit media dimensions and deterministic ETag/cache-state markers for MISS, HIT and 304 revalidation;
- no external network or production data.

SVG fixture bodies make transfers deterministic in CI. They prove loading, sizing, layout and transfer contracts; they do not claim physical-device JPEG/WebP decode cost.

## Environments

### CI Chromium mobile profile

- Playwright Chromium from the locked workspace dependency.
- Viewport: 412 x 915 CSS px; device scale factor: 2.625.
- Mobile/touch context enabled; service workers blocked for deterministic HTTP-cache measurement.

### Lighthouse profile

- Mobile simulated throttling: 150 ms RTT, 1536 Kbps throughput and 4x CPU slowdown.
- Three runs each for the 20-article issue, ordinary image article and creative-poster article.

### Representative Android profile

- GitHub-hosted Android Emulator API 35, Pixel 7 x86_64 profile and production Android Chrome through CDP.
- This is reproducible representative Android CI evidence, not physical-device evidence.

## Budgets

### Public-read navigation and lifecycle

| Metric | Budget |
| --- | ---: |
| Home DOMContentLoaded | <= 2500 ms |
| Cold 20-article issue DOMContentLoaded | <= 3500 ms |
| Warm 20-article issue DOMContentLoaded | <= 2500 ms |
| Ordinary article DOMContentLoaded | <= 3000 ms |
| Issue article links | exactly 20 |
| Representative image requests | >= 3 |
| Representative image transfer | >= 12000 bytes |
| Ordinary Home/Issue/Article p5 transfer | exactly 0 bytes |
| Creative first `running` | <= 2500 ms |
| Offscreen creative pause | <= 1500 ms |
| Background creative pause | <= 2000 ms |
| Simultaneously running canvases | <= 1 |
| Longest creative long task | <= 350 ms |
| Total creative long-task time | <= 1200 ms |

Cache correctness is contractual: empty fixture cache returns `200`/`MISS` plus ETag, a repeat returns `200`/`HIT`, and `If-None-Match` returns `304`/`REVALIDATED`.

### Android creative lifecycle

| Metric | Budget |
| --- | ---: |
| Android DOMContentLoaded | <= 5000 ms |
| Creative first `running` | <= 3500 ms |
| Offscreen pause | <= 2000 ms |
| Background pause | <= 2500 ms |
| Simultaneously running canvases | <= 1 |
| Longest long task | <= 500 ms |
| Total long-task time | <= 1800 ms |

### Bundle

| Metric | Budget |
| --- | ---: |
| Isolated p5 host/preset incremental gzip | <= 450 KiB |
| Ordinary article SSR-hinted JavaScript gzip | <= 400 KiB |
| Total emitted client JavaScript gzip | <= 1600 KiB |
| p5 implementation chunks | exactly 1 |
| Ordinary article SSR prefetch of p5/preset | 0 chunks |

### Lighthouse

| Metric | Budget |
| --- | ---: |
| Performance category median | >= 0.80 |
| Accessibility category | 1.00 |
| SEO category | >= 0.95 |
| LCP median | <= 2500 ms |
| TBT median lab responsiveness guard | <= 200 ms |
| CLS median | <= 0.10 |
| Total byte weight median | <= 1500 KiB |
| Responsive/sized image audits | pass |

## Final-head acceptance contract

The protected PR receipt MUST prove all of the following on one immutable final head:

| Requirement | Required evidence |
| --- | --- |
| Workload and imagery | `artifacts/performance/public-read.json`: 20 links and representative transfers |
| Cache contract | MISS, HIT and ETag 304 revalidation in the same artifact |
| No-p5 ordinary routes | Home, issue and ordinary-article request ledger reports zero p5 bytes |
| Creative lifecycle | desktop Chromium and Android Chrome offscreen/background pause evidence |
| Bundle | `artifacts/performance/bundle-budget.json` satisfies every bundle budget |
| Lighthouse | three URLs x three runs satisfy all configured median/audit budgets |
| Regressions | complete required browser job passes |
| Supply chain | exact-head CI 5/5 and Security 8/8 pass |
| Review/integration | zero unresolved review threads and mergeable against current protected `main` |

Expected artifacts:

```text
artifacts/performance/public-read.json
artifacts/performance/bundle-budget.json
apps/web/artifacts/lighthouse/*.report.json
artifacts/android-chrome/performance-smoke.json
artifacts/exact-head.json
```

T079 is merge-eligible only after an authoritative receipt records the final head, fresh workflow run/job IDs, downloaded artifact digests and measured values. An attributable budget failure is HOLD until fixed or explicitly re-baselined with measured justification; budgets must not be relaxed merely to turn CI green. T079 evidence cannot substitute for T078 accessibility evidence.
