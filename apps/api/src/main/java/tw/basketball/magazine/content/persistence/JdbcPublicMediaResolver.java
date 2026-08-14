package tw.basketball.magazine.content.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;

/** Resolves only server-selected, rights-valid public media variants. */
final class JdbcPublicMediaResolver {
    /**
     * Bounds one SSR projection to well below PostgreSQL's prepared-statement
     * parameter ceiling. An oversized issue snapshot fails closed at the
     * repository boundary rather than falling back to per-asset queries.
     */
    static final int MAXIMUM_BATCH_REFERENCES = 5_000;
    private static final Pattern SAFE_STORAGE_KEY =
            Pattern.compile("[a-z0-9][a-z0-9._/-]{0,255}");
    private static final String RESOLVE_SQL = """
            WITH requested(asset_id, variant, ordinal) AS (
                VALUES %s
            )
            SELECT requested.asset_id,
                   requested.variant AS requested_variant,
                   requested.ordinal,
                   variant.public_storage_key,
                   variant.mime_type,
                   variant.width,
                   variant.height,
                   asset.alt_text,
                   rights.credit,
                   rights.rights_owner,
                   rights.license_name
            FROM requested
            JOIN media_asset asset
              ON asset.id = requested.asset_id
            JOIN media_variant variant
              ON variant.asset_id = asset.id
             AND variant.variant = requested.variant
            JOIN LATERAL (
                SELECT eligible.credit, eligible.rights_owner, eligible.license_name
                FROM rights_record eligible
                WHERE eligible.asset_id = asset.id
                  AND eligible.status = 'VALID'
                  AND eligible.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                  AND eligible.valid_from <= ?
                  AND eligible.valid_until > ?
                ORDER BY eligible.version DESC, eligible.updated_at DESC, eligible.id DESC
                LIMIT 1
            ) rights ON TRUE
            WHERE asset.processing_state = 'READY'
              AND NOT EXISTS (
                    SELECT 1
                    FROM rights_record revoked
                    WHERE revoked.asset_id = asset.id
                      AND revoked.status = 'REVOKED'
              )
              AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
              AND position('..' IN variant.public_storage_key) = 0
              AND position('//' IN variant.public_storage_key) = 0
              AND position('/./' IN variant.public_storage_key) = 0
              AND right(variant.public_storage_key, 1) <> '/'
            ORDER BY requested.ordinal ASC
            """;
    private static final String VISIBILITY_SQL = """
            WITH requested(asset_id, variant, ordinal) AS (
                VALUES %s
            )
            SELECT requested.asset_id,
                   requested.variant AS requested_variant
            FROM requested
            JOIN media_asset asset
              ON asset.id = requested.asset_id
            JOIN media_variant variant
              ON variant.asset_id = asset.id
             AND variant.variant = requested.variant
            WHERE asset.processing_state = 'READY'
              AND NOT EXISTS (
                    SELECT 1
                    FROM rights_record revoked
                    WHERE revoked.asset_id = asset.id
                      AND revoked.status = 'REVOKED'
              )
              AND EXISTS (
                    SELECT 1
                    FROM rights_record eligible
                    WHERE eligible.asset_id = asset.id
                      AND eligible.status = 'VALID'
                      AND eligible.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                      AND eligible.valid_from <= ?
                      AND eligible.valid_until > ?
              )
            ORDER BY requested.ordinal ASC
            """;

    private final JdbcTemplate jdbcTemplate;

    JdbcPublicMediaResolver(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    Optional<List<PublicArticleMedia>> resolveAll(List<MediaReference> references, Instant now) {
        Objects.requireNonNull(references, "references");
        Objects.requireNonNull(now, "now");
        Map<MediaReference, PublicArticleMedia> resolved = resolveAvailable(references, now);
        Map<MediaReference, Boolean> requested = new LinkedHashMap<>();
        for (MediaReference reference : references) {
            requested.putIfAbsent(reference, Boolean.TRUE);
        }
        if (resolved.size() != requested.size()) {
            return Optional.empty();
        }
        List<PublicArticleMedia> ordered = requested.keySet().stream()
                .map(resolved::get)
                .toList();
        return Optional.of(ordered);
    }

    Map<MediaReference, PublicArticleMedia> resolveAvailable(
            List<MediaReference> references,
            Instant now
    ) {
        Objects.requireNonNull(references, "references");
        Objects.requireNonNull(now, "now");
        Map<MediaReference, Integer> requested = new LinkedHashMap<>();
        for (MediaReference reference : references) {
            validate(reference);
            requested.putIfAbsent(reference, requested.size());
        }
        if (requested.isEmpty()) {
            return Map.of();
        }
        if (requested.size() > MAXIMUM_BATCH_REFERENCES) {
            throw new IllegalArgumentException("public media batch exceeds the bounded projection limit");
        }

        String placeholders = String.join(
                ", ",
                java.util.Collections.nCopies(
                        requested.size(),
                        "(CAST(? AS uuid), CAST(? AS text), CAST(? AS integer))"
                )
        );
        List<Object> parameters = new ArrayList<>();
        for (Map.Entry<MediaReference, Integer> entry : requested.entrySet()) {
            parameters.add(entry.getKey().assetId());
            parameters.add(entry.getKey().variant());
            parameters.add(entry.getValue());
        }
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        List<MediaRow> rows = jdbcTemplate.query(
                RESOLVE_SQL.replace("%s", placeholders),
                (resultSet, rowNumber) -> map(resultSet),
                parameters.toArray()
        );
        Map<MediaReference, PublicArticleMedia> resolved = new LinkedHashMap<>();
        for (MediaRow row : rows) {
            MediaReference reference = new MediaReference(row.assetId(), row.variant());
            toProjectionMedia(reference, row).ifPresent(media -> resolved.putIfAbsent(reference, media));
        }
        return Map.copyOf(resolved);
    }

    boolean areAllVisible(List<MediaReference> references, Instant now) {
        Map<MediaReference, Boolean> requested = uniqueReferences(references);
        if (requested.isEmpty()) {
            return true;
        }
        return visibleReferences(requested, now).size() == requested.size();
    }

    Set<MediaReference> visibleReferences(List<MediaReference> references, Instant now) {
        Map<MediaReference, Boolean> requested = uniqueReferences(references);
        if (requested.isEmpty()) {
            return Set.of();
        }
        return visibleReferences(requested, now);
    }

    private Set<MediaReference> visibleReferences(
            Map<MediaReference, Boolean> requested,
            Instant now
    ) {
        Objects.requireNonNull(now, "now");
        String placeholders = placeholders(requested.size());
        List<Object> parameters = parameters(requested.keySet().stream().toList(), now);
        List<MediaReference> visible = jdbcTemplate.query(
                VISIBILITY_SQL.replace("%s", placeholders),
                (resultSet, rowNumber) -> new MediaReference(
                        resultSet.getObject("asset_id", UUID.class),
                        resultSet.getString("requested_variant")
                ),
                parameters.toArray()
        );
        return Set.copyOf(visible);
    }

    private static Map<MediaReference, Boolean> uniqueReferences(List<MediaReference> references) {
        Objects.requireNonNull(references, "references");
        Map<MediaReference, Boolean> requested = new LinkedHashMap<>();
        for (MediaReference reference : references) {
            validate(reference);
            requested.putIfAbsent(reference, Boolean.TRUE);
        }
        if (requested.size() > MAXIMUM_BATCH_REFERENCES) {
            throw new IllegalArgumentException("public media batch exceeds the bounded projection limit");
        }
        return requested;
    }

    private static String placeholders(int size) {
        return String.join(
                ", ",
                java.util.Collections.nCopies(
                        size,
                        "(CAST(? AS uuid), CAST(? AS text), CAST(? AS integer))"
                )
        );
    }

    private static List<Object> parameters(List<MediaReference> references, Instant now) {
        List<Object> parameters = new ArrayList<>();
        for (int index = 0; index < references.size(); index++) {
            MediaReference reference = references.get(index);
            parameters.add(reference.assetId());
            parameters.add(reference.variant());
            parameters.add(index);
        }
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        return parameters;
    }

    private static void validate(MediaReference reference) {
        Objects.requireNonNull(reference, "reference");
        String variant = reference.variant();
        if (variant.isBlank() || variant.length() > 32
                || variant.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("media variant is invalid");
        }
    }

    private static MediaRow map(ResultSet resultSet) throws SQLException {
        return new MediaRow(
                resultSet.getObject("asset_id", UUID.class),
                resultSet.getString("requested_variant"),
                resultSet.getString("public_storage_key"),
                resultSet.getString("mime_type"),
                resultSet.getInt("width"),
                resultSet.getInt("height"),
                resultSet.getString("alt_text"),
                resultSet.getString("credit"),
                resultSet.getString("rights_owner"),
                resultSet.getString("license_name")
        );
    }

    private static Optional<PublicArticleMedia> toProjectionMedia(MediaReference reference, MediaRow row) {
        if (row.publicStorageKey() == null
                || !SAFE_STORAGE_KEY.matcher(row.publicStorageKey()).matches()
                || row.publicStorageKey().contains("..")
                || row.publicStorageKey().contains("//")
                || row.publicStorageKey().contains("/./")
                || row.publicStorageKey().endsWith("/")
                || row.mimeType() == null
                || row.altText() == null
                || row.credit() == null
                || row.rightsOwner() == null
                || row.licenseName() == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(new PublicArticleMedia(
                    reference.assetId(),
                    reference.variant(),
                    "/media/" + row.publicStorageKey(),
                    row.mimeType(),
                    row.width(),
                    row.height(),
                    row.altText(),
                    row.credit(),
                    row.rightsOwner(),
                    row.licenseName()
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
            UUID assetId,
            String variant,
            String publicStorageKey,
            String mimeType,
            int width,
            int height,
            String altText,
            String credit,
            String rightsOwner,
            String licenseName
    ) {
    }
}
