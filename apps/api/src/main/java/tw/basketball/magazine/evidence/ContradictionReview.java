package tw.basketball.magazine.evidence;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Every proposal survives; only an authorized, attributable human decision can resolve a conflict. */
public final class ContradictionReview {
    private final EvidenceStore store;
    private final ReviewAuthority authority;

    public ContradictionReview(EvidenceStore store, ReviewAuthority authority) {
        this.store = Objects.requireNonNull(store, "store");
        this.authority = Objects.requireNonNull(authority, "authority");
    }

    @FunctionalInterface
    public interface ReviewAuthority {
        void requireReviewer(String actorId);
    }

    public record ClaimView(String claimKey, Optional<String> confirmedValue, boolean disputed,
                            int revision, List<EvidenceStore.ReviewEvent> history) {
        public ClaimView {
            history = List.copyOf(history);
        }
    }

    public void propose(UUID eventId, String claimKey, String value, List<UUID> evidenceIds,
                        Evidence.Status status, Evidence.Origin origin, Instant at) {
        Objects.requireNonNull(origin, "origin");
        for (UUID id : evidenceIds) {
            Evidence.EvidenceRef reference = reference(id);
            EvidenceValidation.validate(reference, store);
            Evidence.requirePermittedTransition(reference.status(), status, origin);
        }
        // Proposal status is descriptive only: even a source marked CONFIRMED cannot publish itself.
        List<EvidenceStore.ReviewEvent> history = store.events(claimKey);
        Optional<EvidenceStore.ReviewEvent> prior = history.stream().filter(row -> row.id().equals(eventId)).findFirst();
        int revision = prior.map(EvidenceStore.ReviewEvent::revision).orElse(history.size() + 1);
        store.appendEvent(new EvidenceStore.ReviewEvent(eventId, claimKey, revision,
                EvidenceStore.EventKind.PROPOSED, value, evidenceIds, status, null, null, at), revision - 1);
    }

    public void decide(UUID eventId, String claimKey, UUID selectedProposalId, Evidence.Status status,
                       String reviewerId, String rationale, int expectedRevision, Instant at) {
        authority.requireReviewer(reviewerId);
        List<EvidenceStore.ReviewEvent> history = store.events(claimKey);
        if (history.size() != expectedRevision) {
            throw new IllegalStateException("reviewer must read the latest contradiction set");
        }
        EvidenceStore.ReviewEvent selected = history.stream()
                .filter(row -> row.id().equals(selectedProposalId) && row.kind() == EvidenceStore.EventKind.PROPOSED)
                .findFirst().orElseThrow(() -> new IllegalArgumentException("select an existing proposal"));
        if (status == Evidence.Status.CONFIRMED) {
            for (UUID id : selected.evidenceIds()) {
                Evidence.EvidenceRef ref = reference(id);
                if (ref.status() == Evidence.Status.RUMOR || ref.status() == Evidence.Status.UNKNOWN
                        || ref.status() == Evidence.Status.ANALYSIS || ref.effectiveAt() == null
                        || !"fresh".equals(ref.conditionAt(at, false)) || ref.retrievedAt().isAfter(at)) {
                    throw new IllegalArgumentException("confirmation requires fresh factual evidence with effectiveAt");
                }
            }
        }
        store.appendEvent(new EvidenceStore.ReviewEvent(eventId, claimKey, expectedRevision + 1,
                EvidenceStore.EventKind.REVIEWED, selected.value(), selected.evidenceIds(), status,
                reviewerId, rationale, at), expectedRevision);
    }

    public ClaimView view(String claimKey) {
        List<EvidenceStore.ReviewEvent> history = store.events(claimKey);
        EvidenceStore.ReviewEvent decision = history.stream().filter(row -> row.kind() == EvidenceStore.EventKind.REVIEWED)
                .reduce((previous, next) -> next).orElse(null);
        int decisionRevision = decision == null ? 0 : decision.revision();
        List<String> candidates = history.stream().filter(row -> row.kind() == EvidenceStore.EventKind.PROPOSED
                && row.revision() > decisionRevision).map(EvidenceStore.ReviewEvent::value).toList();
        boolean disputed = candidates.stream().distinct().count() > 1
                || (decision != null && candidates.stream().anyMatch(value -> !value.equals(decision.value())));
        Optional<String> confirmed = decision != null && decision.status() == Evidence.Status.CONFIRMED
                ? Optional.of(decision.value()) : Optional.empty();
        return new ClaimView(claimKey, confirmed, disputed, history.size(), history);
    }

    private Evidence.EvidenceRef reference(UUID id) {
        return store.reference(id).orElseThrow(() -> new IllegalArgumentException("unknown evidence reference"));
    }
}
