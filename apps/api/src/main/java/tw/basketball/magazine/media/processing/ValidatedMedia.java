package tw.basketball.magazine.media.processing;

import java.util.Objects;
import java.util.UUID;

/** Validated original bytes kept in memory only for the processing boundary. */
public final class ValidatedMedia {
    private final UUID assetId;
    private final String mimeType;
    private final String sha256;
    private final byte[] bytes;

    public ValidatedMedia(UUID assetId, String mimeType, String sha256, byte[] bytes) {
        this.assetId = Objects.requireNonNull(assetId, "assetId");
        this.mimeType = Objects.requireNonNull(mimeType, "mimeType");
        this.sha256 = Objects.requireNonNull(sha256, "sha256");
        this.bytes = Objects.requireNonNull(bytes, "bytes").clone();
    }

    public UUID assetId() {
        return assetId;
    }

    public String mimeType() {
        return mimeType;
    }

    public String sha256() {
        return sha256;
    }

    public byte[] bytes() {
        return bytes.clone();
    }
}
