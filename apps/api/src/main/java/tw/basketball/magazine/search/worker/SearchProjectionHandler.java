package tw.basketball.magazine.search.worker;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.search.application.SearchTextNormalizer;

/** Writes versioned public search documents from publication outbox execution. */
public final class SearchProjectionHandler implements SearchProjection {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ContentDocumentExtractor extractor;

    public SearchProjectionHandler(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.extractor = new ContentDocumentExtractor();
    }

    @Override
    public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
        Objects.requireNonNull(articleId, "articleId");
        Objects.requireNonNull(revisionId, "revisionId");
        Objects.requireNonNull(indexedAt, "indexedAt");
        ProjectionSource source = source(articleId);
        if (!"PUBLISHED".equals(source.articleState())) {
            throw new SearchProjectionException("search projection rejects a non-published source", false);
        }
        if (!revisionId.equals(source.publishedRevisionId())) {
            throw new SearchProjectionException("search projection revision is not public", false);
        }
        if (source.issueId() == null || source.snapshotJson() == null || source.checksum() == null) {
            throw new SearchProjectionException("published search source is not yet complete", true);
        }

        JsonNode snapshot;
        try {
            snapshot = objectMapper.readTree(source.snapshotJson());
        } catch (JacksonException exception) {
            throw new SearchProjectionException("published search snapshot is invalid", exception, false);
        }
        String title = requiredText(snapshot, "title");
        String dek = optionalText(snapshot, "dek");
        String bodyText = optionalText(snapshot, "plainText");
        if (bodyText.isBlank()) {
            JsonNode content = snapshot.get("content");
            try {
                bodyText = extractor.extract(content).plainText();
            } catch (RuntimeException exception) {
                throw new SearchProjectionException(
                        "published search content cannot be extracted",
                        exception,
                        false
                );
            }
        }
        String normalized = SearchTextNormalizer.normalize(title + " " + dek + " " + bodyText);
        if (normalized.isBlank()) {
            throw new SearchProjectionException("published search source has no searchable text", false);
        }
        jdbcTemplate.update("""
                INSERT INTO search_document (
                    article_id, revision_id, issue_id, slug, title, dek, body_text,
                    normalized_text, source_checksum_sha256, published_at, active, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?)
                ON CONFLICT (article_id, revision_id) DO UPDATE SET
                    issue_id = EXCLUDED.issue_id,
                    slug = EXCLUDED.slug,
                    title = EXCLUDED.title,
                    dek = EXCLUDED.dek,
                    body_text = EXCLUDED.body_text,
                    normalized_text = EXCLUDED.normalized_text,
                    source_checksum_sha256 = EXCLUDED.source_checksum_sha256,
                    published_at = EXCLUDED.published_at,
                    active = true,
                    indexed_at = EXCLUDED.indexed_at,
                    version = search_document.version + 1
                WHERE search_document.issue_id <> EXCLUDED.issue_id
                   OR search_document.slug <> EXCLUDED.slug
                   OR search_document.source_checksum_sha256 <> EXCLUDED.source_checksum_sha256
                   OR NOT search_document.active
                """,
                articleId,
                revisionId,
                source.issueId(),
                source.slug(),
                title,
                dek,
                bodyText,
                normalized,
                source.checksum(),
                Timestamp.from(source.publishedAt()),
                Timestamp.from(indexedAt)
        );
    }

    @Override
    public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
        Objects.requireNonNull(articleId, "articleId");
        Objects.requireNonNull(revisionId, "revisionId");
        Objects.requireNonNull(indexedAt, "indexedAt");
        List<String> states = jdbcTemplate.query(
                "SELECT state FROM article WHERE id = ? AND published_revision_id = ?",
                (resultSet, rowNumber) -> resultSet.getString("state"),
                articleId,
                revisionId
        );
        if (states.isEmpty()) {
            throw new SearchProjectionException("withdrawn search source is missing", false);
        }
        if (!List.of("WITHDRAWN", "ARCHIVED").contains(states.getFirst())) {
            throw new SearchProjectionException("search withdrawal rejects an active source", false);
        }
        jdbcTemplate.update("""
                UPDATE search_document
                SET active = false, indexed_at = ?, version = version + 1
                WHERE article_id = ? AND revision_id = ? AND active
                """, Timestamp.from(indexedAt), articleId, revisionId);
    }

    private ProjectionSource source(UUID articleId) {
        List<ProjectionSource> rows = jdbcTemplate.query("""
                SELECT a.state, a.published_revision_id, a.slug, a.published_at,
                       issue_link.issue_id, snapshot.content_document::text AS snapshot_json,
                       snapshot.checksum_sha256
                FROM article a
                LEFT JOIN LATERAL (
                    SELECT ia.issue_id
                    FROM issue_article ia
                    JOIN publication_issue pi ON pi.id = ia.issue_id
                    WHERE ia.article_id = a.id
                      AND pi.state = 'PUBLISHED'
                    ORDER BY pi.published_at DESC, pi.id DESC
                    LIMIT 1
                ) issue_link ON true
                LEFT JOIN LATERAL (
                    SELECT ps.content_document, ps.checksum_sha256
                    FROM publication_snapshot ps
                    WHERE ps.aggregate_type = 'ARTICLE'
                      AND ps.aggregate_id = a.id
                      AND ps.revision_id = a.published_revision_id
                    ORDER BY ps.snapshot_version DESC, ps.id DESC
                    LIMIT 1
                ) snapshot ON true
                WHERE a.id = ?
                """, (resultSet, rowNumber) -> mapSource(resultSet), articleId);
        if (rows.isEmpty()) {
            throw new SearchProjectionException("search projection article is missing", false);
        }
        return rows.getFirst();
    }

    private static ProjectionSource mapSource(ResultSet resultSet) throws SQLException {
        Timestamp publishedAt = resultSet.getTimestamp("published_at");
        return new ProjectionSource(
                resultSet.getString("state"),
                resultSet.getObject("published_revision_id", UUID.class),
                resultSet.getString("slug"),
                publishedAt == null ? null : publishedAt.toInstant(),
                resultSet.getObject("issue_id", UUID.class),
                resultSet.getString("snapshot_json"),
                resultSet.getString("checksum_sha256")
        );
    }

    private static String requiredText(JsonNode node, String field) {
        String value = optionalText(node, field);
        if (value.isBlank()) {
            throw new SearchProjectionException("published search snapshot is missing " + field, false);
        }
        return value;
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || !value.isString() ? "" : value.asString();
    }

    private record ProjectionSource(
            String articleState,
            UUID publishedRevisionId,
            String slug,
            Instant publishedAt,
            UUID issueId,
            String snapshotJson,
            String checksum
    ) {
        private ProjectionSource {
            if (publishedAt == null && "PUBLISHED".equals(articleState)) {
                throw new SearchProjectionException("published search source has no timestamp", false);
            }
        }
    }
}
