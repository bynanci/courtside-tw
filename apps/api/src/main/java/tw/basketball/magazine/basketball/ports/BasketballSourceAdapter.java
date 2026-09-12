package tw.basketball.magazine.basketball.ports;

import java.util.List;
import java.util.UUID;
import tw.basketball.magazine.evidence.Evidence;

/** Normalization-only capability; implementations receive no canonical write or network capability. */
public interface BasketballSourceAdapter {
    String provider();
    List<NormalizedClaim> normalize(Evidence.SourceSnapshot snapshot, List<SourceClaim> input);

    record SourceClaim(String externalKey, UUID stableEntityId, String field, String value,
                       Evidence.Status status, List<UUID> evidenceIds) {
        public SourceClaim {
            java.util.Objects.requireNonNull(stableEntityId, "stableEntityId must be resolved before normalization");
            java.util.Objects.requireNonNull(status, "status");
            if (externalKey == null || externalKey.isBlank() || externalKey.length() > 200
                    || field == null || !field.matches("[A-Za-z][A-Za-z0-9_.]{0,80}")
                    || value == null || value.isBlank() || value.length() > 2000) {
                throw new IllegalArgumentException("invalid source claim");
            }
            evidenceIds = List.copyOf(evidenceIds);
            if (evidenceIds.isEmpty()) {
                throw new IllegalArgumentException("normalization requires evidence references");
            }
        }
    }

    record NormalizedClaim(UUID proposalId, String claimKey, String value, Evidence.Status status,
                           UUID snapshotId, List<UUID> evidenceIds) {
        public NormalizedClaim {
            evidenceIds = List.copyOf(evidenceIds);
        }
    }
}
