package tw.basketball.magazine.provenance.manifest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** RFC 8785 JCS for the closed, string-only manifest-v1 schema; never normalizes Unicode. */
public final class ManifestCanonicalizer {
    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final String DIGEST_PATTERN = "sha256:[0-9a-f]{64}";
    private static final Set<String> KEYS = Set.of("schemaVersion", "snapshotId", "publicationId", "revision",
            "publishedAt", "checksum", "rightsScope", "assets");

    public Receipt receipt(Map<String, Object> manifest) {
        validate(manifest);
        String canonical = canonical(manifest);
        byte[] hash = sha256(canonical.getBytes(StandardCharsets.UTF_8));
        return new Receipt(canonical, "sha256:" + HexFormat.of().formatHex(hash), rawCid(hash));
    }

    private static void validate(Map<String, Object> manifest) {
        if (!manifest.keySet().equals(KEYS) || !"1".equals(manifest.get("schemaVersion"))) {
            throw new IllegalArgumentException("unsupported manifest schema or fields");
        }
        text(manifest.get("snapshotId"), UUID_PATTERN);
        text(manifest.get("publicationId"), UUID_PATTERN);
        text(manifest.get("revision"), "[1-9][0-9]{0,18}");
        text(manifest.get("checksum"), DIGEST_PATTERN);
        String at = text(manifest.get("publishedAt"), "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z");
        Instant.parse(at);
        if (!Set.of("DIGEST_ONLY", "PERMANENT_PUBLIC").contains(manifest.get("rightsScope"))) {
            throw new IllegalArgumentException("explicit dissemination scope is required");
        }
        if (!(manifest.get("assets") instanceof List<?> assets) || assets.size() > 500) {
            throw new IllegalArgumentException("invalid assets");
        }
        Set<String> assetIds = new HashSet<>();
        for (Object value : assets) {
            if (!(value instanceof Map<?, ?> asset) || !asset.keySet().equals(Set.of("assetId", "digest"))) {
                throw new IllegalArgumentException("invalid asset fields");
            }
            if (!assetIds.add(text(asset.get("assetId"), UUID_PATTERN))) {
                throw new IllegalArgumentException("duplicate asset");
            }
            text(asset.get("digest"), DIGEST_PATTERN);
        }
    }

    private static String text(Object value, String pattern) {
        if (!(value instanceof String string) || !string.matches(pattern)) {
            throw new IllegalArgumentException("invalid manifest value");
        }
        for (int index = 0; index < string.length(); index++) {
            char current = string.charAt(index);
            if (Character.isHighSurrogate(current)) {
                if (++index >= string.length() || !Character.isLowSurrogate(string.charAt(index))) {
                    throw new IllegalArgumentException("unpaired surrogate");
                }
            } else if (Character.isLowSurrogate(current)) {
                throw new IllegalArgumentException("unpaired surrogate");
            }
        }
        return string;
    }

    private static String canonical(Object value) {
        if (value instanceof String string) {
            StringBuilder result = new StringBuilder("\"");
            for (int index = 0; index < string.length(); index++) {
                char character = string.charAt(index);
                switch (character) {
                    case '"' -> result.append("\\\"");
                    case '\\' -> result.append("\\\\");
                    case '\b' -> result.append("\\b");
                    case '\t' -> result.append("\\t");
                    case '\n' -> result.append("\\n");
                    case '\f' -> result.append("\\f");
                    case '\r' -> result.append("\\r");
                    default -> {
                        if (character < 0x20) {
                            result.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) character));
                        } else {
                            result.append(character);
                        }
                    }
                }
            }
            return result.append('"').toString();
        }
        if (value instanceof List<?> list) {
            return list.stream().map(ManifestCanonicalizer::canonical).collect(Collectors.joining(",", "[", "]"));
        }
        if (value instanceof Map<?, ?> map) {
            return map.keySet().stream().map(String.class::cast).sorted()
                    .map(key -> canonical(key) + ":" + canonical(map.get(key)))
                    .collect(Collectors.joining(",", "{", "}"));
        }
        throw new IllegalArgumentException("manifest-v1 does not permit numbers, null or arbitrary values");
    }

    public static byte[] sha256(byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 runtime unavailable", exception);
        }
    }

    public static String rawCid(byte[] hash) {
        if (hash.length != 32) {
            throw new IllegalArgumentException("CID requires a SHA-256 hash");
        }
        byte[] block = new byte[36];
        block[0] = 1; block[1] = 0x55; block[2] = 0x12; block[3] = 0x20;
        System.arraycopy(hash, 0, block, 4, hash.length);
        String alphabet = "abcdefghijklmnopqrstuvwxyz234567";
        StringBuilder output = new StringBuilder("b");
        int buffer = 0;
        int bits = 0;
        for (byte octet : block) {
            buffer = (buffer << 8) | (octet & 255);
            bits += 8;
            while (bits >= 5) {
                bits -= 5;
                output.append(alphabet.charAt((buffer >>> bits) & 31));
            }
        }
        if (bits > 0) {
            output.append(alphabet.charAt((buffer << (5 - bits)) & 31));
        }
        return output.toString();
    }

    public record Receipt(String canonical, String digest, String cid) { }
}
