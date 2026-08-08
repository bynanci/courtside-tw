package tw.basketball.magazine.media.storage;

import java.net.URI;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A complete, bounded PUT contract returned to a trusted application caller. */
public record SignedUpload(
        UUID assetId,
        UUID uploadId,
        String storageKey,
        String mimeType,
        long maxBytes,
        Instant expiresAt,
        URI url,
        StorageVisibility visibility
) {
    public SignedUpload {
        assetId = Objects.requireNonNull(assetId, "assetId");
        uploadId = Objects.requireNonNull(uploadId, "uploadId");
        storageKey = Objects.requireNonNull(storageKey, "storageKey");
        mimeType = Objects.requireNonNull(mimeType, "mimeType");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        url = requireHttpsUrl(url);
        visibility = Objects.requireNonNull(visibility, "visibility");
        if (maxBytes < 1 || !storageKey.startsWith("media/originals/")) {
            throw new IllegalArgumentException("signed upload contract is invalid");
        }
        if (visibility != StorageVisibility.PRIVATE_ORIGINAL) {
            throw new IllegalArgumentException("original uploads must remain private");
        }
    }

    private static URI requireHttpsUrl(URI value) {
        URI uri = Objects.requireNonNull(value, "url");
        if (!uri.isAbsolute() || !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("signed upload URL must use HTTPS");
        }
        return uri;
    }
}
