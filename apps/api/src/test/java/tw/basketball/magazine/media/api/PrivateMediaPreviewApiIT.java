package tw.basketball.magazine.media.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.PrivateMediaPreviewService;
import tw.basketball.magazine.media.storage.PrivateMediaPreviewReader;
import tw.basketball.magazine.shared.RoleCode;

final class PrivateMediaPreviewApiIT extends EditorialApiIntegrationTestSupport {
    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xd9};

    @Test
    void verifiedPrivatePreviewReturnsBytesWithoutObjectKeysOrCachePersistence() throws Exception {
        UUID asset = seed("READY");
        install((key, limit) -> JPEG.clone());
        var result = mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset)
                        .principal(actor("preview-editor", RoleCode.EDITOR))
                        .header("X-Request-Id", "preview-allowed"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("Cache-Control", "no-store, private"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Request-Id", "preview-allowed"))
                .andReturn();
        assertArrayEquals(JPEG, result.getResponse().getContentAsByteArray());
        assertFalse(result.getResponse().getHeaderNames().contains("Location"));
    }

    @Test
    void anonymousReaderAndRevokedMediaNeverReachPrivateStorage() throws Exception {
        UUID asset = seed("REVOKED");
        AtomicInteger reads = new AtomicInteger();
        install((key, limit) -> { reads.incrementAndGet(); return JPEG.clone(); });
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset).principal(actor("reader", RoleCode.READER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().is(422));
        assertEquals(0, reads.get());
    }

    @Test
    void missingOrCorruptProviderFailsClosedWithSanitizedProblemDetails() throws Exception {
        UUID asset = seed("READY");
        install(PrivateMediaPreviewReader.unavailable());
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("MEDIA_PREVIEW_UNAVAILABLE"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());
        install((key, limit) -> "corrupt-original-secret-canary".getBytes(StandardCharsets.UTF_8));
        var result = mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isServiceUnavailable()).andReturn();
        assertFalse(result.getResponse().getContentAsString().contains("secret-canary"));
    }

    @Test
    void revocationDuringProviderReadSuppressesTheReturnedBytes() throws Exception {
        UUID asset = seed("READY");
        install((key, limit) -> {
            jdbcTemplate.update("UPDATE media_asset SET processing_state = 'REVOKED', version = version + 1 WHERE id = ?", asset);
            return JPEG.clone();
        });
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().is(422));
    }

    @Test
    void readyMediaChangedDuringProviderReadSuppressesTheStaleBytes() throws Exception {
        UUID asset = seed("READY");
        install((key, limit) -> {
            jdbcTemplate.update("UPDATE media_asset SET version = version + 1 WHERE id = ?", asset);
            return JPEG.clone();
        });
        mockMvc.perform(get("/api/v1/publisher/media/{id}/preview", asset)
                        .principal(actor("publisher", RoleCode.PUBLISHER)))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].code").value("MEDIA_CHANGED"));
    }

    @Test
    void objectKeyBelongingToAnotherAssetNeverReachesPrivateStorage() throws Exception {
        UUID asset = seed("READY");
        jdbcTemplate.update("UPDATE media_asset SET private_storage_key = ? WHERE id = ?",
                "media/originals/" + UUID.randomUUID() + "/" + UUID.randomUUID(), asset);
        AtomicInteger reads = new AtomicInteger();
        install((key, limit) -> { reads.incrementAndGet(); return JPEG.clone(); });
        mockMvc.perform(get("/api/v1/editor/media/{id}/preview", asset)
                        .principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isServiceUnavailable());
        assertEquals(0, reads.get());
    }

    @Test
    void publisherCanReadVerifiedPrivateMediaThroughPublisherBoundary() throws Exception {
        UUID asset = seed("READY");
        install((key, limit) -> JPEG.clone());
        var result = mockMvc.perform(get("/api/v1/publisher/media/{id}/preview", asset)
                        .principal(actor("publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store, private"))
                .andReturn();
        assertArrayEquals(JPEG, result.getResponse().getContentAsByteArray());
    }

    @Test
    void pickerUsesBoundedStableCursorAndNeverExposesPrivateStorageFields() throws Exception {
        seed("READY");
        seed("PENDING");
        install(PrivateMediaPreviewReader.unavailable());
        var first = mockMvc.perform(get("/api/v1/editor/media").param("limit", "1")
                        .principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].processingState").isNotEmpty())
                .andExpect(jsonPath("$.items[0].version").value(0))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty()).andReturn();
        JsonNode page = JSON.readTree(first.getResponse().getContentAsString());
        var second = mockMvc.perform(get("/api/v1/editor/media").param("limit", "1")
                        .param("cursor", page.path("nextCursor").asString()).principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1)).andReturn();
        assertFalse(first.getResponse().getContentAsString().contains("private_storage_key"));
        assertFalse(first.getResponse().getContentAsString().contains("media/originals"));
        assertFalse(page.path("items").get(0).path("assetId").asString().equals(
                JSON.readTree(second.getResponse().getContentAsString()).path("items").get(0).path("assetId").asString()));
        mockMvc.perform(get("/api/v1/editor/media").param("limit", "101").principal(actor("editor", RoleCode.EDITOR)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/editor/media").principal(actor("reader", RoleCode.READER)))
                .andExpect(status().isForbidden());
    }

    private void install(PrivateMediaPreviewReader reader) {
        mockMvc = MockMvcBuilders.standaloneSetup(new PrivateMediaPreviewController(
                new PrivateMediaPreviewService(jdbcTemplate, reader))).build();
    }

    private UUID seed(String state) throws Exception {
        UUID asset = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type,
                    byte_size, width, height, alt_text, processing_state)
                VALUES (?, ?, ?, 'image/jpeg', ?, 10, 10, 'Private preview fixture', ?)
                """, asset, "media/originals/" + asset + "/" + UUID.randomUUID(),
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JPEG)), JPEG.length, state);
        return asset;
    }
}
