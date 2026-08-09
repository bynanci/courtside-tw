package tw.basketball.magazine.media.processing;

import java.util.Objects;
import java.util.UUID;

/** Completion input after an object has been uploaded to private storage. */
public final class MediaCompletionRequest {
    private final UUID assetId;
    private final String declaredMimeType;
    private final long declaredBytes;
    private final String expectedSha256;
    private final byte[] bytes;

    public MediaCompletionRequest(
            UUID assetId,
            String declaredMimeType,
            long declaredBytes,
            String expectedSha256,
            byte[] bytes
    ) {
        this.assetId = Objects.requireNonNull(assetId, "assetId");
        this.declaredMimeType = requireText(declaredMimeType, "declaredMimeType");
        if (declaredBytes < 1) {
            throw new IllegalArgumentException("declaredBytes must be positive");
        }
        this.declaredBytes = declaredBytes;
        this.expectedSha256 = requireText(expectedSha256, "expectedSha256");
        this.bytes = Objects.requireNonNull(bytes, "bytes").clone();
    }

    public UUID assetId() {
        return assetId;
    }

    public String declaredMimeType() {
        return declaredMimeType;
    }

    public long declaredBytes() {
        return declaredBytes;
    }

    public String expectedSha256() {
        return expectedSha256;
    }

    public byte[] bytes() {
        return bytes.clone();
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > 256) {
            throw new IllegalArgumentException(field + " must be a bounded value");
        }
        return normalized;
    }
}
