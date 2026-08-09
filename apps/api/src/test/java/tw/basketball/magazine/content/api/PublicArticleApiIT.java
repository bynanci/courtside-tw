package tw.basketball.magazine.publication;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Tests-first contract for the public Article projection.
 *
 * <p>The source path is reserved for US2 content/api work while the existing
 * publication Testcontainers harness keeps this red baseline deterministic.
 * The first assertion is expected to fail until PublicArticleController and
 * its published-only projection are implemented.</p>
 */
final class PublicArticleApiIT extends PublicIssueApiIntegrationTestSupport {
    private static final String CHECKSUM = "b".repeat(64);

    @Test
    void returnsPublishedRevisionAndSnapshotIssueNavigation() throws Exception {
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
                .andExpect(jsonPath("$.issueNavigation.issueSlug").value(issue.slug()))
                .andExpect(jsonPath("$.issueNavigation.next.slug").value("courtside-notes"))
                .andExpect(jsonPath("$.content.blocks[0].type").value("paragraph"));
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

    private void replaceDocument(String articleSlug, String document) {
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
