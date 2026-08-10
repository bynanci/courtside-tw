package tw.basketball.magazine.media.processing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.media.storage.StorageVisibility;

final class MediaProcessingServiceTest {
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-4000-8000-000000000020");

    @Test
    void validJpegReachesReadyAfterExifRemovalAndConfiguredVariants() {
        byte[] jpeg = jpegWithExif();
        MediaProcessingResult result = processingService(validEncoder()).process(
                MediaProcessingState.PENDING,
                request("image/jpeg", jpeg, sha256(jpeg))
        );

        assertEquals(MediaProcessingState.READY, result.state());
        assertEquals(4, result.variants().size());
        assertFalse(new String(result.sanitizedBytes(), StandardCharsets.ISO_8859_1).contains("Exif"));
    }

    @Test
    void validPngAndWebpMagicBytesReachReady() {
        assertReady("image/png", minimalPng());
        assertReady("image/webp", minimalWebp());
    }

    @Test
    void invalidMagicBytesBecomeFailedAndNeverReady() {
        byte[] notJpeg = "not-an-image".getBytes(StandardCharsets.UTF_8);
        MediaProcessingResult result = processingService(validEncoder()).process(
                MediaProcessingState.PENDING,
                request("image/jpeg", notJpeg, sha256(notJpeg))
        );

        assertEquals(MediaProcessingState.FAILED, result.state());
        assertEquals(MediaFailureReason.MAGIC_BYTES, result.failureReason());
        assertTrue(result.variants().isEmpty());
    }

    @Test
    void checksumMismatchBecomesFailedAndNeverReady() {
        byte[] jpeg = jpegWithExif();
        MediaProcessingResult result = processingService(validEncoder()).process(
                MediaProcessingState.PENDING,
                request("image/jpeg", jpeg, "0".repeat(64))
        );

        assertEquals(MediaProcessingState.FAILED, result.state());
        assertEquals(MediaFailureReason.CHECKSUM, result.failureReason());
        assertTrue(result.variants().isEmpty());
    }

    @Test
    void invalidCurrentStateIsRejectedBeforeProcessing() {
        byte[] jpeg = jpegWithExif();

        MediaValidationException exception = assertThrows(
                MediaValidationException.class,
                () -> processingService(validEncoder()).process(
                        MediaProcessingState.READY,
                        request("image/jpeg", jpeg, sha256(jpeg))
                )
        );

        assertEquals(MediaFailureReason.STATE, exception.reason());
    }

    @Test
    void encoderFailureBecomesFailedAndNeverReady() {
        byte[] jpeg = jpegWithExif();
        MediaProcessingResult result = processingService((media, spec) -> {
            throw new MediaVariantProcessingException("encoder unavailable");
        }).process(
                MediaProcessingState.PROCESSING,
                request("image/jpeg", jpeg, sha256(jpeg))
        );

        assertEquals(MediaProcessingState.FAILED, result.state());
        assertEquals(MediaFailureReason.ENCODER, result.failureReason());
        assertTrue(result.variants().isEmpty());
    }

    @Test
    void variantOutsideConfiguredBoundsBecomesFailed() {
        byte[] jpeg = jpegWithExif();
        MediaProcessingResult result = processingService((media, spec) -> new MediaVariant(
                spec.name(),
                spec.outputMimeType(),
                spec.maxWidth() + 1,
                spec.maxHeight(),
                media.bytes().length,
                StorageVisibility.PUBLIC_VARIANT,
                media.bytes()
        )).process(
                MediaProcessingState.PENDING,
                request("image/jpeg", jpeg, sha256(jpeg))
        );

        assertEquals(MediaProcessingState.FAILED, result.state());
        assertEquals(MediaFailureReason.ENCODER, result.failureReason());
    }

    private static void assertReady(String mimeType, byte[] bytes) {
        MediaProcessingResult result = processingService(validEncoder()).process(
                MediaProcessingState.PENDING,
                request(mimeType, bytes, sha256(bytes))
        );

        assertEquals(MediaProcessingState.READY, result.state());
        assertEquals(4, result.variants().size());
    }

    private static MediaProcessingService processingService(MediaVariantEncoder encoder) {
        return new MediaProcessingService(
                new MediaCompletionValidator(StorageUploadPolicy.standard()),
                new MediaMetadataSanitizer(),
                encoder,
                VariantSpec.defaults()
        );
    }

    private static MediaVariantEncoder validEncoder() {
        return (media, spec) -> new MediaVariant(
                spec.name(),
                spec.outputMimeType(),
                spec.maxWidth(),
                spec.maxHeight(),
                Math.max(1, media.bytes().length),
                StorageVisibility.PUBLIC_VARIANT,
                media.bytes()
        );
    }

    private static MediaCompletionRequest request(
            String mimeType,
            byte[] bytes,
            String sha256
    ) {
        return new MediaCompletionRequest(ASSET_ID, mimeType, bytes.length, sha256, bytes);
    }

    private static byte[] jpegWithExif() {
        return new byte[]{
                (byte) 0xFF, (byte) 0xD8,
                (byte) 0xFF, (byte) 0xE1, 0x00, 0x0A,
                'E', 'x', 'i', 'f', 0x00, 0x00, 0x01, 0x02,
                (byte) 0xFF, (byte) 0xDA, 0x00, 0x02,
                (byte) 0xFF, (byte) 0xD9
        };
    }

    private static byte[] minimalPng() {
        return new byte[]{
                (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R',
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 'I', 'E', 'N', 'D',
                (byte) 0xAE, 0x42, 0x60, (byte) 0x82
        };
    }

    private static byte[] minimalWebp() {
        return new byte[]{'R', 'I', 'F', 'F', 0x04, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P'};
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(bytes)
            );
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new AssertionError(exception);
        }
    }
}
