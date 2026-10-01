package tw.basketball.magazine.evidence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Append-only persistence port. Implementations must atomically append review event + audit metadata. */
public interface EvidenceStore {
    void appendSource(Evidence.Source source);
    void appendSnapshot(Evidence.SourceSnapshot snapshot);
    void appendReference(Evidence.EvidenceRef reference);
    Optional<Evidence.Source> source(UUID id);
    Optional<Evidence.SourceSnapshot> snapshot(UUID id);
    Optional<Evidence.EvidenceRef> reference(UUID id);
    List<ReviewEvent> events(String claimKey);
    void appendEvent(ReviewEvent event, int expectedRevision);

    enum EventKind { PROPOSED, REVIEWED }

    /** Reviewer IDs and controlled rationale are private audit metadata and never public projections. */
    record ReviewEvent(UUID id, String claimKey, int revision, EventKind kind, String value,
                       List<UUID> evidenceIds, Evidence.Status status, String reviewerId,
                       String rationale, Instant createdAt) {
        public ReviewEvent {
            java.util.Objects.requireNonNull(id, "id");
            java.util.Objects.requireNonNull(kind, "kind");
            java.util.Objects.requireNonNull(status, "status");
            java.util.Objects.requireNonNull(createdAt, "createdAt");
            createdAt = Evidence.canonicalTime(createdAt);
            if (claimKey == null || !claimKey.matches("[A-Za-z0-9_.:-]{1,200}") || revision < 1
                    || value == null || value.isBlank() || value.length() > 2000) {
                throw new IllegalArgumentException("invalid review event");
            }
            evidenceIds = List.copyOf(evidenceIds);
            if (evidenceIds.isEmpty()) {
                throw new IllegalArgumentException("review events need evidence");
            }
            if (kind == EventKind.REVIEWED && (reviewerId == null || reviewerId.isBlank()
                    || rationale == null || rationale.isBlank() || rationale.length() > 1000)) {
                throw new IllegalArgumentException("review decision requires actor and rationale");
            }
        }
    }
}
