package tw.basketball.magazine.media.processing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
        MediaCompletionRequest request = new MediaCompletionRequest(
                ASSET_ID,
                "image/jpeg",
                jpeg.length,
                sha256(jpeg),
                jpeg
        );
        MediaVariantEncoder encoder = (media, spec) -> new MediaVariant(
                spec.name(),
                spec.outputMimeType(),
                spec.maxWidth(),
                spec.maxHeight(),
                media.bytes().length,
                StorageVisibility.PUBLIC_VARIANT
        );

        MediaProcessingResult result = new MediaProcessingService(
                new MediaCompletionValidator(StorageUploadPolicy.standard()),
                new MediaMetadataSanitizer(),
                encoder,
                VariantSpec.defaults()
        ).process(MediaProcessingState.PENDING, request);

        assertEquals(MediaProcessingState.READY, result.state());
        assertEquals(4, result.variants().size());
        assertFalse(new String(result.sanitizedBytes(), StandardCharsets.ISO_8859_1).contains("Exif"));
    }

    @Test
    void invalidMagicBytesBecomeFailedAndNeverReady() {
        byte[] notJpeg = "not-an-image".getBytes(StandardCharsets.UTF_8);
        MediaCompletionRequest request = new MediaCompletionRequest(
                ASSET_ID,
                "image/jpeg",
                notJpeg.length,
                sha256(notJpeg),
                notJpeg
        );
        MediaProcessingResult result = new MediaProcessingService(
                new MediaCompletionValidator(StorageUploadPolicy.standard()),
                new MediaMetadataSanitizer(),
                (media, spec) -> new MediaVariant(
                        spec.name(),
                        spec.outputMimeType(),
                        spec.maxWidth(),
                        spec.maxHeight(),
                        media.bytes().length,
                        StorageVisibility.PUBLIC_VARIANT
                ),
                VariantSpec.defaults()
        ).process(MediaProcessingState.PENDING, request);

        assertEquals(MediaProcessingState.FAILED, result.state());
        assertEquals(MediaFailureReason.MAGIC_BYTES, result.failureReason());
        assertTrue(result.variants().isEmpty());
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
