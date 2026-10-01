package tw.basketball.magazine.basketball.application;

import java.util.List;
import java.util.Objects;
import tw.basketball.magazine.basketball.ports.BasketballSourceAdapter;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.EvidenceStore;
import tw.basketball.magazine.evidence.EvidenceValidation;

/** Snapshot first; validate proposals; append to review. This class intentionally cannot write a catalog. */
public final class NormalizationIntake {
    private final EvidenceStore store;
    private final ContradictionReview review;

    public NormalizationIntake(EvidenceStore store, ContradictionReview review) {
        this.store = Objects.requireNonNull(store, "store");
        this.review = Objects.requireNonNull(review, "review");
    }

    public List<BasketballSourceAdapter.NormalizedClaim> accept(BasketballSourceAdapter adapter,
            Evidence.SourceSnapshot snapshot, List<BasketballSourceAdapter.SourceClaim> input) {
        store.appendSnapshot(snapshot);
        List<BasketballSourceAdapter.NormalizedClaim> proposals = adapter.normalize(snapshot, input);
        // Validate the whole batch before any proposal can be appended. Snapshot retention is intentional.
        for (BasketballSourceAdapter.NormalizedClaim proposal : proposals) {
            if (!snapshot.id().equals(proposal.snapshotId())) {
                throw new IllegalArgumentException("adapter changed snapshot identity");
            }
            for (java.util.UUID id : proposal.evidenceIds()) {
                Evidence.EvidenceRef reference = store.reference(id)
                        .orElseThrow(() -> new IllegalArgumentException("missing normalized evidence"));
                EvidenceValidation.validate(reference, store);
                if (!snapshot.id().equals(reference.snapshotId()) || reference.status() != proposal.status()) {
                    throw new IllegalArgumentException("adapter cannot switch evidence snapshot or promote claim status");
                }
            }
        }
        for (BasketballSourceAdapter.NormalizedClaim proposal : proposals) {
            review.propose(proposal.proposalId(), proposal.claimKey(), proposal.value(), proposal.evidenceIds(),
                    proposal.status(), Evidence.Origin.ADAPTER, snapshot.retrievedAt());
        }
        return List.copyOf(proposals);
    }
}
