package tw.basketball.magazine.content.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.content.application.PublishedArticleRepository;
import tw.basketball.magazine.content.application.PublishedArticleSource;
import tw.basketball.magazine.content.domain.ContentDocument;
import tw.basketball.magazine.content.domain.ContributorCredit;
import tw.basketball.magazine.content.domain.ContributorCredit.Role;
import tw.basketball.magazine.content.domain.PublishedArticleRevision;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;

/** JDBC read model that selects the revision pinned by the latest published Issue snapshot. */
public final class JdbcPublishedArticleRepository implements PublishedArticleRepository {
    private static final String ARTICLE_SQL = """
            SELECT article.id AS article_id,
                   revision.id AS revision_id,
                   revision.revision_number,
                   article_item.article_document->>'slug' AS slug,
                   article_item.article_document->>'title' AS title,
                   COALESCE(article_item.article_document->>'dek', revision.dek) AS dek,
                   article_snapshot.content_document,
                   issue.id AS issue_id,
                   issue_snapshot.content_document->>'slug' AS issue_slug,
                   publication_dates.published_at,
                   article_snapshot.created_at AS updated_at
            FROM publication_issue issue
            JOIN LATERAL (
                SELECT frozen.content_document
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ISSUE'
                  AND frozen.aggregate_id = issue.id
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) issue_snapshot ON TRUE
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
                SELECT frozen.content_document,
                       frozen.created_at
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ARTICLE'
                  AND frozen.aggregate_id = article.id
                  AND frozen.revision_id = revision.id
                ORDER BY frozen.snapshot_version DESC, frozen.id DESC
                LIMIT 1
            ) article_snapshot ON TRUE
            JOIN LATERAL (
                SELECT MIN(frozen.created_at) AS published_at
                FROM publication_snapshot frozen
                WHERE frozen.aggregate_type = 'ARTICLE'
                  AND frozen.aggregate_id = article.id
            ) publication_dates ON publication_dates.published_at IS NOT NULL
            WHERE article_item.article_document->>'slug' = ?
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
    private final ContentDocumentValidator contentDocumentValidator;

    public JdbcPublishedArticleRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ContentDocumentValidator());
    }

    public JdbcPublishedArticleRepository(
            JdbcTemplate jdbcTemplate,
            ContentDocumentValidator contentDocumentValidator
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.contentDocumentValidator = Objects.requireNonNull(
                contentDocumentValidator,
                "contentDocumentValidator"
        );
    }

    @Override
    public Optional<PublishedArticleSource> findBySlug(String articleSlug, Instant now) {
        Objects.requireNonNull(articleSlug, "articleSlug");
        Objects.requireNonNull(now, "now");
        List<PublishedRow> rows;
        try {
            rows = jdbcTemplate.query(
                    ARTICLE_SQL,
                    (resultSet, rowNumber) -> mapArticle(resultSet),
                    articleSlug,
                    Timestamp.from(now),
                    Timestamp.from(now)
            );
        } catch (InvalidPublishedRevisionException exception) {
            return Optional.empty();
        }
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        PublishedRow row = rows.getFirst();
        List<ContributorCredit> credits;
        try {
            credits = findContributorCredits(row.revisionId());
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
        PublishedArticleRevision revision = new PublishedArticleRevision(
                row.revisionId(),
                row.articleId(),
                row.revisionNumber(),
                row.title(),
                row.dek(),
                row.content(),
                credits
        );
        return Optional.of(new PublishedArticleSource(
                row.slug(),
                row.issueId(),
                row.issueSlug(),
                row.publishedAt(),
                row.updatedAt(),
                revision
        ));
    }

    private PublishedRow mapArticle(ResultSet resultSet) throws SQLException {
        try {
            ContentDocument content = ContentDocument.fromJson(resultSet.getString("content_document"));
            if (!contentDocumentValidator.validate(content.toJsonNode()).valid()) {
                throw new InvalidPublishedRevisionException(
                        "published ContentDocument failed canonical validation"
                );
            }
            return new PublishedRow(
                    resultSet.getObject("article_id", UUID.class),
                    resultSet.getObject("revision_id", UUID.class),
                    resultSet.getInt("revision_number"),
                    resultSet.getString("slug"),
                    resultSet.getString("title"),
                    resultSet.getString("dek"),
                    content,
                    resultSet.getObject("issue_id", UUID.class),
                    resultSet.getString("issue_slug"),
                    resultSet.getTimestamp("published_at").toInstant(),
                    resultSet.getTimestamp("updated_at").toInstant()
            );
        } catch (InvalidPublishedRevisionException exception) {
            throw exception;
        } catch (IllegalArgumentException exception) {
            throw new InvalidPublishedRevisionException("published Article revision is invalid", exception);
        }
    }

    private List<ContributorCredit> findContributorCredits(UUID revisionId) {
        return jdbcTemplate.query(
                CONTRIBUTOR_SQL,
                (resultSet, rowNumber) -> new ContributorCredit(
                        resultSet.getObject("contributor_id", UUID.class),
                        resultSet.getString("slug"),
                        resultSet.getString("display_name"),
                        Role.valueOf(resultSet.getString("role"))
                ),
                revisionId
        );
    }

    private record PublishedRow(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            ContentDocument content,
            UUID issueId,
            String issueSlug,
            Instant publishedAt,
            Instant updatedAt
    ) {
    }

    private static final class InvalidPublishedRevisionException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private InvalidPublishedRevisionException(String message) {
            super(message);
        }

        private InvalidPublishedRevisionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
