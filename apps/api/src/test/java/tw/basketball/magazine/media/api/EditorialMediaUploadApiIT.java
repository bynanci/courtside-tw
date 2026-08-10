package tw.basketball.magazine.media.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.EditorialMediaService;
import tw.basketball.magazine.media.persistence.JdbcMediaAssetRepository;
import tw.basketball.magazine.media.persistence.JdbcMediaUploadIdempotencyRepository;
import tw.basketball.magazine.media.storage.S3CompatibleStoragePort;
import tw.basketball.magazine.media.storage.SignedUpload;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.media.storage.StorageVisibility;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.UuidV7Generator;

final class EditorialMediaUploadApiIT extends EditorialApiIntegrationTestSupport {
    private static final UUID UPLOAD_ID =
            UUID.fromString("00000000-0000-7000-8000-000000000901");
    private static final String CHECKSUM = "a".repeat(64);

    @BeforeEach
    void installMediaController() {
        S3CompatibleStoragePort storage = request -> new SignedUpload(
                request.assetId(),
                UPLOAD_ID,
                "media/originals/" + request.assetId() + "/" + UPLOAD_ID,
                request.mimeType(),
                request.byteSize(),
                applicationClock.now().plus(Duration.ofMinutes(5)),
                URI.create("https://signed.example.test/upload"),
                StorageVisibility.PRIVATE_ORIGINAL
        );
        EditorialMediaService service = new EditorialMediaService(
                new JdbcMediaAssetRepository(jdbcTemplate),
                new JdbcMediaUploadIdempotencyRepository(jdbcTemplate),
                storage,
                new OutboxRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                applicationClock,
                StorageUploadPolicy.standard(),
                UuidV7Generator.system()
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialMediaController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    @Test
    void createsPrivateIntentAndStoresOnlyBoundedUploadMetadata() throws Exception {
        Authentication editor = actor("upload-editor-1", RoleCode.EDITOR);
        String body = uploadBody("cover.jpg");

        MvcResult result = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-intent-1")
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.assetId").isString())
                .andExpect(jsonPath("$.uploadUrl").value("https://signed.example.test/upload"))
                .andExpect(jsonPath("$.state").value("PENDING"))
                .andReturn();

        UUID assetId = UUID.fromString(JSON.readTree(
                result.getResponse().getContentAsString()).path("assetId").asString());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM media_asset WHERE id = ? AND processing_state = 'PENDING'",
                Integer.class,
                assetId
        ));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE aggregate_id = ?",
                Integer.class,
                assetId
        ));
    }

    @Test
    void idempotentIntentReplaysExactlyAndChangedPayloadConflicts() throws Exception {
        Authentication editor = actor("upload-editor-2", RoleCode.EDITOR);
        String body = uploadBody("hero.jpg");
        MvcResult first = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-intent-retry")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        MvcResult replay = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-intent-retry")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        assertEquals(
                first.getResponse().getContentAsString(),
                replay.getResponse().getContentAsString()
        );
        mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-intent-retry")
                        .content(uploadBody("different.jpg")))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.errors[0].code").value("IDEMPOTENCY_KEY_REUSE"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM media_upload_idempotency WHERE operation = 'CREATE_UPLOAD'",
                Integer.class
        ));
    }

    @Test
    void completionMovesAssetToProcessingAndEnqueuesOneWorkerEvent() throws Exception {
        Authentication editor = actor("upload-editor-3", RoleCode.EDITOR);
        MvcResult intent = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-intent-complete")
                        .content(uploadBody("inline.jpg")))
                .andExpect(status().isCreated())
                .andReturn();
        UUID assetId = UUID.fromString(JSON.readTree(
                intent.getResponse().getContentAsString()).path("assetId").asString());

        String completion = """
                {"checksumSha256":"%s","contentType":"image/jpeg"}
                """.formatted(CHECKSUM);
        mockMvc.perform(post("/api/v1/editor/media/{id}:complete", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-complete")
                        .content(completion))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.state").value("PROCESSING"))
                .andExpect(jsonPath("$.version").value(1));

        assertEquals("PROCESSING", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE aggregate_id = ? AND event_type = 'media.asset.process'",
                Integer.class,
                assetId
        ));
        mockMvc.perform(post("/api/v1/editor/media/{id}:complete", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-complete")
                        .content(completion))
                .andExpect(status().isAccepted());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE aggregate_id = ?", Integer.class, assetId));
    }

    @Test
    void completionIdempotencyKeyCannotReplayAReceiptForAnotherAsset() throws Exception {
        Authentication editor = actor("upload-editor-cross-asset", RoleCode.EDITOR);
        UUID firstAssetId = assetIdForIntent(editor, "media-intent-cross-asset-1", "first.jpg");
        UUID secondAssetId = assetIdForIntent(editor, "media-intent-cross-asset-2", "second.jpg");
        String completion = """
                {"checksumSha256":"%s","contentType":"image/jpeg"}
                """.formatted(CHECKSUM);

        mockMvc.perform(post("/api/v1/editor/media/{id}:complete", firstAssetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-complete-cross-asset")
                        .content(completion))
                .andExpect(status().isAccepted());

        mockMvc.perform(post("/api/v1/editor/media/{id}:complete", secondAssetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "media-complete-cross-asset")
                        .content(completion))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.errors[0].code").value("IDEMPOTENCY_KEY_REUSE"));
    }

    @Test
    void publisherCannotCreateAnEditorUploadIntent() throws Exception {
        mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(actor("upload-publisher", RoleCode.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "publisher-upload")
                        .content(uploadBody("blocked.jpg")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    private static String uploadBody(String filename) {
        return """
                {
                  "filename":"%s",
                  "contentType":"image/jpeg",
                  "sizeBytes":1024,
                  "checksumSha256":"%s"
                }
                """.formatted(filename, CHECKSUM);
    }

    private UUID assetIdForIntent(
            Authentication editor,
            String idempotencyKey,
            String filename
    ) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", idempotencyKey)
                        .content(uploadBody(filename)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JSON.readTree(
                result.getResponse().getContentAsString()).path("assetId").asString());
    }
}
