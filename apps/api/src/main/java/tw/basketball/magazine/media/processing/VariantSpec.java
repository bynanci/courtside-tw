package tw.basketball.magazine.media.processing;

import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.media.storage.StorageVisibility;

/** Allowlisted public derivative dimensions and format. */
public record VariantSpec(
        String name,
        int maxWidth,
        int maxHeight,
        String outputMimeType,
        StorageVisibility visibility
) {
    public VariantSpec {
        name = requireText(name, "name");
        if (maxWidth < 1 || maxWidth > 4096 || maxHeight < 1 || maxHeight > 4096) {
            throw new IllegalArgumentException("variant dimensions are outside the configured bounds");
        }
        outputMimeType = requireText(outputMimeType, "outputMimeType");
        if (!outputMimeType.equals("image/avif")
                && !outputMimeType.equals("image/jpeg")
                && !outputMimeType.equals("image/png")
                && !outputMimeType.equals("image/webp")) {
            throw new IllegalArgumentException("variant MIME type is not allowlisted");
        }
        if (visibility != StorageVisibility.PUBLIC_VARIANT) {
            throw new IllegalArgumentException("variants must be public derivative objects");
        }
    }

    public static List<VariantSpec> defaults() {
        return List.of(
                new VariantSpec("cover", 1800, 1200, "image/webp", StorageVisibility.PUBLIC_VARIANT),
                new VariantSpec("hero", 1600, 1200, "image/avif", StorageVisibility.PUBLIC_VARIANT),
                new VariantSpec("wide", 1200, 800, "image/webp", StorageVisibility.PUBLIC_VARIANT),
                new VariantSpec("inline", 768, 512, "image/webp", StorageVisibility.PUBLIC_VARIANT),
                new VariantSpec("card", 480, 320, "image/webp", StorageVisibility.PUBLIC_VARIANT)
        );
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
