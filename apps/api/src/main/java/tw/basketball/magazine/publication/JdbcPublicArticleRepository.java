package tw.basketball.magazine.publication;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.content.validation.ContentDocumentValidator;
import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.publication.PublicArticleModels.Contributor;
import tw.basketball.magazine.publication.PublicArticleModels.IssueNavigation;
import tw.basketball.magazine.publication.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;

/**
 * Read-only JDBC projection for anonymous published Articles.
 *
 * <p>The selected revision is always the article's immutable
 * {@code published_revision_id}; a requested historical revision is never
 * served. Public media rights and server-selected variant resolution are
 * evaluated before the projection leaves the repository, so a private or
 * incomplete asset fails closed as a not-found response.</p>
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
                   revision.content_document,
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

    private static final String CONTRIBUTOR_SQL = """
            SELECT contributor.id AS contributor_id,
                   contributor.slug,
                   contributor.display_name,
                   article_contributor.role
            FROM article_contributor
            JOIN contributor
              ON contributor.id = article_contributor.contributor_id
            WHERE article_contributor.article_revision_id = ?
            ORDER BY article_contributor.position ASC,
                     article_contributor.id ASC
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ContentDocumentValidator contentDocumentValidator;
    private final JdbcPublicMediaResolver mediaResolver;

    public JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper(), new ContentDocumentValidator());
    }

    JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(jdbcTemplate, objectMapper, new ContentDocumentValidator());
    }

    JdbcPublicArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ContentDocumentValidator contentDocumentValidator
    ) {
        this(
                jdbcTemplate,
                objectMapper,
                contentDocumentValidator,
                new JdbcPublicMediaResolver(jdbcTemplate)
        );
    }

    JdbcPublicArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ContentDocumentValidator contentDocumentValidator,
            JdbcPublicMediaResolver mediaResolver
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.contentDocumentValidator = Objects.requireNonNull(
                contentDocumentValidator,
                "contentDocumentValidator"
        );
        this.mediaResolver = Objects.requireNonNull(mediaResolver, "mediaResolver");
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

        List<ArticleRow> rows;
        try {
            rows = jdbcTemplate.query(
                    ARTICLE_SQL,
                    (resultSet, rowNumber) -> mapArticle(resultSet),
                    articleSlug,
                    Timestamp.from(now),
                    Timestamp.from(now)
            );
        } catch (InvalidPublishedContentException exception) {
            return Optional.empty();
        }
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        ArticleRow article = rows.getFirst();
        Optional<List<PublicArticleMedia>> resolvedMedia = resolvePublicMedia(article.content(), now);
        if (resolvedMedia.isEmpty()) {
            return Optional.empty();
        }

        List<Contributor> contributors;
        try {
            contributors = findContributors(article.revisionId());
        } catch (RuntimeException exception) {
            return Optional.empty();
        }

        List<NavigationRow> navigationRows = jdbcTemplate.query(
                NAVIGATION_SQL,
                (resultSet, rowNumber) -> mapNavigationItem(resultSet),
                article.issueId(),
                Timestamp.from(now)
        );
        List<ArticleSummary> navigationItems = navigationRows.stream()
                .filter(Objects::nonNull)
                .filter(row -> isValidContent(row.content()))
                .filter(row -> hasPublicMediaRights(row.content(), now))
                .map(NavigationRow::summary)
                .toList();
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
                resolvedMedia.get(),
                contributors,
                new IssueNavigation(article.issueSlug(), previous, next)
        ));
    }

    private ArticleRow mapArticle(ResultSet resultSet) throws SQLException {
        try {
            JsonNode content = objectMapper.readTree(resultSet.getString("content_document"));
            if (content == null || !content.isObject()) {
                throw new InvalidPublishedContentException("published content document must be a JSON object");
            }
            if (!isValidContent(content)) {
                throw new InvalidPublishedContentException("published ContentDocument failed canonical validation");
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
        } catch (InvalidPublishedContentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new InvalidPublishedContentException("published Article content is not valid JSON", exception);
        }
    }

    private NavigationRow mapNavigationItem(ResultSet resultSet) throws SQLException {
        try {
            JsonNode content = objectMapper.readTree(resultSet.getString("content_document"));
            if (content == null || !content.isObject()) {
                return null;
            }
            return new NavigationRow(
                    new ArticleSummary(
                            resultSet.getObject("article_id", UUID.class),
                            resultSet.getString("slug"),
                            resultSet.getString("title"),
                            resultSet.getInt("position")
                    ),
                    content
            );
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private List<Contributor> findContributors(UUID revisionId) {
        return jdbcTemplate.query(
                CONTRIBUTOR_SQL,
                (resultSet, rowNumber) -> new Contributor(
                        resultSet.getObject("contributor_id", UUID.class),
                        resultSet.getString("slug"),
                        resultSet.getString("display_name"),
                        resultSet.getString("role")
                ),
                revisionId
        );
    }

    private boolean isValidContent(JsonNode content) {
        return content != null && contentDocumentValidator.validate(content.toString()).valid();
    }

    private Optional<List<PublicArticleMedia>> resolvePublicMedia(JsonNode document, Instant now) {
        try {
            return mediaResolver.resolveAll(extractMediaReferences(document), now);
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private boolean hasPublicMediaRights(JsonNode document, Instant now) {
        return resolvePublicMedia(document, now).isPresent();
    }

    private static List<JdbcPublicMediaResolver.MediaReference> extractMediaReferences(JsonNode document) {
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            return List.of();
        }

        List<JdbcPublicMediaResolver.MediaReference> references = new ArrayList<>();
        for (JsonNode block : blocks) {
            if (block == null || !block.isObject()) {
                throw new IllegalArgumentException("content block must be an object");
            }
            JsonNode typeNode = block.get("type");
            JsonNode payload = block.get("payload");
            if (typeNode == null || !typeNode.isString() || payload == null || !payload.isObject()) {
                throw new IllegalArgumentException("content block type and payload are required");
            }
            switch (typeNode.asString()) {
                case "image" -> references.add(reference(payload, "assetId", variant(payload, "inline")));
                case "gallery" -> addGalleryReferences(references, payload);
                case "generative-canvas" -> references.add(reference(payload, "posterAssetId", "poster"));
                default -> {
                    // Non-media blocks do not require a public media resolution.
                }
            }
        }
        return List.copyOf(references);
    }

    private static void addGalleryReferences(
            List<JdbcPublicMediaResolver.MediaReference> references,
            JsonNode payload
    ) {
        JsonNode items = payload.get("items");
        if (items == null || !items.isArray()) {
            throw new IllegalArgumentException("gallery items are required");
        }
        for (JsonNode item : items) {
            if (item == null || !item.isObject()) {
                throw new IllegalArgumentException("gallery item must be an object");
            }
            references.add(reference(item, "assetId", "inline"));
        }
    }

    private static JdbcPublicMediaResolver.MediaReference reference(
            JsonNode payload,
            String assetIdField,
            String variant
    ) {
        JsonNode assetIdNode = payload.get(assetIdField);
        if (assetIdNode == null || !assetIdNode.isString()) {
            throw new IllegalArgumentException(assetIdField + " must be a string");
        }
        try {
            return new JdbcPublicMediaResolver.MediaReference(
                    UUID.fromString(assetIdNode.asString()),
                    variant
            );
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(assetIdField + " must be a UUID", exception);
        }
    }

    private static String variant(JsonNode payload, String fallback) {
        JsonNode variant = payload.get("variant");
        if (variant == null) {
            return fallback;
        }
        if (!variant.isString()) {
            throw new IllegalArgumentException("media variant must be a string");
        }
        return variant.asString();
    }

    private static int findArticleIndex(List<ArticleSummary> items, UUID articleId) {
        for (int index = 0; index < items.size(); index++) {
            if (items.get(index).articleId().equals(articleId)) {
                return index;
            }
        }
        return -1;
    }

    private record NavigationRow(ArticleSummary summary, JsonNode content) {
    }

    private static final class InvalidPublishedContentException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private InvalidPublishedContentException(String message) {
            super(message);
        }

        private InvalidPublishedContentException(String message, Throwable cause) {
            super(message, cause);
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
