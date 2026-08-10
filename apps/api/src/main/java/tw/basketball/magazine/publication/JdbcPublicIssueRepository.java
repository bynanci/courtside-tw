package tw.basketball.magazine.publication;

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
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;
import tw.basketball.magazine.publication.PublicIssueModels.IssueCover;
import tw.basketball.magazine.publication.PublicIssueModels.IssueDetail;
import tw.basketball.magazine.publication.PublicIssueModels.IssueSection;
import tw.basketball.magazine.publication.PublicIssueModels.IssueSummary;
import tw.basketball.magazine.publication.PublicIssueModels.Page;
import tw.basketball.magazine.publication.PublicIssueModels.PageMeta;

/**
 * Read-only JDBC projection for anonymous Issue browsing.
 *
 * <p>Every public predicate is part of the SQL boundary, so a future
 * controller refactor cannot accidentally expose draft or rights-invalid rows.
 * The TOC query has a hard safety cap; an oversized publication fails closed
 * until a future paginated TOC contract is introduced.</p>
 */
public final class JdbcPublicIssueRepository implements PublicIssueRepository {
    private static final int MAXIMUM_TOC_ROWS = 500;
    private static final String PUBLIC_ISSUE_PREDICATE = """
            pi.state = 'PUBLISHED'
            AND pi.published_at <= ?
            AND ma.processing_state = 'READY'
            AND btrim(ma.alt_text) <> ''
            AND mv.variant = 'cover'
            AND mv.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
            AND position('..' IN mv.public_storage_key) = 0
            AND position('//' IN mv.public_storage_key) = 0
            AND position('/./' IN mv.public_storage_key) = 0
            AND right(mv.public_storage_key, 1) <> '/'
            AND EXISTS (
                SELECT 1
                FROM rights_record rr
                WHERE rr.asset_id = pi.cover_asset_id
                  AND rr.status = 'VALID'
                  AND rr.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                  AND rr.valid_from <= ?
                  AND rr.valid_until > ?
            )
            """;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcPublicIssueRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper());
    }

    public JdbcPublicIssueRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public Page list(PublicIssueCursor cursor, int limit, Instant now) {
        Objects.requireNonNull(now, "now");
        String cursorPredicate = cursor == null ? "" : "AND (pi.published_at, pi.id) < (?, ?)";
        List<Object> parameters = new ArrayList<>();
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        if (cursor != null) {
            parameters.add(Timestamp.from(cursor.publishedAt()));
            parameters.add(cursor.issueId());
        }
        parameters.add(limit + 1);

        List<IssueSummary> rows = jdbcTemplate.query("""
                SELECT pi.id, pi.published_at, snapshot.content_document AS snapshot_document,
                       mv.public_storage_key, ma.alt_text, mv.width, mv.height
                FROM publication_issue pi
                JOIN LATERAL (
                    SELECT frozen.content_document
                    FROM publication_snapshot frozen
                    WHERE frozen.aggregate_type = 'ISSUE'
                      AND frozen.aggregate_id = pi.id
                      AND frozen.revision_id IS NULL
                    ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                    LIMIT 1
                ) snapshot ON snapshot.content_document->>'coverAssetId' = pi.cover_asset_id::text
                JOIN media_asset ma ON ma.id = pi.cover_asset_id
                JOIN media_variant mv ON mv.asset_id = ma.id
                WHERE
                """ + PUBLIC_ISSUE_PREDICATE + cursorPredicate + """
                ORDER BY pi.published_at DESC, pi.id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> mapIssueSummary(resultSet), parameters.toArray());

        boolean hasNext = rows.size() > limit;
        List<IssueSummary> items = hasNext ? List.copyOf(rows.subList(0, limit)) : List.copyOf(rows);
        String nextCursor = hasNext
                ? new PublicIssueCursor(
                        items.getLast().publishedAt(),
                        items.getLast().issueId()
                ).encode()
                : null;
        return new Page(items, new PageMeta(nextCursor, limit));
    }

    @Override
    public Optional<IssueDetail> findBySlug(String issueSlug, Instant now) {
        Objects.requireNonNull(issueSlug, "issueSlug");
        Objects.requireNonNull(now, "now");
        List<IssueHeader> headers = jdbcTemplate.query("""
                SELECT pi.id, pi.published_at, snapshot.content_document AS snapshot_document,
                       mv.public_storage_key, ma.alt_text, mv.width, mv.height
                FROM publication_issue pi
                JOIN LATERAL (
                    SELECT frozen.content_document
                    FROM publication_snapshot frozen
                    WHERE frozen.aggregate_type = 'ISSUE'
                      AND frozen.aggregate_id = pi.id
                      AND frozen.revision_id IS NULL
                    ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                    LIMIT 1
                ) snapshot ON snapshot.content_document->>'coverAssetId' = pi.cover_asset_id::text
                JOIN media_asset ma ON ma.id = pi.cover_asset_id
                JOIN media_variant mv ON mv.asset_id = ma.id
                WHERE pi.slug = ?
                  AND
                """ + PUBLIC_ISSUE_PREDICATE + """
                LIMIT 1
                """, (resultSet, rowNumber) -> mapIssueHeader(resultSet),
                issueSlug,
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now));
        if (headers.isEmpty()) {
            return Optional.empty();
        }

        IssueHeader header = headers.getFirst();
        List<TocRow> rows = snapshotRows(header.snapshot());
        if (rows.size() > MAXIMUM_TOC_ROWS) {
            return Optional.empty();
        }

        Map<UUID, SectionAccumulator> sections = new LinkedHashMap<>();
        for (TocRow row : rows) {
            sections.computeIfAbsent(
                    row.sectionId(),
                    ignored -> new SectionAccumulator(row.sectionTitle(), row.sectionPosition())
            ).add(new ArticleSummary(row.articleId(), row.articleSlug(), row.articleTitle(), row.articlePosition()));
        }
        List<IssueSection> orderedSections = new ArrayList<>();
        for (SectionAccumulator section : sections.values()) {
            orderedSections.add(section.toProjection());
        }
        return Optional.of(new IssueDetail(
                header.issueId(),
                header.slug(),
                header.issueNumber(),
                header.title(),
                header.summary(),
                header.cover(),
                header.publishedAt(),
                orderedSections
        ));
    }

    private IssueSummary mapIssueSummary(ResultSet resultSet) throws SQLException {
        JsonNode snapshot = snapshot(resultSet);
        return new IssueSummary(
                resultSet.getObject("id", UUID.class),
                requiredText(snapshot, "slug"),
                requiredInt(snapshot, "issueNumber"),
                requiredText(snapshot, "title"),
                requiredText(snapshot, "summary"),
                cover(resultSet),
                resultSet.getTimestamp("published_at").toInstant(),
                snapshotRows(snapshot).size()
        );
    }

    private IssueHeader mapIssueHeader(ResultSet resultSet) throws SQLException {
        JsonNode snapshot = snapshot(resultSet);
        return new IssueHeader(
                resultSet.getObject("id", UUID.class),
                requiredText(snapshot, "slug"),
                requiredInt(snapshot, "issueNumber"),
                requiredText(snapshot, "title"),
                requiredText(snapshot, "summary"),
                cover(resultSet),
                resultSet.getTimestamp("published_at").toInstant(),
                snapshot
        );
    }

    private JsonNode snapshot(ResultSet resultSet) throws SQLException {
        try {
            return objectMapper.readTree(resultSet.getString("snapshot_document"));
        } catch (JacksonException exception) {
            throw new SQLException("public issue snapshot is invalid", exception);
        }
    }

    private List<TocRow> snapshotRows(JsonNode snapshot) {
        List<TocRow> rows = new ArrayList<>();
        JsonNode sections = snapshot == null ? null : snapshot.get("sections");
        if (sections == null || !sections.isArray()) {
            return rows;
        }
        for (JsonNode section : sections) {
            if (section == null || !section.isObject()) {
                continue;
            }
            UUID sectionId = UUID.fromString(requiredText(section, "sectionId"));
            String sectionTitle = requiredText(section, "title");
            int sectionPosition = requiredInt(section, "position");
            JsonNode articles = section.get("articles");
            if (articles == null || !articles.isArray()) {
                continue;
            }
            for (JsonNode article : articles) {
                if (article == null || !article.isObject()) {
                    continue;
                }
                rows.add(new TocRow(
                        sectionId,
                        sectionTitle,
                        sectionPosition,
                        UUID.fromString(requiredText(article, "articleId")),
                        requiredText(article, "slug"),
                        requiredText(article, "title"),
                        requiredInt(article, "position")
                ));
            }
        }
        return rows;
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalStateException("public issue snapshot is missing " + field);
        }
        return value.asString();
    }

    private static int requiredInt(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isNumber()) {
            throw new IllegalStateException("public issue snapshot is missing " + field);
        }
        return value.asInt();
    }

    private static IssueCover cover(ResultSet resultSet) throws SQLException {
        String storageKey = resultSet.getString("public_storage_key");
        if (storageKey == null || storageKey.contains("..") || storageKey.contains("//")
                || storageKey.contains("/./") || storageKey.startsWith("/") || storageKey.endsWith("/")) {
            throw new IllegalStateException("public cover storage key failed the projection safety contract");
        }
        return new IssueCover(
                "/media/" + storageKey,
                resultSet.getString("alt_text"),
                resultSet.getInt("width"),
                resultSet.getInt("height")
        );
    }

    private record IssueHeader(
            UUID issueId,
            String slug,
            int issueNumber,
            String title,
            String summary,
            IssueCover cover,
            Instant publishedAt,
            JsonNode snapshot
    ) {
    }

    private record TocRow(
            UUID sectionId,
            String sectionTitle,
            int sectionPosition,
            UUID articleId,
            String articleSlug,
            String articleTitle,
            int articlePosition
    ) {
    }

    private static final class SectionAccumulator {
        private final String title;
        private final int position;
        private final List<ArticleSummary> articles = new ArrayList<>();

        private SectionAccumulator(String title, int position) {
            this.title = title;
            this.position = position;
        }

        private void add(ArticleSummary article) {
            articles.add(article);
        }

        private IssueSection toProjection() {
            return new IssueSection(title, position, articles);
        }
    }
}
