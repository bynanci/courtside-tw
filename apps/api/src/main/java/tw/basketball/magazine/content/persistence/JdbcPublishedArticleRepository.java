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

/** JDBC read model that selects only an Article's current published revision pointer. */
public final class JdbcPublishedArticleRepository implements PublishedArticleRepository {
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
                    resultSet.getString("issue_slug")
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
            String issueSlug
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
