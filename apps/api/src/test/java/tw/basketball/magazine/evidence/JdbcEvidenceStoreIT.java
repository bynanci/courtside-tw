package tw.basketball.magazine.evidence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.application.BasketballCatalogService;
import tw.basketball.magazine.basketball.domain.BasketballDomain;
import tw.basketball.magazine.basketball.persistence.JdbcBasketballFactStore;

/** Forward migration, immutable storage, restart and transaction rollback proof against real PostgreSQL. */
final class JdbcEvidenceStoreIT {
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            "postgres:18.6-alpine3.24@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2")
            .withDatabaseName("evidence_fixture").withUsername("fixture").withPassword("fixture-only");
    private static DataSource dataSource;
    private JdbcEvidenceStore store;

    @BeforeAll
    static void startAndMigrate() throws Exception {
        POSTGRES.start();
        dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        execute("CREATE ROLE courtside_app NOLOGIN");
        for (String migration : List.of("V020__basketball_domain.sql", "V021__basketball_evidence.sql")) {
            try (var stream = JdbcEvidenceStoreIT.class.getResourceAsStream("/db/migration/" + migration)) {
                if (stream == null) {
                    throw new IllegalStateException("missing migration " + migration);
                }
                execute(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
    }

    @AfterAll
    static void stop() {
        POSTGRES.stop();
    }

    @BeforeEach
    void isolateFixture() throws Exception {
        execute("TRUNCATE basketball_source, basketball_claim_revision, basketball_identity CASCADE");
        store = new JdbcEvidenceStore(dataSource);
    }

    @Test
    void snapshotsPersistAcrossRepositoryRestartAndRejectOverwriteAtDatabaseBoundary() throws Exception {
        var source = source();
        var snapshot = EvidenceWorkflowProof.snapshot(2, source, "Synthetic retained original");
        store.appendSource(source);
        store.appendSnapshot(snapshot);
        store.appendSnapshot(snapshot);
        store.appendReference(EvidenceWorkflowProof.reference(4, snapshot, Evidence.Status.REPORTED));
        assertEquals(snapshot, new JdbcEvidenceStore(dataSource).snapshot(snapshot.id()).orElseThrow());
        assertThrows(IllegalStateException.class, () -> store.appendSnapshot(
                EvidenceWorkflowProof.snapshot(2, source, "Synthetic overwritten payload")));
        assertThrows(SQLException.class, () -> execute("UPDATE basketball_source_snapshot SET content = 'changed'"));
        assertThrows(SQLException.class, () -> execute("SET ROLE courtside_app; DELETE FROM basketball_source_snapshot"));
        assertEquals(snapshot, store.snapshot(snapshot.id()).orElseThrow());
    }

    @Test
    void contradictionsAuditAndRevisionSurviveRestartAndFailedAppendRollsBackAtomically() throws Exception {
        var source = source();
        store.appendSource(source);
        var a = EvidenceWorkflowProof.snapshot(2, source, "Synthetic team A");
        var b = EvidenceWorkflowProof.snapshot(3, source, "Synthetic team B");
        store.appendSnapshot(a);
        store.appendSnapshot(b);
        store.appendReference(EvidenceWorkflowProof.reference(4, a, Evidence.Status.REPORTED));
        store.appendReference(EvidenceWorkflowProof.reference(5, b, Evidence.Status.REPORTED));
        var review = new ContradictionReview(store, actor -> {
            if (!"fixture-reviewer".equals(actor)) {
                throw new SecurityException("reviewer required");
            }
        });
        Instant at = Instant.parse("2026-01-01T00:00:00Z");
        review.propose(EvidenceWorkflowProof.id(10), "fixture.player.team", "team-A", List.of(EvidenceWorkflowProof.id(4)),
                Evidence.Status.REPORTED, Evidence.Origin.ADAPTER, at);
        review.propose(EvidenceWorkflowProof.id(11), "fixture.player.team", "team-B", List.of(EvidenceWorkflowProof.id(5)),
                Evidence.Status.REPORTED, Evidence.Origin.ADAPTER, at);
        assertTrue(new ContradictionReview(new JdbcEvidenceStore(dataSource), actor -> { })
                .view("fixture.player.team").disputed());
        review.decide(EvidenceWorkflowProof.id(12), "fixture.player.team", EvidenceWorkflowProof.id(10),
                Evidence.Status.CONFIRMED, "fixture-reviewer", "Synthetic source review", 2, at);
        assertFalse(review.view("fixture.player.team").disputed());
        assertEquals(3, store.events("fixture.player.team").size());
        EvidenceStore.ReviewEvent invalid = new EvidenceStore.ReviewEvent(EvidenceWorkflowProof.id(13), "fixture.player.team", 4,
                EvidenceStore.EventKind.PROPOSED, "team-C", List.of(EvidenceWorkflowProof.id(999)),
                Evidence.Status.REPORTED, null, null, at);
        assertThrows(IllegalStateException.class, () -> store.appendEvent(invalid, 3));
        assertEquals(3, store.events("fixture.player.team").size(), "event and revision both roll back");
        assertThrows(SQLException.class, () -> execute("UPDATE basketball_claim_event SET rationale = 'rewritten'"));
        assertTrue(store.snapshot(a.id()).isPresent() && store.snapshot(b.id()).isPresent());
    }

    @Test
    void canonicalCatalogHydratesAfterRestartAndConcurrentRosterEditsDoNotLoseHistory() throws Exception {
        var source = source();
        store.appendSource(source);
        var snapshot = EvidenceWorkflowProof.snapshot(2, source, "Synthetic domain evidence");
        store.appendSnapshot(snapshot);
        store.appendReference(EvidenceWorkflowProof.reference(4, snapshot, Evidence.Status.REPORTED));
        var repository = new JdbcBasketballFactStore(dataSource);
        var catalog = catalog(repository);
        List<UUID> evidence = List.of(EvidenceWorkflowProof.id(4));
        var period = new BasketballDomain.Period(LocalDate.parse("2026-01-01"), LocalDate.parse("2027-01-01"));
        var player = new BasketballDomain.Player(EvidenceWorkflowProof.id(100), List.of(new BasketballDomain.Alias(
                EvidenceWorkflowProof.id(101), EvidenceWorkflowProof.id(100), "Synthetic player", "zh-TW", period, evidence)), evidence);
        catalog.append(player);
        catalog.append(player);
        assertEquals(1, repository.history().size(), "identical retry is not a second history record");
        assertEquals(player, catalog(new JdbcBasketballFactStore(dataSource)).player(player.id()).orElseThrow());
        assertThrows(IllegalStateException.class, () -> catalog.append(new BasketballDomain.Player(player.id(),
                List.of(new BasketballDomain.Alias(EvidenceWorkflowProof.id(102), player.id(),
                        "Synthetic silently renamed player", "zh-TW", period, evidence)), evidence)));
        var competition = new BasketballDomain.Competition(EvidenceWorkflowProof.id(110), "Synthetic FIBA window",
                BasketballDomain.CompetitionKind.FIBA, evidence);
        catalog.append(competition);
        assertNull(repository.history().stream().filter(row -> row.id().equals(competition.id())).findFirst().orElseThrow().validFrom(),
                "unknown identity dates are not fabricated");
        var campaign = new BasketballDomain.NationalTeamCampaign(EvidenceWorkflowProof.id(111), competition.id(),
                BasketballDomain.Gender.MEN, BasketballDomain.AgeGroup.SENIOR, BasketballDomain.Discipline.FIVE_ON_FIVE,
                period, "Synthetic roster", evidence);
        catalog.append(campaign);
        var entry = new BasketballDomain.RosterEntry(player.id(), BasketballDomain.EntryStatus.CALLED_UP, null, period, null, evidence);
        var first = new BasketballDomain.NationalTeamRoster(EvidenceWorkflowProof.id(120), campaign.id(), 1, null,
                BasketballDomain.RosterStatus.TRAINING, LocalDate.parse("2026-01-01"), List.of(entry), evidence);
        catalog.append(first);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var attempts = List.of(121, 122).stream().map(number -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("fixture start timeout");
                }
                try {
                    catalog(repository).append(new BasketballDomain.NationalTeamRoster(EvidenceWorkflowProof.id(number), campaign.id(), 2,
                            first.id(), BasketballDomain.RosterStatus.FINAL, LocalDate.parse("2026-02-01"), List.of(entry), evidence));
                    return true;
                } catch (IllegalArgumentException conflict) {
                    return false;
                }
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            int successes = 0;
            for (var attempt : attempts) {
                if (attempt.get(20, TimeUnit.SECONDS)) {
                    successes++;
                }
            }
            assertEquals(1, successes, "only one revision 2 can be committed");
        } finally {
            executor.shutdownNow();
        }
        var revisions = catalog(new JdbcBasketballFactStore(dataSource)).rosters(campaign.id());
        assertEquals(2, revisions.size());
        assertEquals(first, revisions.get(0), "earlier roster remains byte-for-byte equivalent");
        assertThrows(SQLException.class, () -> execute("UPDATE basketball_fact SET payload = '{}'::jsonb"));
    }

    private BasketballCatalogService catalog(JdbcBasketballFactStore repository) {
        return new BasketballCatalogService(repository, id -> EvidenceValidation.validate(store.reference(id).orElseThrow(), store),
                new ObjectMapper(), () -> { });
    }

    private static Evidence.Source source() {
        return new Evidence.Source(EvidenceWorkflowProof.id(1), Evidence.SourceType.LEAGUE,
                "Synthetic source", URI.create("https://example.invalid/source"), true);
    }

    private static void execute(String sql) throws SQLException {
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
