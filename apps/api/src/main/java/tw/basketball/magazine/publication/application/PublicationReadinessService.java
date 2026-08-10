package tw.basketball.magazine.publication.application;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

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

        LinkedHashSet<String> blockingCodes = new LinkedHashSet<>();
        if (!contentReady) {
            blockingCodes.add("CONTENT_NOT_READY");
        }
        for (MediaRequirement requirement : mediaRequirements) {
            RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                    requirement.assetId(),
                    requirement.rightsRecords(),
                    RightsPolicy.PUBLIC_WEB_CHANNEL,
                    checkedAt
            );
            if (!decision.allowed()) {
                blockingCodes.add(decision.blockingCode());
            }
        }
        return new ReadinessReport(blockingCodes.isEmpty(), List.copyOf(blockingCodes));
    }

    public record MediaRequirement(
            UUID assetId,
            Collection<RightsPolicy.RightsRecord> rightsRecords
    ) {
        public MediaRequirement {
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(rightsRecords, "rightsRecords");
            rightsRecords = List.copyOf(rightsRecords);
        }
    }

    public record ReadinessReport(boolean ready, List<String> blockingCodes) {
        public ReadinessReport {
            Objects.requireNonNull(blockingCodes, "blockingCodes");
            blockingCodes = List.copyOf(blockingCodes);
            if (ready && !blockingCodes.isEmpty()) {
                throw new IllegalArgumentException("ready reports cannot contain blocking codes");
            }
            if (!ready && blockingCodes.isEmpty()) {
                throw new IllegalArgumentException("blocked reports require blocking codes");
            }
        }
    }
}
