package tw.basketball.magazine.publication.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.domain.RightsPolicy;

/**
 * Produces stable, bounded blocking codes for an editorial publication gate.
 * The result is deliberately explainable to a Studio user and to an audit
 * record; it never treats a model or external service response as approval.
 */
public final class PublicationReadinessService {
    public ReadinessReport evaluate(
            boolean contentReady,
            Collection<MediaRequirement> mediaRequirements,
            Instant checkedAt
    ) {
        Objects.requireNonNull(mediaRequirements, "mediaRequirements");
        Objects.requireNonNull(checkedAt, "checkedAt");

        List<ReadinessBlock> blockers = new ArrayList<>();
        if (!contentReady) {
            blockers.add(new ReadinessBlock(null, "CONTENT_NOT_READY", null, null));
        }
        for (MediaRequirement requirement : mediaRequirements) {
            if (requirement.processingState() != MediaProcessingState.READY) {
                String code = requirement.processingState() == MediaProcessingState.REVOKED
                        ? "MEDIA_REVOKED"
                        : "MEDIA_NOT_READY";
                blockers.add(new ReadinessBlock(requirement.assetId(), code, null, null));
                continue;
            }

            RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                    requirement.assetId(),
                    requirement.rightsRecords(),
                    RightsPolicy.PUBLIC_WEB_CHANNEL,
                    checkedAt
            );
            if (!decision.allowed()) {
                blockers.add(new ReadinessBlock(
                        decision.assetId(),
                        decision.blockingCode(),
                        decision.rightsRecordId(),
                        decision.rightsRecordVersion()
                ));
            }
        }
        return new ReadinessReport(blockers);
    }

    public record MediaRequirement(
            UUID assetId,
            MediaProcessingState processingState,
            Collection<RightsPolicy.RightsRecord> rightsRecords
    ) {
        public MediaRequirement {
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(processingState, "processingState");
            Objects.requireNonNull(rightsRecords, "rightsRecords");
            rightsRecords = List.copyOf(rightsRecords);
        }
    }

    public record ReadinessBlock(
            UUID assetId,
            String code,
            UUID rightsRecordId,
            Long rightsRecordVersion
    ) {
        public ReadinessBlock {
            Objects.requireNonNull(code, "code");
            if (assetId == null && !"CONTENT_NOT_READY".equals(code)) {
                throw new IllegalArgumentException("media blockers require an asset id");
            }
            if ((rightsRecordId == null) != (rightsRecordVersion == null)) {
                throw new IllegalArgumentException("rights evidence identity and version must be paired");
            }
            if (rightsRecordVersion != null && rightsRecordVersion < 0) {
                throw new IllegalArgumentException("rights record version must be non-negative");
            }
        }
    }

    public record ReadinessReport(List<ReadinessBlock> blockers) {
        public ReadinessReport {
            Objects.requireNonNull(blockers, "blockers");
            blockers = List.copyOf(blockers);
        }

        public boolean ready() {
            return blockers.isEmpty();
        }

        public List<String> blockingCodes() {
            LinkedHashSet<String> codes = new LinkedHashSet<>();
            blockers.stream()
                    .map(ReadinessBlock::code)
                    .forEach(codes::add);
            return List.copyOf(codes);
        }
    }
}
