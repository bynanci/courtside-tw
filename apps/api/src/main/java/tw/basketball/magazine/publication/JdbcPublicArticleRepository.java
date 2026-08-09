package tw.basketball.magazine.publication;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.publication.PublicArticleModels.IssueNavigation;
import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;

/**
 * Read-only JDBC projection for anonymous published Articles.
 *
 * <p>The selected revision is always the article's immutable
 * {@code published_revision_id}; a requested historical revision is never
 * served. Public media rights are evaluated before the projection leaves the
 * repository, so a private asset fails closed as a not-found response.</p>
 */
public final class JdbcPublicArticleRepository implements PublicArticleRepository {
    private static final String ARTICLE_SQL = """
            SELECT article.id AS article_id,
                   revision.id AS revision_id,
                   revision.revision_number,
                   article.slug,
                   revision.title,
                   revision.dek,
                   revision.content_document,
                   issue.id AS issue_id,
                   issue.slug AS issue_slug
            FROM article
            JOIN article_revision revision
              ON revision.id = article.published_revision_id
             AND revision.article_id = article.id
            JOIN issue_article
              ON issue_article.article_id = article.id
            JOIN issue_section section
              ON section.id = issue_article.section_id
             AND section.issue_id = issue_article.issue_id
            JOIN publication_issue issue
              ON issue.id = issue_article.issue_id
            WHERE article.slug = ?
              AND article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
              AND issue.state = 'PUBLISHED'
              AND issue.published_at IS NOT NULL
              AND issue.published_at <= ?
            ORDER BY issue.published_at DESC, issue.id DESC
            LIMIT 1
            """;

    private static final String NAVIGATION_SQL = """
            SELECT article.id AS article_id,
                   article.slug,
                   revision.title,
                   issue_article.position,
                   section.position AS section_position
            FROM issue_article
            JOIN issue_section section
              ON section.id = issue_article.section_id
             AND section.issue_id = issue_article.issue_id
            JOIN article
              ON article.id = issue_article.article_id
            JOIN article_revision revision
              ON revision.id = article.published_revision_id
             AND revision.article_id = article.id
            WHERE issue_article.issue_id = ?
              AND article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
            ORDER BY section.position ASC,
                     section.id ASC,
                     issue_article.position ASC,
                     issue_article.id ASC
            """;

    private static final String PUBLIC_MEDIA_EXISTS_SQL = """
            SELECT EXISTS (
                SELECT 1
                FROM media_asset asset
                JOIN media_variant variant ON variant.asset_id = asset.id
                JOIN rights_record rights ON rights.asset_id = asset.id
                WHERE asset.id = ?
                  AND asset.processing_state = 'READY'
                  AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
                  AND position('..' IN variant.public_storage_key) = 0
                  AND position('//' IN variant.public_storage_key) = 0
                  AND position('/./' IN variant.public_storage_key) = 0
                  AND right(variant.public_storage_key, 1) <> '/'
                  AND rights.status = 'VALID'
                  AND rights.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                  AND rights.valid_from <= ?
                  AND rights.valid_until > ?
            )
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper());
    }

    JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public Optional<ArticleProjection> findBySlug(
            String articleSlug,
            String requestedRevision,
            Instant now
    ) {
        Objects.requireNonNull(articleSlug, "articleSlug");
        Objects.requireNonNull(now, "now");
        if (requestedRevision != null && !requestedRevision.isBlank()) {
            return Optional.empty();
        }

        List<ArticleRow> rows = jdbcTemplate.query(
                ARTICLE_SQL,
                (resultSet, rowNumber) -> mapArticle(resultSet),
                articleSlug,
                Timestamp.from(now),
                Timestamp.from(now)
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        ArticleRow article = rows.getFirst();
        if (!hasPublicMediaRights(article.content(), now)) {
            return Optional.empty();
        }

        List<ArticleSummary> navigationItems = jdbcTemplate.query(
                NAVIGATION_SQL,
                (resultSet, rowNumber) -> mapNavigationItem(resultSet),
                article.issueId(),
                Timestamp.from(now)
        );
        int currentIndex = findArticleIndex(navigationItems, article.articleId());
        if (currentIndex < 0) {
            return Optional.empty();
        }

        ArticleSummary previous = currentIndex > 0 ? navigationItems.get(currentIndex - 1) : null;
        ArticleSummary next = currentIndex + 1 < navigationItems.size()
                ? navigationItems.get(currentIndex + 1)
                : null;
        return Optional.of(new ArticleProjection(
                article.articleId(),
                article.revisionId(),
                article.revisionNumber(),
                article.slug(),
                article.title(),
                article.dek(),
                article.content(),
                new IssueNavigation(article.issueSlug(), previous, next)
        ));
    }

    private ArticleRow mapArticle(ResultSet resultSet) throws SQLException {
        try {
            JsonNode content = objectMapper.readTree(resultSet.getString("content_document"));
            if (content == null || !content.isObject()) {
                throw new IllegalStateException("published content document must be a JSON object");
            }
            return new ArticleRow(
                    resultSet.getObject("article_id", UUID.class),
                    resultSet.getObject("revision_id", UUID.class),
                    resultSet.getInt("revision_number"),
                    resultSet.getString("slug"),
                    resultSet.getString("title"),
                    resultSet.getString("dek"),
                    content,
                    resultSet.getObject("issue_id", UUID.class),
                    resultSet.getString("issue_slug")
            );
        } catch (RuntimeException exception) {
            throw new IllegalStateException("published Article content is not valid JSON", exception);
        }
    }

    private static ArticleSummary mapNavigationItem(ResultSet resultSet) throws SQLException {
        return new ArticleSummary(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getString("slug"),
                resultSet.getString("title"),
                resultSet.getInt("position")
        );
    }

    private static int findArticleIndex(List<ArticleSummary> items, UUID articleId) {
        for (int index = 0; index < items.size(); index++) {
            if (items.get(index).articleId().equals(articleId)) {
                return index;
            }
        }
        return -1;
    }

    private boolean hasPublicMediaRights(JsonNode document, Instant now) {
        Set<UUID> assetIds;
        try {
            assetIds = extractAssetIds(document);
        } catch (IllegalArgumentException exception) {
            return false;
        }
        for (UUID assetId : assetIds) {
            Boolean allowed = jdbcTemplate.queryForObject(
                    PUBLIC_MEDIA_EXISTS_SQL,
                    Boolean.class,
                    assetId,
                    Timestamp.from(now),
                    Timestamp.from(now)
            );
            if (!Boolean.TRUE.equals(allowed)) {
                return false;
            }
        }
        return true;
    }

    private static Set<UUID> extractAssetIds(JsonNode node) {
        Set<UUID> assetIds = new LinkedHashSet<>();
        collectAssetIds(node, assetIds);
        return Set.copyOf(assetIds);
    }

    private static void collectAssetIds(JsonNode node, Set<UUID> assetIds) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                collectAssetIds(child, assetIds);
            }
            return;
        }
        if (!node.isObject()) {
            return;
        }

        for (Map.Entry<String, JsonNode> field : node.properties()) {
            String fieldName = field.getKey();
            JsonNode value = field.getValue();
            if (fieldName.equals("assetId") || fieldName.equals("posterAssetId")) {
                if (value == null || !value.isString()) {
                    throw new IllegalArgumentException("asset id must be a string");
                }
                try {
                    assetIds.add(UUID.fromString(value.asString()));
                } catch (IllegalArgumentException exception) {
                    throw new IllegalArgumentException("asset id must be a UUID", exception);
                }
            }
            collectAssetIds(value, assetIds);
        }
    }

    private record ArticleRow(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            JsonNode content,
            UUID issueId,
            String issueSlug
    ) {
    }
}
