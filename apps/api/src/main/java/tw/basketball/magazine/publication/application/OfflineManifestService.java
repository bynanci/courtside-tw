package tw.basketball.magazine.publication.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.content.domain.ExtractedArticleContent;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;

/** Builds bounded, immutable, rights-checked packages for anonymous offline clients. */
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
                   frozen.created_at AS snapshot_created_at,
                   rights.expires_at
            FROM publication_issue issue
            JOIN LATERAL (
                SELECT frozen.id, frozen.snapshot_version,
                       frozen.checksum_sha256, frozen.content_document, frozen.created_at
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
                  AND rights.allowed_channels @> ARRAY['OFFLINE']::text[]
                  AND rights.valid_from <= ?
                  AND rights.valid_until > ?
            ) rights ON rights.expires_at IS NOT NULL
            WHERE issue.slug = ?
              AND issue.state = 'PUBLISHED'
              AND issue.published_at IS NOT NULL
              AND issue.published_at <= ?
            LIMIT 1
            """;
    private static final String ARTICLE_BY_REVISION_SQL = """
            SELECT article.id AS article_id,
                   article.slug AS live_slug,
                   article.published_at,
                   revision.id AS revision_id,
                   revision.revision_number,
                   revision.title AS live_title,
                   revision.dek AS live_dek,
                   revision.updated_at AS revision_updated_at,
                   frozen.id AS snapshot_id,
                   frozen.checksum_sha256,
                   frozen.content_document,
                   frozen.created_at AS snapshot_created_at
            FROM article
            JOIN article_revision revision ON revision.article_id = article.id
            JOIN publication_snapshot frozen
              ON frozen.aggregate_type = 'ARTICLE'
             AND frozen.aggregate_id = article.id
             AND frozen.revision_id = revision.id
            WHERE article.id = ?
              AND revision.id = ?
              AND article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
            ORDER BY frozen.snapshot_version DESC, frozen.id DESC
            LIMIT 1
            """;
    private static final String ARTICLE_AT_ISSUE_SNAPSHOT_SQL = """
            SELECT article.id AS article_id,
                   article.slug AS live_slug,
                   article.published_at,
                   revision.id AS revision_id,
                   revision.revision_number,
                   revision.title AS live_title,
                   revision.dek AS live_dek,
                   revision.updated_at AS revision_updated_at,
                   frozen.id AS snapshot_id,
                   frozen.checksum_sha256,
                   frozen.content_document,
                   frozen.created_at AS snapshot_created_at
            FROM article
            JOIN publication_snapshot frozen
              ON frozen.aggregate_type = 'ARTICLE'
             AND frozen.aggregate_id = article.id
             AND frozen.created_at <= ?
            JOIN article_revision revision
              ON revision.article_id = article.id
             AND revision.id = frozen.revision_id
            WHERE article.id = ?
              AND article.state = 'PUBLISHED'
              AND article.published_at IS NOT NULL
              AND article.published_at <= ?
              AND revision.state = 'PUBLISHED'
            ORDER BY frozen.created_at DESC, frozen.snapshot_version DESC, frozen.id DESC
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
              AND rights.allowed_channels @> ARRAY['OFFLINE']::text[]
              AND rights.valid_from <= ?
              AND rights.valid_until > ?
            GROUP BY asset.id, variant.variant, variant.public_storage_key,
                     variant.mime_type, variant.byte_size, variant.checksum_sha256
            ORDER BY asset.id, variant.variant
            """;
    private static final String LINKED_ASSET_SQL = """
            SELECT DISTINCT asset_id
            FROM publication_impact_link
            WHERE snapshot_id = ?
            ORDER BY asset_id
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
            SELECT version
            FROM offline_withdrawal_manifest_state
            WHERE singleton = TRUE
            """;

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final ObjectMapper objectMapper;
    private final ContentDocumentValidator contentValidator;
    private final ContentDocumentExtractor contentExtractor;

    public OfflineManifestService(JdbcTemplate jdbcTemplate) {
        this(
                jdbcTemplate,
                Clock.systemUTC(),
                new ObjectMapper(),
                new ContentDocumentValidator(),
                new ContentDocumentExtractor()
        );
    }

    OfflineManifestService(
            JdbcTemplate jdbcTemplate,
            Clock clock,
            ObjectMapper objectMapper,
            ContentDocumentValidator contentValidator,
            ContentDocumentExtractor contentExtractor
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.contentValidator = Objects.requireNonNull(contentValidator, "contentValidator");
        this.contentExtractor = Objects.requireNonNull(contentExtractor, "contentExtractor");
    }

    public Optional<OfflineManifest> findIssueManifest(String issueSlug) {
        return buildIssueManifest(issueSlug);
    }

    public Optional<OfflineArticleContent> findIssueArticleContent(
            String issueSlug,
            UUID articleId,
            UUID revisionId
    ) {
        Objects.requireNonNull(articleId, "articleId");
        Objects.requireNonNull(revisionId, "revisionId");
        Instant now = clock.instant();
        Optional<IssueRow> issueValue = findIssueRow(issueSlug, now);
        if (issueValue.isEmpty()) {
            return Optional.empty();
        }

        IssueRow issue = issueValue.get();
        try {
            JsonNode issueSnapshot = objectMapper.readTree(issue.document());
            List<SnapshotArticle> snapshotArticles = snapshotArticles(issueSnapshot);
            int articleIndex = -1;
            for (int index = 0; index < snapshotArticles.size(); index++) {
                SnapshotArticle candidate = snapshotArticles.get(index);
                if (candidate.articleId().equals(articleId)) {
                    articleIndex = index;
                    break;
                }
            }
            if (articleIndex < 0) {
                return Optional.empty();
            }

            SnapshotArticle frozen = snapshotArticles.get(articleIndex);
            if (frozen.revisionId() != null && !frozen.revisionId().equals(revisionId)) {
                return Optional.empty();
            }
            Optional<ArticleRow> rowValue = findArticleRow(frozen, issue.snapshotCreatedAt(), now);
            if (rowValue.isEmpty() || !rowValue.get().revisionId().equals(revisionId)) {
                return Optional.empty();
            }

            ArticleRow row = rowValue.get();
            AssetBundle assetBundle = assets(List.of(issue.snapshotId(), row.snapshotId()), now);
            if (!assetBundle.complete()) {
                return Optional.empty();
            }
            byte[] body = articleProjection(
                    issue.slug(),
                    snapshotArticles,
                    articleIndex,
                    frozen,
                    row
            );
            return Optional.of(new OfflineArticleContent(body, digest(body)));
        } catch (JacksonException | IllegalArgumentException | IllegalStateException exception) {
            return Optional.empty();
        }
    }

    public WithdrawalManifest withdrawalManifest() {
        Instant generatedAt = clock.instant();
        Long version = jdbcTemplate.queryForObject(VERSION_SQL, Long.class);
        List<UUID> withdrawals = new ArrayList<>(jdbcTemplate.query(
                WITHDRAWAL_SQL,
                (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class)
        ));
        withdrawals.sort(Comparator.comparing(UUID::toString));
        long manifestVersion = version == null ? 1 : Math.max(1, version);
        String canonicalPayload = manifestVersion + "\n" + withdrawals.stream()
                .map(UUID::toString)
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
        return new WithdrawalManifest(
                manifestVersion,
                generatedAt,
                withdrawals,
                digest(canonicalPayload.getBytes(StandardCharsets.UTF_8))
        );
    }

    private Optional<OfflineManifest> buildIssueManifest(String issueSlug) {
        Instant now = clock.instant();
        Optional<IssueRow> issueValue = findIssueRow(issueSlug, now);
        if (issueValue.isEmpty()) {
            return Optional.empty();
        }

        IssueRow issue = issueValue.get();
        try {
            JsonNode issueSnapshot = objectMapper.readTree(issue.document());
            List<SnapshotArticle> snapshotArticles = snapshotArticles(issueSnapshot);
            if (snapshotArticles.size() > MAXIMUM_ARTICLES) {
                return Optional.empty();
            }

            List<PackagedArticle> packagedArticles = new ArrayList<>();
            List<UUID> snapshotIds = new ArrayList<>();
            snapshotIds.add(issue.snapshotId());
            for (int index = 0; index < snapshotArticles.size(); index++) {
                SnapshotArticle frozen = snapshotArticles.get(index);
                Optional<ArticleRow> articleRow = findArticleRow(frozen, issue.snapshotCreatedAt(), now);
                if (articleRow.isEmpty()) {
                    return Optional.empty();
                }
                ArticleRow row = articleRow.get();
                byte[] body = articleProjection(issue.slug(), snapshotArticles, index, frozen, row);
                String checksum = digest(body);
                String contentUrl = articleContentUrl(
                        issue.slug(),
                        frozen.articleId(),
                        row.revisionId()
                );
                OfflineArticle article = new OfflineArticle(
                        frozen.articleId(),
                        row.revisionId(),
                        row.revisionNumber(),
                        frozen.slug(),
                        frozen.title(),
                        frozen.position(),
                        contentUrl,
                        body.length,
                        checksum
                );
                packagedArticles.add(new PackagedArticle(article, row.snapshotChecksum()));
                snapshotIds.add(row.snapshotId());
            }

            AssetBundle assetBundle = assets(snapshotIds, now);
            if (!assetBundle.complete()) {
                return Optional.empty();
            }
            Instant expiresAt = assetBundle.assets().stream()
                    .map(OfflineAsset::expiresAt)
                    .reduce(issue.expiresAt(), (left, right) -> left.isBefore(right) ? left : right);
            long downloadableBytes = assetBundle.assets().stream()
                    .mapToLong(OfflineAsset::byteSize)
                    .reduce(0, Math::addExact);
            for (PackagedArticle article : packagedArticles) {
                downloadableBytes = Math.addExact(downloadableBytes, article.article().byteSize());
            }

            List<OfflineArticle> articles = packagedArticles.stream()
                    .map(PackagedArticle::article)
                    .toList();
            String checksum = packageChecksum(
                    issue,
                    packagedArticles,
                    assetBundle.assets(),
                    expiresAt,
                    downloadableBytes
            );
            OfflineManifest manifest = new OfflineManifest(
                    issue.slug(),
                    issue.snapshotVersion(),
                    checksum,
                    articles,
                    expiresAt,
                    downloadableBytes,
                    assetBundle.assets()
            );
            return Optional.of(manifest);
        } catch (JacksonException | IllegalArgumentException | IllegalStateException
                 | ArithmeticException exception) {
            return Optional.empty();
        }
    }

    private Optional<IssueRow> findIssueRow(String issueSlug, Instant now) {
        if (issueSlug == null || issueSlug.length() > 128 || !ISSUE_SLUG.matcher(issueSlug).matches()) {
            return Optional.empty();
        }
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
        return Optional.of(rows.getFirst());
    }

    private Optional<ArticleRow> findArticleRow(
            SnapshotArticle article,
            Instant issueSnapshotCreatedAt,
            Instant now
    ) {
        List<ArticleRow> rows;
        if (article.revisionId() != null) {
            rows = jdbcTemplate.query(
                    ARTICLE_BY_REVISION_SQL,
                    (resultSet, rowNumber) -> mapArticle(resultSet),
                    article.articleId(),
                    article.revisionId(),
                    Timestamp.from(now)
            );
        } else {
            rows = jdbcTemplate.query(
                    ARTICLE_AT_ISSUE_SNAPSHOT_SQL,
                    (resultSet, rowNumber) -> mapArticle(resultSet),
                    Timestamp.from(issueSnapshotCreatedAt),
                    article.articleId(),
                    Timestamp.from(now)
            );
        }
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        ArticleRow row = rows.getFirst();
        if (article.revisionNumber() != null && article.revisionNumber() != row.revisionNumber()) {
            return Optional.empty();
        }
        return Optional.of(row);
    }

    private List<SnapshotArticle> snapshotArticles(JsonNode snapshot) {
        JsonNode sections = snapshot == null ? null : snapshot.get("sections");
        if (sections == null || !sections.isArray()) {
            throw new IllegalStateException("offline issue snapshot has no sections");
        }
        List<SnapshotArticle> result = new ArrayList<>();
        Set<UUID> articleIds = new LinkedHashSet<>();
        Set<String> slugs = new LinkedHashSet<>();
        for (JsonNode section : sections) {
            if (section == null || !section.isObject()) {
                throw new IllegalStateException("offline issue section is invalid");
            }
            JsonNode articles = section.get("articles");
            if (articles == null || !articles.isArray()) {
                throw new IllegalStateException("offline issue section has no articles");
            }
            for (JsonNode article : articles) {
                if (result.size() >= MAXIMUM_ARTICLES) {
                    throw new IllegalStateException("offline issue exceeds the bounded article limit");
                }
                UUID articleId = UUID.fromString(requiredText(article, "articleId"));
                String slug = requiredText(article, "slug");
                if (!ISSUE_SLUG.matcher(slug).matches() || !articleIds.add(articleId) || !slugs.add(slug)) {
                    throw new IllegalStateException("offline issue contains duplicate or invalid articles");
                }
                result.add(new SnapshotArticle(
                        articleId,
                        optionalUuid(article, "revisionId"),
                        optionalPositiveInt(article, "revisionNumber"),
                        slug,
                        requiredText(article, "title"),
                        requiredPositiveInt(article, "position")
                ));
            }
        }
        return List.copyOf(result);
    }

    private byte[] articleProjection(
            String issueSlug,
            List<SnapshotArticle> issueArticles,
            int articleIndex,
            SnapshotArticle frozen,
            ArticleRow row
    ) {
        JsonNode snapshot;
        try {
            snapshot = objectMapper.readTree(row.document());
        } catch (JacksonException exception) {
            throw new IllegalStateException("offline article snapshot is invalid", exception);
        }
        JsonNode content = snapshot.has("content") ? snapshot.get("content") : snapshot;
        if (content == null || !content.isObject() || !contentValidator.validate(content.toString()).valid()) {
            throw new IllegalStateException("offline article content is invalid");
        }
        ExtractedArticleContent extracted = contentExtractor.extract(content);
        if (extracted.plainText().isBlank()) {
            throw new IllegalStateException("offline article content has no reader-visible text");
        }

        UUID snapshotArticleId = optionalUuid(snapshot, "articleId", row.articleId());
        UUID snapshotRevisionId = optionalUuid(snapshot, "revisionId", row.revisionId());
        int snapshotRevisionNumber = optionalPositiveInt(
                snapshot,
                "revisionNumber",
                row.revisionNumber()
        );
        String slug = optionalText(snapshot, "slug", row.liveSlug());
        if (!row.articleId().equals(snapshotArticleId)
                || !row.revisionId().equals(snapshotRevisionId)
                || row.revisionNumber() != snapshotRevisionNumber
                || !frozen.articleId().equals(snapshotArticleId)
                || !frozen.slug().equals(slug)) {
            throw new IllegalStateException("offline article snapshot identity is inconsistent");
        }

        ObjectNode projection = objectMapper.createObjectNode();
        projection.put("articleId", snapshotArticleId.toString());
        projection.put("revisionId", snapshotRevisionId.toString());
        projection.put("revisionNumber", snapshotRevisionNumber);
        projection.put("slug", slug);
        projection.put("title", optionalText(snapshot, "title", row.liveTitle()));
        String dek = optionalNullableText(snapshot, "dek", row.liveDek());
        if (dek != null) {
            projection.put("dek", dek);
        }
        projection.set("content", extracted.renderableContent().deepCopy());
        projection.put("plainText", extracted.plainText());
        projection.put("readingTimeMinutes", extracted.readingTimeMinutes());
        projection.put("publishedAt", optionalInstant(
                snapshot,
                "publishedAt",
                row.publishedAt()
        ).toString());
        projection.put("updatedAt", optionalInstant(
                snapshot,
                "updatedAt",
                row.revisionUpdatedAt() == null ? row.snapshotCreatedAt() : row.revisionUpdatedAt()
        ).toString());
        projection.put("canonicalPath", "/articles/" + slug);
        projection.set("media", optionalArray(snapshot, "media"));
        projection.set("contributors", optionalArray(snapshot, "contributors"));
        projection.set("issueNavigation", navigation(issueSlug, issueArticles, articleIndex));
        try {
            return objectMapper.writeValueAsBytes(projection);
        } catch (JacksonException exception) {
            throw new IllegalStateException("offline article projection cannot be serialized", exception);
        }
    }

    private ObjectNode navigation(
            String issueSlug,
            List<SnapshotArticle> articles,
            int articleIndex
    ) {
        ObjectNode navigation = objectMapper.createObjectNode();
        navigation.put("issueSlug", issueSlug);
        if (articleIndex == 0) {
            navigation.putNull("previous");
        } else {
            navigation.set("previous", articleSummary(articles.get(articleIndex - 1)));
        }
        if (articleIndex + 1 >= articles.size()) {
            navigation.putNull("next");
        } else {
            navigation.set("next", articleSummary(articles.get(articleIndex + 1)));
        }
        return navigation;
    }

    private ObjectNode articleSummary(SnapshotArticle article) {
        ObjectNode summary = objectMapper.createObjectNode();
        summary.put("articleId", article.articleId().toString());
        summary.put("slug", article.slug());
        summary.put("title", article.title());
        summary.put("position", article.position());
        return summary;
    }

    private ArrayNode optionalArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null) {
            return objectMapper.createArrayNode();
        }
        if (!value.isArray()) {
            throw new IllegalStateException("offline article snapshot has invalid " + field);
        }
        return (ArrayNode) value.deepCopy();
    }

    private AssetBundle assets(List<UUID> snapshotIds, Instant now) {
        Map<AssetKey, OfflineAsset> assets = new LinkedHashMap<>();
        Set<UUID> linkedAssetIds = new LinkedHashSet<>();
        for (UUID snapshotId : new LinkedHashSet<>(snapshotIds)) {
            linkedAssetIds.addAll(jdbcTemplate.query(
                    LINKED_ASSET_SQL,
                    (resultSet, rowNumber) -> resultSet.getObject("asset_id", UUID.class),
                    snapshotId
            ));
            for (OfflineAsset asset : jdbcTemplate.query(
                    ASSET_SQL,
                    (resultSet, rowNumber) -> mapAsset(resultSet),
                    snapshotId,
                    Timestamp.from(now),
                    Timestamp.from(now)
            )) {
                AssetKey key = new AssetKey(asset.assetId(), asset.variant());
                OfflineAsset existing = assets.putIfAbsent(key, asset);
                if (existing != null && !existing.equals(asset)) {
                    throw new IllegalStateException("offline package asset identity is inconsistent");
                }
            }
        }
        long eligibleAssetCount = assets.values().stream().map(OfflineAsset::assetId).distinct().count();
        return new AssetBundle(
                List.copyOf(assets.values()),
                eligibleAssetCount == linkedAssetIds.size()
        );
    }

    private String packageChecksum(
            IssueRow issue,
            List<PackagedArticle> articles,
            List<OfflineAsset> assets,
            Instant expiresAt,
            long downloadableBytes
    ) {
        StringBuilder fingerprint = new StringBuilder();
        fingerprint.append(issue.slug()).append('\n')
                .append(issue.snapshotVersion()).append('\n')
                .append(issue.checksum()).append('\n')
                .append(expiresAt).append('\n')
                .append(downloadableBytes).append('\n');
        for (PackagedArticle packaged : articles) {
            OfflineArticle article = packaged.article();
            fingerprint.append(article.articleId()).append('|')
                    .append(article.revisionId()).append('|')
                    .append(article.revisionNumber()).append('|')
                    .append(article.slug()).append('|')
                    .append(article.position()).append('|')
                    .append(article.contentUrl()).append('|')
                    .append(article.byteSize()).append('|')
                    .append(article.checksum()).append('|')
                    .append(packaged.snapshotChecksum()).append('\n');
        }
        for (OfflineAsset asset : assets) {
            fingerprint.append(asset.assetId()).append('|')
                    .append(asset.variant()).append('|')
                    .append(asset.url()).append('|')
                    .append(asset.mimeType()).append('|')
                    .append(asset.byteSize()).append('|')
                    .append(asset.checksum()).append('|')
                    .append(asset.expiresAt()).append('\n');
        }
        return digest(fingerprint.toString().getBytes(StandardCharsets.UTF_8));
    }

    private IssueRow mapIssue(ResultSet resultSet) throws SQLException {
        return new IssueRow(
                resultSet.getObject("snapshot_id", UUID.class),
                resultSet.getString("slug"),
                resultSet.getLong("snapshot_version"),
                resultSet.getString("checksum_sha256").toLowerCase(Locale.ROOT),
                resultSet.getString("content_document"),
                resultSet.getTimestamp("snapshot_created_at").toInstant(),
                resultSet.getTimestamp("expires_at").toInstant()
        );
    }

    private ArticleRow mapArticle(ResultSet resultSet) throws SQLException {
        Timestamp revisionUpdatedAt = resultSet.getTimestamp("revision_updated_at");
        return new ArticleRow(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getString("live_slug"),
                resultSet.getTimestamp("published_at").toInstant(),
                resultSet.getObject("revision_id", UUID.class),
                resultSet.getInt("revision_number"),
                resultSet.getString("live_title"),
                resultSet.getString("live_dek"),
                revisionUpdatedAt == null ? null : revisionUpdatedAt.toInstant(),
                resultSet.getObject("snapshot_id", UUID.class),
                resultSet.getString("checksum_sha256").toLowerCase(Locale.ROOT),
                resultSet.getString("content_document"),
                resultSet.getTimestamp("snapshot_created_at").toInstant()
        );
    }

    private OfflineAsset mapAsset(ResultSet resultSet) throws SQLException {
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

    private static String articleContentUrl(String issueSlug, UUID articleId, UUID revisionId) {
        return "/api/v1/public/offline/issues/" + issueSlug
                + "/articles/" + articleId + "/revisions/" + revisionId;
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalStateException("offline snapshot is missing " + field);
        }
        return value.asString();
    }

    private static String optionalText(JsonNode node, String field, String fallback) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null) {
            return Objects.requireNonNull(fallback, field);
        }
        if (!value.isString() || value.asString().isBlank()) {
            throw new IllegalStateException("offline snapshot has invalid " + field);
        }
        return value.asString();
    }

    private static String optionalNullableText(JsonNode node, String field, String fallback) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return fallback;
        }
        if (!value.isString()) {
            throw new IllegalStateException("offline snapshot has invalid " + field);
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

    private static Integer optionalPositiveInt(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null) {
            return null;
        }
        if (!value.isIntegralNumber() || value.asInt() < 1) {
            throw new IllegalStateException("offline snapshot has invalid " + field);
        }
        return value.asInt();
    }

    private static int optionalPositiveInt(JsonNode node, String field, int fallback) {
        Integer value = optionalPositiveInt(node, field);
        return value == null ? fallback : value;
    }

    private static UUID optionalUuid(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null) {
            return null;
        }
        if (!value.isString()) {
            throw new IllegalStateException("offline snapshot has invalid " + field);
        }
        return UUID.fromString(value.asString());
    }

    private static UUID optionalUuid(JsonNode node, String field, UUID fallback) {
        UUID value = optionalUuid(node, field);
        return value == null ? fallback : value;
    }

    private static Instant optionalInstant(JsonNode node, String field, Instant fallback) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null) {
            return Objects.requireNonNull(fallback, field);
        }
        if (!value.isString()) {
            throw new IllegalStateException("offline snapshot has invalid " + field);
        }
        try {
            return Instant.parse(value.asString());
        } catch (DateTimeParseException exception) {
            throw new IllegalStateException("offline snapshot has invalid " + field, exception);
        }
    }

    private static String digest(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
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
            String contentUrl,
            long byteSize,
            String checksum
    ) {
        public OfflineArticle {
            Objects.requireNonNull(articleId, "articleId");
            Objects.requireNonNull(revisionId, "revisionId");
            Objects.requireNonNull(slug, "slug");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(contentUrl, "contentUrl");
            if (revisionNumber < 1 || position < 1 || byteSize < 1 || checksum == null
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

    public record OfflineArticleContent(byte[] body, String checksum) {
        public OfflineArticleContent {
            body = Objects.requireNonNull(body, "body").clone();
            if (body.length < 1 || checksum == null || !checksum.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("offline article content is invalid");
            }
        }

        @Override
        public byte[] body() {
            return body.clone();
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
            Instant snapshotCreatedAt,
            Instant expiresAt
    ) {
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
            UUID snapshotId,
            String snapshotChecksum,
            String document,
            Instant snapshotCreatedAt
    ) {
    }

    private record SnapshotArticle(
            UUID articleId,
            UUID revisionId,
            Integer revisionNumber,
            String slug,
            String title,
            int position
    ) {
    }

    private record PackagedArticle(OfflineArticle article, String snapshotChecksum) {
    }

    private record AssetKey(UUID assetId, String variant) {
    }

    private record AssetBundle(List<OfflineAsset> assets, boolean complete) {
    }

}
