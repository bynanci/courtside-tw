package tw.basketball.magazine.media.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Evaluates the rights record that must be satisfied before an asset can be
 * included in a public publication snapshot.
 */
public final class RightsPolicy {
    public static final String PUBLIC_WEB_CHANNEL = "PUBLIC_WEB";

    private RightsPolicy() {
    }

    public static RightsDecision evaluate(
            UUID assetId,
            Collection<RightsRecord> records,
            String requiredChannel,
            Instant checkedAt
    ) {
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(records, "records");
        Objects.requireNonNull(checkedAt, "checkedAt");
        if (requiredChannel == null || requiredChannel.isBlank()) {
            throw new IllegalArgumentException("requiredChannel must not be blank");
        }

        List<RightsRecord> assetRecords = records.stream()
                .filter(record -> record.assetId().equals(assetId))
                .toList();
        if (assetRecords.isEmpty()) {
            return RightsDecision.blocked(assetId, "RIGHTS_MISSING");
        }
        if (assetRecords.stream().anyMatch(record -> record.status() == Status.REVOKED)) {
            return RightsDecision.blocked(assetId, "RIGHTS_REVOKED");
        }

        boolean activeRecord = assetRecords.stream().anyMatch(record -> record.isActiveAt(checkedAt));
        if (activeRecord && assetRecords.stream().anyMatch(record ->
                record.isActiveAt(checkedAt) && record.allowedChannels().contains(requiredChannel))) {
            return RightsDecision.allowed(assetId);
        }
        if (activeRecord) {
            return RightsDecision.blocked(assetId, "RIGHTS_WRONG_CHANNEL");
        }
        if (assetRecords.stream().anyMatch(record -> record.isExpiredAt(checkedAt))) {
            return RightsDecision.blocked(assetId, "RIGHTS_EXPIRED");
        }
        return RightsDecision.blocked(assetId, "RIGHTS_MISSING");
    }

    public enum Status {
        UNKNOWN,
        PENDING,
        VALID,
        EXPIRED,
        REVOKED,
        BLOCKED
    }

    public record RightsRecord(
            UUID assetId,
            Status status,
            Set<String> allowedChannels,
            Instant validFrom,
            Instant validUntil
    ) {
        public RightsRecord {
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(allowedChannels, "allowedChannels");
            Objects.requireNonNull(validFrom, "validFrom");
            Objects.requireNonNull(validUntil, "validUntil");
            if (!validUntil.isAfter(validFrom)) {
                throw new IllegalArgumentException("validUntil must be after validFrom");
            }
            allowedChannels = Set.copyOf(allowedChannels);
        }

        public boolean isActiveAt(Instant checkedAt) {
            return status == Status.VALID
                    && !checkedAt.isBefore(validFrom)
                    && checkedAt.isBefore(validUntil);
        }

        public boolean isExpiredAt(Instant checkedAt) {
            return status == Status.EXPIRED
                    || (status == Status.VALID && !checkedAt.isBefore(validUntil));
        }
    }

    public record RightsDecision(UUID assetId, boolean allowed, String blockingCode) {
        public RightsDecision {
            Objects.requireNonNull(assetId, "assetId");
            if (allowed && blockingCode != null) {
                throw new IllegalArgumentException("allowed decisions cannot have a blocking code");
            }
            if (!allowed && (blockingCode == null || blockingCode.isBlank())) {
                throw new IllegalArgumentException("blocked decisions require a blocking code");
            }
        }

        public static RightsDecision allowed(UUID assetId) {
            return new RightsDecision(assetId, true, null);
        }

        public static RightsDecision blocked(UUID assetId, String blockingCode) {
            return new RightsDecision(assetId, false, blockingCode);
        }
    }
}
