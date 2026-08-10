package tw.basketball.magazine.media.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.processing.MediaProcessingResult;
import tw.basketball.magazine.media.processing.MediaVariant;

/** PostgreSQL adapter for private originals and generated public variants. */
public final class JdbcMediaAssetRepository implements MediaAssetRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcMediaAssetRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public void insertPending(PendingAsset asset) {
        Objects.requireNonNull(asset, "asset");
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    original_filename, upload_id, upload_intent_expires_at,
                    processing_state, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)
                """,
                asset.assetId(),
                asset.privateStorageKey(),
                asset.checksumSha256(),
                asset.mimeType(),
                asset.byteSize(),
                asset.originalFilename(),
                asset.uploadId(),
                Timestamp.from(asset.uploadIntentExpiresAt())
        );
    }

    @Override
    public Optional<MediaAssetRecord> find(UUID assetId) {
        Objects.requireNonNull(assetId, "assetId");
        return jdbcTemplate.query("""
                SELECT id, upload_id, original_filename, private_storage_key,
                       checksum_sha256, mime_type, byte_size, alt_text,
                       processing_state, version, upload_intent_expires_at
                FROM media_asset
                WHERE id = ?
                """, resultSet -> resultSet.next()
                ? Optional.of(mapAsset(resultSet))
                : Optional.empty(), assetId);
    }

    @Override
    public boolean markProcessing(UUID assetId, long expectedVersion) {
        return jdbcTemplate.update("""
                UPDATE media_asset
                SET processing_state = 'PROCESSING',
                    version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND processing_state = 'PENDING' AND version = ?
                """, assetId, expectedVersion) == 1;
    }

    @Override
    public boolean recordProcessingResult(
            UUID assetId,
            long expectedVersion,
            MediaProcessingResult result
    ) {
        Objects.requireNonNull(result, "result");
        MediaAssetRecord current = find(assetId).orElse(null);
        if (current == null || current.version() != expectedVersion
                || current.processingState() != MediaProcessingState.PROCESSING) {
            return false;
        }
        var resultState = result.state();
        MediaProcessingState nextState = resultState == tw.basketball.magazine.media.processing.MediaProcessingState.READY
                && current.altText() != null
                && !current.altText().isBlank()
                ? MediaProcessingState.READY
                : resultState == tw.basketball.magazine.media.processing.MediaProcessingState.FAILED
                ? MediaProcessingState.FAILED
                : MediaProcessingState.PROCESSING;
        String checksum = result.originalSha256() == null
                ? current.checksumSha256()
                : result.originalSha256();
        int rows = jdbcTemplate.update("""
                UPDATE media_asset
                SET checksum_sha256 = ?, processing_state = ?, version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND processing_state = 'PROCESSING' AND version = ?
                """, checksum, nextState.name(), assetId, expectedVersion);
        if (rows != 1) {
            return false;
        }
        // Keep generated variants even when the worker finishes before the
        // editor has supplied required alt text. Metadata completion can then
        // promote the asset to READY without re-reading the private original.
        if (resultState == tw.basketball.magazine.media.processing.MediaProcessingState.READY) {
            for (MediaVariant variant : result.variants()) {
                jdbcTemplate.update("""
                        INSERT INTO media_variant (
                            asset_id, variant, public_storage_key, checksum_sha256,
                            mime_type, byte_size, width, height
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (asset_id, variant) DO NOTHING
                        """,
                        assetId,
                        variant.name(),
                        "media/variants/" + assetId + "/" + variant.name(),
                        checksum,
                        variant.mimeType(),
                        variant.byteSize(),
                        variant.width(),
                        variant.height()
                );
            }
        }
        return true;
    }

    @Override
    public boolean updateMetadata(UUID assetId, long expectedVersion, String altText) {
        return jdbcTemplate.update("""
                UPDATE media_asset
                SET alt_text = ?,
                    processing_state = CASE
                        WHEN processing_state = 'PROCESSING'
                             AND btrim(?) <> ''
                             AND EXISTS (
                                 SELECT 1 FROM media_variant variant
                                 WHERE variant.asset_id = media_asset.id
                             )
                            THEN 'READY'
                        ELSE processing_state
                    END,
                    version = version + 1, updated_at = transaction_timestamp()
                WHERE id = ? AND version = ? AND processing_state <> 'REVOKED'
                """, altText, altText, assetId, expectedVersion) == 1;
    }

    @Override
    public List<MediaVariantRecord> variants(UUID assetId) {
        return jdbcTemplate.query("""
                SELECT asset_id, variant, public_storage_key, mime_type,
                       byte_size, width, height, checksum_sha256
                FROM media_variant
                WHERE asset_id = ?
                ORDER BY variant, id
                """, (resultSet, rowNumber) -> new MediaVariantRecord(
                uuid(resultSet, "asset_id"),
                resultSet.getString("variant"),
                resultSet.getString("public_storage_key"),
                resultSet.getString("mime_type"),
                resultSet.getLong("byte_size"),
                resultSet.getInt("width"),
                resultSet.getInt("height"),
                resultSet.getString("checksum_sha256")
        ), assetId);
    }

    private static MediaAssetRecord mapAsset(ResultSet resultSet) throws SQLException {
        Timestamp expiry = resultSet.getTimestamp("upload_intent_expires_at");
        return new MediaAssetRecord(
                uuid(resultSet, "id"),
                nullableUuid(resultSet, "upload_id"),
                resultSet.getString("original_filename"),
                resultSet.getString("private_storage_key"),
                resultSet.getString("checksum_sha256"),
                resultSet.getString("mime_type"),
                resultSet.getLong("byte_size"),
                resultSet.getString("alt_text"),
                MediaProcessingState.valueOf(resultSet.getString("processing_state")),
                resultSet.getLong("version"),
                expiry == null ? null : expiry.toInstant()
        );
    }

    private static UUID uuid(ResultSet resultSet, String column) throws SQLException {
        return UUID.fromString(resultSet.getString(column));
    }

    private static UUID nullableUuid(ResultSet resultSet, String column) throws SQLException {
        String value = resultSet.getString(column);
        return value == null ? null : UUID.fromString(value);
    }
}
