package tw.basketball.magazine.media.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.processing.MediaProcessingResult;

/** Persistence boundary for the T048 private-upload and worker lifecycle. */
public interface MediaAssetRepository {
    void insertPending(PendingAsset asset);

    Optional<MediaAssetRecord> find(UUID assetId);

    boolean markProcessing(UUID assetId, long expectedVersion);

    boolean recordProcessingResult(
            UUID assetId,
            long expectedVersion,
            MediaProcessingResult result
    );

    boolean updateMetadata(
            UUID assetId,
            long expectedVersion,
            String altText
    );

    List<MediaVariantRecord> variants(UUID assetId);

    record PendingAsset(
            UUID assetId,
            UUID uploadId,
            String originalFilename,
            String privateStorageKey,
            String checksumSha256,
            String mimeType,
            long byteSize,
            Instant uploadIntentExpiresAt
    ) {
    }

    record MediaAssetRecord(
            UUID assetId,
            UUID uploadId,
            String originalFilename,
            String privateStorageKey,
            String checksumSha256,
            String mimeType,
            long byteSize,
            String altText,
            MediaProcessingState processingState,
            long version,
            Instant uploadIntentExpiresAt
    ) {
    }

    record MediaVariantRecord(
            UUID assetId,
            String name,
            String publicStorageKey,
            String mimeType,
            long byteSize,
            int width,
            int height,
            String checksumSha256
    ) {
    }
}
