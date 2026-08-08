package tw.basketball.magazine.media.storage;

import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Bounded upload policy shared by every S3-compatible signer adapter. */
public record StorageUploadPolicy(
        Duration signedUrlTtl,
        long maximumBytes,
        Set<String> allowedMimeTypes
) {
    public static final long MAXIMUM_ORIGINAL_BYTES = 20L * 1024L * 1024L;
    private static final Duration MINIMUM_SIGNED_URL_TTL = Duration.ofSeconds(1);
    private static final Duration MAXIMUM_SIGNED_URL_TTL = Duration.ofMinutes(5);

    public StorageUploadPolicy {
        signedUrlTtl = Objects.requireNonNull(signedUrlTtl, "signedUrlTtl");
        if (signedUrlTtl.compareTo(MINIMUM_SIGNED_URL_TTL) < 0
                || signedUrlTtl.compareTo(MAXIMUM_SIGNED_URL_TTL) > 0) {
            throw new IllegalArgumentException("signedUrlTtl must be between 1 second and 5 minutes");
        }
        if (maximumBytes < 1 || maximumBytes > MAXIMUM_ORIGINAL_BYTES) {
            throw new IllegalArgumentException("maximumBytes must be between 1 byte and 20 MiB");
        }
        allowedMimeTypes = canonicalMimeTypes(allowedMimeTypes);
    }

    public static StorageUploadPolicy standard() {
        return new StorageUploadPolicy(
                Duration.ofMinutes(5),
                MAXIMUM_ORIGINAL_BYTES,
                Set.of("image/avif", "image/jpeg", "image/png", "image/webp")
        );
    }

    private static Set<String> canonicalMimeTypes(Set<String> values) {
        Objects.requireNonNull(values, "allowedMimeTypes");
        if (values.isEmpty() || values.size() > 16) {
            throw new IllegalArgumentException("allowedMimeTypes must contain 1 to 16 values");
        }
        Set<String> canonical = new LinkedHashSet<>();
        for (String value : values) {
            Objects.requireNonNull(value, "allowedMimeType");
            String normalized = value.strip().toLowerCase(Locale.ROOT);
            if (normalized.isBlank()
                    || normalized.length() > 128
                    || normalized.codePoints().anyMatch(Character::isISOControl)
                    || !normalized.matches("[a-z0-9.+-]+/[a-z0-9.+-]+")) {
                throw new IllegalArgumentException("allowed MIME types must be bounded MIME values");
            }
            canonical.add(normalized);
        }
        return Set.copyOf(canonical);
    }
}
