package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.application.BasketballCatalogService;
import tw.basketball.magazine.basketball.application.CanonicalBasketballIntake;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.basketball.ports.BasketballFactStore;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.EvidenceValidation;
import tw.basketball.magazine.evidence.MemoryEvidenceStore;

final class CanonicalBasketballIntakeTest {
    private static final Instant NOW = Instant.parse("2026-09-12T10:00:00Z");
    private static final ObjectMapper JSON = new ObjectMapper();
    private final MemoryEvidenceStore evidence = new MemoryEvidenceStore();
    private final MemoryFacts facts = new MemoryFacts();
    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private final ReviewedEvidenceIntake reviewed = new ReviewedEvidenceIntake(evidence,
            new ContradictionReview(evidence, ignored -> { }), () -> "oidc-publisher", now::get);
    private final CanonicalBasketballIntake intake = new CanonicalBasketballIntake(new BasketballCatalogService(facts,
            id -> EvidenceValidation.validate(evidence.reference(id).orElseThrow(), evidence), JSON, () -> { }), reviewed, JSON);

    @Test
    void reviewedNormalWorkflowCreatesSeasonAndParticipationWithoutDirectStoreWrites() {
        confirm();
        intake.append("LEAGUE", JSON.readTree(identity(10, "League", 4)), "Official league review");
        intake.append("TEAM", JSON.readTree(identity(20, "Team", 4)), "Official team review");
        intake.append("SEASON", JSON.readTree(season(30, 10, 4)), "Official season review");
        intake.append("TEAM_SEASON", JSON.readTree(participation(40, 20, 10, 30, 4)), "Official participation review");
        assertEquals(List.of("LEAGUE", "TEAM", "SEASON", "TEAM_SEASON"), facts.history().stream().map(BasketballFactStore.Fact::kind).toList());
        assertEquals("oidc-publisher", evidence.events("basketball:fact:" + id(40)).get(1).reviewerId());
        intake.append("TEAM_SEASON", JSON.readTree(participation(40, 20, 10, 30, 4)), "Official participation review");
        assertEquals(4, facts.history().size());
        assertEquals(2, evidence.events("basketball:fact:" + id(40)).size());
    }

    @Test
    void unreviewedReferencesAndInventedRelationshipsCannotEnterCanonicalCatalog() {
        submit();
        assertThrows(IllegalArgumentException.class, () -> intake.append("LEAGUE", JSON.readTree(identity(10, "League", 3)), "Unreviewed"));
        assertTrue(facts.history().isEmpty());
        reviewed.confirm(id(3), new ReviewedEvidenceIntake.ConfirmationCommand(id(4), "Official source reviewed"));
        assertThrows(IllegalArgumentException.class, () -> intake.append("SEASON", JSON.readTree(season(30, 999, 4)), "Unknown league"));
        assertTrue(facts.history().isEmpty());
        assertTrue(evidence.events("basketball:fact:" + id(30)).isEmpty(), "invalid relationships never create a successful fact review");
    }

    @Test
    void hiddenFieldsAndNestedUnreviewedEvidenceAreRejected() {
        confirm();
        String actorSpoof = identity(10, "League", 4).replace("\"lifecycle\"", "\"reviewerId\":\"spoof\",\"lifecycle\"");
        assertThrows(IllegalArgumentException.class, () -> intake.append("LEAGUE", JSON.readTree(actorSpoof), "Spoofed"));
        String nestedUnreviewed = identity(10, "League", 4).replaceFirst(id(4).toString(), id(3).toString());
        assertThrows(IllegalArgumentException.class, () -> intake.append("LEAGUE", JSON.readTree(nestedUnreviewed), "Nested bypass"));
        assertTrue(facts.history().isEmpty());
    }

    @Test
    void evidenceExpiringWhileWaitingForCatalogLockCannotAppendEvenWithARetainedPriorReview() {
        confirm();
        String payload = JSON.writeValueAsString(JSON.readValue(identity(10, "League", 4),
                tw.basketball.magazine.basketball.domain.BasketballDomain.League.class));
        reviewed.recordDecision("basketball:fact:" + id(10), "sha256:" + Evidence.digest(payload), List.of(id(4)), "Official league review");
        facts.beforeWork = () -> now.set(NOW.plusSeconds(3601));
        assertThrows(IllegalArgumentException.class, () -> intake.append("LEAGUE", JSON.readTree(identity(10, "League", 4)), "Official league review"));
        assertTrue(facts.history().isEmpty());
    }

    @Test
    void contradictionArrivingWhileWaitingForCatalogLockCannotAppend() {
        confirm();
        facts.beforeWork = () -> new ContradictionReview(evidence, ignored -> { }).propose(id(90),
                "evidence:" + id(4), "Conflicting official source", List.of(id(4)), Evidence.Status.CONFIRMED, Evidence.Origin.HUMAN, NOW);
        assertThrows(IllegalArgumentException.class, () -> intake.append("LEAGUE", JSON.readTree(identity(10, "League", 4)), "Official league review"));
        assertTrue(facts.history().isEmpty());
        assertTrue(evidence.events("basketball:fact:" + id(10)).isEmpty());
    }

    @Test
    void retryWithReorderedJsonObjectKeysRetainsTheSameCanonicalFactAndAudit() {
        confirm();
        reviewed.confirm(id(3), new ReviewedEvidenceIntake.ConfirmationCommand(id(8), "Independent alias review"));
        String original = identity(10, "League", 4).replaceFirst(id(4).toString(), id(8).toString());
        intake.append("LEAGUE", JSON.readTree(original), "Official league review");
        var reordered = (tools.jackson.databind.node.ObjectNode) JSON.readTree(original);
        var aliases = reordered.remove("aliases");
        reordered.set("aliases", aliases);
        intake.append("LEAGUE", reordered, "Official league review");
        assertEquals(1, facts.history().size());
        assertEquals(2, evidence.events("basketball:fact:" + id(10)).size());
    }

    private void confirm() {
        submit();
        reviewed.confirm(id(3), new ReviewedEvidenceIntake.ConfirmationCommand(id(4), "Official source reviewed"));
    }

    private void submit() {
        reviewed.submit(new ReviewedEvidenceIntake.SnapshotCommand(new Evidence.Source(id(1), Evidence.SourceType.LEAGUE,
                "Synthetic official source", URI.create("https://example.invalid/official"), true), id(2), id(3),
                NOW.minusSeconds(3600), NOW.minusSeconds(3600), "Synthetic official reference", "Written permission", 0.9,
                NOW.plusSeconds(3600), NOW.plusSeconds(7200)));
    }

    static String identity(int id, String name, int ref) {
        return "{\"id\":\"" + id(id) + "\",\"lifecycle\":\"ACTIVE\",\"aliases\":[{\"id\":\"" + id(id + 1)
                + "\",\"ownerId\":\"" + id(id) + "\",\"name\":\"" + name + "\",\"locale\":\"zh-TW\",\"period\":" + period()
                + ",\"evidenceIds\":[\"" + id(ref) + "\"]}],\"evidenceIds\":[\"" + id(ref) + "\"]}";
    }

    static String season(int id, int league, int ref) {
        return "{\"id\":\"" + id(id) + "\",\"leagueId\":\"" + id(league)
                + "\",\"officialLabel\":\"Synthetic 2026\",\"period\":" + period() + ",\"evidenceIds\":[\"" + id(ref) + "\"]}";
    }

    static String participation(int id, int team, int league, int season, int ref) {
        return "{\"id\":\"" + id(id) + "\",\"teamId\":\"" + id(team) + "\",\"leagueId\":\"" + id(league)
                + "\",\"seasonId\":\"" + id(season) + "\",\"status\":\"ACTIVE\",\"period\":" + period()
                + ",\"evidenceIds\":[\"" + id(ref) + "\"]}";
    }

    private static String period() {
        return "{\"startDate\":\"2026-01-01\",\"endDate\":\"2027-01-01\"}";
    }

    static UUID id(int suffix) {
        return UUID.fromString("00000000-0000-4000-8000-" + String.format("%012d", suffix));
    }

    static final class MemoryFacts implements BasketballFactStore {
        private List<Fact> values = List.of();
        private Runnable beforeWork = () -> { };

        @Override
        public List<Fact> history() {
            return List.copyOf(values);
        }

        @Override
        public <T> T transact(Function<Session, T> work) {
            List<Fact> pending = new ArrayList<>(values);
            beforeWork.run();
            T result = work.apply(new Session() {
                @Override
                public List<Fact> history() {
                    return List.copyOf(pending);
                }

                @Override
                public void append(Fact value) {
                    if (pending.stream().noneMatch(prior -> prior.id().equals(value.id()))) {
                        pending.add(value);
                    }
                }
            });
            values = List.copyOf(pending);
            return result;
        }
    }
}
