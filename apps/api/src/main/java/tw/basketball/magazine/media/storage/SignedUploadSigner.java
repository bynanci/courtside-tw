package tw.basketball.magazine.media.storage;

import java.net.URI;
import java.time.Instant;

/** Adapter capability that signs one already-validated PUT contract. */
@FunctionalInterface
public interface SignedUploadSigner {
    URI signPut(
            String storageKey,
            String mimeType,
            long maxBytes,
            Instant expiresAt,
            StorageVisibility visibility
    );
}
