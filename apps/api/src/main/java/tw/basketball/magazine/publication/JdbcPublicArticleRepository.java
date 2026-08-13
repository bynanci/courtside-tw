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

import tw.basketball.magazine.content.application.PublishedArticleProjection;
import tw.basketball.magazine.content.application.PublishedArticleProjectionService;
import tw.basketball.magazine.content.domain.ContributorCredit;
import tw.basketball.magazine.content.persistence.JdbcPublishedArticleRepository;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;
import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.publication.PublicArticleModels.Contributor;
import tw.basketball.magazine.publication.PublicArticleModels.IssueNavigation;
import tw.basketball.magazine.publication.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;

/**
 * Read-only JDBC projection for anonymous published Articles.
 *
 * <p>The selected revision and navigation order come from the latest immutable
 * Issue publication snapshot; a requested historical revision is never served.
 * Public media rights and server-selected variant resolution are evaluated
 * before the projection leaves the repository, so a private or incomplete
 * asset fails closed as a not-found response.</p>
 */
public final class JdbcPublicArticleRepository implements PublicArticleRepository {
    private static final String NAVIGATION_SQL = """
            WITH issue_snapshot AS (
                SELECT frozen.content_document
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ISSUE'
                  AND frozen.aggregate_id = ?
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            )
            SELECT article.id AS article_id,
                   article_item.article_document->>'slug' AS slug,
                   article_item.article_document->>'title' AS title,
                   article_snapshot.content_document,
                   (article_item.article_document->>'position')::integer AS position,
                   (section_item.section_document->>'position')::integer AS section_position
            FROM issue_snapshot
            CROSS JOIN LATERAL jsonb_array_elements(
                COALESCE(issue_snapshot.content_document->'sections', '[]'::jsonb)
            ) AS section_item(section_document)
            CROSS JOIN LATERAL jsonb_array_elements(
                COALESCE(section_item.section_document->'articles', '[]'::jsonb)
            ) AS article_item(article_document)
            JOIN article
              ON article.id::text = article_item.article_document->>'articleId'
            JOIN article_revision revision
              ON revision.article_id = article.id
             AND revision.id::text = COALESCE(
                    article_item.article_document->>'revisionId',
                    article.published_revision_id::text
                 )
            JOIN LATERAL (
                SELECT frozen.content_document
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ARTICLE'
                  AND frozen.aggregate_id = article.id
                  AND frozen.revision_id = revision.id
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) article_snapshot ON TRUE
            WHERE article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
            ORDER BY section_position ASC,
                     position ASC,
                     article.id ASC
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ContentDocumentValidator contentDocumentValidator;
    private final JdbcPublicMediaResolver mediaResolver;
    private final PublishedArticleProjectionService contentProjectionService;

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
                new JdbcPublicMediaResolver(jdbcTemplate),
                new PublishedArticleProjectionService(new JdbcPublishedArticleRepository(
                        jdbcTemplate,
                        contentDocumentValidator
                ))
        );
    }

    JdbcPublicArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ContentDocumentValidator contentDocumentValidator,
            JdbcPublicMediaResolver mediaResolver
    ) {
        this(
                jdbcTemplate,
                objectMapper,
                contentDocumentValidator,
                mediaResolver,
                new PublishedArticleProjectionService(new JdbcPublishedArticleRepository(
                        jdbcTemplate,
                        contentDocumentValidator
                ))
        );
    }

    JdbcPublicArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ContentDocumentValidator contentDocumentValidator,
            JdbcPublicMediaResolver mediaResolver,
            PublishedArticleProjectionService contentProjectionService
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.contentDocumentValidator = Objects.requireNonNull(
                contentDocumentValidator,
                "contentDocumentValidator"
        );
        this.mediaResolver = Objects.requireNonNull(mediaResolver, "mediaResolver");
        this.contentProjectionService = Objects.requireNonNull(
                contentProjectionService,
                "contentProjectionService"
        );
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

        Optional<PublishedArticleProjection> projectedArticle = contentProjectionService.findBySlug(
                articleSlug,
                now
        );
        if (projectedArticle.isEmpty()) {
            return Optional.empty();
        }

        PublishedArticleProjection article = projectedArticle.get();
        JsonNode content = article.content().toJsonNode();
        Optional<List<PublicArticleMedia>> resolvedMedia = resolvePublicMedia(content, now);
        if (resolvedMedia.isEmpty()) {
            return Optional.empty();
        }
        List<Contributor> contributors = article.contributorCredits().stream()
                .map(JdbcPublicArticleRepository::toPublicContributor)
                .toList();

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
                "/articles/" + article.slug(),
                article.title(),
                article.dek(),
                article.publishedAt(),
                article.updatedAt(),
                content,
                article.plainText(),
                article.readingTimeMinutes(),
                resolvedMedia.get(),
                contributors,
                new IssueNavigation(article.issueSlug(), previous, next)
        ));
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

    private static Contributor toPublicContributor(ContributorCredit credit) {
        return new Contributor(
                credit.contributorId(),
                credit.slug(),
                credit.displayName(),
                credit.role().name()
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
                case "generative-canvas" -> references.add(reference(payload, "posterAssetId", "wide"));
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

}
