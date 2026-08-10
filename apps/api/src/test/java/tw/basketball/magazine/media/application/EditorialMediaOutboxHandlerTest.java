package tw.basketball.magazine.media.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.persistence.MediaAssetRepository;
import tw.basketball.magazine.media.processing.MediaCompletionValidator;
import tw.basketball.magazine.media.processing.MediaMetadataSanitizer;
import tw.basketball.magazine.media.processing.MediaProcessingResult;
import tw.basketball.magazine.media.processing.MediaProcessingService;
import tw.basketball.magazine.media.processing.MediaVariantEncoder;
import tw.basketball.magazine.media.processing.VariantSpec;
import tw.basketball.magazine.media.storage.PrivateObjectReader;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.media.storage.StorageVisibility;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxStatus;

final class EditorialMediaOutboxHandlerTest {
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-7000-8000-000000000201");
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void readyAssetMakesDuplicateDeliveryAcknowledgeWithoutReadingPrivateObject() throws Exception {
        CapturingRepository repository = new CapturingRepository(asset(MediaProcessingState.READY, 2));
        PrivateObjectReader reader = key -> {
            throw new AssertionError("ready duplicate must not read the private original");
        };
        new EditorialMediaOutboxHandler(repository, reader, processor(), (key, mime, bytes) -> {
            throw new AssertionError("ready duplicate must not write variants");
        }, JSON).handle(event(payload()));
        assertFalse(repository.recorded);
    }

    @Test
    void invalidBytesBecomeTerminalFailureInsteadOfRetryingForever() throws Exception {
        byte[] bytes = "not-a-jpeg".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String checksum = sha256(bytes);
        CapturingRepository repository = new CapturingRepository(asset(MediaProcessingState.PROCESSING, 1));
        PrivateObjectReader reader = key -> bytes;
        new EditorialMediaOutboxHandler(
                repository,
                reader,
                processor(),
                (key, mime, variantBytes) -> {
                    throw new AssertionError("failed processing must not write variants");
                },
                JSON
        ).handle(event(payload(checksum, bytes.length)));
        assertTrue(repository.recorded);
        assertEquals(
                tw.basketball.magazine.media.processing.MediaProcessingState.FAILED,
                repository.result.state()
        );
    }

    @Test
    void readyProcessingWritesEveryPublicVariantBeforeRecordingCompletion() throws Exception {
        byte[] bytes = new byte[]{
                (byte) 0xFF, (byte) 0xD8, (byte) 0xFF,
                (byte) 0xDA, 0x00, 0x02, (byte) 0xFF, (byte) 0xD9
        };
        CapturingRepository repository = new CapturingRepository(asset(MediaProcessingState.PROCESSING, 1));
        List<String> keys = new ArrayList<>();
        new EditorialMediaOutboxHandler(
                repository,
                key -> bytes,
                processor(),
                (key, mime, variantBytes) -> keys.add(key + "|" + variantBytes.length),
                JSON
        ).handle(event(payload(sha256(bytes), bytes.length)));

        assertTrue(repository.recorded);
        assertEquals(5, keys.size());
        assertTrue(keys.stream().allMatch(key -> key.startsWith("media/variants/")));
    }

    @Test
    void publicVariantWriteFailureIsRetryableAndDoesNotRecordReady() throws Exception {
        byte[] bytes = new byte[]{
                (byte) 0xFF, (byte) 0xD8, (byte) 0xFF,
                (byte) 0xDA, 0x00, 0x02, (byte) 0xFF, (byte) 0xD9
        };
        CapturingRepository repository = new CapturingRepository(asset(MediaProcessingState.PROCESSING, 1));
        OutboxHandlerException exception = assertThrows(
                OutboxHandlerException.class,
                () -> new EditorialMediaOutboxHandler(
                        repository,
                        key -> bytes,
                        processor(),
                        (key, mime, variantBytes) -> { throw new IllegalStateException("storage down"); },
                        JSON
                ).handle(event(payload(sha256(bytes), bytes.length)))
        );

        assertTrue(exception.retryable());
        assertFalse(repository.recorded);
    }

    private static MediaProcessingService processor() {
        MediaVariantEncoder encoder = (media, spec) -> new tw.basketball.magazine.media.processing.MediaVariant(
                spec.name(), spec.outputMimeType(), spec.maxWidth(), spec.maxHeight(),
                Math.max(1, media.bytes().length), StorageVisibility.PUBLIC_VARIANT,
                media.bytes()
        );
        return new MediaProcessingService(
                new MediaCompletionValidator(StorageUploadPolicy.standard()),
                new MediaMetadataSanitizer(),
                encoder,
                VariantSpec.defaults()
        );
    }

    private static MediaAssetRepository.MediaAssetRecord asset(MediaProcessingState state, long version) {
        return new MediaAssetRepository.MediaAssetRecord(
                ASSET_ID,
                UUID.fromString("00000000-0000-7000-8000-000000000202"),
                "fixture.jpg",
                "private/fixture/" + ASSET_ID,
                "a".repeat(64),
                "image/jpeg",
                10,
                "fixture alt",
                state,
                version,
                Instant.parse("2026-08-10T00:05:00Z")
        );
    }

    private static OutboxEvent event(String payload) {
        Instant now = Instant.parse("2026-08-10T00:00:00Z");
        return new OutboxEvent(
                UUID.fromString("00000000-0000-7000-8000-000000000203"),
                EditorialMediaOutboxHandler.EVENT_TYPE,
                "MEDIA_ASSET",
                ASSET_ID,
                "media.process:" + ASSET_ID,
                payload,
                OutboxStatus.PENDING,
                now,
                1,
                null,
                null,
                null,
                now,
                now,
                null,
                null
        );
    }

    private static String payload() {
        return payload("a".repeat(64), 10);
    }

    private static String payload(String checksum, int bytes) {
        return """
                {"assetId":"%s","privateStorageKey":"private/fixture/%s","checksumSha256":"%s","mimeType":"image/jpeg","byteSize":%d}
                """.formatted(ASSET_ID, ASSET_ID, checksum, bytes);
    }

    private static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static final class CapturingRepository implements MediaAssetRepository {
        private final MediaAssetRecord current;
        private boolean recorded;
        private MediaProcessingResult result;

        private CapturingRepository(MediaAssetRecord current) {
            this.current = current;
        }

        @Override
        public void insertPending(PendingAsset asset) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<MediaAssetRecord> find(UUID assetId) {
            return Optional.of(current);
        }

        @Override
        public boolean markProcessing(UUID assetId, long expectedVersion) {
            throw new UnsupportedOperationException();
        }

        @Override
        public boolean recordProcessingResult(UUID assetId, long expectedVersion, MediaProcessingResult result) {
            this.recorded = true;
            this.result = result;
            return true;
        }

        @Override
        public boolean updateMetadata(UUID assetId, long expectedVersion, String altText) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<MediaVariantRecord> variants(UUID assetId) {
            return List.of();
        }
    }
}
