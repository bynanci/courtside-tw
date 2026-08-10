package tw.basketball.magazine.media.processing;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;

import tw.basketball.magazine.media.storage.StorageVisibility;

/** Result metadata and encoded bytes for one generated public derivative. */
public record MediaVariant(
        String name,
        String mimeType,
        int width,
        int height,
        long byteSize,
        StorageVisibility visibility,
        byte[] encodedBytes,
        String encodedSha256
) {
    public MediaVariant(
            String name,
            String mimeType,
            int width,
            int height,
            long byteSize,
            StorageVisibility visibility,
            byte[] encodedBytes
    ) {
        this(name, mimeType, width, height, byteSize, visibility, encodedBytes, checksum(encodedBytes));
    }

    public MediaVariant {
        name = requireText(name, "name");
        mimeType = requireText(mimeType, "mimeType");
        if (width < 1 || height < 1 || byteSize < 1) {
            throw new IllegalArgumentException("variant dimensions and byteSize must be positive");
        }
        visibility = Objects.requireNonNull(visibility, "visibility");
        encodedBytes = Objects.requireNonNull(encodedBytes, "encodedBytes").clone();
        if (encodedBytes.length == 0 || encodedBytes.length != byteSize) {
            throw new IllegalArgumentException("encodedBytes must be non-empty and match byteSize");
        }
        encodedSha256 = requireChecksum(encodedSha256);
    }

    @Override
    public byte[] encodedBytes() {
        return encodedBytes.clone();
    }

    private static String checksum(byte[] bytes) {
        Objects.requireNonNull(bytes, "encodedBytes");
        try {
            return java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(bytes)
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private static String requireChecksum(String value) {
        Objects.requireNonNull(value, "encodedSha256");
        if (!value.matches("^[0-9a-fA-F]{64}$")) {
            throw new IllegalArgumentException("encodedSha256 must be a SHA-256 hex digest");
        }
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip().toLowerCase(java.util.Locale.ROOT);
        if (normalized.isBlank() || normalized.length() > 96) {
            throw new IllegalArgumentException(field + " must be a bounded value");
        }
        return normalized;
    }
}
