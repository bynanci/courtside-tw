package tw.basketball.magazine.publication;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.publication.PublicArticleModels.PublicArticleMedia;

/**
 * Resolves only server-selected public media variants for an anonymous Article projection.
 *
 * <p>The canonical document supplies an asset id and a bounded variant hint. The
 * resolver is the only component that turns that reference into a public media
 * path; callers never derive a storage path from an Article slug or asset id.</p>
 */
final class JdbcPublicMediaResolver {
    private static final Pattern SAFE_STORAGE_KEY =
            Pattern.compile("[a-z0-9][a-z0-9._/-]{0,255}");
    private static final String RESOLVE_SQL = """
            SELECT variant.public_storage_key,
                   variant.mime_type,
                   variant.width,
                   variant.height,
                   rights.credit
            FROM media_asset asset
            JOIN media_variant variant
              ON variant.asset_id = asset.id
            JOIN rights_record rights
              ON rights.asset_id = asset.id
            WHERE asset.id = ?
              AND asset.processing_state = 'READY'
              AND variant.variant = ?
              AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
              AND position('..' IN variant.public_storage_key) = 0
              AND position('//' IN variant.public_storage_key) = 0
              AND position('/./' IN variant.public_storage_key) = 0
              AND right(variant.public_storage_key, 1) <> '/'
              AND rights.status = 'VALID'
              AND rights.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
              AND rights.valid_from <= ?
              AND rights.valid_until > ?
            ORDER BY rights.valid_from DESC, rights.id DESC, variant.id ASC
            LIMIT 1
            """;

    private final JdbcTemplate jdbcTemplate;

    JdbcPublicMediaResolver(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    Optional<PublicArticleMedia> resolve(UUID assetId, String variant, Instant now) {
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(variant, "variant");
        Objects.requireNonNull(now, "now");
        if (variant.isBlank() || variant.length() > 32
                || variant.codePoints().anyMatch(Character::isISOControl)) {
            return Optional.empty();
        }

        List<MediaRow> rows = jdbcTemplate.query(
                RESOLVE_SQL,
                (resultSet, rowNumber) -> map(resultSet),
                assetId,
                variant,
                Timestamp.from(now),
                Timestamp.from(now)
        );
        return rows.stream()
                .findFirst()
                .flatMap(row -> toProjectionMedia(assetId, variant, row));
    }

    Optional<List<PublicArticleMedia>> resolveAll(
            List<MediaReference> references,
            Instant now
    ) {
        Objects.requireNonNull(references, "references");
        Objects.requireNonNull(now, "now");

        Map<MediaReference, PublicArticleMedia> resolved = new LinkedHashMap<>();
        for (MediaReference reference : references) {
            Optional<PublicArticleMedia> media = resolve(reference.assetId(), reference.variant(), now);
            if (media.isEmpty()) {
                return Optional.empty();
            }
            resolved.putIfAbsent(reference, media.get());
        }
        return Optional.of(List.copyOf(resolved.values()));
    }

    private static MediaRow map(ResultSet resultSet) throws SQLException {
        return new MediaRow(
                resultSet.getString("public_storage_key"),
                resultSet.getString("mime_type"),
                resultSet.getInt("width"),
                resultSet.getInt("height"),
                resultSet.getString("credit")
        );
    }

    private static Optional<PublicArticleMedia> toProjectionMedia(
            UUID assetId,
            String variant,
            MediaRow row
    ) {
        if (!SAFE_STORAGE_KEY.matcher(row.publicStorageKey()).matches()
                || row.publicStorageKey().contains("..")
                || row.publicStorageKey().contains("//")
                || row.publicStorageKey().contains("/./")
                || row.publicStorageKey().endsWith("/")) {
            return Optional.empty();
        }
        try {
            return Optional.of(new PublicArticleMedia(
                    assetId,
                    variant,
                    "/media/" + row.publicStorageKey(),
                    row.mimeType(),
                    row.width(),
                    row.height(),
                    row.credit()
            ));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    record MediaReference(UUID assetId, String variant) {
        MediaReference {
            assetId = Objects.requireNonNull(assetId, "assetId");
            variant = Objects.requireNonNull(variant, "variant");
        }
    }

    private record MediaRow(
            String publicStorageKey,
            String mimeType,
            int width,
            int height,
            String credit
    ) {
    }
}
