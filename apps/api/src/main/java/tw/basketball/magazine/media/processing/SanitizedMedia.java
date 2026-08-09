package tw.basketball.magazine.media.processing;

import java.util.Objects;
import java.util.UUID;

/** Media bytes after metadata removal, before variant encoding. */
public final class SanitizedMedia {
    private final UUID assetId;
    private final String mimeType;
    private final String originalSha256;
    private final byte[] bytes;

    public SanitizedMedia(UUID assetId, String mimeType, String originalSha256, byte[] bytes) {
        this.assetId = Objects.requireNonNull(assetId, "assetId");
        this.mimeType = Objects.requireNonNull(mimeType, "mimeType");
        this.originalSha256 = Objects.requireNonNull(originalSha256, "originalSha256");
        this.bytes = Objects.requireNonNull(bytes, "bytes").clone();
    }

    public UUID assetId() {
        return assetId;
    }

    public String mimeType() {
        return mimeType;
    }

    public String originalSha256() {
        return originalSha256;
    }

    public byte[] bytes() {
        return bytes.clone();
    }
}
