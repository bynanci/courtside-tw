# T098–T104 implementation and migration review

As of: 2026-09-12. Base: `ac92f88a7267736325519a8bf12dc6b9ee2bcb86`.

This is implementation evidence for synthetic fixtures. It does not claim current league data, source rights approval, completed production activation, or a passing remote CI run.

| Tasks | Implemented boundary | Executable verification |
| --- | --- | --- |
| T098–T099 | Strict UUID/evidence contracts; aliases, half-open periods, team participation, same-name separation, overseas career, immutable roster revisions | `domain-contracts.test.mjs`, `BasketballCoreProof`, `BasketballDomainProof`, `BasketballContractTest` |
| T100 | Canonical aggregates; evidence/application ports; JDBC catalog hydrate/validate/append in one transaction; publisher/admin write authority; optional origin-reading enrichment | `JdbcEvidenceStoreIT` catalog restart, retry and concurrent roster cases; `BasketballConfigurationTest`; `BasketballModuleBoundaryTest` |
| T101–T102 | Immutable source/ref values, UNKNOWN dates, all five status values, freshness/as-of/rights projection, no model or adapter promotion | `EvidenceCoreProof`, `EvidenceWorkflowProof`, strict schema positive/negative fixtures |
| T103 | JDBC snapshots/refs, SHA-256 and source metadata binding, immutable records, claim revision lock, append-only contradiction/audit history | `JdbcEvidenceStoreIT` checksum/overwrite/restart/conflict/rollback cases |
| T104 | FIBA/CTBA/TPBL/PLG/SBL/overseas normalization ports, stable proposal identities, snapshot-first validation, proposal-only writes | Six-adapter retry/no-promotion cases in `EvidenceWorkflowProof`; adapter architecture rule |

## Recorded local verification

- The initial compile-ready `TemporalHistory` and `EvidenceFreshness` scaffolds produced two behavioral assertion failures before implementation: missing historical append, and an expired source incorrectly remaining fresh. The initial failed attempt caused by an unavailable `javac` command was a setup failure and is **not** RED evidence.
- Java 17 compiler module (`java -m jdk.compiler/com.sun.tools.javac.Main`) compiled the dependency-free domain, evidence, normalization and JDBC repositories using `-Xlint:all -Werror`; all four executable proof suites passed after implementation.
- The retained RED artifacts are compiled classes and captured assertion output; original scaffold source was not separately archived. No RED git commit or source snapshot is claimed.
- The AJV suite executed 5 tests successfully, including missing evidence, unstable IDs, unexpected fields, unknown confirmed effective dates, source URL sanitization, invalid confidence/status/freshness and source/checksum/reference integrity.
- `BasketballDomainTest` and `EvidenceWorkflowTest` invoke the same executable proofs in standard JUnit discovery. `BasketballContractTest`, `BasketballConfigurationTest`, `BasketballModuleBoundaryTest` and `JdbcEvidenceStoreIT` end in the existing Gradle-discovered `Test`/`IT` patterns.
- Spring/Jackson-dependent service/configuration tests, full Java 21 compilation, Checkstyle, SpotBugs, PostgreSQL integration and protected exact-head CI/Security require the normal project CI environment. A local core pass is not a substitute for those gates.

## Migration forward and application rollback

V020 and V021 are additive and leave V001–V019 and existing publication tables unchanged. Apply in that order using the established migration owner; runtime application role receives only the explicit new-table privileges. Fixtures create isolated databases only.

V020 stores stable identities and immutable facts. A singleton row lock serializes catalog validation and append; sequence numbers only order ingestion and never stand in for effective dates. Competition identity dates remain null when unknown. The canonical aggregate validates relationship IDs and periods before any insert. Reusing an immutable ID with different content or identity kind fails.

V021 stores immutable sources, content snapshots, refs and claim events. Snapshot content is SHA-256 checked by Java and PostgreSQL. Ref inserts must exactly match immutable source/snapshot metadata. A claim revision lock plus unique `(claim_key, revision)` preserves concurrent review ordering; event, evidence links and revision advance commit atomically. Facts and events require existing evidence. The database and application role reject updating or deleting retained facts/snapshots/events.

`JdbcEvidenceStoreIT` executes migrations on PostgreSQL, reconstructs repositories/services, proves preserved snapshots/catalogs, rejects SQL mutation, tests failed event rollback and races two roster revision writes. The test is authored for CI and was not executed in the local environment without Docker/PostgreSQL.

Application rollback means deploying the previous application artifact and leaving additive tables/data intact. No down migration, destructive reset, provider configuration or source backfill is part of this change. New Spring beans perform no startup query and expose no new HTTP write/public endpoint or ingest schedule; existing origin article reading remains independent.

## Data and activation limits

All fixture source URLs use `example.invalid`; names, careers, rosters and conflicts are synthetic. Provider names identify adapter contracts, not completed official API integration. Identity resolution, real source owners, source-specific freshness windows, rights approval and production ingest activation still need real evidence and an explicit operating decision. These limits do not disable the implemented domain/application/persistence behavior.
