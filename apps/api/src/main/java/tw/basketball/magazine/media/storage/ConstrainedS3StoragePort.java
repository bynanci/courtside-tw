package tw.basketball.magazine.media.storage;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Enforces server-owned keys and bounded signed PUT constraints before an
 * S3-compatible signer is called.
 */
public final class ConstrainedS3StoragePort implements S3CompatibleStoragePort {
    private static final String ORIGINAL_PREFIX = "media/originals/";

    private final SignedUploadSigner signer;
    private final Clock clock;
    private final StorageUploadPolicy policy;
    private final Supplier<UUID> uploadIdSupplier;

    public ConstrainedS3StoragePort(
            SignedUploadSigner signer,
            Clock clock,
            StorageUploadPolicy policy,
            Supplier<UUID> uploadIdSupplier
    ) {
        this.signer = Objects.requireNonNull(signer, "signer");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.uploadIdSupplier = Objects.requireNonNull(uploadIdSupplier, "uploadIdSupplier");
    }

    public ConstrainedS3StoragePort(SignedUploadSigner signer, Clock clock) {
        this(signer, clock, StorageUploadPolicy.standard(), UUID::randomUUID);
    }

    @Override
    public SignedUpload createSignedUpload(MediaUploadRequest request) {
        Objects.requireNonNull(request, "request");
        if (!policy.allowedMimeTypes().contains(request.mimeType())) {
            throw new IllegalArgumentException("MIME type is not allowed for original uploads");
        }
        if (request.byteSize() > policy.maximumBytes()) {
            throw new IllegalArgumentException("upload exceeds the configured maximum size");
        }

        UUID uploadId = Objects.requireNonNull(uploadIdSupplier.get(), "uploadIdSupplier returned null");
        String storageKey = ORIGINAL_PREFIX + request.assetId() + "/" + uploadId;
        Instant expiresAt = clock.instant().plus(policy.signedUrlTtl());
        URI url = Objects.requireNonNull(
                signer.signPut(
                        storageKey,
                        request.mimeType(),
                        request.byteSize(),
                        expiresAt,
                        StorageVisibility.PRIVATE_ORIGINAL
                ),
                "signer returned null URL"
        );
        return new SignedUpload(
                request.assetId(),
                uploadId,
                storageKey,
                request.mimeType(),
                request.byteSize(),
                expiresAt,
                url,
                StorageVisibility.PRIVATE_ORIGINAL
        );
    }
}
