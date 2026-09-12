package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.MemoryEvidenceStore;

final class ReviewedEvidenceIntakeTest {
    private static final Instant NOW = Instant.parse("2026-09-12T10:00:00Z");
    private final MemoryEvidenceStore store = new MemoryEvidenceStore();
    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private final ReviewedEvidenceIntake intake = new ReviewedEvidenceIntake(store,
            new ContradictionReview(store, actor -> {
                if (!"oidc-publisher".equals(actor)) {
                    throw new SecurityException("publisher identity mismatch");
                }
            }), () -> "oidc-publisher", now::get);

    @Test
    void sourceSubmissionCannotSelfConfirmAndReviewKeepsOriginalImmutable() {
        var command = command();
        var reported = intake.submit(command);
        assertEquals(Evidence.Status.REPORTED, reported.status());
        assertEquals(NOW, reported.retrievedAt());
        assertEquals(Evidence.digest(command.content()), store.snapshot(reported.snapshotId()).orElseThrow().sha256());
        assertFalse(new ContradictionReview(store, ignored -> { }).view("evidence:" + reported.id()).confirmedValue().isPresent());
        var confirmed = intake.confirm(reported.id(), new ReviewedEvidenceIntake.ConfirmationCommand(id(4), "Checked official source"));
        assertEquals(Evidence.Status.CONFIRMED, confirmed.status());
        assertEquals(reported.snapshotId(), confirmed.snapshotId());
        assertEquals(Evidence.Status.REPORTED, store.reference(reported.id()).orElseThrow().status());
        var audit = store.events("evidence:" + confirmed.id());
        assertEquals(2, audit.size());
        assertEquals("oidc-publisher", audit.get(1).reviewerId());
        assertEquals("Checked official source", audit.get(1).rationale());
        assertTrue(new ContradictionReview(store, ignored -> { }).view("evidence:" + confirmed.id()).confirmedValue().isPresent());
        now.set(NOW.plusSeconds(10));
        assertEquals(reported, intake.submit(command), "retry retains server retrieval time and immutable bytes");
        assertEquals(confirmed, intake.confirm(reported.id(), new ReviewedEvidenceIntake.ConfirmationCommand(id(4), "Checked official source")));
        assertEquals(2, store.events("evidence:" + confirmed.id()).size());
    }

    @Test
    void unauthorizedCallerCannotWriteAnyEvidence() {
        var denied = new ReviewedEvidenceIntake(store, new ContradictionReview(store, ignored -> { }),
                () -> { throw new SecurityException("publisher required"); }, now::get);
        assertThrows(SecurityException.class, () -> denied.submit(command()));
        assertTrue(store.source(id(1)).isEmpty());
    }

    @Test
    void staleFutureAndUnknownEffectiveDatesNeverBecomeConfirmedFacts() {
        var reported = intake.submit(command());
        now.set(NOW.plusSeconds(3601));
        assertThrows(IllegalArgumentException.class, () -> intake.confirm(reported.id(),
                new ReviewedEvidenceIntake.ConfirmationCommand(id(4), "Too late")));
        assertTrue(store.reference(id(4)).isEmpty());
        now.set(NOW);
        var unknown = command();
        unknown = new ReviewedEvidenceIntake.SnapshotCommand(unknown.source(), id(20), id(30), unknown.publishedAt(),
                null, unknown.content(), unknown.rightsReference(), unknown.confidence(), unknown.staleAt(), unknown.expiresAt());
        var unknownRef = intake.submit(unknown);
        assertThrows(IllegalArgumentException.class, () -> intake.confirm(unknownRef.id(),
                new ReviewedEvidenceIntake.ConfirmationCommand(id(40), "Date unknown")));
        assertTrue(store.reference(id(40)).isEmpty());
    }

    @Test
    void sourceIdentityAndSnapshotCannotBeSilentlyRewritten() {
        intake.submit(command());
        var original = command();
        var changed = new ReviewedEvidenceIntake.SnapshotCommand(original.source(), original.snapshotId(), original.evidenceId(),
                original.publishedAt(), original.effectiveAt(), "Rewritten original", original.rightsReference(),
                original.confidence(), original.staleAt(), original.expiresAt());
        assertThrows(IllegalStateException.class, () -> intake.submit(changed));
        assertEquals(original.content(), store.snapshot(original.snapshotId()).orElseThrow().content());
    }

    private static ReviewedEvidenceIntake.SnapshotCommand command() {
        return new ReviewedEvidenceIntake.SnapshotCommand(new Evidence.Source(id(1), Evidence.SourceType.LEAGUE,
                "Synthetic official source", URI.create("https://example.invalid/official"), true), id(2), id(3),
                NOW.minusSeconds(3600), NOW.minusSeconds(3600), "Synthetic rights-approved reference", "Written public-reference permission",
                0.9, NOW.plusSeconds(3600), NOW.plusSeconds(7200));
    }

    private static UUID id(int suffix) {
        return UUID.fromString("00000000-0000-4000-8000-" + String.format("%012d", suffix));
    }
}
