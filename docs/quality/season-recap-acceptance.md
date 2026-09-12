# T110–T112 Season Recap acceptance

| Gate                                                                                  | Attributable verification                                                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| TS/server/browser schema parity                                                       | Shared `valid/season-recap-v1.json`; `ContentDocumentValidatorTest` and `content-document.test.ts` |
| Fixed seed, local registry, bounded values                                            | `packages/creative-runtime/tests/season-recap.test.ts`; existing CourtPulse regression suite       |
| Reviewed public evidence, stable lineage and ordering                                 | `SeasonRecapProjectionTest`                                                                        |
| Server-derived calendar coverage and immutable fact lineage                           | `SeasonCoverageTest`; `SeasonRecapApiIT`                                                           |
| Real Spring/JDBC generator, draft/publication separation and OIDC roles               | `SeasonRecapApiIT`                                                                                 |
| Forged raw article JSON rejected, current contradiction/rights override stored output | `SeasonRecapPublicationGuardTest`; `SeasonRecapApiIT`                                              |
| No private payload, no unapproved archive presentation                                | `ArchiveContributionPolicyTest`; strict archive public-projection schema                           |
| Withdrawal outranks serialization for web/cache/search/offline/IPFS                   | `SeasonRecapProjectionTest` rechecks current rights on an already created projection               |
| Complete no-JS/reduced-motion poster and summary                                      | `apps/web/tests/e2e/us12-season-recap.spec.ts`                                                     |
| Explicit enhancement and route-unmount disposal                                       | `us12-season-recap.spec.ts`; existing `us2-creative-lifecycle.spec.ts` for common host regression  |
| Ordinary anonymous reading after recap withdrawal                                     | `us12-season-recap.spec.ts`                                                                        |

The Node/schema RED was observed before implementation: the valid recap fixture was rejected by the previous CourtPulse-only schema and the trusted registry had no recap preset. Java and browser gates must be executed in the repository's pinned runtime before the canonical task receipt is marked complete. These fixtures do not establish human research, a representative physical-device benchmark, production source coverage, source-owner approval or public-chain activation.

Production wiring review added actual Java17 RED evidence for the calendar coverage implementation and a guard that incorrectly accepted a fabricated projection without persistence. The exact pre-fix sources and classes are retained in the work-session evidence. The three focused JUnit cases pass locally. `SeasonRecapApiIT` exercises PostgreSQL18 and an actual Spring web application context; its execution requires the Java21 CI environment. Do not treat authored integration cases as an executed PASS until that CI result exists. Private/personal recap generation remains explicitly unavailable; no private projection history is fabricated.
