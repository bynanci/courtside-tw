package tw.basketball.magazine.media.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
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
                .peek(record -> Objects.requireNonNull(record, "records must not contain null"))
                .filter(record -> record.assetId().equals(assetId))
                .sorted(Comparator.comparing(RightsRecord::id))
                .toList();
        if (assetRecords.isEmpty()) {
            return RightsDecision.blocked(assetId, "RIGHTS_MISSING");
        }

        Optional<RightsRecord> revokedRecord = assetRecords.stream()
                .filter(record -> record.status() == Status.REVOKED)
                .findFirst();
        if (revokedRecord.isPresent()) {
            return RightsDecision.blocked(assetId, "RIGHTS_REVOKED", revokedRecord.get());
        }

        List<RightsRecord> activeRecords = assetRecords.stream()
                .filter(record -> record.isActiveAt(checkedAt))
                .toList();
        if (!activeRecords.isEmpty()) {
            Optional<RightsRecord> allowedRecord = activeRecords.stream()
                    .filter(record -> record.allowedChannels().contains(requiredChannel))
                    .findFirst();
            if (allowedRecord.isPresent()) {
                return RightsDecision.allowed(assetId, allowedRecord.get());
            }
            return RightsDecision.blocked(assetId, "RIGHTS_WRONG_CHANNEL", activeRecords.get(0));
        }

        Optional<RightsRecord> expiredRecord = assetRecords.stream()
                .filter(record -> record.isExpiredAt(checkedAt))
                .findFirst();
        if (expiredRecord.isPresent()) {
            return RightsDecision.blocked(assetId, "RIGHTS_EXPIRED", expiredRecord.get());
        }

        return RightsDecision.blocked(assetId, "RIGHTS_MISSING", assetRecords.get(0));
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
            UUID id,
            UUID assetId,
            long version,
            Status status,
            Set<String> allowedChannels,
            Instant validFrom,
            Instant validUntil
    ) {
        public RightsRecord {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(allowedChannels, "allowedChannels");
            Objects.requireNonNull(validFrom, "validFrom");
            Objects.requireNonNull(validUntil, "validUntil");
            if (version < 0) {
                throw new IllegalArgumentException("version must be non-negative");
            }
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

    public record RightsDecision(
            UUID assetId,
            boolean allowed,
            String blockingCode,
            UUID rightsRecordId,
            Long rightsRecordVersion
    ) {
        public RightsDecision {
            Objects.requireNonNull(assetId, "assetId");
            if (allowed && blockingCode != null) {
                throw new IllegalArgumentException("allowed decisions cannot have a blocking code");
            }
            if (!allowed && (blockingCode == null || blockingCode.isBlank())) {
                throw new IllegalArgumentException("blocked decisions require a blocking code");
            }
            if ((rightsRecordId == null) != (rightsRecordVersion == null)) {
                throw new IllegalArgumentException("rights record identity and version must be paired");
            }
            if (rightsRecordVersion != null && rightsRecordVersion < 0) {
                throw new IllegalArgumentException("rights record version must be non-negative");
            }
            if (allowed && rightsRecordId == null) {
                throw new IllegalArgumentException("allowed decisions require rights evidence");
            }
        }

        public static RightsDecision allowed(UUID assetId, RightsRecord record) {
            return new RightsDecision(assetId, true, null, record.id(), record.version());
        }

        public static RightsDecision blocked(UUID assetId, String blockingCode) {
            return new RightsDecision(assetId, false, blockingCode, null, null);
        }

        public static RightsDecision blocked(UUID assetId, String blockingCode, RightsRecord record) {
            return new RightsDecision(assetId, false, blockingCode, record.id(), record.version());
        }
    }
}
