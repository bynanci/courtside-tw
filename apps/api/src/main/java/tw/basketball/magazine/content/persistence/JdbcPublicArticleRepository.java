package tw.basketball.magazine.content.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.content.domain.ExtractedArticleContent;
import tw.basketball.magazine.content.domain.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.content.domain.PublicArticleModels.ArticleSummary;
import tw.basketball.magazine.content.domain.PublicArticleModels.Contributor;
import tw.basketball.magazine.content.domain.PublicArticleModels.IssueNavigation;
import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;

/** JDBC adapter for stable snapshot-based, anonymous Article reads. */
public final class JdbcPublicArticleRepository implements PublicArticleRepository {
    private static final int MAXIMUM_TOC_ROWS = 500;
    private static final String ARTICLE_SQL = """
            SELECT article.id AS article_id,
                   article.slug AS live_slug,
                   article.published_at,
                   revision.id AS revision_id,
                   revision.revision_number,
                   revision.title AS live_title,
                   revision.dek AS live_dek,
                   revision.updated_at AS revision_updated_at,
                   snapshot.content_document AS snapshot_document,
                   snapshot.created_at AS snapshot_created_at
            FROM article
            JOIN article_revision revision
              ON revision.id = article.published_revision_id
             AND revision.article_id = article.id
            JOIN LATERAL (
                SELECT frozen.content_document, frozen.created_at
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ARTICLE'
                  AND frozen.aggregate_id = article.id
                  AND frozen.revision_id = revision.id
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) snapshot ON TRUE
            WHERE article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
              AND (
                    (jsonb_typeof(snapshot.content_document->'content') = 'object'
                     AND snapshot.content_document->>'slug' = ?)
                 OR (snapshot.content_document->'content' IS NULL AND article.slug = ?)
              )
            ORDER BY article.published_at DESC, article.id DESC
            LIMIT 1
            """;
    private static final String ISSUE_SNAPSHOT_SQL = """
            SELECT issue.id AS issue_id,
                   snapshot.content_document AS snapshot_document
            FROM publication_issue issue
            JOIN LATERAL (
                SELECT frozen.content_document
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ISSUE'
                  AND frozen.aggregate_id = issue.id
                  AND frozen.revision_id IS NULL
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) snapshot ON TRUE
            WHERE issue.state = 'PUBLISHED'
              AND issue.published_at IS NOT NULL
              AND issue.published_at <= ?
              AND snapshot.content_document @> jsonb_build_object(
                    'sections', jsonb_build_array(jsonb_build_object(
                        'articles', jsonb_build_array(jsonb_build_object('articleId', CAST(? AS text)))
                    ))
              )
            ORDER BY issue.published_at DESC, issue.id DESC
            LIMIT 1
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
    private final ContentDocumentValidator validator;
    private final ContentDocumentExtractor extractor;
    private final JdbcPublicMediaResolver mediaResolver;

    public JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper());
    }

    public JdbcPublicArticleRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(
                jdbcTemplate,
                objectMapper,
                new ContentDocumentValidator(),
                new ContentDocumentExtractor(),
                new JdbcPublicMediaResolver(jdbcTemplate)
        );
    }

    JdbcPublicArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ContentDocumentValidator validator,
            ContentDocumentExtractor extractor,
            JdbcPublicMediaResolver mediaResolver
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.validator = Objects.requireNonNull(validator, "validator");
        this.extractor = Objects.requireNonNull(extractor, "extractor");
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
                    Timestamp.from(now),
                    articleSlug,
                    articleSlug
            );
        } catch (InvalidPublishedContentException exception) {
            return Optional.empty();
        }
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        ArticleRow row = rows.getFirst();
        try {
            FrozenArticle article = frozenArticle(row);
            Optional<List<PublicArticleMedia>> resolvedMedia = resolvePublicMedia(article, now);
            if (resolvedMedia.isEmpty()) {
                return Optional.empty();
            }
            List<Contributor> contributors = article.contributors() == null
                    ? findContributors(article.revisionId())
                    : article.contributors();
            Optional<IssueNavigation> navigation = issueNavigation(article.articleId(), now);
            if (navigation.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(new ArticleProjection(
                    article.articleId(),
                    article.revisionId(),
                    article.revisionNumber(),
                    article.slug(),
                    article.title(),
                    article.dek(),
                    article.content(),
                    article.plainText(),
                    article.readingTimeMinutes(),
                    article.publishedAt(),
                    article.updatedAt(),
                    article.canonicalPath(),
                    resolvedMedia.get(),
                    contributors,
                    navigation.get()
            ));
        } catch (InvalidPublishedContentException | IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private ArticleRow mapArticle(ResultSet resultSet) throws SQLException {
        return new ArticleRow(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getString("live_slug"),
                instant(resultSet.getTimestamp("published_at")),
                resultSet.getObject("revision_id", UUID.class),
                resultSet.getInt("revision_number"),
                resultSet.getString("live_title"),
                resultSet.getString("live_dek"),
                instant(resultSet.getTimestamp("revision_updated_at")),
                json(resultSet.getString("snapshot_document")),
                instant(resultSet.getTimestamp("snapshot_created_at"))
        );
    }

    private FrozenArticle frozenArticle(ArticleRow row) {
        JsonNode snapshot = row.snapshot();
        boolean envelope = snapshot.has("content");
        JsonNode content = envelope ? snapshot.get("content") : snapshot;
        ExtractedArticleContent extracted = validatedExtraction(content);
        validateEnvelopeContract(snapshot, envelope, extracted);

        UUID articleId = envelope
                ? optionalUuid(snapshot, "articleId", row.articleId())
                : row.articleId();
        UUID revisionId = envelope
                ? optionalUuid(snapshot, "revisionId", row.revisionId())
                : row.revisionId();
        if (!row.articleId().equals(articleId) || !row.revisionId().equals(revisionId)) {
            throw invalid("published snapshot ownership does not match its database row");
        }
        int revisionNumber = envelope
                ? optionalPositiveInt(snapshot, "revisionNumber", row.revisionNumber())
                : row.revisionNumber();
        String slug = envelope ? optionalText(snapshot, "slug", row.liveSlug()) : row.liveSlug();
        String title = envelope ? optionalText(snapshot, "title", row.liveTitle()) : row.liveTitle();
        String dek = envelope ? optionalNullableText(snapshot, "dek", row.liveDek()) : row.liveDek();
        Instant publishedAt = envelope
                ? optionalInstant(snapshot, "publishedAt", row.publishedAt())
                : row.publishedAt();
        Instant updatedAt = envelope
                ? optionalInstant(snapshot, "updatedAt", row.revisionUpdatedAt())
                : row.revisionUpdatedAt();
        if (publishedAt == null) {
            publishedAt = row.snapshotCreatedAt();
        }
        if (updatedAt == null) {
            updatedAt = row.snapshotCreatedAt();
        }
        String canonicalPath = envelope
                ? optionalText(snapshot, "canonicalPath", "/articles/" + slug)
                : "/articles/" + slug;
        verifyDerivedMetadata(snapshot, extracted, envelope);
        List<Contributor> contributors = envelope && snapshot.has("contributors")
                ? snapshotContributors(snapshot.get("contributors"))
                : null;
        List<PublicArticleMedia> media = envelope && snapshot.has("media")
                ? snapshotMedia(snapshot.get("media"), extracted.renderableContent())
                : null;
        return new FrozenArticle(
                articleId,
                revisionId,
                revisionNumber,
                slug,
                title,
                dek,
                extracted.renderableContent(),
                extracted.plainText(),
                extracted.readingTimeMinutes(),
                publishedAt,
                updatedAt,
                canonicalPath,
                contributors,
                media
        );
    }

    private void verifyDerivedMetadata(
            JsonNode snapshot,
            ExtractedArticleContent extracted,
            boolean envelope
    ) {
        if (!envelope) {
            return;
        }
        JsonNode plainText = snapshot.get("plainText");
        if (plainText != null
                && (!plainText.isString() || !plainText.asString().equals(extracted.plainText()))) {
            throw invalid("published snapshot plain text does not match frozen content");
        }
        JsonNode readingTime = snapshot.get("readingTimeMinutes");
        if (readingTime != null
                && (!readingTime.isIntegralNumber()
                || readingTime.asInt() != extracted.readingTimeMinutes())) {
            throw invalid("published snapshot reading time does not match frozen content");
        }
    }

    private Optional<IssueNavigation> issueNavigation(UUID articleId, Instant now) {
        List<JsonNode> rows = jdbcTemplate.query(
                ISSUE_SNAPSHOT_SQL,
                (resultSet, rowNumber) -> json(resultSet.getString("snapshot_document")),
                Timestamp.from(now),
                articleId.toString()
        );
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        JsonNode snapshot = rows.getFirst();
        String issueSlug = requiredText(snapshot, "slug");
        List<ArticleSummary> snapshotItems = issueArticles(snapshot);
        if (snapshotItems.size() > MAXIMUM_TOC_ROWS) {
            return Optional.empty();
        }

        NavigationCandidates candidates = navigationCandidates(snapshotItems, now);
        Map<UUID, List<JdbcPublicMediaResolver.MediaReference>> mediaByArticle =
                candidates.mediaByArticle();
        List<JdbcPublicMediaResolver.MediaReference> allReferences = mediaByArticle.values().stream()
                .flatMap(List::stream)
                .toList();
        Set<JdbcPublicMediaResolver.MediaReference> availableMedia =
                mediaResolver.visibleReferences(allReferences, now);

        List<ArticleSummary> publicItems = new ArrayList<>();
        for (ArticleSummary item : snapshotItems) {
            List<JdbcPublicMediaResolver.MediaReference> references = mediaByArticle.get(item.articleId());
            String currentSlug = candidates.currentSlugs().get(item.articleId());
            if (references != null && currentSlug != null && availableMedia.containsAll(references)) {
                publicItems.add(new ArticleSummary(
                        item.articleId(),
                        currentSlug,
                        item.title(),
                        item.position()
                ));
            }
        }
        int currentIndex = findArticleIndex(publicItems, articleId);
        if (currentIndex < 0) {
            return Optional.empty();
        }
        ArticleSummary previous = currentIndex > 0 ? publicItems.get(currentIndex - 1) : null;
        ArticleSummary next = currentIndex + 1 < publicItems.size()
                ? publicItems.get(currentIndex + 1)
                : null;
        return Optional.of(new IssueNavigation(issueSlug, previous, next));
    }

    private List<ArticleSummary> issueArticles(JsonNode snapshot) {
        JsonNode sections = snapshot.get("sections");
        if (sections == null || !sections.isArray()) {
            throw invalid("published issue snapshot has no sections");
        }
        List<ArticleSummary> items = new ArrayList<>();
        Set<UUID> articleIds = new LinkedHashSet<>();
        for (JsonNode section : sections) {
            if (section == null || !section.isObject()) {
                throw invalid("published issue section is invalid");
            }
            JsonNode articles = section.get("articles");
            if (articles == null || !articles.isArray()) {
                throw invalid("published issue section has no articles");
            }
            for (JsonNode article : articles) {
                if (items.size() >= MAXIMUM_TOC_ROWS) {
                    throw invalid("published issue snapshot exceeds the bounded TOC limit");
                }
                UUID articleId = requiredUuid(article, "articleId");
                if (!articleIds.add(articleId)) {
                    throw invalid("published issue snapshot contains a duplicate Article");
                }
                items.add(new ArticleSummary(
                        articleId,
                        requiredText(article, "slug"),
                        requiredText(article, "title"),
                        requiredPositiveInt(article, "position")
                ));
            }
        }
        return List.copyOf(items);
    }

    private NavigationCandidates navigationCandidates(
            List<ArticleSummary> items,
            Instant now
    ) {
        if (items.isEmpty()) {
            return new NavigationCandidates(Map.of(), Map.of());
        }
        String placeholders = String.join(", ", java.util.Collections.nCopies(items.size(), "?"));
        String sql = """
                SELECT article.id AS article_id,
                       article.slug AS live_slug,
                       revision.id AS revision_id,
                       snapshot.content_document AS snapshot_document
                FROM article
                JOIN article_revision revision
                  ON revision.id = article.published_revision_id
                 AND revision.article_id = article.id
                JOIN LATERAL (
                    SELECT frozen.content_document
                    FROM publication_snapshot frozen
                    WHERE frozen.aggregate_type = 'ARTICLE'
                      AND frozen.aggregate_id = article.id
                      AND frozen.revision_id = revision.id
                    ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                    LIMIT 1
                ) snapshot ON TRUE
                WHERE article.id IN (%s)
                  AND article.state = 'PUBLISHED'
                  AND article.published_at IS NOT NULL
                  AND article.published_at <= ?
                  AND revision.state = 'PUBLISHED'
                """.replace("%s", placeholders);
        List<Object> parameters = new ArrayList<>();
        for (ArticleSummary item : items) {
            parameters.add(item.articleId());
        }
        parameters.add(Timestamp.from(now));
        List<NavigationSnapshotRow> rows = jdbcTemplate.query(
                sql,
                (resultSet, rowNumber) -> new NavigationSnapshotRow(
                        resultSet.getObject("article_id", UUID.class),
                        resultSet.getString("live_slug"),
                        resultSet.getObject("revision_id", UUID.class),
                        resultSet.getString("snapshot_document")
                ),
                parameters.toArray()
        );
        Map<UUID, NavigationSnapshotRow> snapshots = new LinkedHashMap<>();
        for (NavigationSnapshotRow row : rows) {
            snapshots.put(row.articleId(), row);
        }
        Map<UUID, List<JdbcPublicMediaResolver.MediaReference>> references = new LinkedHashMap<>();
        Map<UUID, String> currentSlugs = new LinkedHashMap<>();
        for (ArticleSummary item : items) {
            NavigationSnapshotRow row = snapshots.get(item.articleId());
            if (row == null) {
                continue;
            }
            JsonNode articleSnapshot;
            JsonNode content;
            String currentSlug;
            List<JdbcPublicMediaResolver.MediaReference> articleReferences;
            try {
                articleSnapshot = json(row.snapshotDocument());
                currentSlug = articleSnapshot.has("content")
                        ? requiredText(articleSnapshot, "slug")
                        : row.liveSlug();
                if (articleSnapshot.has("content")) {
                    UUID frozenArticleId = optionalUuid(articleSnapshot, "articleId", row.articleId());
                    UUID frozenRevisionId = optionalUuid(articleSnapshot, "revisionId", row.revisionId());
                    if (!row.articleId().equals(frozenArticleId)
                            || !row.revisionId().equals(frozenRevisionId)) {
                        throw invalid("published neighbor snapshot ownership is inconsistent");
                    }
                }
                content = snapshotContent(articleSnapshot);
                ExtractedArticleContent extracted = validatedExtraction(content);
                validateEnvelopeContract(articleSnapshot, articleSnapshot.has("content"), extracted);
                articleReferences = extractMediaReferences(content);
            } catch (InvalidPublishedContentException | IllegalArgumentException exception) {
                // An invalid or inaccessible neighbor is omitted without destabilizing the reader.
                continue;
            }
            try {
                validateSnapshotMediaContract(articleSnapshot, content, articleReferences);
            } catch (InvalidPublishedContentException | IllegalArgumentException exception) {
                // A bounded neighbor with an invalid frozen media contract remains inaccessible.
                continue;
            }
            references.put(item.articleId(), articleReferences);
            currentSlugs.put(item.articleId(), currentSlug);
        }
        return new NavigationCandidates(Map.copyOf(references), Map.copyOf(currentSlugs));
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

    private List<Contributor> snapshotContributors(JsonNode contributors) {
        if (contributors == null || !contributors.isArray()) {
            throw invalid("published snapshot contributors must be an array");
        }
        List<Contributor> result = new ArrayList<>();
        for (JsonNode contributor : contributors) {
            result.add(new Contributor(
                    requiredUuid(contributor, "contributorId"),
                    requiredText(contributor, "slug"),
                    requiredText(contributor, "displayName"),
                    requiredText(contributor, "role")
            ));
        }
        return List.copyOf(result);
    }

    private List<PublicArticleMedia> snapshotMedia(JsonNode media, JsonNode content) {
        if (media == null || !media.isArray()) {
            throw invalid("published snapshot media must be an array");
        }
        Map<JdbcPublicMediaResolver.MediaReference, PublicArticleMedia> frozen = new LinkedHashMap<>();
        for (JsonNode value : media) {
            if (frozen.size() >= JdbcPublicMediaResolver.MAXIMUM_BATCH_REFERENCES) {
                throw invalid("published snapshot exceeds the bounded media limit");
            }
            PublicArticleMedia item = new PublicArticleMedia(
                    requiredUuid(value, "assetId"),
                    requiredText(value, "variant"),
                    requiredText(value, "url"),
                    requiredText(value, "mimeType"),
                    requiredPositiveInt(value, "width"),
                    requiredPositiveInt(value, "height"),
                    requiredText(value, "altText"),
                    requiredText(value, "credit"),
                    requiredText(value, "rightsOwner"),
                    requiredText(value, "licenseName")
            );
            JdbcPublicMediaResolver.MediaReference reference =
                    new JdbcPublicMediaResolver.MediaReference(item.assetId(), item.variant());
            if (frozen.putIfAbsent(reference, item) != null) {
                throw invalid("published snapshot media contains a duplicate variant");
            }
        }

        Map<JdbcPublicMediaResolver.MediaReference, Boolean> referenced = new LinkedHashMap<>();
        for (JdbcPublicMediaResolver.MediaReference reference : extractMediaReferences(content)) {
            referenced.putIfAbsent(reference, Boolean.TRUE);
        }
        if (referenced.size() > JdbcPublicMediaResolver.MAXIMUM_BATCH_REFERENCES) {
            throw invalid("published snapshot exceeds the bounded media limit");
        }
        List<JdbcPublicMediaResolver.MediaReference> frozenOrder = List.copyOf(frozen.keySet());
        List<JdbcPublicMediaResolver.MediaReference> referencedOrder = List.copyOf(referenced.keySet());
        if (!frozenOrder.equals(referencedOrder)) {
            throw invalid("published snapshot media does not match its frozen content");
        }
        return frozenOrder.stream().map(frozen::get).toList();
    }

    private void validateSnapshotMediaContract(
            JsonNode snapshot,
            JsonNode content,
            List<JdbcPublicMediaResolver.MediaReference> references
    ) {
        Map<JdbcPublicMediaResolver.MediaReference, Boolean> unique = new LinkedHashMap<>();
        for (JdbcPublicMediaResolver.MediaReference reference : references) {
            unique.putIfAbsent(reference, Boolean.TRUE);
        }
        if (unique.size() > JdbcPublicMediaResolver.MAXIMUM_BATCH_REFERENCES) {
            throw invalid("published snapshot exceeds the bounded media limit");
        }
        if (!snapshot.has("media")) {
            if (!unique.isEmpty()) {
                throw invalid("legacy published snapshot cannot synthesize media metadata");
            }
            return;
        }
        snapshotMedia(snapshot.get("media"), content);
    }

    private void validateEnvelopeContract(
            JsonNode snapshot,
            boolean envelope,
            ExtractedArticleContent extracted
    ) {
        if (!envelope || !snapshot.has("projectionVersion")) {
            return;
        }
        JsonNode version = snapshot.get("projectionVersion");
        if (!version.isIntegralNumber() || (version.asInt() != 1 && version.asInt() != 2)) {
            throw invalid("published snapshot projection version is unsupported");
        }
        if (version.asInt() != 2) {
            return;
        }
        JsonNode schemaVersion = snapshot.get("schemaVersion");
        if (schemaVersion == null || !schemaVersion.isIntegralNumber() || schemaVersion.asInt() != 1) {
            throw invalid("published snapshot schema version is unsupported");
        }
        if (!"published-article".equals(requiredText(snapshot, "snapshotType"))) {
            throw invalid("published snapshot type is unsupported");
        }
        requiredUuid(snapshot, "articleId");
        requiredUuid(snapshot, "revisionId");
        requiredPositiveInt(snapshot, "revisionNumber");
        String slug = requiredText(snapshot, "slug");
        requiredText(snapshot, "title");
        if (!snapshot.has("dek")) {
            throw invalid("published snapshot is missing dek");
        }
        optionalNullableText(snapshot, "dek", null);
        requiredText(snapshot, "plainText");
        requiredPositiveInt(snapshot, "readingTimeMinutes");
        if (!snapshot.has("publishedAt") || !snapshot.has("updatedAt")) {
            throw invalid("published snapshot is missing public timestamps");
        }
        optionalInstant(snapshot, "publishedAt", null);
        optionalInstant(snapshot, "updatedAt", null);
        String canonicalPath = requiredText(snapshot, "canonicalPath");
        if (!canonicalPath.equals("/articles/" + slug)) {
            throw invalid("published snapshot canonical path does not match its slug");
        }
        if (!snapshot.has("contributors")) {
            throw invalid("published snapshot is missing contributors");
        }
        snapshotContributors(snapshot.get("contributors"));
        if (!snapshot.has("media")) {
            throw invalid("published snapshot is missing media");
        }
        verifyDerivedMetadata(snapshot, extracted, true);
    }

    private ExtractedArticleContent validatedExtraction(JsonNode content) {
        if (content == null || !content.isObject()
                || !validator.validate(content.toString()).valid()) {
            throw invalid("published ContentDocument failed canonical validation");
        }
        try {
            return extractor.extract(content);
        } catch (IllegalArgumentException exception) {
            throw invalid("published ContentDocument extraction failed", exception);
        }
    }

    private Optional<List<PublicArticleMedia>> resolvePublicMedia(FrozenArticle article, Instant now) {
        List<JdbcPublicMediaResolver.MediaReference> references = extractMediaReferences(article.content());
        if (article.media() == null) {
            return references.isEmpty() ? Optional.of(List.of()) : Optional.empty();
        }
        if (!mediaResolver.areAllVisible(references, now)) {
            return Optional.empty();
        }
        return Optional.of(article.media());
    }

    private static List<JdbcPublicMediaResolver.MediaReference> extractMediaReferences(JsonNode document) {
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            throw new IllegalArgumentException("content blocks are required");
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
                    // Canonical non-media blocks do not need public media resolution.
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
        JsonNode value = payload.get("variant");
        if (value == null) {
            return fallback;
        }
        if (!value.isString()) {
            throw new IllegalArgumentException("media variant must be a string");
        }
        return value.asString();
    }

    private JsonNode json(String value) {
        try {
            JsonNode parsed = objectMapper.readTree(value);
            if (parsed == null || !parsed.isObject()) {
                throw invalid("published snapshot must be a JSON object");
            }
            return parsed;
        } catch (InvalidPublishedContentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid("published snapshot is not valid JSON", exception);
        }
    }

    private static JsonNode snapshotContent(JsonNode snapshot) {
        JsonNode content = snapshot.has("content") ? snapshot.get("content") : snapshot;
        if (content == null || !content.isObject()) {
            throw invalid("published Article snapshot content is missing");
        }
        return content;
    }

    private static int findArticleIndex(List<ArticleSummary> items, UUID articleId) {
        for (int index = 0; index < items.size(); index++) {
            if (items.get(index).articleId().equals(articleId)) {
                return index;
            }
        }
        return -1;
    }

    private static UUID optionalUuid(JsonNode node, String field, UUID fallback) {
        return node.has(field) ? requiredUuid(node, field) : fallback;
    }

    private static UUID requiredUuid(JsonNode node, String field) {
        try {
            return UUID.fromString(requiredText(node, field));
        } catch (IllegalArgumentException exception) {
            throw invalid("published snapshot " + field + " must be a UUID", exception);
        }
    }

    private static int optionalPositiveInt(JsonNode node, String field, int fallback) {
        return node.has(field) ? requiredPositiveInt(node, field) : fallback;
    }

    private static int requiredPositiveInt(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isIntegralNumber() || value.asInt() < 1) {
            throw invalid("published snapshot " + field + " must be positive");
        }
        return value.asInt();
    }

    private static String optionalText(JsonNode node, String field, String fallback) {
        return node.has(field) ? requiredText(node, field) : fallback;
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw invalid("published snapshot is missing " + field);
        }
        return value.asString();
    }

    private static String optionalNullableText(JsonNode node, String field, String fallback) {
        if (!node.has(field)) {
            return fallback;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw invalid("published snapshot " + field + " must be text");
        }
        return value.asString();
    }

    private static Instant optionalInstant(JsonNode node, String field, Instant fallback) {
        if (!node.has(field)) {
            return fallback;
        }
        String value = requiredText(node, field);
        try {
            return Instant.parse(value);
        } catch (DateTimeException exception) {
            throw invalid("published snapshot " + field + " must be an instant", exception);
        }
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static InvalidPublishedContentException invalid(String message) {
        return new InvalidPublishedContentException(message);
    }

    private static InvalidPublishedContentException invalid(String message, Throwable cause) {
        return new InvalidPublishedContentException(message, cause);
    }

    private record ArticleRow(
            UUID articleId,
            String liveSlug,
            Instant publishedAt,
            UUID revisionId,
            int revisionNumber,
            String liveTitle,
            String liveDek,
            Instant revisionUpdatedAt,
            JsonNode snapshot,
            Instant snapshotCreatedAt
    ) {
    }

    private record FrozenArticle(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            JsonNode content,
            String plainText,
            int readingTimeMinutes,
            Instant publishedAt,
            Instant updatedAt,
            String canonicalPath,
            List<Contributor> contributors,
            List<PublicArticleMedia> media
    ) {
    }

    private record NavigationSnapshotRow(
            UUID articleId,
            String liveSlug,
            UUID revisionId,
            String snapshotDocument
    ) {
    }

    private record NavigationCandidates(
            Map<UUID, List<JdbcPublicMediaResolver.MediaReference>> mediaByArticle,
            Map<UUID, String> currentSlugs
    ) {
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
}
