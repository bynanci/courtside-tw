package tw.basketball.magazine.evidence;

import java.util.Objects;

public final class EvidenceValidation {
    private EvidenceValidation() {
    }

    public static void validate(Evidence.EvidenceRef reference, EvidenceStore store) {
        Evidence.Source source = store.source(reference.sourceId())
                .orElseThrow(() -> new IllegalArgumentException("missing source"));
        Evidence.SourceSnapshot snapshot = store.snapshot(reference.snapshotId())
                .orElseThrow(() -> new IllegalArgumentException("missing snapshot"));
        if (!snapshot.sourceId().equals(source.id()) || source.type() != reference.sourceType()
                || !snapshot.sourceUrl().equals(reference.sourceUrl())
                || !snapshot.retrievedAt().equals(reference.retrievedAt())
                || !Objects.equals(snapshot.publishedAt(), reference.publishedAt())) {
            throw new IllegalArgumentException("evidence must exactly bind source snapshot metadata");
        }
    }
}
