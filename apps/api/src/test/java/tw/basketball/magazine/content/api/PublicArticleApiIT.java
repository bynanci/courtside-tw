package tw.basketball.magazine.publication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Contract tests for the public Article projection.
 *
 * <p>The publication Testcontainers harness verifies published-only projection,
 * rights-filtered issue navigation, and fail-closed content validation.</p>
 */
final class PublicArticleApiIT extends PublicIssueApiIntegrationTestSupport {
    private static final String CHECKSUM = "b".repeat(64);

    @Test
    void returnsPublishedRevisionAndIssueNavigation() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-04",
                4,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "開場", 1, "opening-night", 1, "PUBLISHED");
        addArticle(issue, "場邊觀察", 2, "courtside-notes", 1, "PUBLISHED");
        replaceDocument("opening-night", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"公開文章正文。"}]}}
                ]}
                """);

        mockMvc.perform(get("/api/v1/public/articles/opening-night")
                        .header("X-Request-Id", "us2-published")
                        .header("If-None-Match", ""))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.slug").value("opening-night"))
                .andExpect(jsonPath("$.revisionNumber").value(1))
                .andExpect(jsonPath("$.plainText").value("公開文章正文。"))
                .andExpect(jsonPath("$.readingTimeMinutes").value(1))
                .andExpect(jsonPath("$.issueNavigation.issueSlug").value(issue.slug()))
                .andExpect(jsonPath("$.issueNavigation.next.slug").value("courtside-notes"))
                .andExpect(jsonPath("$.content.blocks[0].type").value("paragraph"));
    }

    @Test
    void returnsStableEtagHonorsIfNoneMatchAndIgnoresLiveRevisionDrift() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-11",
                11,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "快取", 1, "etag-article", 1, "PUBLISHED");

        MvcResult first = mockMvc.perform(get("/api/v1/public/articles/etag-article"))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andReturn();
        String etag = first.getResponse().getHeader(HttpHeaders.ETAG);
        assertNotNull(etag);

        mockMvc.perform(get("/api/v1/public/articles/etag-article")
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, etag))
                .andExpect(content().string(""));

        mutateLiveDocument("etag-article", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"Changed projection"}]}}
                ]}
                """);

        MvcResult unchanged = mockMvc.perform(get("/api/v1/public/articles/etag-article")
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, etag))
                .andReturn();
        assertEquals(etag, unchanged.getResponse().getHeader(HttpHeaders.ETAG));

        replaceDocument("etag-article", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"Changed projection"}]}}
                ]}
                """);
        MvcResult republished = mockMvc.perform(get("/api/v1/public/articles/etag-article")
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andReturn();
        assertNotEquals(etag, republished.getResponse().getHeader(HttpHeaders.ETAG));
    }

    @Test
    void returnsPublishedPointerWithRevisionScopedContributors() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-12",
                12,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        String articleSlug = "published-pointer";
        addArticle(issue, "版本", 1, articleSlug, 1, "PUBLISHED");
        addPublishedRevision(articleSlug);

        UUID revisionId = jdbcTemplate.queryForObject("""
                SELECT revision.id
                FROM article_revision revision
                JOIN article ON article.id = revision.article_id
                WHERE article.slug = ? AND revision.revision_number = 2
                """, UUID.class, articleSlug);
        UUID contributorId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO contributor (id, slug, display_name)
                VALUES (?, 'current-revision-author', 'Current revision author')
                """, contributorId);
        jdbcTemplate.update("""
                INSERT INTO article_contributor (
                    article_revision_id, contributor_id, role, position
                ) VALUES (?, ?, 'AUTHOR', 1)
                """, revisionId, contributorId);

        mockMvc.perform(get("/api/v1/public/articles/" + articleSlug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisionId").value(revisionId.toString()))
                .andExpect(jsonPath("$.revisionNumber").value(2))
                .andExpect(jsonPath("$.title").value("Current revision"))
                .andExpect(jsonPath("$.content.blocks[0].payload.content[0].text")
                        .value("Current revision"))
                .andExpect(jsonPath("$.plainText").value("Current revision"))
                .andExpect(jsonPath("$.readingTimeMinutes").value(1))
                .andExpect(jsonPath("$.contributors.length()").value(1))
                .andExpect(jsonPath("$.contributors[0].contributorId")
                        .value(contributorId.toString()))
                .andExpect(jsonPath("$.contributors[0].displayName")
                        .value("Current revision author"))
                .andExpect(jsonPath("$.contributors[0].role").value("AUTHOR"));
    }

    @Test
    void resolvesSelectedPublicStorageVariantWithoutInventingArticlePath() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-08",
                8,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "影像", 1, "resolved-media", 1, "PUBLISHED");
        UUID assetId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        UUID rightsId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, 'private/resolved-media.bin', ?, 'image/webp', 2048, 1200, 800, 'resolved', 'READY')
                """, assetId, CHECKSUM);
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'wide', 'published/actual-key.webp', ?, 'image/webp', 1024, 1200, 800)
                """, variantId, assetId, CHECKSUM);
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Courtside TW', 'Editorial license', '{PUBLIC_WEB}'::text[],
                    ARRAY['GLOBAL']::text[], '2026-08-01T00:00:00Z', '2027-08-01T00:00:00Z',
                    'Courtside TW', 'withdraw on notice', 'VALID')
                """, rightsId, assetId);
        replaceDocument("resolved-media", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000007","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"公開圖片","variant":"wide"}}
                ]}
                """.formatted(assetId));

        mockMvc.perform(get("/api/v1/public/articles/resolved-media"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.media[0].assetId").value(assetId.toString()))
                .andExpect(jsonPath("$.media[0].variant").value("wide"))
                .andExpect(jsonPath("$.media[0].url").value("/media/published/actual-key.webp"))
                .andExpect(jsonPath("$.media[0].url").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("/media/articles/resolved-media/")
                )));
    }


    @Test
    void resolvesGenerativePosterWithStandardWideVariant() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-09",
                9,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "視覺", 1, "generative-wide", 1, "PUBLISHED");
        UUID assetId = addPublicWideMediaAsset("generative-wide");
        replaceDocument("generative-wide", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000019","type":"generative-canvas","version":1,
                   "payload":{"presetId":"court-pulse-v1","seed":20260808,"parameters":{"density":42,"tempo":0.8,"lineWeight":1.5,"paletteId":"court-dusk","numericSequence":[0.1,0.4,0.9]},"posterAssetId":"%s","altText":"公開生成視覺","dataSummary":"wide fixture"}}
                ]}
                """.formatted(assetId));

        mockMvc.perform(get("/api/v1/public/articles/generative-wide"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.media[0].assetId").value(assetId.toString()))
                .andExpect(jsonPath("$.media[0].variant").value("wide"))
                .andExpect(jsonPath("$.media[0].url").value("/media/published/generative-wide.webp"));
    }

    @Test
    void contributorDatabaseFailurePropagatesInsteadOfBecomingNotFound() {
        IssueFixture issue = createIssue(
                "issue-2026-10",
                10,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "故障測試", 1, "contributor-db-failure", 1, "PUBLISHED");

        jdbcTemplate.execute("ALTER TABLE article_contributor RENAME TO article_contributor_unavailable");
        try {
            assertThrows(DataAccessException.class, () ->
                    new JdbcPublicArticleRepository(jdbcTemplate).findBySlug(
                            "contributor-db-failure",
                            null,
                            Instant.parse("2026-08-08T12:00:00Z")
                    ));
        } finally {
            jdbcTemplate.execute("ALTER TABLE article_contributor_unavailable RENAME TO article_contributor");
        }
    }

    @Test
    void deniesDraftWithdrawnHistoricalAndPrivateRightsContent() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-05",
                5,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Access", 1, "draft-article", 1, "DRAFT");
        addArticle(issue, "Access", 2, "withdrawn-article", 1, "WITHDRAWN");
        addArticle(issue, "Access", 3, "history-article", 1, "PUBLISHED");
        addPublishedRevision("history-article");
        addArticle(issue, "Access", 4, "private-media-article", 1, "PUBLISHED");
        UUID privateAssetId = addPrivateMediaAsset("private-media-article");
        replaceDocument("private-media-article", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000007","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"不可公開的圖片"}}
                ]}
                """.formatted(privateAssetId));

        for (String slug : new String[]{"draft-article", "withdrawn-article", "private-media-article"}) {
            MvcResult result = mockMvc.perform(get("/api/v1/public/articles/" + slug))
                    .andExpect(status().isNotFound())
                    .andReturn();
            assertFalse(result.getResponse().getContentAsString().contains("private"));
        }

        MvcResult historical = mockMvc.perform(get("/api/v1/public/articles/history-article")
                        .param("revision", "1"))
                .andExpect(status().isNotFound())
                .andReturn();
        assertFalse(historical.getResponse().getContentAsString().contains("history-article"));
    }

    @Test
    void skipsRightsIneligibleNeighborFromIssueNavigation() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-06",
                6,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "開場", 1, "navigation-opening", 1, "PUBLISHED");
        addArticle(issue, "不可公開鄰居", 2, "private-neighbor", 1, "PUBLISHED");
        addArticle(issue, "公開下一篇", 3, "public-next", 1, "PUBLISHED");
        UUID privateAssetId = addPrivateMediaAsset("private-neighbor");
        replaceDocument("private-neighbor", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000007","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"不可公開的圖片"}}
                ]}
                """.formatted(privateAssetId));

        mockMvc.perform(get("/api/v1/public/articles/navigation-opening"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueNavigation.next.slug").value("public-next"));
    }

    @Test
    void returnsCanonicalPublicationMetadataAndMediaCredit() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-13",
                13,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "中繼資料", 1, "canonical-metadata", 1, "PUBLISHED");
        UUID assetId = addPublicWideMediaAsset("canonical-metadata");
        replaceDocument("canonical-metadata", """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000019","type":"generative-canvas","version":1,
                   "payload":{"presetId":"court-pulse-v1","seed":20260808,"parameters":{"density":42,"tempo":0.8,"lineWeight":1.5,"paletteId":"court-dusk","numericSequence":[0.1,0.4,0.9]},"posterAssetId":"%s","altText":"公開生成視覺","dataSummary":"wide fixture"}}
                ]}
                """.formatted(assetId));

        mockMvc.perform(get("/api/v1/public/articles/canonical-metadata"))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=60, must-revalidate, public"))
                .andExpect(jsonPath("$.canonicalPath").value("/articles/canonical-metadata"))
                .andExpect(jsonPath("$.publishedAt").value("2026-08-01T00:00:00Z"))
                .andExpect(jsonPath("$.updatedAt").value("2026-08-02T00:00:00Z"))
                .andExpect(jsonPath("$.media[0].credit").value("Courtside TW"));
    }

    @Test
    void keepsArticleAndNavigationFrozenAfterLiveEditorialRowsDrift() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-14",
                14,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "第一節", 1, "snapshot-opening", 1, "PUBLISHED");
        addArticle(issue, "第二節", 2, "snapshot-next", 1, "PUBLISHED");

        MvcResult before = mockMvc.perform(get("/api/v1/public/articles/snapshot-opening"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Article snapshot-opening"))
                .andExpect(jsonPath("$.plainText").value("Fixture article snapshot-opening"))
                .andExpect(jsonPath("$.issueNavigation.next.slug").value("snapshot-next"))
                .andReturn();
        String etag = before.getResponse().getHeader(HttpHeaders.ETAG);
        assertNotNull(etag);

        UUID articleId = jdbcTemplate.queryForObject(
                "SELECT id FROM article WHERE slug = 'snapshot-opening'",
                UUID.class
        );
        UUID liveRevisionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 2, 'Unpublished pointer drift', 'Unpublished pointer drift',
                    '{"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                      {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                       "payload":{"content":[{"kind":"text","text":"Unpublished pointer drift"}]}}
                    ]}'::jsonb, 'PUBLISHED')
                """, liveRevisionId, articleId);
        jdbcTemplate.update(
                "UPDATE article SET published_revision_id = ? WHERE id = ?",
                liveRevisionId,
                articleId
        );
        jdbcTemplate.update("""
                UPDATE article_revision
                SET title = 'Live drift title',
                    content_document = '{"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                      {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                       "payload":{"content":[{"kind":"text","text":"Live drift body"}]}}
                    ]}'::jsonb
                WHERE article_id = (SELECT id FROM article WHERE slug = 'snapshot-opening')
                """);
        jdbcTemplate.update("""
                DELETE FROM issue_article
                WHERE article_id = (SELECT id FROM article WHERE slug = 'snapshot-next')
                """);

        mockMvc.perform(get("/api/v1/public/articles/snapshot-opening")
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, etag));
        mockMvc.perform(get("/api/v1/public/articles/snapshot-opening"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Article snapshot-opening"))
                .andExpect(jsonPath("$.plainText").value("Fixture article snapshot-opening"))
                .andExpect(jsonPath("$.issueNavigation.next.slug").value("snapshot-next"));
    }

    @Test
    void deniesSchemaInvalidPublishedDocument() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-07",
                7,
                Instant.parse("2026-08-08T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "無效內容", 1, "invalid-content", 1, "PUBLISHED");
        replaceDocument("invalid-content", """
                {"schemaVersion":1,"documentId":"00000000-0000-4000-8000-000000000017","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000018","type":"html","version":1,
                   "payload":{"html":"<script>alert(1)</script>"}}
                ]}
                """);

        mockMvc.perform(get("/api/v1/public/articles/invalid-content"))
                .andExpect(status().isNotFound());
    }

    private void replaceDocument(String articleSlug, String document) {
        mutateLiveDocument(articleSlug, document);
        appendCurrentArticleSnapshot(articleSlug, Instant.parse("2026-08-02T00:00:00Z"));
    }

    private void mutateLiveDocument(String articleSlug, String document) {
        jdbcTemplate.update("""
                UPDATE article_revision
                SET content_document = ?::jsonb
                WHERE article_id = (SELECT id FROM article WHERE slug = ?)
                """, document, articleSlug);
    }

    private void addPublishedRevision(String articleSlug) {
        UUID articleId = jdbcTemplate.queryForObject(
                "SELECT id FROM article WHERE slug = ?",
                UUID.class,
                articleSlug
        );
        UUID revisionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 2, 'Current revision', 'Current dek',
                    '{"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                      {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                       "payload":{"content":[{"kind":"text","text":"Current revision"}]}}
                    ]}'::jsonb, 'PUBLISHED')
                """,
                revisionId,
                articleId
        );
        jdbcTemplate.update(
                "UPDATE article SET published_revision_id = ? WHERE id = ?",
                revisionId,
                articleId
        );
        appendCurrentArticleSnapshot(articleSlug, Instant.parse("2026-08-02T00:00:00Z"));
    }


    private UUID addPublicWideMediaAsset(String articleSlug) {
        UUID assetId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        UUID rightsId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/webp', 2048, 1200, 675, ?, 'READY')
                """,
                assetId,
                "private/" + articleSlug + ".webp",
                CHECKSUM,
                "公開生成視覺"
        );
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'wide', ?, ?, 'image/webp', 1024, 1200, 675)
                """,
                variantId,
                assetId,
                "published/" + articleSlug + ".webp",
                CHECKSUM
        );
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Courtside TW', 'Editorial license', '{PUBLIC_WEB}'::text[],
                    ARRAY['GLOBAL']::text[], '2026-08-01T00:00:00Z', '2027-08-01T00:00:00Z',
                    'Courtside TW', 'withdraw on notice', 'VALID')
                """,
                rightsId,
                assetId
        );
        return assetId;
    }

    private UUID addPrivateMediaAsset(String articleSlug) {
        UUID assetId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        UUID rightsId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/webp', 2048, 1200, 900, ?, 'READY')
                """,
                assetId,
                "private/articles/" + articleSlug + ".webp",
                CHECKSUM,
                "不可公開的圖片"
        );
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'inline', ?, ?, 'image/webp', 1024, 1200, 900)
                """,
                variantId,
                assetId,
                "articles/" + articleSlug + "/inline.webp",
                CHECKSUM
        );
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Private owner', 'Reader-only license', ?::text[],
                    ARRAY['GLOBAL']::text[], ?, ?, 'Private owner', 'withdraw on notice', 'VALID')
                """,
                rightsId,
                assetId,
                "{READER_LIBRARY}",
                Timestamp.from(Instant.parse("2026-08-01T00:00:00Z")),
                Timestamp.from(Instant.parse("2027-08-01T00:00:00Z"))
        );
        return assetId;
    }
}
