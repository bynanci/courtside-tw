package tw.basketball.magazine.media.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.PublisherMediaService;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.shared.RoleCode;

final class PublisherMediaRevokeApiIT extends EditorialApiIntegrationTestSupport {
    @BeforeEach
    void installPublisherMediaController() {
        PublisherMediaService service = new PublisherMediaService(
                jdbcTemplate,
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new PublisherMediaController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    @Test
    void publisherRevokeIsConditionalIdempotentAndLeavesImpactLink() throws Exception {
        UUID assetId = seedAssetAndPublishedImpact();
        var publisher = actor("publisher-revoke-1", RoleCode.PUBLISHER);
        String body = """{"reason":"rights revoked by owner"}""";

        MvcResult first = mockMvc.perform(post("/api/v1/publisher/media/{id}:revoke", assetId)
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .header("Idempotency-Key", "revoke-media-1")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.affectedArticles").isArray())
                .andReturn();

        MvcResult replay = mockMvc.perform(post("/api/v1/publisher/media/{id}:revoke", assetId)
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .header("Idempotency-Key", "revoke-media-1")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1))
                .andReturn();
        assertEquals(first.getResponse().getContentAsString(), replay.getResponse().getContentAsString());
        assertEquals("REVOKED", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_impact_link WHERE asset_id = ?", Integer.class, assetId));
    }

    @Test
    void editorCannotRevokeMedia() throws Exception {
        UUID assetId = seedAssetAndPublishedImpact();
        mockMvc.perform(post("/api/v1/publisher/media/{id}:revoke", assetId)
                        .principal(actor("editor-revoke", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .header("Idempotency-Key", "editor-revoke")
                        .content("""{"reason":"not allowed"}"""))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    private UUID seedAssetAndPublishedImpact() {
        UUID assetId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        String document = """{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000105","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Revoke fixture"}]}}]}""";
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'fixture media', 'READY')
                """, assetId, "private/revoke/" + assetId, "b".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, version)
                VALUES (?, ?, 'DRAFT', 2)
                """, articleId, "revoke-" + articleId.toString().substring(0, 8));
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state, version
                ) VALUES (?, ?, 1, 'Fixture article', 'Fixture', ?::jsonb, 'PUBLISHED', 2)
                """, revisionId, articleId, document);
        jdbcTemplate.update("""
                UPDATE article
                SET state = 'PUBLISHED', published_revision_id = ?,
                    published_at = TIMESTAMPTZ '2026-08-09 00:00:00+00'
                WHERE id = ?
                """, revisionId, articleId);
        jdbcTemplate.update("""
                INSERT INTO article_revision_media (article_revision_id, asset_id, required_channel, position)
                VALUES (?, ?, 'PUBLIC_WEB', 1)
                """, revisionId, assetId);
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot (
                    id, aggregate_type, aggregate_id, revision_id, snapshot_version,
                    content_document, checksum_sha256, created_by
                ) VALUES (?, 'ARTICLE', ?, ?, 1, ?::jsonb, ?, 'fixture-publisher')
                """, snapshotId, articleId, revisionId, document, "c".repeat(64));
        return assetId;
    }
}
