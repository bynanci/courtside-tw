package tw.basketball.magazine.media.processing;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Bounded processing result; only sanitized bytes may cross this testable boundary. */
public final class MediaProcessingResult {
    private final UUID assetId;
    private final MediaProcessingState state;
    private final MediaFailureReason failureReason;
    private final String originalSha256;
    private final List<MediaVariant> variants;
    private final byte[] sanitizedBytes;

    public MediaProcessingResult(
            UUID assetId,
            MediaProcessingState state,
            MediaFailureReason failureReason,
            String originalSha256,
            List<MediaVariant> variants,
            byte[] sanitizedBytes
    ) {
        this.assetId = Objects.requireNonNull(assetId, "assetId");
        this.state = Objects.requireNonNull(state, "state");
        this.failureReason = failureReason;
        this.originalSha256 = originalSha256;
        this.variants = List.copyOf(Objects.requireNonNull(variants, "variants"));
        this.sanitizedBytes = Objects.requireNonNull(sanitizedBytes, "sanitizedBytes").clone();
    }

    public UUID assetId() {
        return assetId;
    }

    public MediaProcessingState state() {
        return state;
    }

    public MediaFailureReason failureReason() {
        return failureReason;
    }

    public String originalSha256() {
        return originalSha256;
    }

    public List<MediaVariant> variants() {
        return List.copyOf(variants);
    }

    public byte[] sanitizedBytes() {
        return sanitizedBytes.clone();
    }
}
