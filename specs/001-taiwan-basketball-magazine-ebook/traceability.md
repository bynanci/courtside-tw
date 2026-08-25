# T085 Cross-artifact Traceability and Scope Analysis

Authorized source: protected `main@3fc14dd29b216ce46e4d364ceaec79a971dcef44`. This artifact maps exactly 74 FR + 23 SC to the current 112-task ledger and repository proof locators. It is an implementation artifact, not a T085 completion receipt.

## Decision packet

| Decision                        | Current disposition                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Traceability analysis           | VALID only when `pnpm run contract:traceability` passes on the exact PR head         |
| T085 completion                 | HOLD — T085 stays unchecked until protected merge and a separate accepted receipt    |
| T086                            | NOT DISPATCHED; SC-012 remains `PLANNED_BLOCKED`                                     |
| Human research                  | NOT EXECUTED; SC-001/004/007 retain truthful human-evidence boundaries               |
| Web3 / passport / future domain | NOT STARTED; unchecked tasks remain planned or partial and cannot support `VERIFIED` |
| Production / provider / secrets | NOT ACTIVATED or configured; no credentials or external writes are authorized        |

Evidence states are deliberately asymmetric: `VERIFIED` requires checked tasks plus a current file and literal stable selector; `PARTIAL`, `PROXY_ONLY`, `HUMAN_OPEN`, `EXTERNAL_OPEN`, and `PLANNED_BLOCKED` require an explicit deviation. A checked task or lab proxy never upgrades a success criterion by itself.

## Functional requirements

| Requirement | Story / slice                            | Tasks                                                                                                      | Implementation | Evidence        | Proof                  | Deviation      | Release impact                      |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- | --------------- | ---------------------- | -------------- | ----------------------------------- |
| FR-001      | US1/US2 / public-reading                 | T024, T027, T028, T029, T030, T031                                                                         | COMPLETE       | VERIFIED        | `P_US1_LIST`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-002      | US1/US2 / public-reading                 | T024, T026, T027, T028, T029, T030                                                                         | COMPLETE       | VERIFIED        | `P_US1_TOC`            | —              | NONE_FOR_CURRENT_SLICE              |
| FR-003      | US1/US2 / public-reading                 | T024, T027, T028, T030                                                                                     | COMPLETE       | VERIFIED        | `P_US1_DENY`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-004      | US1/US2 / public-reading                 | T032, T034, T035, T038, T041                                                                               | COMPLETE       | VERIFIED        | `P_ARTICLE_READER`, `P_ARTICLE_REFLOW` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-005      | US1/US2 / public-reading                 | T009, T010, T032, T033, T036, T037, T038                                                                   | COMPLETE       | VERIFIED        | `P_CONTENT_BLOCKS`     | —              | NONE_FOR_CURRENT_SLICE              |
| FR-006      | US1/US2 / public-reading                 | T032, T034, T035, T038                                                                                     | COMPLETE       | VERIFIED        | `P_ARTICLE_METADATA`   | —              | NONE_FOR_CURRENT_SLICE              |
| FR-007      | US1/US2 / public-reading                 | T032, T033, T035, T040                                                                                     | COMPLETE       | VERIFIED        | `P_ARTICLE`            | —              | NONE_FOR_CURRENT_SLICE              |
| FR-008      | US1/US2 / public-reading                 | T033, T039, T064, T065, T066, T067, T068, T069, T070                                                       | COMPLETE       | VERIFIED        | `P_LOCAL_PROGRESS`, `P_SYNC_PROGRESS` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-009      | US1/US2 / public-reading                 | T031, T041                                                                                                 | COMPLETE       | VERIFIED        | `P_ISSUE_SEO`, `P_ARTICLE_SEO`, `P_SITEMAP` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-010      | US1/US2 / public-reading                 | T040, T041                                                                                                 | COMPLETE       | VERIFIED        | `P_SHARE`              | —              | NONE_FOR_CURRENT_SLICE              |
| FR-011      | US3 / editorial-publication-rights       | T042, T043, T044, T045, T046, T047, T048, T049, T050, T051, T052, T053, T054, T055                         | PLANNED        | PARTIAL         | `P_WORKFLOW`           | `DEV-T085-030` | BLOCKS_T086_UNLESS_ADJUDICATED      |
| FR-012      | US3 / editorial-publication-rights       | T042, T045, T046, T050, T054, T055, T056                                                                   | COMPLETE       | VERIFIED        | `P_REVISION`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-013      | US3 / editorial-publication-rights       | T042, T045, T046, T054, T055                                                                               | COMPLETE       | VERIFIED        | `P_WORKFLOW`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-014      | US3 / editorial-publication-rights       | T042, T043, T044, T046, T053, T054, T055                                                                   | COMPLETE       | VERIFIED        | `P_ROLE`               | —              | NONE_FOR_CURRENT_SLICE              |
| FR-015      | US3 / editorial-publication-rights       | T042, T043, T044, T046, T054                                                                               | COMPLETE       | VERIFIED        | `P_SCHEDULE`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-016      | US3 / editorial-publication-rights       | T042, T043, T045, T054, T056                                                                               | COMPLETE       | VERIFIED        | `P_IDEMPOTENCY`        | —              | NONE_FOR_CURRENT_SLICE              |
| FR-017      | US3 / editorial-publication-rights       | T044, T045, T052                                                                                           | COMPLETE       | VERIFIED        | `P_ORDER`              | —              | NONE_FOR_CURRENT_SLICE              |
| FR-018      | US3 / editorial-publication-rights       | T043, T044, T046, T050, T051                                                                               | COMPLETE       | VERIFIED        | `P_CONFLICT`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-019      | US3 / editorial-publication-rights       | T013, T017, T042, T043, T044, T045, T046, T054, T055                                                       | PLANNED        | PARTIAL         | `P_AUDIT`              | `DEV-T085-031` | BLOCKS_T086_UNLESS_ADJUDICATED      |
| FR-020      | US3 / editorial-publication-rights       | T032, T042, T045, T050, T054, T055, T056                                                                   | COMPLETE       | VERIFIED        | `P_REVISION_IMMUTABLE`, `P_REVISION_CANONICAL`, `P_REVISION_VISIBLE` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-021      | US3 / editorial-publication-rights       | T019, T043, T048, T049                                                                                     | COMPLETE       | VERIFIED        | `P_UPLOAD`             | —              | NONE_FOR_CURRENT_SLICE              |
| FR-022      | US3 / editorial-publication-rights       | T019, T020, T042, T043, T047, T048, T049                                                                   | COMPLETE       | VERIFIED        | `P_MEDIA_METADATA`     | —              | NONE_FOR_CURRENT_SLICE              |
| FR-023      | US3 / editorial-publication-rights       | T042, T043, T047, T056                                                                                     | COMPLETE       | VERIFIED        | `P_RIGHTS`             | —              | NONE_FOR_CURRENT_SLICE              |
| FR-024      | US3 / editorial-publication-rights       | T020                                                                                                       | COMPLETE       | VERIFIED        | `P_PROCESSING`         | —              | NONE_FOR_CURRENT_SLICE              |
| FR-025      | US3 / editorial-publication-rights       | T055, T056, T071, T072, T073, T074, T075, T076                                                             | PLANNED        | PARTIAL         | `P_WITHDRAW`           | `DEV-T085-032` | BLOCKS_T086_UNLESS_ADJUDICATED      |
| FR-026      | US4 / search-discovery                   | T057, T058, T059, T060, T061, T062                                                                         | PLANNED        | PARTIAL         | `P_SEARCH`             | `DEV-T085-033` | BLOCKS_P2_ACCEPTANCE_NOT_T085       |
| FR-027      | US4 / search-discovery                   | T057, T058, T059, T060, T061                                                                               | PLANNED        | PARTIAL         | `P_SEARCH`             | `DEV-T085-033` | BLOCKS_P2_ACCEPTANCE_NOT_T085       |
| FR-028      | US4 / search-discovery                   | T057, T058, T060, T061, T062, T063                                                                         | PLANNED        | PARTIAL         | `P_SEARCH`             | `DEV-T085-034` | BLOCKS_P2_ACCEPTANCE_NOT_T085       |
| FR-029      | US4 / search-discovery                   | T057, T058, T059, T060, T061, T062, T063                                                                   | PLANNED        | PARTIAL         | `P_SEARCH`             | `DEV-T085-034` | BLOCKS_P2_ACCEPTANCE_NOT_T085       |
| FR-030      | US4 / search-discovery                   | T056, T057, T060, T063, T083                                                                               | COMPLETE       | PARTIAL         | `P_SEARCH_FRESH`       | `DEV-T085-016` | BLOCKS_P2_ACCEPTANCE_NOT_T085       |
| FR-031      | FOUNDATION/US5 / identity-reader-library | T011, T015, T016, T023                                                                                     | COMPLETE       | VERIFIED        | `P_OIDC`               | —              | NONE_FOR_CURRENT_SLICE              |
| FR-032      | FOUNDATION/US5 / identity-reader-library | T013, T015, T016, T023, T042, T043, T044, T053, T080                                                       | COMPLETE       | VERIFIED        | `P_ROLES`              | —              | NONE_FOR_CURRENT_SLICE              |
| FR-033      | FOUNDATION/US5 / identity-reader-library | T064, T065, T066, T067, T068, T070                                                                         | COMPLETE       | VERIFIED        | `P_BOOKMARK`           | —              | NONE_FOR_CURRENT_SLICE              |
| FR-034      | FOUNDATION/US5 / identity-reader-library | T064, T065, T066, T067, T068, T069, T070                                                                   | COMPLETE       | VERIFIED        | `P_SYNC_PROGRESS`      | —              | NONE_FOR_CURRENT_SLICE              |
| FR-035      | FOUNDATION/US5 / identity-reader-library | T064, T065, T069, T070                                                                                     | COMPLETE       | VERIFIED        | `P_ERASURE`            | —              | NONE_FOR_CURRENT_SLICE              |
| FR-036      | US6 / offline-lifecycle                  | T071, T072, T073, T074, T075, T076                                                                         | COMPLETE       | VERIFIED        | `P_OFFLINE_MANIFEST`   | —              | NONE_FOR_CURRENT_SLICE              |
| FR-037      | US6 / offline-lifecycle                  | T071, T072, T074, T075                                                                                     | COMPLETE       | VERIFIED        | `P_OFFLINE_ATOMIC`     | —              | NONE_FOR_CURRENT_SLICE              |
| FR-038      | US6 / offline-lifecycle                  | T071, T072, T074, T076                                                                                     | COMPLETE       | VERIFIED        | `P_OFFLINE_RECONCILE`  | —              | NONE_FOR_CURRENT_SLICE              |
| FR-039      | US6 / offline-lifecycle                  | T071, T074, T075                                                                                           | COMPLETE       | VERIFIED        | `P_OFFLINE_LOCAL_MANAGE` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-040      | CROSS_CUT / quality-security-operations  | T009, T010, T023, T032, T036, T037, T080                                                                   | COMPLETE       | VERIFIED        | `P_CONTENT_VALIDATION` | —              | NONE_FOR_CURRENT_SLICE              |
| FR-041      | CROSS_CUT / quality-security-operations  | T011, T019, T023, T080                                                                                     | PLANNED        | PARTIAL         | `P_RATE_LIMIT`         | `DEV-T085-035` | BLOCKS_T086_UNLESS_ADJUDICATED      |
| FR-042      | CROSS_CUT / quality-security-operations  | T011, T012, T014, T016, T023, T043                                                                         | COMPLETE       | PARTIAL         | `P_PROBLEM`            | `DEV-T085-037` | BLOCKS_T086_UNLESS_ADJUDICATED      |
| FR-043      | CROSS_CUT / quality-security-operations  | T003, T006, T008, T010, T012, T022, T024, T025, T032, T033, T042, T043, T044, T057, T064, T071, T078, T079 | COMPLETE       | VERIFIED        | `P_CI`                 | —              | NONE_FOR_CURRENT_SLICE              |
| FR-044      | CROSS_CUT / quality-security-operations  | T018, T021, T056, T060, T083                                                                               | COMPLETE       | PARTIAL         | `P_OBSERVABILITY`      | `DEV-T085-029` | PRODUCTION_ACTIVATION_EVIDENCE_OPEN |
| FR-045      | CROSS_CUT / quality-security-operations  | T081                                                                                                       | COMPLETE       | PARTIAL         | `P_BACKUP`             | `DEV-T085-028` | PRODUCTION_ACTIVATION_EVIDENCE_OPEN |
| FR-046      | US2 / progressive-creative-runtime       | T002, T025, T029, T033, T038, T041, T078, T079                                                             | COMPLETE       | VERIFIED        | `P_REDUCED`            | —              | NONE_FOR_CURRENT_SLICE              |
| FR-047      | US2 / progressive-creative-runtime       | T009, T010, T022, T023, T033, T036, T037, T041, T080                                                       | COMPLETE       | VERIFIED        | `P_CREATIVE_SECURITY`  | —              | NONE_FOR_CURRENT_SLICE              |
| FR-048      | US2 / progressive-creative-runtime       | T033, T037, T041, T079                                                                                     | COMPLETE       | VERIFIED        | `P_LIFECYCLE`          | —              | NONE_FOR_CURRENT_SLICE              |
| FR-049      | US7 / optional-provenance-wallet         | T087, T089, T090, T094, T096                                                                               | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-050      | US7 / optional-provenance-wallet         | T087, T089, T091, T096                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-051      | US7 / optional-provenance-wallet         | T088, T090, T093, T095, T096                                                                               | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-052      | US7 / optional-provenance-wallet         | T080, T088, T091, T092, T093, T094, T095, T096                                                             | PLANNED        | PARTIAL         | `P_OIDC_FALLBACK`      | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-053      | US7 / optional-provenance-wallet         | T017, T080, T087, T089, T091, T092, T096                                                                   | PLANNED        | PARTIAL         | `P_WEB_SECURITY`       | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-054      | US8 / basketball-domain                  | T097, T098, T099, T100                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-055      | US8 / basketball-domain                  | T097, T098, T099, T100                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-056      | US8 / basketball-domain                  | T097, T098, T100                                                                                           | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-057      | US8 / basketball-domain                  | T059, T097, T098, T100                                                                                     | PLANNED        | PARTIAL         | `P_TAXONOMY_PROXY`     | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-058      | US8 / basketball-domain                  | T097, T098, T099, T100                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-059      | US8 / basketball-domain                  | T097, T099, T100                                                                                           | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-060      | US8 / basketball-domain                  | T097, T099, T100                                                                                           | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-061      | US9 / evidence-layer                     | T097, T101, T103, T104                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-062      | US9 / evidence-layer                     | T097, T101, T102, T103                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-063      | US9 / evidence-layer                     | T097, T101, T102, T103                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-064      | US9 / evidence-layer                     | T097, T101, T102, T103, T104                                                                               | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-065      | US7/US11 / edition-provenance            | T087, T089, T090, T091, T092, T093, T094, T096, T097, T107, T108, T109                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-066      | US10/US11 / passport-credential-rights   | T097, T105, T106, T108, T110, T111                                                                         | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-067      | US10/US11 / passport-credential-rights   | T105, T106                                                                                                 | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-068      | US10/US11 / passport-credential-rights   | T093, T095, T105, T106, T107                                                                               | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-069      | US10/US11 / passport-credential-rights   | T105, T106, T109                                                                                           | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-070      | US10/US11 / passport-credential-rights   | T092, T096, T108, T109                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-071      | US10/US11 / passport-credential-rights   | T087, T088, T095, T109                                                                                     | PLANNED        | PLANNED_BLOCKED | planned target only    | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-072      | US10/US11 / passport-credential-rights   | T047, T055, T076, T109, T111, T112                                                                         | PLANNED        | PARTIAL         | `P_MEDIA_REVOKE`       | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-073      | US12 / season-recap-fallback             | T037, T041, T097, T110, T112                                                                               | PLANNED        | PARTIAL         | `P_LIFECYCLE`          | `DEV-T085-024` | BLOCKS_FUTURE_SLICE_NOT_T085        |
| FR-074      | US12 / season-recap-fallback             | T030, T031, T032, T033, T034, T035, T036, T037, T038, T039, T040, T041, T080, T107, T109, T112             | PLANNED        | PARTIAL         | `P_NO_JS`              | `DEV-T085-024` | BLOCKS_FUTURE_SLICE_NOT_T085        |

## Success criteria

| Criterion | Story / slice                    | Tasks                                                                              | Implementation | Evidence        | Proof                 | Deviation      | Release impact                            |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------- | -------------- | --------------- | --------------------- | -------------- | ----------------------------------------- |
| SC-001    | P1_RELEASE / measurable-outcome  | T025                                                                               | COMPLETE       | HUMAN_OPEN      | `P_US1_BROWSER`       | `DEV-T085-013` | RELEASE_OWNER_HUMAN_EVIDENCE_DECISION     |
| SC-002    | P1_RELEASE / measurable-outcome  | T041, T079, T083                                                                   | COMPLETE       | PROXY_ONLY      | `P_PERFORMANCE_PROXY` | `DEV-T085-014` | PRODUCTION_ACTIVATION_EVIDENCE_OPEN       |
| SC-003    | P1_RELEASE / measurable-outcome  | T004, T030, T033, T038, T041                                                       | COMPLETE       | PARTIAL         | `P_NO_JS`             | `DEV-T085-036` | BLOCKS_T086_UNLESS_ADJUDICATED            |
| SC-004    | P1_RELEASE / measurable-outcome  | T044, T052, T053, T077                                                             | COMPLETE       | HUMAN_OPEN      | `P_IDEMPOTENCY`       | `DEV-T085-015` | RELEASE_OWNER_HUMAN_EVIDENCE_DECISION     |
| SC-005    | P1_RELEASE / measurable-outcome  | T042, T043, T047, T056, T077                                                       | COMPLETE       | VERIFIED        | `P_RIGHTS_VALID`, `P_RIGHTS_MISSING`, `P_RIGHTS_EXPIRED`, `P_RIGHTS_REVOKED`, `P_RIGHTS_CHANNEL`, `P_RIGHTS_EXECUTION` | —              | NONE_FOR_CURRENT_SLICE                    |
| SC-006    | P1_RELEASE / measurable-outcome  | T031, T055, T056, T060, T063, T076, T083                                           | COMPLETE       | PARTIAL         | `P_SEARCH_WITHDRAW`   | `DEV-T085-016` | BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED |
| SC-007    | P1_RELEASE / measurable-outcome  | T025, T041, T078                                                                   | COMPLETE       | HUMAN_OPEN      | `P_ACCESS_BOUNDARY`   | `DEV-T085-017` | RELEASE_OWNER_HUMAN_EVIDENCE_DECISION     |
| SC-008    | P1_RELEASE / measurable-outcome  | T079, T083                                                                         | COMPLETE       | PROXY_ONLY      | `P_PERFORMANCE_PROXY` | `DEV-T085-026` | BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED |
| SC-009    | P1_RELEASE / measurable-outcome  | T042, T043, T054, T056                                                             | COMPLETE       | PARTIAL         | `P_IDEMPOTENCY`       | `DEV-T085-027` | BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED |
| SC-010    | P1_RELEASE / measurable-outcome  | T081                                                                               | COMPLETE       | VERIFIED        | `P_BACKUP_GATE`, `P_BACKUP_RECEIPT_READBACK` | —              | NONE_FOR_CURRENT_SLICE                    |
| SC-011    | P1_RELEASE / measurable-outcome  | T084                                                                               | COMPLETE       | EXTERNAL_OPEN   | `P_ANALYTICS_PROXY`   | `DEV-T085-018` | POST_LAUNCH_MEASUREMENT_OPEN              |
| SC-012    | P1_RELEASE / measurable-outcome  | T086                                                                               | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-019` | BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED |
| SC-013    | US2 / progressive-enhancement    | T025, T029, T033, T036, T037, T038, T039, T040, T041, T078, T079                   | COMPLETE       | PARTIAL         | `P_REDUCED`, `P_NO_JS` | `DEV-T085-036` | BLOCKS_T086_UNLESS_ADJUDICATED            |
| SC-014    | US2 / progressive-enhancement    | T033, T036, T037, T041, T079                                                       | COMPLETE       | VERIFIED        | `P_NO_P5`, `P_LIFECYCLE`, `P_SSR_POSTER`, `P_ACCESSIBLE_FALLBACK` | —              | NONE_FOR_CURRENT_SLICE                    |
| SC-015    | US7 / optional-provenance-wallet | T080, T087, T089, T096                                                             | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-016    | US7 / optional-provenance-wallet | T080, T088, T093, T095, T096                                                       | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-020` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-017    | US8 / basketball-domain          | T098, T099, T100                                                                   | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-018    | US8 / basketball-domain          | T098, T099, T100                                                                   | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-021` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-019    | US9 / evidence-layer             | T101, T102, T103, T104                                                             | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-020    | US9 / evidence-layer             | T101, T102, T103, T104                                                             | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-022` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-021    | US10/US11 / passport-credential  | T105, T106                                                                         | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-022    | US10/US11 / passport-credential  | T080, T087, T088, T089, T090, T091, T092, T093, T094, T095, T096, T107, T108, T109 | PLANNED        | PLANNED_BLOCKED | `P_OIDC_FALLBACK`     | `DEV-T085-023` | BLOCKS_FUTURE_SLICE_NOT_T085              |
| SC-023    | US12 / season-recap              | T109, T110, T111, T112                                                             | PLANNED        | PLANNED_BLOCKED | planned target only   | `DEV-T085-024` | BLOCKS_FUTURE_SLICE_NOT_T085              |

## Task reverse-ledger coverage

The machine contract below deterministically inverts every forward mapping and classifies exactly T001–T112. Current source status is T001–T084 plus T097 checked; T085–T096 and T098–T112 remain open. Enabling or governance rows may have an explicit `orphan_reason`; delivery rows are never silently treated as proof.

| Task range | Classification                   | Source status        |
| ---------- | -------------------------------- | -------------------- |
| T001–T023  | Foundation / contracts           | checked              |
| T024–T076  | Current tests and implementation | checked              |
| T077–T084  | Current quality gates            | checked              |
| T085       | Traceability control             | open                 |
| T086       | Beta release gate                | open, not dispatched |
| T087–T096  | Future US7                       | open                 |
| T097       | Spec-only alignment              | checked              |
| T098–T112  | Future US8–US12                  | open                 |

## Deviation register

| ID           | Type                    | Severity | State    | Affected                                                                       | Disposition / target                                                                                                                             | Release impact                 |
| ------------ | ----------------------- | -------- | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| DEV-T085-001 | MISSING_ARTIFACT        | HIGH     | RESOLVED | T085                                                                           | Resolved by the T085 matrix. Target: T085 implementation.                                                                                        | NONE                           |
| DEV-T085-002 | MISSING_ENFORCEMENT     | HIGH     | RESOLVED | T085                                                                           | Resolved by mutation-tested contract:traceability wiring. Target: T085 implementation.                                                           | NONE                           |
| DEV-T085-003 | STRUCTURE_DRIFT         | MEDIUM   | RESOLVED | T085                                                                           | Corrected in plan.md in this change. Target: T085 implementation.                                                                                | NONE                           |
| DEV-T085-004 | STATUS_MISMATCH         | HIGH     | RESOLVED | T085                                                                           | Qualified as T085 controlled with open evidence states. Target: T085 implementation.                                                             | NONE                           |
| DEV-T085-005 | STALE_PATH              | LOW      | OPEN     | T024                                                                           | Use the current locator in this matrix; do not patch runtime. Target: Documentation reconciliation.                                              | NONE                           |
| DEV-T085-006 | STALE_PATH              | LOW      | OPEN     | T025                                                                           | Use current locators; preserve historical task prose. Target: Documentation reconciliation.                                                      | NONE                           |
| DEV-T085-007 | STALE_PATH              | LOW      | OPEN     | T028                                                                           | Use current semantic proof; no runtime move. Target: Documentation reconciliation.                                                               | NONE                           |
| DEV-T085-008 | STALE_PATH              | LOW      | OPEN     | T029                                                                           | Use current semantic proof; no runtime move. Target: Documentation reconciliation.                                                               | NONE                           |
| DEV-T085-009 | STALE_PATH              | LOW      | OPEN     | T031                                                                           | Use current issue-seo proof. Target: Documentation reconciliation.                                                                               | NONE                           |
| DEV-T085-010 | STALE_PATH              | LOW      | OPEN     | T054                                                                           | Use current idempotency and worker proof; no runtime consolidation. Target: Documentation reconciliation.                                        | NONE                           |
| DEV-T085-011 | STALE_PATH              | LOW      | OPEN     | T055                                                                           | Use current semantic proof; no runtime rename. Target: Documentation reconciliation.                                                             | NONE                           |
| DEV-T085-012 | STALE_PATH              | LOW      | OPEN     | T080                                                                           | Use the current exact file. Target: Documentation reconciliation.                                                                                | NONE                           |
| DEV-T085-013 | HUMAN_EVIDENCE_REQUIRED | HIGH     | OPEN     | SC-001                                                                         | Keep HUMAN_OPEN; do not dispatch participants in T085. Target: Separate participant-research authorization.                                      | RELEASE_OWNER_DECISION         |
| DEV-T085-014 | PROXY_ONLY              | HIGH     | OPEN     | SC-002                                                                         | Keep PROXY_ONLY until production measurement is separately authorized. Target: Post-activation RUM receipt.                                      | PRODUCTION_ACTIVATION_OPEN     |
| DEV-T085-015 | HUMAN_EVIDENCE_REQUIRED | MEDIUM   | OPEN     | SC-004                                                                         | Keep HUMAN_OPEN; no participant dispatch. Target: Separate editorial usability authorization.                                                    | RELEASE_OWNER_DECISION         |
| DEV-T085-016 | PARTIAL_ACCEPTANCE      | HIGH     | OPEN     | FR-030, SC-006                                                                 | Keep PARTIAL and require a bounded multi-surface acceptance receipt. Target: T086 release checklist.                                             | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-017 | HUMAN_EVIDENCE_REQUIRED | HIGH     | OPEN     | SC-007                                                                         | Never promote waiver or agent inference to native PASS. Target: Release-owner accessibility decision.                                            | RELEASE_OWNER_DECISION         |
| DEV-T085-018 | EXTERNAL_OPEN           | MEDIUM   | OPEN     | SC-011                                                                         | Measure post-launch only after separate provider/production approval. Target: Post-launch product measurement.                                   | POST_LAUNCH_OPEN               |
| DEV-T085-019 | PLANNED_BLOCKED         | HIGH     | OPEN     | SC-012                                                                         | Keep blocked; T085 must not create release.yml or run T086. Target: T086.                                                                        | BLOCKS_T086                    |
| DEV-T085-020 | FUTURE_SLICE            | HIGH     | OPEN     | FR-049, FR-050, FR-051, FR-052, FR-053, SC-015, SC-016                         | Keep planned/partial without starting Web3. Target: US7 dispatch.                                                                                | BLOCKS_FUTURE_SLICE            |
| DEV-T085-021 | FUTURE_SLICE            | HIGH     | OPEN     | FR-054, FR-055, FR-056, FR-057, FR-058, FR-059, FR-060, SC-017, SC-018         | Keep planned/partial without starting domain runtime. Target: US8 dispatch.                                                                      | BLOCKS_FUTURE_SLICE            |
| DEV-T085-022 | FUTURE_SLICE            | HIGH     | OPEN     | FR-061, FR-062, FR-063, FR-064, SC-019, SC-020                                 | Keep planned; no source or participant research execution. Target: US9 dispatch.                                                                 | BLOCKS_FUTURE_SLICE            |
| DEV-T085-023 | FUTURE_SLICE            | HIGH     | OPEN     | FR-065, FR-066, FR-067, FR-068, FR-069, FR-070, FR-071, FR-072, SC-021, SC-022 | Keep planned/partial with every external write flag off. Target: US10/US11 dispatch.                                                             | BLOCKS_FUTURE_SLICE            |
| DEV-T085-024 | FUTURE_SLICE            | HIGH     | OPEN     | FR-073, FR-074, SC-023                                                         | Keep partial/planned; do not start recap or archive work. Target: US12 dispatch.                                                                 | BLOCKS_FUTURE_SLICE            |
| DEV-T085-025 | RECEIPT_DRIFT           | MEDIUM   | OPEN     | T074, T075, T076, T077, T078, T079                                             | Treat historical prose as non-authoritative; use protected-main receipts and current tests in this matrix. Target: Documentation reconciliation. | NONE                           |
| DEV-T085-026 | PROXY_ONLY              | HIGH     | OPEN     | SC-008                                                                         | Keep PROXY_ONLY until the precise benchmark is captured. Target: T086 performance acceptance.                                                    | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-027 | PARTIAL_ACCEPTANCE      | MEDIUM   | OPEN     | SC-009                                                                         | Keep PARTIAL until an exact ten-retry test/receipt exists. Target: T086 publication acceptance.                                                  | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-028 | EXTERNAL_OPEN           | HIGH     | OPEN     | FR-045                                                                         | Keep PARTIAL; do not activate production from T085. Target: Production operations approval.                                                      | PRODUCTION_ACTIVATION_OPEN     |
| DEV-T085-029 | EXTERNAL_OPEN           | MEDIUM   | OPEN     | FR-044                                                                         | Keep PARTIAL; activation requires separate provider and production approval. Target: Observability activation approval.                          | PRODUCTION_ACTIVATION_OPEN     |
| DEV-T085-030 | EDITORIAL_CAPABILITY_GAP | HIGH    | OPEN     | FR-011                                                                         | Author/contributor CRUD, preview and archive remain absent. Target: separately scoped editorial remediation.                                     | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-031 | AUDIT_COVERAGE_GAP      | HIGH     | OPEN     | FR-019                                                                         | Role-change and permission-failure audit paths are not evidenced. Target: separately scoped audit remediation.                                  | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-032 | ASSET_REVOCATION_OFFLINE_IMPACT_GAP | HIGH | OPEN | FR-025                                                                         | Asset revoke identifies articles but not affected offline packages. Target: separately scoped revocation remediation.                           | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-033 | TAXONOMY_SCOPE_GAP      | MEDIUM   | OPEN     | FR-026, FR-027                                                                 | Event/match taxonomy and immutable historical display context are absent. Target: P2 taxonomy completion.                                        | BLOCKS_P2_ACCEPTANCE_NOT_T085  |
| DEV-T085-034 | SEARCH_CAPABILITY_GAP   | MEDIUM   | OPEN     | FR-028, FR-029                                                                 | Author indexing plus issue/date filters are absent. Target: P2 search completion.                                                               | BLOCKS_P2_ACCEPTANCE_NOT_T085  |
| DEV-T085-035 | RATE_LIMIT_ENFORCEMENT_GAP | HIGH  | OPEN     | FR-041                                                                         | Route policy exists without an enforcing limiter/filter across required surfaces. Target: P1 security remediation.                              | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-036 | NO_JS_ACCEPTANCE_GAP    | HIGH     | OPEN     | SC-003, SC-013                                                                 | Current no-JS proof does not assert every required content and navigation clause. Target: T086 reader acceptance.                                | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-037 | WRITE_API_CONTRACT_COVERAGE_GAP | HIGH | OPEN | FR-042                                                                         | Shared primitives are tested, but every write API is not enumerated under the same error/request-ID/locking proof.                               | BLOCKS_T086_UNLESS_ADJUDICATED |
| DEV-T085-038 | TASK_SOURCE_DRIFT       | MEDIUM   | OPEN     | T032, T042                                                                     | Task prose claims broader FR ranges than the evidence-backed matrix. Target: documentation reconciliation without runtime changes.               | NONE                           |

## Exact-head acceptance and protected-merge boundary

A release-owner decision may move this draft out of HOLD only after one immutable PR head has: (1) CI 5/5 and Security 8/8; (2) the generated `artifacts/frontend/t085-traceability-report.json` read back from the `ci-frontend-reports` artifact with matching head SHA and artifact digest; (3) 97/97 mapped requirements, 112/112 classified tasks, zero validator errors, and the open deviations above unchanged or explicitly adjudicated; (4) zero unresolved review threads; and (5) current protected-main mergeability under ruleset #20822671.

The tracked document does not self-reference a final commit SHA. Exact-head attribution belongs in the generated report and GitHub artifact/read-back. Ready-for-review, protected merge, checking T085, closing issue #145, or starting T086 requires separate release-owner authorization.

## Machine-readable contract

<!-- t085:contract:start -->

```json
{
  "schema_version": "courtside-traceability/v1",
  "repository": "bynanci/courtside-tw",
  "authorized_base_sha": "3fc14dd29b216ce46e4d364ceaec79a971dcef44",
  "source_inventory": {
    "spec": "specs/001-taiwan-basketball-magazine-ebook/spec.md",
    "plan": "specs/001-taiwan-basketball-magazine-ebook/plan.md",
    "tasks": "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
    "functional_requirements": 74,
    "success_criteria": 23,
    "tasks_total": 112,
    "tasks_checked": 85,
    "tasks_unchecked": 27
  },
  "lifecycle": {
    "phase": "T085_IMPLEMENTATION",
    "task": "T085",
    "t085_complete": false,
    "t086_dispatched": false,
    "participant_research_executed": false,
    "web3_activated": false,
    "production_activated": false,
    "provider_configured": false,
    "secrets_changed": false
  },
  "requirements": [
    {
      "id": "FR-001",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T024", "T027", "T028", "T029", "T030", "T031"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_US1_LIST",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",
          "selector": "listsOnlyPublishedRightsValidIssuesWithBoundedOpaqueKeysetPaginationAndEtags"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-002",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T024", "T026", "T027", "T028", "T029", "T030"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_US1_TOC",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",
          "selector": "returnsVisibleSectionsAndArticlesInEditorOrderWithoutDraftMetadata"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-003",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T024", "T027", "T028", "T030"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_US1_DENY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",
          "selector": "returnsSafeProblemDetailsForUnknownWithdrawnAndInvalidPublicRequests"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-004",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T032", "T034", "T035", "T038", "T041"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ARTICLE_READER",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-read-article.spec.ts",
          "selector": "renders every v1 block, metadata, image fallback, navigation and share"
        },
        {
          "id": "P_ARTICLE_REFLOW",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/t078-accessibility-release.spec.ts",
          "selector": "reader surfaces reflow at"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-005",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T009", "T010", "T032", "T033", "T036", "T037", "T038"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_CONTENT_BLOCKS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/component/content-blocks/registry.test.ts",
          "selector": "registry resolves every canonical v1 block through an explicit renderer key"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-006",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T032", "T034", "T035", "T038"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ARTICLE_METADATA",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-read-article.spec.ts",
          "selector": "renders every v1 block, metadata, image fallback, navigation and share"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-007",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T032", "T033", "T035", "T040"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ARTICLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/content/api/PublicArticleApiIT.java",
          "selector": "returnsPublishedRevisionAndIssueNavigation"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-008",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T033", "T039", "T064", "T065", "T066", "T067", "T068", "T069", "T070"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_LOCAL_PROGRESS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-read-article.spec.ts",
          "selector": "offers explicit continue or start-over actions before restoring a stable anchor"
        },
        {
          "id": "P_SYNC_PROGRESS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",
          "selector": "progressIsRevisionAwareAndMergeRequiresExplicitApply"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-009",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T031", "T041"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ISSUE_SEO",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us1-browse-issue.spec.ts",
          "selector": "a mobile reader reaches an article shell from Home in two activations"
        },
        {
          "id": "P_ARTICLE_SEO",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/unit/reader/article-seo.test.ts",
          "selector": "article SEO binds canonical, Open Graph and structured data to the public projection"
        },
        {
          "id": "P_SITEMAP",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us1-browse-issue.spec.ts",
          "selector": "robots and sitemap expose only the public reading surface"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-010",
      "story": "US1/US2",
      "priority": "P1",
      "slice": "public-reading",
      "task_ids": ["T040", "T041"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_SHARE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/component/reader/reader-components.test.ts",
          "selector": "share prefers native share and falls back to clipboard after failure"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-011",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": [
        "T042",
        "T043",
        "T044",
        "T045",
        "T046",
        "T047",
        "T048",
        "T049",
        "T050",
        "T051",
        "T052",
        "T053",
        "T054",
        "T055"
      ],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_WORKFLOW",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java",
          "selector": "editorSubmitsAndPublisherApprovesOnlyAfterRightsAreReady"
        }
      ],
      "deviation_ids": ["DEV-T085-030"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "FR-012",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T045", "T046", "T050", "T054", "T055", "T056"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_REVISION",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "editorCreatesARevisionWithoutMutatingThePublishedSnapshotReference"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-013",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T045", "T046", "T054", "T055"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_WORKFLOW",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java",
          "selector": "editorSubmitsAndPublisherApprovesOnlyAfterRightsAreReady"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-014",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T043", "T044", "T046", "T053", "T054", "T055"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ROLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "roleBoundariesRejectEditorApprovalAndPublisherSubmission"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-015",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T043", "T044", "T046", "T054"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_SCHEDULE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "publisherSchedulePersistsAsiaTaipeiLocalTimeAsUtc"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-016",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T043", "T045", "T054", "T056"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_IDEMPOTENCY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "sameScopedRetryReplaysOneResultAndChangedPayloadConflicts"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-017",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T044", "T045", "T052"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ORDER",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialIssueApiIT.java",
          "selector": "editorCanManageAndReorderSectionsWithAggregateIfMatch"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-018",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T043", "T044", "T046", "T050", "T051"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_CONFLICT",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "editorCanCreateAndConditionallyPatchButStaleIfMatchCannotOverwrite"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-019",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T013", "T017", "T042", "T043", "T044", "T045", "T046", "T054", "T055"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_AUDIT",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "generatedRequestIdIsSharedByAuditAndResponse"
        }
      ],
      "deviation_ids": ["DEV-T085-031"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "FR-020",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T032", "T042", "T045", "T050", "T054", "T055", "T056"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_REVISION_IMMUTABLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "editorCreatesARevisionWithoutMutatingThePublishedSnapshotReference"
        },
        {
          "id": "P_REVISION_CANONICAL",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "submitRejectsContentThatIsNotCanonicalContentDocumentV1"
        },
        {
          "id": "P_REVISION_VISIBLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "submitRejectsCanonicalContentWithoutReaderVisibleText"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-021",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T019", "T043", "T048", "T049"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_UPLOAD",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/api/EditorialMediaUploadApiIT.java",
          "selector": "createsPrivateIntentAndStoresOnlyBoundedUploadMetadata"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-022",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T019", "T020", "T042", "T043", "T047", "T048", "T049"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_MEDIA_METADATA",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/api/EditorialMediaMetadataApiIT.java",
          "selector": "editorPatchPersistsAltTextCreditRightsAndPromotesProcessedAsset"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-023",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T042", "T043", "T047", "T056"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_RIGHTS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "missingRecordBlocksWithStableCode"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-024",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T020"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_PROCESSING",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/processing/MediaProcessingServiceTest.java",
          "selector": "validJpegReachesReadyAfterExifRemovalAndConfiguredVariants"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-025",
      "story": "US3",
      "priority": "P1",
      "slice": "editorial-publication-rights",
      "task_ids": ["T055", "T056", "T071", "T072", "T073", "T074", "T075", "T076"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_WITHDRAW",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/PublicationReliabilityIT.java",
          "selector": "withdrawnOriginDeniesContentBeforeExternalPurgeCompletes"
        }
      ],
      "deviation_ids": ["DEV-T085-032"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "FR-026",
      "story": "US4",
      "priority": "P2",
      "slice": "search-discovery",
      "task_ids": ["T057", "T058", "T059", "T060", "T061", "T062"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "mixedLanguageAndAliasSearchUsesPublishedProjectionAndExcludesWithdrawnResults"
        }
      ],
      "deviation_ids": ["DEV-T085-033"],
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085"
    },
    {
      "id": "FR-027",
      "story": "US4",
      "priority": "P2",
      "slice": "search-discovery",
      "task_ids": ["T057", "T058", "T059", "T060", "T061"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "mixedLanguageAndAliasSearchUsesPublishedProjectionAndExcludesWithdrawnResults"
        }
      ],
      "deviation_ids": ["DEV-T085-033"],
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085"
    },
    {
      "id": "FR-028",
      "story": "US4",
      "priority": "P2",
      "slice": "search-discovery",
      "task_ids": ["T057", "T058", "T060", "T061", "T062", "T063"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "mixedLanguageAndAliasSearchUsesPublishedProjectionAndExcludesWithdrawnResults"
        }
      ],
      "deviation_ids": ["DEV-T085-034"],
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085"
    },
    {
      "id": "FR-029",
      "story": "US4",
      "priority": "P2",
      "slice": "search-discovery",
      "task_ids": ["T057", "T058", "T059", "T060", "T061", "T062", "T063"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "mixedLanguageAndAliasSearchUsesPublishedProjectionAndExcludesWithdrawnResults"
        }
      ],
      "deviation_ids": ["DEV-T085-034"],
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085"
    },
    {
      "id": "FR-030",
      "story": "US4",
      "priority": "P2",
      "slice": "search-discovery",
      "task_ids": ["T056", "T057", "T060", "T063", "T083"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH_FRESH",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "publishedProjectionChangesHaveFreshEtagAndSixtySecondPublicCache"
        }
      ],
      "deviation_ids": ["DEV-T085-016"],
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085"
    },
    {
      "id": "FR-031",
      "story": "FOUNDATION/US5",
      "priority": "P1",
      "slice": "identity-reader-library",
      "task_ids": ["T011", "T015", "T016", "T023"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_OIDC",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/identity/OidcSecurityFoundationTest.java",
          "selector": "rejectsTokenFromUnexpectedIssuer"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-032",
      "story": "FOUNDATION/US5",
      "priority": "P1",
      "slice": "identity-reader-library",
      "task_ids": ["T013", "T015", "T016", "T023", "T042", "T043", "T044", "T053", "T080"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ROLES",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/identity/OidcSecurityFoundationTest.java",
          "selector": "mapsOnlyCanonicalRolesAndDoesNotImplyHigherPrivilege"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-033",
      "story": "FOUNDATION/US5",
      "priority": "P2",
      "slice": "identity-reader-library",
      "task_ids": ["T064", "T065", "T066", "T067", "T068", "T070"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_BOOKMARK",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",
          "selector": "bookmarkIsIdempotentCrossDeviceAndSafeWhenArticleIsWithdrawn"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-034",
      "story": "FOUNDATION/US5",
      "priority": "P2",
      "slice": "identity-reader-library",
      "task_ids": ["T064", "T065", "T066", "T067", "T068", "T069", "T070"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_SYNC_PROGRESS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",
          "selector": "progressIsRevisionAwareAndMergeRequiresExplicitApply"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-035",
      "story": "FOUNDATION/US5",
      "priority": "P2",
      "slice": "identity-reader-library",
      "task_ids": ["T064", "T065", "T069", "T070"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_ERASURE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",
          "selector": "verifiedAccountDeletionRemovesIdentifiableLibraryData"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-036",
      "story": "US6",
      "priority": "P3",
      "slice": "offline-lifecycle",
      "task_ids": ["T071", "T072", "T073", "T074", "T075", "T076"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_OFFLINE_MANIFEST",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/OfflineManifestApiIT.java",
          "selector": "returnsABoundedVersionedManifestForAPublishedIssue"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-037",
      "story": "US6",
      "priority": "P3",
      "slice": "offline-lifecycle",
      "task_ids": ["T071", "T072", "T074", "T075"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_OFFLINE_ATOMIC",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us6-offline-issue.spec.ts",
          "selector": "does not install a partially downloaded issue after interruption"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-038",
      "story": "US6",
      "priority": "P3",
      "slice": "offline-lifecycle",
      "task_ids": ["T071", "T072", "T074", "T076"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_OFFLINE_RECONCILE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us6-offline-issue.spec.ts",
          "selector": "reconciles a withdrawal on reconnect with bounded retry"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-039",
      "story": "US6",
      "priority": "P3",
      "slice": "offline-lifecycle",
      "task_ids": ["T071", "T074", "T075"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_OFFLINE_LOCAL_MANAGE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us6-offline-issue.spec.ts",
          "selector": "shows storage, progress and expiry before removing an issue locally"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-040",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": ["T009", "T010", "T023", "T032", "T036", "T037", "T080"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_CONTENT_VALIDATION",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/content/validation/ContentDocumentValidatorTest.java",
          "selector": "rejectsEveryCanonicalInvalidFixture"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-041",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": ["T011", "T019", "T023", "T080"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_RATE_LIMIT",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/security/SecurityBoundaryTest.java",
          "selector": "keepsRateLimitsRouteSpecificAndIgnoresQueryContent"
        }
      ],
      "deviation_ids": ["DEV-T085-035"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "FR-042",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": ["T011", "T012", "T014", "T016", "T023", "T043"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_PROBLEM",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/shared/SharedFoundationTest.java",
          "selector": "problemDetailsUsesStableContractMetadataAndDoesNotExposeExceptionText"
        }
      ],
      "deviation_ids": ["DEV-T085-037"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "FR-043",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": [
        "T003",
        "T006",
        "T008",
        "T010",
        "T012",
        "T022",
        "T024",
        "T025",
        "T032",
        "T033",
        "T042",
        "T043",
        "T044",
        "T057",
        "T064",
        "T071",
        "T078",
        "T079"
      ],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_CI",
          "kind": "REPOSITORY_PROOF",
          "path": ".github/workflows/ci.yml",
          "selector": "make verify 2>&1 | tee artifacts/frontend/make-verify.log"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-044",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": ["T018", "T021", "T056", "T060", "T083"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_OBSERVABILITY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/shared/observability/ObservabilityMetricsTest.java",
          "selector": "recordsBoundedOperationalSignalsWithoutSensitiveLabels"
        }
      ],
      "deviation_ids": ["DEV-T085-029"],
      "release_impact": "PRODUCTION_ACTIVATION_EVIDENCE_OPEN"
    },
    {
      "id": "FR-045",
      "story": "CROSS_CUT",
      "priority": "P1",
      "slice": "quality-security-operations",
      "task_ids": ["T081"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_BACKUP",
          "kind": "REPOSITORY_PROOF",
          "path": "scripts/test/verify-backup-restore.sh",
          "selector": "T081 restore receipt is not release-ready"
        }
      ],
      "deviation_ids": ["DEV-T085-028"],
      "release_impact": "PRODUCTION_ACTIVATION_EVIDENCE_OPEN"
    },
    {
      "id": "FR-046",
      "story": "US2",
      "priority": "P1",
      "slice": "progressive-creative-runtime",
      "task_ids": ["T002", "T025", "T029", "T033", "T038", "T041", "T078", "T079"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_REDUCED",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-reduced-motion.spec.ts",
          "selector": "reduced motion keeps content visible and creative runtime bounded"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-047",
      "story": "US2",
      "priority": "P1",
      "slice": "progressive-creative-runtime",
      "task_ids": ["T009", "T010", "T022", "T023", "T033", "T036", "T037", "T041", "T080"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_CREATIVE_SECURITY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/security/ContentPayloadBoundaryTest.java",
          "selector": "rejectsForbiddenGenerativeCanvasCapabilitiesAtRuntime"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-048",
      "story": "US2",
      "priority": "P1",
      "slice": "progressive-creative-runtime",
      "task_ids": ["T033", "T037", "T041", "T079"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_LIFECYCLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",
          "selector": "twenty client-side article switches leave no positive per-instance creative lifecycle delta"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "FR-049",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T087", "T089", "T090", "T094", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-050",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T087", "T089", "T091", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-051",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T088", "T090", "T093", "T095", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-052",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T080", "T088", "T091", "T092", "T093", "T094", "T095", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_OIDC_FALLBACK",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/identity/OidcSecurityFallbackTest.java",
          "selector": "keepsPublicReadingAnonymousWhenIssuerIsUnconfigured"
        }
      ],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-053",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T017", "T080", "T087", "T089", "T091", "T092", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_WEB_SECURITY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/integration/t080-security-policy.test.ts",
          "selector": "T080 rejects credential-bearing, local and metadata API origins"
        }
      ],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-054",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T098", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-055",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T098", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-056",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T098", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-057",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T059", "T097", "T098", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_TAXONOMY_PROXY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/PublicSearchApiIT.java",
          "selector": "taxonomyAndSearchSchemaProvidesVersionedAliasesAndTrigramIndexes"
        }
      ],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-058",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T098", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-059",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-060",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T097", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-061",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T097", "T101", "T103", "T104"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-062",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T097", "T101", "T102", "T103"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-063",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T097", "T101", "T102", "T103"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-064",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T097", "T101", "T102", "T103", "T104"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-065",
      "story": "US7/US11",
      "priority": "P2",
      "slice": "edition-provenance",
      "task_ids": [
        "T087",
        "T089",
        "T090",
        "T091",
        "T092",
        "T093",
        "T094",
        "T096",
        "T097",
        "T107",
        "T108",
        "T109"
      ],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-066",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T097", "T105", "T106", "T108", "T110", "T111"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-067",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T105", "T106"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-068",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T093", "T095", "T105", "T106", "T107"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-069",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T105", "T106", "T109"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-070",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T092", "T096", "T108", "T109"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-071",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T087", "T088", "T095", "T109"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-072",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential-rights",
      "task_ids": ["T047", "T055", "T076", "T109", "T111", "T112"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_MEDIA_REVOKE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/api/PublisherMediaRevokeApiIT.java",
          "selector": "publisherRevokeIsConditionalIdempotentAndLeavesImpactLink"
        }
      ],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-073",
      "story": "US12",
      "priority": "P3",
      "slice": "season-recap-fallback",
      "task_ids": ["T037", "T041", "T097", "T110", "T112"],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_LIFECYCLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",
          "selector": "twenty client-side article switches leave no positive per-instance creative lifecycle delta"
        }
      ],
      "deviation_ids": ["DEV-T085-024"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "FR-074",
      "story": "US12",
      "priority": "P3",
      "slice": "season-recap-fallback",
      "task_ids": [
        "T030",
        "T031",
        "T032",
        "T033",
        "T034",
        "T035",
        "T036",
        "T037",
        "T038",
        "T039",
        "T040",
        "T041",
        "T080",
        "T107",
        "T109",
        "T112"
      ],
      "implementation_state": "PLANNED",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_NO_JS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-no-js.spec.ts",
          "selector": "SSR renders article blocks and generative poster without JavaScript"
        }
      ],
      "deviation_ids": ["DEV-T085-024"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-001",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T025"],
      "implementation_state": "COMPLETE",
      "evidence_state": "HUMAN_OPEN",
      "proofs": [
        {
          "id": "P_US1_BROWSER",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us1-browse-issue.spec.ts",
          "selector": "a mobile reader reaches an article shell from Home in two activations"
        }
      ],
      "deviation_ids": ["DEV-T085-013"],
      "release_impact": "RELEASE_OWNER_HUMAN_EVIDENCE_DECISION"
    },
    {
      "id": "SC-002",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T041", "T079", "T083"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PROXY_ONLY",
      "proofs": [
        {
          "id": "P_PERFORMANCE_PROXY",
          "kind": "REPOSITORY_PROOF",
          "path": "docs/quality/performance-baseline.md",
          "selector": "Lighthouse profile"
        }
      ],
      "deviation_ids": ["DEV-T085-014"],
      "release_impact": "PRODUCTION_ACTIVATION_EVIDENCE_OPEN"
    },
    {
      "id": "SC-003",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T004", "T030", "T033", "T038", "T041"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_NO_JS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-no-js.spec.ts",
          "selector": "SSR renders article blocks and generative poster without JavaScript"
        }
      ],
      "deviation_ids": ["DEV-T085-036"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "SC-004",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T044", "T052", "T053", "T077"],
      "implementation_state": "COMPLETE",
      "evidence_state": "HUMAN_OPEN",
      "proofs": [
        {
          "id": "P_IDEMPOTENCY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "sameScopedRetryReplaysOneResultAndChangedPayloadConflicts"
        }
      ],
      "deviation_ids": ["DEV-T085-015"],
      "release_impact": "RELEASE_OWNER_HUMAN_EVIDENCE_DECISION"
    },
    {
      "id": "SC-005",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T042", "T043", "T047", "T056", "T077"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_RIGHTS_VALID",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "validPublicWebRecordAllowsPublication"
        },
        {
          "id": "P_RIGHTS_MISSING",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "missingRecordBlocksWithStableCode"
        },
        {
          "id": "P_RIGHTS_EXPIRED",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "expiredRecordBlocksBeforeItCanBeUsed"
        },
        {
          "id": "P_RIGHTS_REVOKED",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "revokedRecordWinsOverOtherRecords"
        },
        {
          "id": "P_RIGHTS_CHANNEL",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/media/domain/RightsPolicyTest.java",
          "selector": "activeRecordForAnotherChannelBlocksWithWrongChannel"
        },
        {
          "id": "P_RIGHTS_EXECUTION",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/worker/PublicationJobHandlerIT.java",
          "selector": "dueWorkerRechecksRightsAndBlocksWithoutPublishingOrCreatingSnapshot"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "SC-006",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T031", "T055", "T056", "T060", "T063", "T076", "T083"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_SEARCH_WITHDRAW",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/search/worker/SearchProjectionHandlerIT.java",
          "selector": "withdrawalDeactivatesProjectionOnce"
        }
      ],
      "deviation_ids": ["DEV-T085-016"],
      "release_impact": "BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED"
    },
    {
      "id": "SC-007",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T025", "T041", "T078"],
      "implementation_state": "COMPLETE",
      "evidence_state": "HUMAN_OPEN",
      "proofs": [
        {
          "id": "P_ACCESS_BOUNDARY",
          "kind": "REPOSITORY_PROOF",
          "path": "docs/quality/accessibility-test-plan.md",
          "selector": "native rows are WAIVED / NOT_RUN, never PASS"
        }
      ],
      "deviation_ids": ["DEV-T085-017"],
      "release_impact": "RELEASE_OWNER_HUMAN_EVIDENCE_DECISION"
    },
    {
      "id": "SC-008",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T079", "T083"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PROXY_ONLY",
      "proofs": [
        {
          "id": "P_PERFORMANCE_PROXY",
          "kind": "REPOSITORY_PROOF",
          "path": "docs/quality/performance-baseline.md",
          "selector": "Lighthouse profile"
        }
      ],
      "deviation_ids": ["DEV-T085-026"],
      "release_impact": "BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED"
    },
    {
      "id": "SC-009",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T042", "T043", "T054", "T056"],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_IDEMPOTENCY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialPublicationApiIT.java",
          "selector": "sameScopedRetryReplaysOneResultAndChangedPayloadConflicts"
        }
      ],
      "deviation_ids": ["DEV-T085-027"],
      "release_impact": "BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED"
    },
    {
      "id": "SC-010",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T081"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_BACKUP_GATE",
          "kind": "REPOSITORY_PROOF",
          "path": "scripts/test/verify-backup-restore.sh",
          "selector": "T081 restore receipt is not release-ready"
        },
        {
          "id": "P_BACKUP_RECEIPT_READBACK",
          "kind": "REPOSITORY_PROOF",
          "path": ".loop/evidence/t085-review.json",
          "selector": "\"restore_receipt_sha256\": \"e43cdc024bb9317ffbbf4620de237c9578470a5bb38633c798309da8be930210\""
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "SC-011",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T084"],
      "implementation_state": "COMPLETE",
      "evidence_state": "EXTERNAL_OPEN",
      "proofs": [
        {
          "id": "P_ANALYTICS_PROXY",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/unit/analytics/runtime-wiring.test.ts",
          "selector": "default runtime remains inert without an explicit consent store or sink"
        }
      ],
      "deviation_ids": ["DEV-T085-018"],
      "release_impact": "POST_LAUNCH_MEASUREMENT_OPEN"
    },
    {
      "id": "SC-012",
      "story": "P1_RELEASE",
      "priority": "P1",
      "slice": "measurable-outcome",
      "task_ids": ["T086"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-019"],
      "release_impact": "BLOCKS_T086_UNLESS_EXPLICITLY_ADJUDICATED"
    },
    {
      "id": "SC-013",
      "story": "US2",
      "priority": "P1",
      "slice": "progressive-enhancement",
      "task_ids": [
        "T025",
        "T029",
        "T033",
        "T036",
        "T037",
        "T038",
        "T039",
        "T040",
        "T041",
        "T078",
        "T079"
      ],
      "implementation_state": "COMPLETE",
      "evidence_state": "PARTIAL",
      "proofs": [
        {
          "id": "P_REDUCED",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-reduced-motion.spec.ts",
          "selector": "reduced motion keeps content visible and creative runtime bounded"
        },
        {
          "id": "P_NO_JS",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-no-js.spec.ts",
          "selector": "SSR renders article blocks and generative poster without JavaScript"
        }
      ],
      "deviation_ids": ["DEV-T085-036"],
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED"
    },
    {
      "id": "SC-014",
      "story": "US2",
      "priority": "P1",
      "slice": "progressive-enhancement",
      "task_ids": ["T033", "T036", "T037", "T041", "T079"],
      "implementation_state": "COMPLETE",
      "evidence_state": "VERIFIED",
      "proofs": [
        {
          "id": "P_NO_P5",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",
          "selector": "ordinary and reduced-motion reads transfer zero p5 bytes until explicit enable"
        },
        {
          "id": "P_LIFECYCLE",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",
          "selector": "twenty client-side article switches leave no positive per-instance creative lifecycle delta"
        },
        {
          "id": "P_SSR_POSTER",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/us2-no-js.spec.ts",
          "selector": "SSR renders article blocks and generative poster without JavaScript"
        },
        {
          "id": "P_ACCESSIBLE_FALLBACK",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/web/tests/e2e/t078-accessibility-release.spec.ts",
          "selector": "poster and summary are the single accessible creative fallback"
        }
      ],
      "deviation_ids": [],
      "release_impact": "NONE_FOR_CURRENT_SLICE"
    },
    {
      "id": "SC-015",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T080", "T087", "T089", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-016",
      "story": "US7",
      "priority": "P2",
      "slice": "optional-provenance-wallet",
      "task_ids": ["T080", "T088", "T093", "T095", "T096"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-020"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-017",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T098", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-018",
      "story": "US8",
      "priority": "P2",
      "slice": "basketball-domain",
      "task_ids": ["T098", "T099", "T100"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-021"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-019",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T101", "T102", "T103", "T104"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-020",
      "story": "US9",
      "priority": "P2",
      "slice": "evidence-layer",
      "task_ids": ["T101", "T102", "T103", "T104"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-022"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-021",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential",
      "task_ids": ["T105", "T106"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-022",
      "story": "US10/US11",
      "priority": "P2",
      "slice": "passport-credential",
      "task_ids": [
        "T080",
        "T087",
        "T088",
        "T089",
        "T090",
        "T091",
        "T092",
        "T093",
        "T094",
        "T095",
        "T096",
        "T107",
        "T108",
        "T109"
      ],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [
        {
          "id": "P_OIDC_FALLBACK",
          "kind": "REPOSITORY_PROOF",
          "path": "apps/api/src/test/java/tw/basketball/magazine/identity/OidcSecurityFallbackTest.java",
          "selector": "keepsPublicReadingAnonymousWhenIssuerIsUnconfigured"
        }
      ],
      "deviation_ids": ["DEV-T085-023"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    },
    {
      "id": "SC-023",
      "story": "US12",
      "priority": "P3",
      "slice": "season-recap",
      "task_ids": ["T109", "T110", "T111", "T112"],
      "implementation_state": "PLANNED",
      "evidence_state": "PLANNED_BLOCKED",
      "proofs": [],
      "deviation_ids": ["DEV-T085-024"],
      "release_impact": "BLOCKS_FUTURE_SLICE_NOT_T085"
    }
  ],
  "task_ledger": [
    {
      "id": "T001",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": [],
      "orphan_reason": "Enabling or quality/release governance task; no direct requirement claim is inferred."
    },
    {
      "id": "T002",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-046"]
    },
    {
      "id": "T003",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-043"]
    },
    {
      "id": "T004",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["SC-003"]
    },
    {
      "id": "T005",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": [],
      "orphan_reason": "Enabling or quality/release governance task; no direct requirement claim is inferred."
    },
    {
      "id": "T006",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-043"]
    },
    {
      "id": "T007",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": [],
      "orphan_reason": "Enabling or quality/release governance task; no direct requirement claim is inferred."
    },
    {
      "id": "T008",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-043"]
    },
    {
      "id": "T009",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-005", "FR-040", "FR-047"]
    },
    {
      "id": "T010",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-005", "FR-040", "FR-043", "FR-047"]
    },
    {
      "id": "T011",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-031", "FR-041", "FR-042"]
    },
    {
      "id": "T012",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-042", "FR-043"]
    },
    {
      "id": "T013",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-019", "FR-032"]
    },
    {
      "id": "T014",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-042"]
    },
    {
      "id": "T015",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-031", "FR-032"]
    },
    {
      "id": "T016",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-031", "FR-032", "FR-042"]
    },
    {
      "id": "T017",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-019", "FR-053"]
    },
    {
      "id": "T018",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-044"]
    },
    {
      "id": "T019",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-021", "FR-022", "FR-041"]
    },
    {
      "id": "T020",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-022", "FR-024"]
    },
    {
      "id": "T021",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-044"]
    },
    {
      "id": "T022",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-043", "FR-047"]
    },
    {
      "id": "T023",
      "status": "COMPLETE",
      "classification": "FOUNDATION",
      "requirement_ids": ["FR-031", "FR-032", "FR-040", "FR-041", "FR-042", "FR-047"]
    },
    {
      "id": "T024",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": ["FR-001", "FR-002", "FR-003", "FR-043"]
    },
    {
      "id": "T025",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": ["FR-043", "FR-046", "SC-001", "SC-007", "SC-013"]
    },
    {
      "id": "T026",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-002"]
    },
    {
      "id": "T027",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-001", "FR-002", "FR-003"]
    },
    {
      "id": "T028",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-001", "FR-002", "FR-003"]
    },
    {
      "id": "T029",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-001", "FR-002", "FR-046", "SC-013"]
    },
    {
      "id": "T030",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-001", "FR-002", "FR-003", "FR-074", "SC-003"]
    },
    {
      "id": "T031",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-001", "FR-009", "FR-074", "SC-006"]
    },
    {
      "id": "T032",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": [
        "FR-004",
        "FR-005",
        "FR-006",
        "FR-007",
        "FR-020",
        "FR-040",
        "FR-043",
        "FR-074"
      ]
    },
    {
      "id": "T033",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": [
        "FR-005",
        "FR-007",
        "FR-008",
        "FR-043",
        "FR-046",
        "FR-047",
        "FR-048",
        "FR-074",
        "SC-003",
        "SC-013",
        "SC-014"
      ]
    },
    {
      "id": "T034",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-004", "FR-006", "FR-074"]
    },
    {
      "id": "T035",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-004", "FR-006", "FR-007", "FR-074"]
    },
    {
      "id": "T036",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-005", "FR-040", "FR-047", "FR-074", "SC-013", "SC-014"]
    },
    {
      "id": "T037",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": [
        "FR-005",
        "FR-040",
        "FR-047",
        "FR-048",
        "FR-073",
        "FR-074",
        "SC-013",
        "SC-014"
      ]
    },
    {
      "id": "T038",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-004", "FR-005", "FR-006", "FR-046", "FR-074", "SC-003", "SC-013"]
    },
    {
      "id": "T039",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-074", "SC-013"]
    },
    {
      "id": "T040",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-007", "FR-010", "FR-074", "SC-013"]
    },
    {
      "id": "T041",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": [
        "FR-004",
        "FR-009",
        "FR-010",
        "FR-046",
        "FR-047",
        "FR-048",
        "FR-073",
        "FR-074",
        "SC-002",
        "SC-003",
        "SC-007",
        "SC-013",
        "SC-014"
      ]
    },
    {
      "id": "T042",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": [
        "FR-011",
        "FR-012",
        "FR-013",
        "FR-014",
        "FR-015",
        "FR-016",
        "FR-019",
        "FR-020",
        "FR-022",
        "FR-023",
        "FR-032",
        "FR-043",
        "SC-005",
        "SC-009"
      ]
    },
    {
      "id": "T043",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": [
        "FR-011",
        "FR-014",
        "FR-015",
        "FR-016",
        "FR-018",
        "FR-019",
        "FR-021",
        "FR-022",
        "FR-023",
        "FR-032",
        "FR-042",
        "FR-043",
        "SC-005",
        "SC-009"
      ]
    },
    {
      "id": "T044",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": [
        "FR-011",
        "FR-014",
        "FR-015",
        "FR-017",
        "FR-018",
        "FR-019",
        "FR-032",
        "FR-043",
        "SC-004"
      ]
    },
    {
      "id": "T045",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-012", "FR-013", "FR-016", "FR-017", "FR-019", "FR-020"]
    },
    {
      "id": "T046",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-012", "FR-013", "FR-014", "FR-015", "FR-018", "FR-019"]
    },
    {
      "id": "T047",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-022", "FR-023", "FR-072", "SC-005"]
    },
    {
      "id": "T048",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-021", "FR-022"]
    },
    {
      "id": "T049",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-021", "FR-022"]
    },
    {
      "id": "T050",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-012", "FR-018", "FR-020"]
    },
    {
      "id": "T051",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-018"]
    },
    {
      "id": "T052",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-017", "SC-004"]
    },
    {
      "id": "T053",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-011", "FR-014", "FR-032", "SC-004"]
    },
    {
      "id": "T054",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": [
        "FR-011",
        "FR-012",
        "FR-013",
        "FR-014",
        "FR-015",
        "FR-016",
        "FR-019",
        "FR-020",
        "SC-009"
      ]
    },
    {
      "id": "T055",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": [
        "FR-011",
        "FR-012",
        "FR-013",
        "FR-014",
        "FR-019",
        "FR-020",
        "FR-025",
        "FR-072",
        "SC-006"
      ]
    },
    {
      "id": "T056",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": [
        "FR-012",
        "FR-016",
        "FR-020",
        "FR-023",
        "FR-025",
        "FR-030",
        "FR-044",
        "SC-005",
        "SC-006",
        "SC-009"
      ]
    },
    {
      "id": "T057",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": ["FR-026", "FR-027", "FR-028", "FR-029", "FR-030", "FR-043"]
    },
    {
      "id": "T058",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-026", "FR-027", "FR-028", "FR-029"]
    },
    {
      "id": "T059",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-026", "FR-027", "FR-029", "FR-057"]
    },
    {
      "id": "T060",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-026", "FR-027", "FR-028", "FR-029", "FR-030", "FR-044", "SC-006"]
    },
    {
      "id": "T061",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-026", "FR-027", "FR-028", "FR-029"]
    },
    {
      "id": "T062",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-026", "FR-028", "FR-029"]
    },
    {
      "id": "T063",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-028", "FR-029", "FR-030", "SC-006"]
    },
    {
      "id": "T064",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": ["FR-008", "FR-033", "FR-034", "FR-035", "FR-043"]
    },
    {
      "id": "T065",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-033", "FR-034", "FR-035"]
    },
    {
      "id": "T066",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-033", "FR-034"]
    },
    {
      "id": "T067",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-033", "FR-034"]
    },
    {
      "id": "T068",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-033", "FR-034"]
    },
    {
      "id": "T069",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-034", "FR-035"]
    },
    {
      "id": "T070",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-008", "FR-033", "FR-034", "FR-035"]
    },
    {
      "id": "T071",
      "status": "COMPLETE",
      "classification": "TEST",
      "requirement_ids": ["FR-025", "FR-036", "FR-037", "FR-038", "FR-039", "FR-043"]
    },
    {
      "id": "T072",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-025", "FR-036", "FR-037", "FR-038"]
    },
    {
      "id": "T073",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-025", "FR-036"]
    },
    {
      "id": "T074",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-025", "FR-036", "FR-037", "FR-038", "FR-039"]
    },
    {
      "id": "T075",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-025", "FR-036", "FR-037", "FR-039"]
    },
    {
      "id": "T076",
      "status": "COMPLETE",
      "classification": "IMPLEMENTATION",
      "requirement_ids": ["FR-025", "FR-036", "FR-038", "FR-072", "SC-006"]
    },
    {
      "id": "T077",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["SC-004", "SC-005"]
    },
    {
      "id": "T078",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["FR-043", "FR-046", "SC-007", "SC-013"]
    },
    {
      "id": "T079",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["FR-043", "FR-046", "FR-048", "SC-002", "SC-008", "SC-013", "SC-014"]
    },
    {
      "id": "T080",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": [
        "FR-032",
        "FR-040",
        "FR-041",
        "FR-047",
        "FR-052",
        "FR-053",
        "FR-074",
        "SC-015",
        "SC-016",
        "SC-022"
      ]
    },
    {
      "id": "T081",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["FR-045", "SC-010"]
    },
    {
      "id": "T082",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": [],
      "orphan_reason": "Enabling or quality/release governance task; no direct requirement claim is inferred."
    },
    {
      "id": "T083",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["FR-030", "FR-044", "SC-002", "SC-006", "SC-008"]
    },
    {
      "id": "T084",
      "status": "COMPLETE",
      "classification": "QUALITY_GATE",
      "requirement_ids": ["SC-011"]
    },
    {
      "id": "T085",
      "status": "OPEN",
      "classification": "TRACEABILITY",
      "requirement_ids": [],
      "orphan_reason": "T085 is the cross-artifact control itself; it does not substitute for any requirement proof."
    },
    {
      "id": "T086",
      "status": "OPEN",
      "classification": "RELEASE_GATE",
      "requirement_ids": ["SC-012"]
    },
    {
      "id": "T087",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-049", "FR-050", "FR-053", "FR-065", "FR-071", "SC-015", "SC-022"]
    },
    {
      "id": "T088",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-051", "FR-052", "FR-071", "SC-016", "SC-022"]
    },
    {
      "id": "T089",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-049", "FR-050", "FR-053", "FR-065", "SC-015", "SC-022"]
    },
    {
      "id": "T090",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-049", "FR-051", "FR-065", "SC-022"]
    },
    {
      "id": "T091",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-050", "FR-052", "FR-053", "FR-065", "SC-022"]
    },
    {
      "id": "T092",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-052", "FR-053", "FR-065", "FR-070", "SC-022"]
    },
    {
      "id": "T093",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-051", "FR-052", "FR-065", "FR-068", "SC-016", "SC-022"]
    },
    {
      "id": "T094",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-049", "FR-052", "FR-065", "SC-022"]
    },
    {
      "id": "T095",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-051", "FR-052", "FR-068", "FR-071", "SC-016", "SC-022"]
    },
    {
      "id": "T096",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": [
        "FR-049",
        "FR-050",
        "FR-051",
        "FR-052",
        "FR-053",
        "FR-065",
        "FR-070",
        "SC-015",
        "SC-016",
        "SC-022"
      ]
    },
    {
      "id": "T097",
      "status": "COMPLETE",
      "classification": "ALIGNMENT",
      "requirement_ids": [
        "FR-054",
        "FR-055",
        "FR-056",
        "FR-057",
        "FR-058",
        "FR-059",
        "FR-060",
        "FR-061",
        "FR-062",
        "FR-063",
        "FR-064",
        "FR-065",
        "FR-066",
        "FR-073"
      ]
    },
    {
      "id": "T098",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-054", "FR-055", "FR-056", "FR-057", "FR-058", "SC-017", "SC-018"]
    },
    {
      "id": "T099",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-054", "FR-055", "FR-058", "FR-059", "FR-060", "SC-017", "SC-018"]
    },
    {
      "id": "T100",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": [
        "FR-054",
        "FR-055",
        "FR-056",
        "FR-057",
        "FR-058",
        "FR-059",
        "FR-060",
        "SC-017",
        "SC-018"
      ]
    },
    {
      "id": "T101",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-061", "FR-062", "FR-063", "FR-064", "SC-019", "SC-020"]
    },
    {
      "id": "T102",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-062", "FR-063", "FR-064", "SC-019", "SC-020"]
    },
    {
      "id": "T103",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-061", "FR-062", "FR-063", "FR-064", "SC-019", "SC-020"]
    },
    {
      "id": "T104",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-061", "FR-064", "SC-019", "SC-020"]
    },
    {
      "id": "T105",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-066", "FR-067", "FR-068", "FR-069", "SC-021"]
    },
    {
      "id": "T106",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-066", "FR-067", "FR-068", "FR-069", "SC-021"]
    },
    {
      "id": "T107",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-065", "FR-068", "FR-074", "SC-022"]
    },
    {
      "id": "T108",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-065", "FR-066", "FR-070", "SC-022"]
    },
    {
      "id": "T109",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": [
        "FR-065",
        "FR-069",
        "FR-070",
        "FR-071",
        "FR-072",
        "FR-074",
        "SC-022",
        "SC-023"
      ]
    },
    {
      "id": "T110",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-066", "FR-073", "SC-023"]
    },
    {
      "id": "T111",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-066", "FR-072", "SC-023"]
    },
    {
      "id": "T112",
      "status": "OPEN",
      "classification": "FUTURE",
      "requirement_ids": ["FR-072", "FR-073", "FR-074", "SC-023"]
    }
  ],
  "deviations": [
    {
      "id": "DEV-T085-001",
      "type": "MISSING_ARTIFACT",
      "severity": "HIGH",
      "affected_ids": ["T085"],
      "expected": "A versioned traceability.md exists.",
      "observed": "Artifact was absent on authorized base.",
      "disposition": "Resolved by the T085 matrix.",
      "owner": "T085 release owner",
      "target": "T085 implementation",
      "release_impact": "NONE",
      "state": "RESOLVED"
    },
    {
      "id": "DEV-T085-002",
      "type": "MISSING_ENFORCEMENT",
      "severity": "HIGH",
      "affected_ids": ["T085"],
      "expected": "Root verification rejects traceability drift.",
      "observed": "No validator or root command existed on authorized base.",
      "disposition": "Resolved by mutation-tested contract:traceability wiring.",
      "owner": "T085 release owner",
      "target": "T085 implementation",
      "release_impact": "NONE",
      "state": "RESOLVED"
    },
    {
      "id": "DEV-T085-003",
      "type": "STRUCTURE_DRIFT",
      "severity": "MEDIUM",
      "affected_ids": ["T085"],
      "expected": "The plan documentation tree names traceability.md.",
      "observed": "The tree listed only spec.md plan.md and tasks.md.",
      "disposition": "Corrected in plan.md in this change.",
      "owner": "T085 release owner",
      "target": "T085 implementation",
      "release_impact": "NONE",
      "state": "RESOLVED"
    },
    {
      "id": "DEV-T085-004",
      "type": "STATUS_MISMATCH",
      "severity": "HIGH",
      "affected_ids": ["T085"],
      "expected": "Plan traceability status distinguishes design-time intent from acceptance evidence.",
      "observed": "The plan used an unqualified PASS before T085 existed.",
      "disposition": "Qualified as T085 controlled with open evidence states.",
      "owner": "T085 release owner",
      "target": "T085 implementation",
      "release_impact": "NONE",
      "state": "RESOLVED"
    },
    {
      "id": "DEV-T085-005",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T024"],
      "expected": "T024 locator points to the current test.",
      "observed": "Task says publication/api/PublicIssueApiIT.java; current file is publication/PublicIssueApiIT.java.",
      "disposition": "Use the current locator in this matrix; do not patch runtime.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-006",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T025"],
      "expected": "T025 names current accessibility coverage.",
      "observed": "The separate a11y spec is absent; assertions are consolidated in us1-browse-issue.spec.ts and T078.",
      "disposition": "Use current locators; preserve historical task prose.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-007",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T028"],
      "expected": "T028 locator points to current controller/service.",
      "observed": "Task names publication/api/PublicIssueController.java; current controller is in publication/ with PublicIssueService.",
      "disposition": "Use current semantic proof; no runtime move.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-008",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T029"],
      "expected": "T029 names current issue components/tests.",
      "observed": "Current components live under app/components/issues with unit/E2E contracts.",
      "disposition": "Use current semantic proof; no runtime move.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-009",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T031"],
      "expected": "T031 names current SEO implementation.",
      "observed": "Current SEO logic is app/composables/public-seo.ts rather than features/issues/seo.",
      "disposition": "Use current issue-seo proof.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-010",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T054"],
      "expected": "T054 names current publication orchestration.",
      "observed": "PublicationService.java is absent; behavior is split across EditorialWorkflowService and PublicationJobHandler.",
      "disposition": "Use current idempotency and worker proof; no runtime consolidation.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-011",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T055"],
      "expected": "T055 names current publisher/audit controllers.",
      "observed": "Current surfaces are EditorialArticleController EditorialIssueController EditorialAuditController and PublisherMediaController.",
      "disposition": "Use current semantic proof; no runtime rename.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-012",
      "type": "STALE_PATH",
      "severity": "LOW",
      "affected_ids": ["T080"],
      "expected": "T080 web-security locator matches current file.",
      "observed": "Current proof is apps/web/tests/integration/t080-security-policy.test.ts rather than a security directory.",
      "disposition": "Use the current exact file.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-013",
      "type": "HUMAN_EVIDENCE_REQUIRED",
      "severity": "HIGH",
      "affected_ids": ["SC-001"],
      "expected": "At least 90 percent of consented participants finish within three interactions.",
      "observed": "Automation proves two activations but issue 110 participant research remains unexecuted.",
      "disposition": "Keep HUMAN_OPEN; do not dispatch participants in T085.",
      "owner": "T085 release owner",
      "target": "Separate participant-research authorization",
      "release_impact": "RELEASE_OWNER_DECISION",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-014",
      "type": "PROXY_ONLY",
      "severity": "HIGH",
      "affected_ids": ["SC-002"],
      "expected": "Production p75 Core Web Vitals satisfy all thresholds.",
      "observed": "Lighthouse and representative CI profiles are lab proxies; production RUM is unavailable and analytics has no sink.",
      "disposition": "Keep PROXY_ONLY until production measurement is separately authorized.",
      "owner": "T085 release owner",
      "target": "Post-activation RUM receipt",
      "release_impact": "PRODUCTION_ACTIVATION_OPEN",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-015",
      "type": "HUMAN_EVIDENCE_REQUIRED",
      "severity": "MEDIUM",
      "affected_ids": ["SC-004"],
      "expected": "A real editor completes the 20-draft workflow within 30 minutes.",
      "observed": "E2E verifies workflow behavior but not human elapsed time.",
      "disposition": "Keep HUMAN_OPEN; no participant dispatch.",
      "owner": "T085 release owner",
      "target": "Separate editorial usability authorization",
      "release_impact": "RELEASE_OWNER_DECISION",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-016",
      "type": "PARTIAL_ACCEPTANCE",
      "severity": "HIGH",
      "affected_ids": ["FR-030", "SC-006"],
      "expected": "Every public page search and sitemap surface converges within 60 seconds after each lifecycle event.",
      "observed": "Search withdrawal cache and alert seams are tested, but no single exact-head receipt measures every surface/event permutation.",
      "disposition": "Keep PARTIAL and require a bounded multi-surface acceptance receipt.",
      "owner": "T085 release owner",
      "target": "T086 release checklist",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-017",
      "type": "HUMAN_EVIDENCE_REQUIRED",
      "severity": "HIGH",
      "affected_ids": ["SC-007"],
      "expected": "Automated and native keyboard/screen-reader acceptance pass.",
      "observed": "Automated evidence passed; native OS/AT/device/font rows are explicitly WAIVED / NOT_RUN.",
      "disposition": "Never promote waiver or agent inference to native PASS.",
      "owner": "T085 release owner",
      "target": "Release-owner accessibility decision",
      "release_impact": "RELEASE_OWNER_DECISION",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-018",
      "type": "EXTERNAL_OPEN",
      "severity": "MEDIUM",
      "affected_ids": ["SC-011"],
      "expected": "First-three-issue production readership reaches the specified depth rate.",
      "observed": "T084 supplies inert consent-aware producers only; no sink or production cohort exists.",
      "disposition": "Measure post-launch only after separate provider/production approval.",
      "owner": "T085 release owner",
      "target": "Post-launch product measurement",
      "release_impact": "POST_LAUNCH_OPEN",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-019",
      "type": "PLANNED_BLOCKED",
      "severity": "HIGH",
      "affected_ids": ["SC-012"],
      "expected": "Twenty consecutive exact-scope CI runs have zero flaky failures.",
      "observed": "T086 is unchecked and not dispatched.",
      "disposition": "Keep blocked; T085 must not create release.yml or run T086.",
      "owner": "T085 release owner",
      "target": "T086",
      "release_impact": "BLOCKS_T086",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-020",
      "type": "FUTURE_SLICE",
      "severity": "HIGH",
      "affected_ids": ["FR-049", "FR-050", "FR-051", "FR-052", "FR-053", "SC-015", "SC-016"],
      "expected": "Optional provenance and wallet requirements have executable acceptance proof.",
      "observed": "T087-T096 remain unchecked; only current origin/security boundaries exist.",
      "disposition": "Keep planned/partial without starting Web3.",
      "owner": "T085 release owner",
      "target": "US7 dispatch",
      "release_impact": "BLOCKS_FUTURE_SLICE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-021",
      "type": "FUTURE_SLICE",
      "severity": "HIGH",
      "affected_ids": [
        "FR-054",
        "FR-055",
        "FR-056",
        "FR-057",
        "FR-058",
        "FR-059",
        "FR-060",
        "SC-017",
        "SC-018"
      ],
      "expected": "Basketball domain fixtures and implementation exist.",
      "observed": "T098-T100 remain unchecked; T097 is spec-only alignment.",
      "disposition": "Keep planned/partial without starting domain runtime.",
      "owner": "T085 release owner",
      "target": "US8 dispatch",
      "release_impact": "BLOCKS_FUTURE_SLICE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-022",
      "type": "FUTURE_SLICE",
      "severity": "HIGH",
      "affected_ids": ["FR-061", "FR-062", "FR-063", "FR-064", "SC-019", "SC-020"],
      "expected": "Evidence contracts adapters and contradiction semantics execute.",
      "observed": "T101-T104 remain unchecked.",
      "disposition": "Keep planned; no source or participant research execution.",
      "owner": "T085 release owner",
      "target": "US9 dispatch",
      "release_impact": "BLOCKS_FUTURE_SLICE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-023",
      "type": "FUTURE_SLICE",
      "severity": "HIGH",
      "affected_ids": [
        "FR-065",
        "FR-066",
        "FR-067",
        "FR-068",
        "FR-069",
        "FR-070",
        "FR-071",
        "FR-072",
        "SC-021",
        "SC-022"
      ],
      "expected": "Passport/credential lifecycle privacy rights and outage acceptance execute.",
      "observed": "T105-T109 remain unchecked; current rights and anonymous fallback are partial proxies only.",
      "disposition": "Keep planned/partial with every external write flag off.",
      "owner": "T085 release owner",
      "target": "US10/US11 dispatch",
      "release_impact": "BLOCKS_FUTURE_SLICE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-024",
      "type": "FUTURE_SLICE",
      "severity": "HIGH",
      "affected_ids": ["FR-073", "FR-074", "SC-023"],
      "expected": "Recap/archive variants and complete fallback/privacy/withdrawal acceptance execute.",
      "observed": "T110-T112 remain unchecked; current court-pulse and anonymous SSR prove only the inherited baseline.",
      "disposition": "Keep partial/planned; do not start recap or archive work.",
      "owner": "T085 release owner",
      "target": "US12 dispatch",
      "release_impact": "BLOCKS_FUTURE_SLICE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-025",
      "type": "RECEIPT_DRIFT",
      "severity": "MEDIUM",
      "affected_ids": ["T074", "T075", "T076", "T077", "T078", "T079"],
      "expected": "Checked task prose is retrospective and bound to protected-main receipts.",
      "observed": "Several rows retain prospective phrases such as receipt-only head will be verified or PR must bind before merge.",
      "disposition": "Treat historical prose as non-authoritative; use protected-main receipts and current tests in this matrix.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-026",
      "type": "PROXY_ONLY",
      "severity": "HIGH",
      "affected_ids": ["SC-008"],
      "expected": "A 100 RPS 95-percent-cache-hit benchmark proves p95 and error thresholds.",
      "observed": "T079 proves browser/Lighthouse budgets and T083 defines SLOs, but the exact 100 RPS workload receipt is absent.",
      "disposition": "Keep PROXY_ONLY until the precise benchmark is captured.",
      "owner": "T085 release owner",
      "target": "T086 performance acceptance",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-027",
      "type": "PARTIAL_ACCEPTANCE",
      "severity": "MEDIUM",
      "affected_ids": ["SC-009"],
      "expected": "The same idempotency key is retried exactly ten times with one version and side-effect set.",
      "observed": "Current tests prove replay/concurrency idempotency but do not literally execute the ten-retry criterion.",
      "disposition": "Keep PARTIAL until an exact ten-retry test/receipt exists.",
      "owner": "T085 release owner",
      "target": "T086 publication acceptance",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-028",
      "type": "EXTERNAL_OPEN",
      "severity": "HIGH",
      "affected_ids": ["FR-045"],
      "expected": "Daily production backup scheduling and recurring quarterly restore drills are active and evidenced.",
      "observed": "T081 proves backup/restore tooling and one isolated drill; production scheduling/activation is outside scope.",
      "disposition": "Keep PARTIAL; do not activate production from T085.",
      "owner": "T085 release owner",
      "target": "Production operations approval",
      "release_impact": "PRODUCTION_ACTIVATION_OPEN",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-029",
      "type": "EXTERNAL_OPEN",
      "severity": "MEDIUM",
      "affected_ids": ["FR-044"],
      "expected": "Operational signals reach active dashboards/receivers in the target environment.",
      "observed": "Instrumentation and provider-neutral alert contracts exist, while exporter/receiver/provider activation remains off.",
      "disposition": "Keep PARTIAL; activation requires separate provider and production approval.",
      "owner": "T085 release owner",
      "target": "Observability activation approval",
      "release_impact": "PRODUCTION_ACTIVATION_OPEN",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-030",
      "type": "EDITORIAL_CAPABILITY_GAP",
      "severity": "HIGH",
      "affected_ids": ["FR-011"],
      "expected": "Authorized editors can create edit preview and archive issues articles authors taxonomies and media.",
      "observed": "Issue article media and taxonomy paths exist, but author/contributor create edit preview and archive paths are absent.",
      "disposition": "Keep PARTIAL and require separately scoped editorial capability remediation.",
      "owner": "T085 release owner",
      "target": "Editorial capability remediation",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-031",
      "type": "AUDIT_COVERAGE_GAP",
      "severity": "HIGH",
      "affected_ids": ["FR-019"],
      "expected": "Immutable audit events cover every named editorial action, role change and permission failure.",
      "observed": "Audit persistence and several editorial events exist, but role-change and permission-failure audit paths are not evidenced.",
      "disposition": "Keep PARTIAL and require separately scoped audit coverage remediation.",
      "owner": "T085 release owner",
      "target": "Audit coverage remediation",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-032",
      "type": "ASSET_REVOCATION_OFFLINE_IMPACT_GAP",
      "severity": "HIGH",
      "affected_ids": ["FR-025"],
      "expected": "Asset revocation identifies affected published articles and offline packages and makes installed copies expire.",
      "observed": "Publisher revoke reports affected articles, while affected offline package discovery and asset-triggered invalidation are absent.",
      "disposition": "Keep PARTIAL and require separately scoped asset/offline revocation remediation.",
      "owner": "T085 release owner",
      "target": "Asset revocation remediation",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-033",
      "type": "TAXONOMY_SCOPE_GAP",
      "severity": "MEDIUM",
      "affected_ids": ["FR-026", "FR-027"],
      "expected": "Taxonomy management includes events/matches and preserves historical article display context across renames.",
      "observed": "The taxonomy omits event/match and updates display names in place without a versioned article snapshot.",
      "disposition": "Keep PARTIAL until the P2 taxonomy slice is completed.",
      "owner": "T085 release owner",
      "target": "P2 taxonomy completion",
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-034",
      "type": "SEARCH_CAPABILITY_GAP",
      "severity": "MEDIUM",
      "affected_ids": ["FR-028", "FR-029"],
      "expected": "Search indexes author/contributor text and filters by issue and publication date in addition to taxonomy.",
      "observed": "Projection normalization excludes author/contributor text and the public API lacks issue and publication-date filters.",
      "disposition": "Keep PARTIAL until the P2 search slice is completed.",
      "owner": "T085 release owner",
      "target": "P2 search completion",
      "release_impact": "BLOCKS_P2_ACCEPTANCE_NOT_T085",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-035",
      "type": "RATE_LIMIT_ENFORCEMENT_GAP",
      "severity": "HIGH",
      "affected_ids": ["FR-041"],
      "expected": "Route-specific rate and payload limits are enforced across public login upload search and backoffice surfaces.",
      "observed": "Route policy and payload limits exist, but the rate-limit policy documents enforcement as an adapter concern and no enforcing filter is present.",
      "disposition": "Keep PARTIAL and require separately scoped enforcement remediation.",
      "owner": "T085 release owner",
      "target": "P1 security remediation",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-036",
      "type": "NO_JS_ACCEPTANCE_GAP",
      "severity": "HIGH",
      "affected_ids": ["SC-003", "SC-013"],
      "expected": "No-JavaScript acceptance explicitly proves every required content field and navigation/share operation.",
      "observed": "Current no-JavaScript proof covers visible content, TOC, issue link and share fallback but not every named clause including previous/next operation.",
      "disposition": "Keep PARTIAL until a clause-complete no-JavaScript acceptance test exists.",
      "owner": "T085 release owner",
      "target": "T086 reader acceptance",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-037",
      "type": "WRITE_API_CONTRACT_COVERAGE_GAP",
      "severity": "HIGH",
      "affected_ids": ["FR-042"],
      "expected": "Every write API is enumerated under consistent Problem Details request-ID and optimistic-lock acceptance proof.",
      "observed": "Shared primitives and selected editorial APIs are tested, but a complete write-endpoint inventory is absent.",
      "disposition": "Keep PARTIAL until endpoint-complete contract coverage is captured.",
      "owner": "T085 release owner",
      "target": "T086 API contract acceptance",
      "release_impact": "BLOCKS_T086_UNLESS_ADJUDICATED",
      "state": "OPEN"
    },
    {
      "id": "DEV-T085-038",
      "type": "TASK_SOURCE_DRIFT",
      "severity": "MEDIUM",
      "affected_ids": ["T032", "T042"],
      "expected": "Broad FR ranges in task prose agree with the evidence-backed forward matrix.",
      "observed": "T032 claims FR-004 through FR-010 but omits FR-008 through FR-010 in the matrix; T042 claims FR-011 through FR-025 but omits FR-017 FR-018 FR-021 FR-024 and FR-025.",
      "disposition": "Keep the evidence-backed mapping and record the source drift without modifying runtime or historical task prose.",
      "owner": "T085 release owner",
      "target": "Documentation reconciliation",
      "release_impact": "NONE",
      "state": "OPEN"
    }
  ]
}
```

<!-- t085:contract:end -->
