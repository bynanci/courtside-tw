package tw.basketball.magazine.evidence;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import tw.basketball.magazine.basketball.adapters.CtbaAdapter;
import tw.basketball.magazine.basketball.adapters.FibaAdapter;
import tw.basketball.magazine.basketball.adapters.OverseasAdapter;
import tw.basketball.magazine.basketball.adapters.PlgAdapter;
import tw.basketball.magazine.basketball.adapters.SblAdapter;
import tw.basketball.magazine.basketball.adapters.TpblAdapter;
import tw.basketball.magazine.basketball.application.NormalizationIntake;
import tw.basketball.magazine.basketball.ports.BasketballSourceAdapter;

public final class EvidenceWorkflowProof {
    private static final Instant AT = Instant.parse("2026-01-01T00:00:00Z");

    private EvidenceWorkflowProof() {
    }

    public static void main(String[] args) {
        MemoryEvidenceStore store = new MemoryEvidenceStore();
        Evidence.Source source = new Evidence.Source(id(1), Evidence.SourceType.LEAGUE, "Synthetic league source",
                URI.create("https://example.invalid/source"), true);
        store.appendSource(source);
        Evidence.SourceSnapshot first = snapshot(2, source, "Synthetic team A");
        Evidence.SourceSnapshot second = snapshot(3, source, "Synthetic team B");
        store.appendSnapshot(first);
        store.appendSnapshot(second);
        store.appendSnapshot(first);
        rejected(() -> store.appendSnapshot(snapshot(2, source, "changed same identity")), "snapshot overwrite");
        rejected(() -> new Evidence.SourceSnapshot(id(4), source.id(), source.sourceUrl(), AT, null,
                "tampered", first.sha256(), "synthetic"), "snapshot checksum mismatch");
        Evidence.EvidenceRef a = reference(4, first, Evidence.Status.REPORTED);
        Evidence.EvidenceRef b = reference(5, second, Evidence.Status.REPORTED);
        store.appendReference(a);
        store.appendReference(b);
        check(a.publishedAt() == null, "unknown publication date remains unknown");
        for (Evidence.Status status : Evidence.Status.values()) {
            Evidence.requirePermittedTransition(status, status, Evidence.Origin.MODEL);
            if (status != Evidence.Status.CONFIRMED) {
                rejected(() -> Evidence.requirePermittedTransition(status, Evidence.Status.CONFIRMED, Evidence.Origin.MODEL),
                        "model status promotion");
            }
        }
        ContradictionReview review = new ContradictionReview(store, reviewer -> {
            if (!"authorized-fixture-reviewer".equals(reviewer)) {
                throw new SecurityException("reviewer required");
            }
        });
        review.propose(id(10), "player.synthetic.team", "team-A", List.of(a.id()), a.status(), Evidence.Origin.ADAPTER, AT);
        review.propose(id(11), "player.synthetic.team", "team-B", List.of(b.id()), b.status(), Evidence.Origin.ADAPTER, AT);
        check(review.view("player.synthetic.team").disputed(), "conflicting facts are disputed");
        check(review.view("player.synthetic.team").confirmedValue().isEmpty(), "no proposal auto-publishes a canonical fact");
        check(store.snapshot(first.id()).isPresent() && store.snapshot(second.id()).isPresent(), "both conflicting snapshots retained");
        rejected(() -> review.decide(id(12), "player.synthetic.team", id(10), Evidence.Status.CONFIRMED,
                "adapter", "synthetic rationale", 2, AT), "adapter cannot adjudicate");
        rejected(() -> review.decide(id(12), "player.synthetic.team", id(10), Evidence.Status.CONFIRMED,
                "authorized-fixture-reviewer", "synthetic rationale", 1, AT), "stale reviewer revision");
        review.decide(id(12), "player.synthetic.team", id(10), Evidence.Status.CONFIRMED,
                "authorized-fixture-reviewer", "Synthetic evidence independently reviewed", 2, AT);
        check(!review.view("player.synthetic.team").disputed(), "human decision resolves reviewed conflicts");
        check(review.view("player.synthetic.team").confirmedValue().orElseThrow().equals("team-A"), "selected value confirmed explicitly");
        review.propose(id(13), "player.synthetic.team", "team-B", List.of(b.id()), b.status(), Evidence.Origin.ADAPTER, AT);
        check(review.view("player.synthetic.team").disputed(), "new contradictory evidence reopens review");
        check(review.view("player.synthetic.team").confirmedValue().orElseThrow().equals("team-A"), "latest fetch does not replace last confirmed value");
        Evidence.EvidenceRef confirmed = reference(6, first, Evidence.Status.CONFIRMED);
        check(Evidence.project(confirmed, source, AT, false, true).currentFact(), "fresh reviewed reference is current");
        check(!Evidence.project(confirmed, source, AT.plusSeconds(86400), false, true).currentFact(), "stale fact never presented as current");
        check(Evidence.project(confirmed, source, AT.plusSeconds(86400), false, true).asOf().equals(AT), "stale projection retains as-of");
        check(!Evidence.project(confirmed, source, AT, true, true).currentFact(), "disputed fact never presented as current");
        check(Evidence.project(confirmed, source, AT, false, false).sourceUrl() == null, "rights withdrawal suppresses public source reference");
        for (BasketballSourceAdapter adapter : List.of(new FibaAdapter(), new CtbaAdapter(), new TpblAdapter(),
                new PlgAdapter(), new SblAdapter(), new OverseasAdapter())) {
            NormalizationIntake intake = new NormalizationIntake(store, review);
            List<BasketballSourceAdapter.SourceClaim> raw = List.of(new BasketballSourceAdapter.SourceClaim(
                    "synthetic-key", id(100), "team", "team-A", Evidence.Status.REPORTED, List.of(a.id())));
            List<BasketballSourceAdapter.NormalizedClaim> once = intake.accept(adapter, first, raw);
            check(once.equals(intake.accept(adapter, first, raw)), "adapter retry proposal IDs are deterministic");
            check(review.view(id(100) + ".team").confirmedValue().isEmpty(), "adapter has no canonical overwrite capability");
            rejected(() -> intake.accept(adapter, first, List.of(new BasketballSourceAdapter.SourceClaim(
                    "forged", id(100), "team", "team-B", Evidence.Status.CONFIRMED, List.of(a.id())))), "adapter cannot promote normalized evidence");
        }
        System.out.println("PASS evidence checksums, immutable retry, all statuses, freshness, rights, conflict review and six adapter contracts");
    }

    public static Evidence.SourceSnapshot snapshot(int number, Evidence.Source source, String content) {
        return new Evidence.SourceSnapshot(id(number), source.id(), source.sourceUrl(), AT, null,
                content, Evidence.digest(content), "synthetic-fixture-only");
    }

    public static Evidence.EvidenceRef reference(int number, Evidence.SourceSnapshot snapshot, Evidence.Status status) {
        return new Evidence.EvidenceRef(id(number), snapshot.sourceId(), Evidence.SourceType.LEAGUE,
                snapshot.sourceUrl(), snapshot.retrievedAt(), snapshot.publishedAt(), AT, 0.8, status,
                "fresh", snapshot.id(), AT.plusSeconds(86400), AT.plusSeconds(172800), "Synthetic evidence");
    }

    public static UUID id(int number) {
        return UUID.fromString(String.format("00000000-0000-4000-8000-%012d", number));
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void rejected(Runnable action, String message) {
        try {
            action.run();
            throw new AssertionError("must reject " + message);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException expected) {
            // Fail closed before evidence promotion or history mutation.
        }
    }
}
