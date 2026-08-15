package tw.basketball.magazine.search.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.search.application.SearchService;

final class SearchProjectionHandlerIT extends PublicIssueApiIntegrationTestSupport {
    @Test
    void publishedSnapshotIsProjectedWithChecksumAndDuplicateDeliveryIsIdempotent() {
        IssueFixture issue = createIssue(
                "projection-issue",
                31,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Projection", 1, "projection-article", 1, "PUBLISHED");
        UUID articleId = articleId("projection-article");
        UUID revisionId = revisionId(articleId);

        handler().project(articleId, revisionId, Instant.parse("2026-08-10T00:00:00Z"));
        handler().project(articleId, revisionId, Instant.parse("2026-08-10T00:01:00Z"));

        assertEquals("a".repeat(64), jdbcTemplate.queryForObject(
                "SELECT source_checksum_sha256 FROM search_document WHERE article_id = ?",
                String.class,
                articleId
        ));
        assertEquals(0L, jdbcTemplate.queryForObject(
                "SELECT version FROM search_document WHERE article_id = ?",
                Long.class,
                articleId
        ));
        assertEquals(Boolean.TRUE, jdbcTemplate.queryForObject(
                "SELECT active FROM search_document WHERE article_id = ?",
                Boolean.class,
                articleId
        ));

    }

    @Test
    void publishedArticleCanBeProjectedBeforeItsLinkedIssueIsPublished() {
        IssueFixture issue = createIssue(
                "draft-issue-projection",
                34,
                Instant.parse("2026-08-08T00:00:00Z"),
                "DRAFT",
                true
        );
        addArticle(issue, "Pre-publication", 1, "pre-publication-projection", 1, "PUBLISHED");
        UUID articleId = articleId("pre-publication-projection");
        UUID revisionId = revisionId(articleId);

        handler().project(articleId, revisionId, Instant.parse("2026-08-10T00:00:00Z"));

        assertEquals(issue.id(), jdbcTemplate.queryForObject(
                "SELECT issue_id FROM search_document WHERE article_id = ?",
                UUID.class,
                articleId
        ));
        assertEquals(Boolean.TRUE, jdbcTemplate.queryForObject(
                "SELECT active FROM search_document WHERE article_id = ?",
                Boolean.class,
                articleId
        ));

        SearchService search = new SearchService(jdbcTemplate);
        assertEquals(0, search.search(
                "pre publication",
                null,
                "20",
                "article",
                List.of()
        ).items().size());

        jdbcTemplate.update(
                "UPDATE publication_issue SET state = 'PUBLISHED' WHERE id = ?",
                issue.id()
        );

        assertEquals(1, search.search(
                "pre publication",
                null,
                "20",
                "article",
                List.of()
        ).items().size());
    }

    @Test
    void draftSourceIsRejectedPermanently() {
        IssueFixture issue = createIssue(
                "draft-projection-issue",
                32,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Draft", 1, "draft-projection", 1, "DRAFT");
        UUID articleId = articleId("draft-projection");

        SearchProjectionException failure = assertThrows(
                SearchProjectionException.class,
                () -> handler().project(
                        articleId,
                        revisionId(articleId),
                        Instant.parse("2026-08-10T00:00:00Z")
                )
        );

        assertFalse(failure.retryable());
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM search_document WHERE article_id = ?",
                Integer.class,
                articleId
        ));
    }

    @Test
    void withdrawalDeactivatesProjectionOnce() {
        IssueFixture issue = createIssue(
                "withdraw-projection-issue",
                33,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Withdraw", 1, "withdraw-projection", 1, "PUBLISHED");
        UUID articleId = articleId("withdraw-projection");
        UUID revisionId = revisionId(articleId);
        handler().project(articleId, revisionId, Instant.parse("2026-08-10T00:00:00Z"));
        jdbcTemplate.update(
                "UPDATE article SET state = 'WITHDRAWN' WHERE id = ?",
                articleId
        );
        jdbcTemplate.update(
                "UPDATE article_revision SET state = 'WITHDRAWN' WHERE id = ?",
                revisionId
        );

        handler().withdraw(articleId, revisionId, Instant.parse("2026-08-10T00:01:00Z"));
        handler().withdraw(articleId, revisionId, Instant.parse("2026-08-10T00:02:00Z"));

        assertEquals(Boolean.FALSE, jdbcTemplate.queryForObject(
                "SELECT active FROM search_document WHERE article_id = ?",
                Boolean.class,
                articleId
        ));
        assertEquals(1L, jdbcTemplate.queryForObject(
                "SELECT version FROM search_document WHERE article_id = ?",
                Long.class,
                articleId
        ));
    }

    private UUID articleId(String slug) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM article WHERE slug = ?",
                UUID.class,
                slug
        );
    }

    private SearchProjectionHandler handler() {
        return new SearchProjectionHandler(jdbcTemplate, new ObjectMapper());
    }

    private UUID revisionId(UUID articleId) {
        return jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?",
                UUID.class,
                articleId
        );
    }
}
