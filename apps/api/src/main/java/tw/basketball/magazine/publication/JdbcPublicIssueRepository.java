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

    public JdbcPublicIssueRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public Page list(PublicIssueCursor cursor, int limit, Instant now) {
        Objects.requireNonNull(now, "now");
        String cursorPredicate = cursor == null ? "" : "AND (pi.published_at, pi.id) < (?, ?)";
        List<Object> parameters = new ArrayList<>();
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        parameters.add(Timestamp.from(now));
        if (cursor != null) {
            parameters.add(Timestamp.from(cursor.publishedAt()));
            parameters.add(cursor.issueId());
        }
        parameters.add(limit + 1);

        List<IssueSummary> rows = jdbcTemplate.query("""
                SELECT pi.id, pi.issue_number, pi.slug, pi.title, pi.summary, pi.published_at,
                       mv.public_storage_key, ma.alt_text, mv.width, mv.height,
                       count(ar.id) AS article_count
                FROM publication_issue pi
                JOIN media_asset ma ON ma.id = pi.cover_asset_id
                JOIN media_variant mv ON mv.asset_id = ma.id
                LEFT JOIN issue_article ia ON ia.issue_id = pi.id
                LEFT JOIN article a ON a.id = ia.article_id
                    AND a.state = 'PUBLISHED'
                    AND a.published_at <= ?
                    AND a.published_revision_id IS NOT NULL
                LEFT JOIN article_revision ar ON ar.id = a.published_revision_id
                    AND ar.article_id = a.id
                    AND ar.state = 'PUBLISHED'
                WHERE """ + PUBLIC_ISSUE_PREDICATE + cursorPredicate + """
                GROUP BY pi.id, pi.issue_number, pi.slug, pi.title, pi.summary, pi.published_at,
                         mv.public_storage_key, ma.alt_text, mv.width, mv.height
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
                SELECT pi.id, pi.issue_number, pi.slug, pi.title, pi.summary, pi.published_at,
                       mv.public_storage_key, ma.alt_text, mv.width, mv.height
                FROM publication_issue pi
                JOIN media_asset ma ON ma.id = pi.cover_asset_id
                JOIN media_variant mv ON mv.asset_id = ma.id
                WHERE pi.slug = ?
                  AND """ + PUBLIC_ISSUE_PREDICATE + """
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
        List<TocRow> rows = jdbcTemplate.query("""
                SELECT section.id AS section_id, section.title AS section_title,
                       section.position AS section_position,
                       article.id AS article_id, article.slug AS article_slug,
                       revision.title AS article_title,
                       issue_article.position AS article_position
                FROM issue_section section
                JOIN issue_article ON issue_article.section_id = section.id
                JOIN article ON article.id = issue_article.article_id
                JOIN article_revision revision ON revision.id = article.published_revision_id
                    AND revision.article_id = article.id
                WHERE section.issue_id = ?
                  AND article.state = 'PUBLISHED'
                  AND article.published_at <= ?
                  AND article.published_revision_id IS NOT NULL
                  AND revision.state = 'PUBLISHED'
                ORDER BY section.position ASC, section.id ASC,
                         issue_article.position ASC, issue_article.id ASC
                LIMIT ?
                """, (resultSet, rowNumber) -> mapTocRow(resultSet),
                header.issueId(),
                Timestamp.from(now),
                MAXIMUM_TOC_ROWS + 1);
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

    private static IssueSummary mapIssueSummary(ResultSet resultSet) throws SQLException {
        return new IssueSummary(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("slug"),
                resultSet.getInt("issue_number"),
                resultSet.getString("title"),
                resultSet.getString("summary"),
                cover(resultSet),
                resultSet.getTimestamp("published_at").toInstant(),
                resultSet.getInt("article_count")
        );
    }

    private static IssueHeader mapIssueHeader(ResultSet resultSet) throws SQLException {
        return new IssueHeader(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("slug"),
                resultSet.getInt("issue_number"),
                resultSet.getString("title"),
                resultSet.getString("summary"),
                cover(resultSet),
                resultSet.getTimestamp("published_at").toInstant()
        );
    }

    private static TocRow mapTocRow(ResultSet resultSet) throws SQLException {
        return new TocRow(
                resultSet.getObject("section_id", UUID.class),
                resultSet.getString("section_title"),
                resultSet.getInt("section_position"),
                resultSet.getObject("article_id", UUID.class),
                resultSet.getString("article_slug"),
                resultSet.getString("article_title"),
                resultSet.getInt("article_position")
        );
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
            Instant publishedAt
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
