package tw.basketball.magazine.media.api;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialMediaMetadataApiIT extends EditorialApiIntegrationTestSupport {
    private UUID assetId;

    @BeforeEach
    void installMetadataControllerAndSeedProcessingAsset() {
        EditorialMediaMetadataService service = new EditorialMediaMetadataService(
                jdbcTemplate,
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialMediaMetadataController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();

        assetId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, processing_state, version
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'PROCESSING', 0)
                """,
                assetId,
                "private/metadata/" + assetId,
                "a".repeat(64)
        );
        jdbcTemplate.update(
                """
                INSERT INTO media_variant (
                    asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, 'web', ?, ?, 'image/jpeg', 512, 10, 10)
                """,
                assetId,
                "public/metadata/" + assetId,
                "b".repeat(64)
        );
    }

    @Test
    void editorPatchPersistsAltTextCreditRightsAndPromotesProcessedAsset() throws Exception {
        var editor = actor("metadata-editor", RoleCode.EDITOR);
        mockMvc.perform(get("/api/v1/editor/media/{id}", assetId).principal(editor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assetId").value(assetId.toString()))
                .andExpect(jsonPath("$.altText").value(nullValue()))
                .andExpect(jsonPath("$.rights").value(nullValue()));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .content(body()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
                .andExpect(jsonPath("$.altText").value("夜間球場全景"))
                .andExpect(jsonPath("$.state").value("READY"))
                .andExpect(jsonPath("$.rights.credit").value("Courtside TW"))
                .andExpect(jsonPath("$.rights.status").value("VALID"));

        assertEquals("夜間球場全景", jdbcTemplate.queryForObject(
                "SELECT alt_text FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals("READY", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals("Courtside TW", jdbcTemplate.queryForObject(
                "SELECT credit FROM rights_record WHERE asset_id = ?", String.class, assetId));
        assertEquals("VALID", jdbcTemplate.queryForObject(
                "SELECT status FROM rights_record WHERE asset_id = ?", String.class, assetId));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .content(body()))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .content(bodyWithoutRightsVersion()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("RIGHTS_VERSION_REQUIRED"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT version FROM media_asset WHERE id = ?", Integer.class, assetId));
    }

    @Test
    void publisherCannotReadOrUpdateEditorMetadata() throws Exception {
        mockMvc.perform(get("/api/v1/editor/media/{id}", assetId)
                        .principal(actor("metadata-publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    private static String body() {
        return """
                {
                  "altText":"夜間球場全景",
                  "rights":{
                    "rightsOwner":"Courtside TW",
                    "licenseName":"Editorial license",
                    "allowedChannels":["PUBLIC_WEB"],
                    "territories":["GLOBAL"],
                    "validFrom":"2026-08-10T00:00:00Z",
                    "validUntil":"2027-08-10T00:00:00Z",
                    "credit":"Courtside TW",
                    "withdrawalTerms":"Contact the rights desk.",
                    "status":"VALID"
                  }
                }
                """;
    }

    private static String bodyWithoutRightsVersion() {
        return body().replace("\"rightsOwner\"", "\"version\":null,\"rightsOwner\"");
    }
}
