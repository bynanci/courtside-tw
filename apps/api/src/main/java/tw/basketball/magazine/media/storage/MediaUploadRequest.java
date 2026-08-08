package tw.basketball.magazine.media.storage;

import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/** Client-independent upload intent; callers never provide an object key. */
public record MediaUploadRequest(UUID assetId, String mimeType, long byteSize) {
    public MediaUploadRequest {
        assetId = Objects.requireNonNull(assetId, "assetId");
        mimeType = normalizedMimeType(mimeType);
        if (byteSize < 1) {
            throw new IllegalArgumentException("byteSize must be positive");
        }
    }

    private static String normalizedMimeType(String value) {
        Objects.requireNonNull(value, "mimeType");
        String normalized = value.strip().toLowerCase(Locale.ROOT);
        if (normalized.isBlank()
                || normalized.length() > 128
                || normalized.codePoints().anyMatch(Character::isISOControl)
                || !normalized.contains("/")) {
            throw new IllegalArgumentException("mimeType must be bounded and well-formed");
        }
        return normalized;
    }
}
