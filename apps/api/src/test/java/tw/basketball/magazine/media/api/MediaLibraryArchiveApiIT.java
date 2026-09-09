package tw.basketball.magazine.media.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.MediaLibraryArchiveService;
import tw.basketball.magazine.media.application.PrivateMediaPreviewService;
import tw.basketball.magazine.media.storage.PrivateMediaPreviewReader;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** FR-011 archive acceptance runs against PostgreSQL, not a processing-state substitute. */
final class MediaLibraryArchiveApiIT extends EditorialApiIntegrationTestSupport {
    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xd9};
    private TransactionTemplate transaction;
    private MediaLibraryArchiveService service;

    @BeforeEach
    void installArchiveController() {
        transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource()));
        service = new MediaLibraryArchiveService(jdbcTemplate, new JdbcAuditWriter(jdbcTemplate, JSON), transaction);
        install((key, limit) -> JPEG.clone());
    }

    @Test
    void archiveIsVersionedAuditedAndIndependentOfProcessingAndRights() throws Exception {
        UUID asset = seed("READY");
        jdbcTemplate.update("""
                INSERT INTO rights_record (asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status, version)
                VALUES (?, 'Owner', 'License', ARRAY['PUBLIC_WEB'], ARRAY['GLOBAL'],
                    '2026-01-01', '2027-01-01', 'Credit', 'Contact desk', 'VALID', 3)
                """, asset);
        mockMvc.perform(post("/api/v1/editor/media/{id}:archive", asset)
                        .principal(actor("editor", RoleCode.EDITOR)).header("If-Match", "\"0\""))
                .andExpect(status().isOk()).andExpect(header().string("ETag", "\"1\""))
                .andExpect(header().string("Cache-Control", "no-store, private"))
                .andExpect(jsonPath("$.archivedAt").isNotEmpty());
        assertEquals("READY", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, asset));
        assertEquals(3L, jdbcTemplate.queryForObject(
                "SELECT version FROM rights_record WHERE asset_id = ? AND status = 'VALID'", Long.class, asset));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE action = 'MEDIA_LIBRARY_ARCHIVED'", Integer.class));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM outbox_event", Integer.class));
        mockMvc.perform(post("/api/v1/editor/media/{id}:archive", asset)
                        .principal(actor("editor", RoleCode.EDITOR)).header("If-Match", "\"0\""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
        mockMvc.perform(post("/api/v1/publisher/media/{id}:archive", asset)
                        .principal(actor("publisher", RoleCode.PUBLISHER)).header("If-Match", "\"1\""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE action = 'MEDIA_LIBRARY_ARCHIVED'", Integer.class));
    }

    @Test
    void anonymousReaderAndMalformedVersionCannotArchive() throws Exception {
        UUID asset = seed("REVOKED");
        mockMvc.perform(post("/api/v1/editor/media/{id}:archive", asset).header("If-Match", "\"0\""))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/editor/media/{id}:archive", asset)
                        .principal(actor("reader", RoleCode.READER)).header("If-Match", "\"0\""))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/editor/media/{id}:archive", asset).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/v1/publisher/media/{id}:archive", asset)
                        .principal(actor("publisher", RoleCode.PUBLISHER)).header("If-Match", "\"0\""))
                .andExpect(status().isOk());
        assertEquals("REVOKED", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, asset));
    }

    @Test
    void defaultPickerExcludesArchiveButArchivedLibraryAndCheckedPreviewRemainAvailable() throws Exception {
        UUID archived = seed("READY");
        UUID active = seed("READY");
        archive(archived);
        mockMvc.perform(get("/api/v1/editor/media").principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].assetId").value(active.toString()));
        mockMvc.perform(get("/api/v1/publisher/media").param("archived", "true")
                        .principal(actor("publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].assetId").value(archived.toString()))
                .andExpect(jsonPath("$.items[0].archivedAt").isNotEmpty());
        mockMvc.perform(get("/api/v1/editor/media").param("archived", "all")
                        .principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", archived)
                        .principal(actor("editor", RoleCode.EDITOR))).andExpect(status().isOk());
        AtomicInteger reads = new AtomicInteger();
        install((key, limit) -> { reads.incrementAndGet(); return JPEG.clone(); });
        jdbcTemplate.update("UPDATE media_asset SET processing_state = 'REVOKED' WHERE id = ?", archived);
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", archived)
                        .principal(actor("editor", RoleCode.EDITOR))).andExpect(status().is(422));
        assertEquals(0, reads.get());
    }

    @Test
    void newReferencesAreRejectedWhileExistingDraftImageAndCoverCanBeRetained() throws Exception {
        UUID asset = seed("READY");
        JsonNode content = JSON.readTree("""
                {"schemaVersion":1,"documentId":"00000000-0000-4000-8000-000000000002","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000003","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"Archive fixture","variant":"inline"}}]}
                """.formatted(asset));
        var articles = new JdbcEditorialArticleRepository(jdbcTemplate);
        var issues = new JdbcEditorialIssueRepository(jdbcTemplate);
        var existing = transaction.execute(status -> articles.insertDraft("Existing", "existing-media", "Dek", content));
        var issue = transaction.execute(status -> issues.insertDraft("Existing", "existing-cover", "Summary", asset));
        assertNotNull(existing);
        assertNotNull(issue);
        archive(asset);
        var newArticleError = assertThrows(EditorialProblemException.class, () -> transaction.execute(
                status -> articles.insertDraft("New", "new-media", "Dek", content)));
        assertEquals("MEDIA_ARCHIVED", newArticleError.errors().getFirst().code());
        var newCoverError = assertThrows(EditorialProblemException.class, () -> transaction.execute(
                status -> issues.insertDraft("New", "new-cover", "Summary", asset)));
        assertEquals("MEDIA_ARCHIVED", newCoverError.errors().getFirst().code());
        assertTrue(Boolean.TRUE.equals(transaction.execute(status -> articles.updateDraft(
                existing.articleId(), existing.revisionId(), existing.version(), existing.revisionVersion(),
                "Updated existing", existing.slug(), existing.dek(), content))));
        assertTrue(Boolean.TRUE.equals(transaction.execute(status -> issues.updateDraft(
                issue.issueId(), issue.version(), "Updated existing", issue.slug(), issue.summary(), asset))));
        assertThrows(EditorialProblemException.class, () -> transaction.execute(status ->
                articles.createRevision(existing.articleId(), existing.version() + 1, "New revision", "Dek", content)));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM article", Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_issue", Integer.class));
    }

    private void archive(UUID asset) {
        service.archive(ActorContext.user("editor", Set.of(RoleCode.EDITOR), RequestId.of("archive-test")),
                asset, Version.initial());
    }

    private void install(PrivateMediaPreviewReader reader) {
        mockMvc = MockMvcBuilders.standaloneSetup(new MediaLibraryArchiveController(service),
                        new PrivateMediaPreviewController(new PrivateMediaPreviewService(jdbcTemplate, reader)))
                .setControllerAdvice(new EditorialApiExceptionHandler()).build();
    }

    private UUID seed(String state) throws Exception {
        UUID asset = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type,
                    byte_size, width, height, alt_text, processing_state)
                VALUES (?, ?, ?, 'image/jpeg', ?, 10, 10, 'Archive fixture', ?)
                """, asset, "media/originals/" + asset + "/" + UUID.randomUUID(),
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JPEG)), JPEG.length, state);
        return asset;
    }
}
