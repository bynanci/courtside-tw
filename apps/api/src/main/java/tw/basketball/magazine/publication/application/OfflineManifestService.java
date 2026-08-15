package tw.basketball.magazine.publication.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Builds bounded, rights-checked manifests for anonymous offline clients. */
public final class OfflineManifestService {
    private static final Pattern ISSUE_SLUG = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final int MAXIMUM_ARTICLES = 500;
    private static final String ISSUE_SQL = """
            SELECT issue.id AS issue_id,
                   issue.slug,
                   issue.published_at,
                   frozen.id AS snapshot_id,
                   frozen.snapshot_version,
                   frozen.checksum_sha256,
                   frozen.content_document,
                   rights.expires_at
            FROM publication_issue issue
            JOIN LATERAL (
                SELECT frozen.id, frozen.snapshot_version,
                       frozen.checksum_sha256, frozen.content_document
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ISSUE'
                  AND frozen.aggregate_id = issue.id
                  AND frozen.revision_id IS NULL
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) frozen ON TRUE
            JOIN LATERAL (
                SELECT MIN(rights.valid_until) AS expires_at
                FROM rights_record rights
                WHERE rights.asset_id = issue.cover_asset_id
                  AND rights.status = 'VALID'
                  AND rights.allowed_channels && ARRAY['PUBLIC_WEB', 'OFFLINE']::text[]
                  AND rights.valid_from <= ?
                  AND rights.valid_until > ?
            ) rights ON rights.expires_at IS NOT NULL
            WHERE issue.slug = ?
              AND issue.state = 'PUBLISHED'
              AND issue.published_at IS NOT NULL
              AND issue.published_at <= ?
            LIMIT 1
            """;
    private static final String ARTICLE_SQL = """
            SELECT article.id AS article_id,
                   revision.id AS revision_id,
                   revision.revision_number,
                   frozen.id AS snapshot_id,
                   frozen.checksum_sha256
            FROM article
            JOIN article_revision revision
              ON revision.id = article.published_revision_id
             AND revision.article_id = article.id
            JOIN LATERAL (
                SELECT frozen.id, frozen.checksum_sha256
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ARTICLE'
                  AND frozen.aggregate_id = article.id
                  AND frozen.revision_id = revision.id
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) frozen ON TRUE
            WHERE article.id = ?
              AND article.state = 'PUBLISHED'
              AND revision.state = 'PUBLISHED'
            LIMIT 1
            """;
    private static final String ASSET_SQL = """
            SELECT DISTINCT
                   asset.id AS asset_id,
                   variant.variant,
                   variant.public_storage_key,
                   variant.mime_type,
                   variant.byte_size,
                   variant.checksum_sha256,
                   MIN(rights.valid_until) AS expires_at
            FROM publication_impact_link impact
            JOIN media_asset asset ON asset.id = impact.asset_id
            JOIN media_variant variant ON variant.asset_id = asset.id
            JOIN rights_record rights ON rights.asset_id = asset.id
            WHERE impact.snapshot_id = ?
              AND asset.processing_state = 'READY'
              AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
              AND position('..' IN variant.public_storage_key) = 0
              AND position('//' IN variant.public_storage_key) = 0
              AND position('/./' IN variant.public_storage_key) = 0
              AND right(variant.public_storage_key, 1) <> '/'
              AND rights.status = 'VALID'
              AND rights.allowed_channels && ARRAY['PUBLIC_WEB', 'OFFLINE']::text[]
              AND rights.valid_from <= ?
              AND rights.valid_until > ?
            GROUP BY asset.id, variant.variant, variant.public_storage_key,
                     variant.mime_type, variant.byte_size, variant.checksum_sha256
            ORDER BY asset.id, variant.variant
            """;
    private static final String ASSET_COUNT_SQL = """
            SELECT COUNT(DISTINCT impact.asset_id)
            FROM publication_impact_link impact
            WHERE impact.snapshot_id = ?
            """;
    private static final String WITHDRAWAL_SQL = """
            SELECT id
            FROM publication_issue
            WHERE state IN ('WITHDRAWN', 'ARCHIVED')
            UNION
            SELECT id
            FROM article
            WHERE state IN ('WITHDRAWN', 'ARCHIVED')
            UNION
            SELECT article.id
            FROM article
            JOIN article_revision revision ON revision.article_id = article.id
            WHERE revision.state IN ('WITHDRAWN', 'ARCHIVED')
            ORDER BY id
            """;
    private static final String VERSION_SQL = """
            SELECT GREATEST(
                1,
                COALESCE((SELECT MAX(version) FROM publication_issue), 0),
                COALESCE((SELECT MAX(version) FROM article), 0),
                COALESCE((SELECT MAX(version) FROM rights_record), 0)
            )
            """;

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public OfflineManifestService(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, Clock.systemUTC(), new ObjectMapper());
    }

    OfflineManifestService(JdbcTemplate jdbcTemplate, Clock clock, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    public Optional<OfflineManifest> findIssueManifest(String issueSlug) {
        if (issueSlug == null || issueSlug.length() > 128 || !ISSUE_SLUG.matcher(issueSlug).matches()) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        List<IssueRow> rows = jdbcTemplate.query(
                ISSUE_SQL,
                (resultSet, rowNumber) -> mapIssue(resultSet),
                Timestamp.from(now),
                Timestamp.from(now),
                issueSlug,
                Timestamp.from(now)
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        IssueRow issue = rows.getFirst();
        try {
            JsonNode snapshot = objectMapper.readTree(issue.document());
            List<OfflineArticle> articles = articles(snapshot, now);
            if (articles == null || articles.size() > MAXIMUM_ARTICLES) {
                return Optional.empty();
            }
            List<OfflineAsset> assets = assets(issue.snapshotId(), now);
            int linkedAssetCount = jdbcTemplate.queryForObject(
                    ASSET_COUNT_SQL,
                    Integer.class,
                    issue.snapshotId()
            );
            if (linkedAssetCount == null || assets.stream().map(OfflineAsset::assetId).distinct().count()
                    != linkedAssetCount) {
                return Optional.empty();
            }
            Instant expiresAt = assets.stream()
                    .map(OfflineAsset::expiresAt)
                    .reduce(issue.expiresAt(), (left, right) -> left.isBefore(right) ? left : right);
            long assetBytes = assets.stream().mapToLong(OfflineAsset::byteSize).sum();
            return Optional.of(new OfflineManifest(
                    issue.slug(),
                    issue.snapshotVersion(),
                    issue.checksum(),
                    articles,
                    expiresAt,
                    assetBytes,
                    assets
            ));
        } catch (JacksonException | IllegalArgumentException | IllegalStateException exception) {
            return Optional.empty();
        }
    }

    public WithdrawalManifest withdrawalManifest() {
        Instant generatedAt = clock.instant();
        Long version = jdbcTemplate.queryForObject(VERSION_SQL, Long.class);
        List<UUID> withdrawals = jdbcTemplate.query(
                WITHDRAWAL_SQL,
                (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class)
        );
        long manifestVersion = version == null ? 1 : Math.max(1, version);
        return new WithdrawalManifest(
                manifestVersion,
                generatedAt,
                withdrawals,
                digest(manifestVersion + "|" + withdrawals)
        );
    }

    private List<OfflineArticle> articles(JsonNode snapshot, Instant now) {
        JsonNode sections = snapshot == null ? null : snapshot.get("sections");
        if (sections == null || !sections.isArray()) {
            throw new IllegalStateException("offline issue snapshot has no sections");
        }
        List<OfflineArticle> result = new ArrayList<>();
        for (JsonNode section : sections) {
            if (section == null || !section.isObject()) {
                throw new IllegalStateException("offline issue section is invalid");
            }
            JsonNode sectionArticles = section.get("articles");
            if (sectionArticles == null || !sectionArticles.isArray()) {
                throw new IllegalStateException("offline issue section has no articles");
            }
            for (JsonNode article : sectionArticles) {
                if (result.size() >= MAXIMUM_ARTICLES) {
                    throw new IllegalStateException("offline issue exceeds the bounded article limit");
                }
                UUID articleId = UUID.fromString(requiredText(article, "articleId"));
                String slug = requiredText(article, "slug");
                String title = requiredText(article, "title");
                int position = requiredPositiveInt(article, "position");
                List<ArticleRow> rows = jdbcTemplate.query(
                        ARTICLE_SQL,
                        (resultSet, rowNumber) -> mapArticle(resultSet),
                        articleId
                );
                if (rows.isEmpty()) {
                    return null;
                }
                ArticleRow current = rows.getFirst();
                result.add(new OfflineArticle(
                        articleId,
                        current.revisionId(),
                        current.revisionNumber(),
                        slug,
                        title,
                        position,
                        current.checksum()
                ));
            }
        }
        return List.copyOf(result);
    }

    private List<OfflineAsset> assets(UUID snapshotId, Instant now) {
        return jdbcTemplate.query(
                ASSET_SQL,
                (resultSet, rowNumber) -> mapAsset(resultSet),
                snapshotId,
                Timestamp.from(now),
                Timestamp.from(now)
        );
    }

    private IssueRow mapIssue(ResultSet resultSet, int rowNumber) throws SQLException {
        return new IssueRow(
                resultSet.getObject("snapshot_id", UUID.class),
                resultSet.getString("slug"),
                resultSet.getLong("snapshot_version"),
                resultSet.getString("checksum_sha256").toLowerCase(Locale.ROOT),
                resultSet.getString("content_document"),
                resultSet.getTimestamp("expires_at").toInstant()
        );
    }

    private ArticleRow mapArticle(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ArticleRow(
                resultSet.getObject("revision_id", UUID.class),
                resultSet.getInt("revision_number"),
                resultSet.getString("checksum_sha256").toLowerCase(Locale.ROOT)
        );
    }

    private OfflineAsset mapAsset(ResultSet resultSet, int rowNumber) throws SQLException {
        return new OfflineAsset(
                resultSet.getObject("asset_id", UUID.class),
                resultSet.getString("variant"),
                "/media/" + resultSet.getString("public_storage_key"),
                resultSet.getString("mime_type"),
                resultSet.getLong("byte_size"),
                resultSet.getString("checksum_sha256").toLowerCase(Locale.ROOT),
                resultSet.getTimestamp("expires_at").toInstant()
        );
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalStateException("offline snapshot is missing " + field);
        }
        return value.asString();
    }

    private static int requiredPositiveInt(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isIntegralNumber() || value.asInt() < 1) {
            throw new IllegalStateException("offline snapshot is missing " + field);
        }
        return value.asInt();
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record OfflineManifest(
            String issueSlug,
            long manifestVersion,
            String checksum,
            List<OfflineArticle> articles,
            Instant expiresAt,
            long assetBytes,
            List<OfflineAsset> assets
    ) {
        public OfflineManifest {
            if (issueSlug == null || issueSlug.isBlank() || manifestVersion < 1
                    || checksum == null || !checksum.matches("[0-9a-f]{64}")
                    || expiresAt == null || assetBytes < 0) {
                throw new IllegalArgumentException("offline manifest metadata is invalid");
            }
            articles = List.copyOf(Objects.requireNonNull(articles, "articles"));
            assets = List.copyOf(Objects.requireNonNull(assets, "assets"));
        }
    }

    public record OfflineArticle(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            int position,
            String checksum
    ) {
        public OfflineArticle {
            Objects.requireNonNull(articleId, "articleId");
            Objects.requireNonNull(revisionId, "revisionId");
            Objects.requireNonNull(slug, "slug");
            Objects.requireNonNull(title, "title");
            if (revisionNumber < 1 || position < 1 || checksum == null
                    || !checksum.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("offline article metadata is invalid");
            }
        }
    }

    public record OfflineAsset(
            UUID assetId,
            String variant,
            String url,
            String mimeType,
            long byteSize,
            String checksum,
            Instant expiresAt
    ) {
        public OfflineAsset {
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(variant, "variant");
            Objects.requireNonNull(url, "url");
            Objects.requireNonNull(mimeType, "mimeType");
            Objects.requireNonNull(expiresAt, "expiresAt");
            if (byteSize <= 0 || checksum == null || !checksum.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("offline asset metadata is invalid");
            }
        }
    }

    public record WithdrawalManifest(
            long version,
            Instant generatedAt,
            List<UUID> withdrawals,
            String checksum
    ) {
        public WithdrawalManifest {
            if (version < 1 || generatedAt == null || checksum == null
                    || !checksum.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("withdrawal manifest metadata is invalid");
            }
            withdrawals = List.copyOf(Objects.requireNonNull(withdrawals, "withdrawals"));
        }
    }

    private record IssueRow(
            UUID snapshotId,
            String slug,
            long snapshotVersion,
            String checksum,
            String document,
            Instant expiresAt
    ) {
    }

    private record ArticleRow(UUID revisionId, int revisionNumber, String checksum) {
    }
}
