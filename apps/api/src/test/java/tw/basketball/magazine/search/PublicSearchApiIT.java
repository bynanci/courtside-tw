package tw.basketball.magazine.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.search.application.SearchTextNormalizer;

/**
 * Tests-first contract for the public search projection.
 *
 * <p>T057 intentionally starts red until the search projection and public
 * endpoint are implemented. The fixture keeps published, alias and withdrawn
 * records in one issue so result visibility and freshness remain attributable
 * to the search contract.</p>
 */
final class PublicSearchApiIT extends PublicIssueApiIntegrationTestSupport {
    @Test
    void taxonomyAndSearchSchemaProvidesVersionedAliasesAndTrigramIndexes() {
        assertEquals(
                "taxonomy_term",
                jdbcTemplate.queryForObject(
                        "SELECT to_regclass('public.taxonomy_term')::text",
                        String.class
                )
        );
        assertEquals(
                "search_document",
                jdbcTemplate.queryForObject(
                        "SELECT to_regclass('public.search_document')::text",
                        String.class
                )
        );
        assertEquals(
                1,
                jdbcTemplate.queryForObject(
                        """
                        SELECT count(*)
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                          AND indexname = 'search_document_normalized_text_trgm_idx'
                        """,
                        Integer.class
                )
        );
    }

    @Test
    void emptyAndPunctuationOnlyQueriesReturnStableEmptyContract() throws Exception {
        for (String query : List.of("", "!?、，。")) {
            mockMvc.perform(get("/api/v1/public/search")
                            .param("q", query)
                            .param("limit", "20"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.query.raw").value(query))
                    .andExpect(jsonPath("$.query.normalized").value(""))
                    .andExpect(jsonPath("$.items").isEmpty())
                    .andExpect(jsonPath("$.page.limit").value(20))
                    .andExpect(jsonPath("$.page.nextCursor").value(Matchers.nullValue()));
        }
    }

    @Test
    void unsupportedIssueSearchTypeFailsClosedInsteadOfReturningAFalseEmptyResult()
            throws Exception {
        mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "台籃")
                        .param("type", "issue"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].code").value("invalid_search_type"));
    }

    @Test
    void mixedLanguageAndAliasSearchUsesPublishedProjectionAndExcludesWithdrawnResults()
            throws Exception {
        IssueFixture issue = createIssue(
                "search-contract",
                21,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Mixed", 1, "search-mixed", 1, "PUBLISHED");
        addArticle(issue, "Alias", 2, "search-alias", 1, "PUBLISHED");
        addArticle(issue, "Withdrawn", 3, "search-withdrawn", 1, "WITHDRAWN");
        enrichSearchProjection("search-mixed", "台籃 Courtside", "Taiwan basketball notes");
        enrichSearchProjection("search-alias", "台灣職籃", "聯盟球季指南");
        attachAlias("search-alias", "league-sbl", "SBL");
        enrichSearchProjection("search-withdrawn", "撤回 Courtside", "must not be searchable");

        mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "台籃 Courtside"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].slug").value("search-mixed"))
                .andExpect(jsonPath("$.items[0].title").value("台籃 Courtside"))
                .andExpect(jsonPath("$.items[0].issueSlug").value(issue.slug()));

        mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "SBL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].slug").value("search-alias"))
                .andExpect(jsonPath("$.items[0].title").value("台灣職籃"));

        mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "撤回"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void taxonomyOnlyQueryFiltersPublishedProjectionWithoutTextQuery() throws Exception {
        IssueFixture issue = createIssue(
                "taxonomy-only-search",
                23,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Taxonomy only", 1, "taxonomy-only-article", 1, "PUBLISHED");
        enrichSearchProjection("taxonomy-only-article", "台籃分類", "taxonomy filter fixture");
        attachAlias("taxonomy-only-article", "league-plg", "PLG");

        mockMvc.perform(get("/api/v1/public/search")
                        .param("taxonomy", "league-plg"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query.raw").value(""))
                .andExpect(jsonPath("$.query.normalized").value(""))
                .andExpect(jsonPath("$.query.taxonomy[0]").value("league-plg"))
                .andExpect(jsonPath("$.items").value(Matchers.hasSize(1)))
                .andExpect(jsonPath("$.items[0].slug").value("taxonomy-only-article"));
    }

    @Test
    void publishedProjectionChangesHaveFreshEtagAndSixtySecondPublicCache() throws Exception {
        IssueFixture issue = createIssue(
                "search-freshness",
                22,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Before", 1, "search-before", 1, "PUBLISHED");
        enrichSearchProjection("search-before", "台籃 開幕", "before projection");

        MvcResult before = mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "台籃"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL,
                        Matchers.allOf(
                                Matchers.containsString("public"),
                                Matchers.containsString("max-age=60"),
                                Matchers.containsString("must-revalidate")
                        )
                ))
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andExpect(jsonPath("$.items[0].slug").value("search-before"))
                .andReturn();
        String beforeEtag = before.getResponse().getHeader(HttpHeaders.ETAG);
        assertNotNull(beforeEtag);

        addArticle(issue, "After", 2, "search-after", 1, "PUBLISHED");
        enrichSearchProjection("search-after", "台籃 季後", "fresh projection");

        MvcResult after = mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "台籃"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL,
                        Matchers.allOf(
                                Matchers.containsString("public"),
                                Matchers.containsString("max-age=60"),
                                Matchers.containsString("must-revalidate")
                        )
                ))
                .andExpect(jsonPath("$.items").value(Matchers.hasSize(2)))
                .andReturn();
        String afterEtag = after.getResponse().getHeader(HttpHeaders.ETAG);
        assertNotEquals(beforeEtag, afterEtag);

        mockMvc.perform(get("/api/v1/public/search")
                        .param("q", "台籃")
                        .header(HttpHeaders.IF_NONE_MATCH, afterEtag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL,
                        Matchers.allOf(
                                Matchers.containsString("public"),
                                Matchers.containsString("max-age=60"),
                                Matchers.containsString("must-revalidate")
                        )
                ))
                .andExpect(content().string(""));
    }

    private void enrichSearchProjection(String slug, String title, String dek) {
        UUID articleId = jdbcTemplate.queryForObject(
                "SELECT id FROM article WHERE slug = ?",
                UUID.class,
                slug
        );
        jdbcTemplate.update(
                "UPDATE article_revision SET title = ?, dek = ? WHERE article_id = ?",
                title,
                dek,
                articleId
        );
        jdbcTemplate.update(
                """
                INSERT INTO publication_snapshot (
                    aggregate_type, aggregate_id, revision_id, snapshot_version,
                    content_document, checksum_sha256, created_by
                )
                SELECT aggregate_type, aggregate_id, revision_id, snapshot_version + 1,
                       jsonb_set(
                           jsonb_set(content_document, '{title}', to_jsonb(?::text)),
                           '{dek}', to_jsonb(?::text)
                       ), ?, 'search-fixture'
                FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ?
                ORDER BY snapshot_version DESC, id DESC
                LIMIT 1
                """,
                title,
                dek,
                "b".repeat(64),
                articleId
        );
        jdbcTemplate.update(
                """
                INSERT INTO search_document (
                    article_id, revision_id, issue_id, slug, title, dek, body_text,
                    normalized_text, source_checksum_sha256, published_at, active
                )
                SELECT article.id, revision.id, issue_article.issue_id, article.slug,
                       revision.title, revision.dek, 'Fixture article ' || article.slug,
                       ?, snapshot.checksum_sha256, article.published_at, true
                FROM article
                JOIN article_revision revision ON revision.id = article.published_revision_id
                JOIN issue_article ON issue_article.article_id = article.id
                JOIN LATERAL (
                    SELECT checksum_sha256
                    FROM publication_snapshot
                    WHERE aggregate_type = 'ARTICLE' AND aggregate_id = article.id
                    ORDER BY snapshot_version DESC, id DESC
                    LIMIT 1
                ) snapshot ON true
                WHERE article.id = ?
                """,
                SearchTextNormalizer.normalize(title + " " + dek + " Fixture article " + slug),
                articleId
        );
    }

    private void attachAlias(String slug, String termKey, String alias) {
        UUID revisionId = jdbcTemplate.queryForObject(
                """
                SELECT article.published_revision_id
                FROM article
                WHERE article.slug = ?
                """,
                UUID.class,
                slug
        );
        UUID termId = jdbcTemplate.queryForObject(
                """
                INSERT INTO taxonomy_term (term_key, kind, display_name)
                VALUES (?, 'LEAGUE', '台灣職籃聯盟')
                RETURNING id
                """,
                UUID.class,
                termKey
        );
        jdbcTemplate.update(
                """
                INSERT INTO taxonomy_alias (term_id, alias, normalized_alias)
                VALUES (?, ?, ?)
                """,
                termId,
                alias,
                SearchTextNormalizer.normalize(alias)
        );
        jdbcTemplate.update(
                """
                INSERT INTO article_taxonomy (article_revision_id, term_id, relevance)
                VALUES (?, ?, 'PRIMARY')
                """,
                revisionId,
                termId
        );
    }
}
