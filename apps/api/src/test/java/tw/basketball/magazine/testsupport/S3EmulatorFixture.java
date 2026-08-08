package tw.basketball.magazine.testsupport;

import java.net.URI;
import java.util.Objects;
import java.util.UUID;

/** S3 emulator contract used by tests; originals remain private by construction. */
public record S3EmulatorFixture(
        URI endpoint,
        String bucket,
        String privateOriginalPrefix,
        String publicVariantPrefix
) {
    public S3EmulatorFixture {
        endpoint = Objects.requireNonNull(endpoint, "endpoint");
        bucket = requireText(bucket, "bucket");
        privateOriginalPrefix = requirePrefix(privateOriginalPrefix, "media/originals/");
        publicVariantPrefix = requirePrefix(publicVariantPrefix, "media/variants/");
        if (privateOriginalPrefix.equals(publicVariantPrefix)) {
            throw new IllegalArgumentException("original and variant prefixes must differ");
        }
    }

    public static S3EmulatorFixture local() {
        return new S3EmulatorFixture(
                URI.create("http://127.0.0.1:9090"),
                "courtside-test",
                "media/originals/",
                "media/variants/"
        );
    }

    public String originalKey(UUID assetId, UUID uploadId) {
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(uploadId, "uploadId");
        return privateOriginalPrefix + assetId + "/" + uploadId;
    }

    public String variantKey(UUID assetId, String variant) {
        Objects.requireNonNull(assetId, "assetId");
        String normalizedVariant = requireText(variant, "variant");
        return publicVariantPrefix + assetId + "/" + normalizedVariant;
    }

    private static String requirePrefix(String value, String expectedPrefix) {
        String normalized = requireText(value, "prefix");
        if (!normalized.endsWith("/") || !normalized.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException("fixture prefix is outside its contract");
        }
        return normalized;
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > 256) {
            throw new IllegalArgumentException(field + " must be a bounded value");
        }
        return normalized;
    }
}
