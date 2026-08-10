package tw.basketball.magazine.media.processing;

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
        byte[] encodedBytes
) {
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
    }

    @Override
    public byte[] encodedBytes() {
        return encodedBytes.clone();
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
