package tw.basketball.magazine.media.processing;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Objects;

import tw.basketball.magazine.media.storage.StorageUploadPolicy;

/** Re-checks upload claims against bytes fetched from private storage. */
public final class MediaCompletionValidator {
    private static final byte[] PNG_SIGNATURE = {
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    };

    private final StorageUploadPolicy policy;

    public MediaCompletionValidator(StorageUploadPolicy policy) {
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public ValidatedMedia validate(MediaCompletionRequest request) {
        Objects.requireNonNull(request, "request");
        byte[] bytes = request.bytes();
        if (bytes.length == 0) {
            throw failure(MediaFailureReason.EMPTY_CONTENT, "media content is empty");
        }
        if (request.declaredBytes() != bytes.length || bytes.length > policy.maximumBytes()) {
            throw failure(MediaFailureReason.SIZE, "media byte count is outside the signed contract");
        }
        String mimeType = request.declaredMimeType().strip().toLowerCase(Locale.ROOT);
        if (!policy.allowedMimeTypes().contains(mimeType)) {
            throw failure(MediaFailureReason.MIME, "media MIME type is not allowlisted");
        }
        if (!magicBytesMatch(mimeType, bytes)) {
            throw failure(MediaFailureReason.MAGIC_BYTES, "media magic bytes do not match MIME type");
        }
        String actualSha256 = sha256(bytes);
        String expectedSha256 = request.expectedSha256().strip().toLowerCase(Locale.ROOT);
        if (!expectedSha256.matches("[0-9a-f]{64}")
                || !MessageDigest.isEqual(
                        actualSha256.getBytes(StandardCharsets.US_ASCII),
                        expectedSha256.getBytes(StandardCharsets.US_ASCII)
                )) {
            throw failure(MediaFailureReason.CHECKSUM, "media checksum does not match completion claim");
        }
        return new ValidatedMedia(request.assetId(), mimeType, actualSha256, bytes);
    }

    private static boolean magicBytesMatch(String mimeType, byte[] bytes) {
        return switch (mimeType) {
            case "image/jpeg" -> bytes.length >= 3
                    && unsigned(bytes[0]) == 0xFF
                    && unsigned(bytes[1]) == 0xD8
                    && unsigned(bytes[2]) == 0xFF;
            case "image/png" -> startsWith(bytes, PNG_SIGNATURE);
            case "image/webp" -> bytes.length >= 12
                    && ascii(bytes, 0, 4, "RIFF")
                    && ascii(bytes, 8, 4, "WEBP");
            case "image/avif" -> bytes.length >= 12
                    && ascii(bytes, 4, 4, "ftyp")
                    && (ascii(bytes, 8, 4, "avif") || ascii(bytes, 8, 4, "avis"));
            default -> false;
        };
    }

    private static boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private static boolean ascii(byte[] value, int offset, int length, String expected) {
        if (value.length < offset + length) {
            return false;
        }
        for (int index = 0; index < length; index++) {
            if (value[offset + index] != (byte) expected.charAt(index)) {
                return false;
            }
        }
        return true;
    }

    private static int unsigned(byte value) {
        return value & 0xFF;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private static MediaValidationException failure(MediaFailureReason reason, String message) {
        return new MediaValidationException(reason, message);
    }
}
