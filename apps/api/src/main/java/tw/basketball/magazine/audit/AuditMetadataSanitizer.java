package tw.basketball.magazine.audit;

import java.lang.reflect.Array;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Converts caller metadata into a bounded JSON-compatible object before it is
 * written to the audit table. Unknown object types are discarded rather than
 * invoking arbitrary toString implementations.
 */
final class AuditMetadataSanitizer {
    static final String REDACTED = "[REDACTED]";
    private static final String REDACTED_DEPTH = "[REDACTED_DEPTH]";
    private static final String REDACTED_UNSUPPORTED = "[REDACTED_UNSUPPORTED]";
    private static final String TRUNCATED = "[TRUNCATED]";
    private static final int MAX_DEPTH = 5;
    private static final int MAX_ENTRIES = 64;
    private static final int MAX_ITEMS = 64;
    private static final int MAX_KEY_LENGTH = 64;
    private static final int MAX_STRING_LENGTH = 1024;
    private static final Pattern AUTHORIZATION_SCHEME = Pattern.compile(
            "(?i)\\b(?:bearer|basic)\\s+[A-Za-z0-9._~+/=-]{8,}"
    );
    private static final Pattern JWT = Pattern.compile(
            "(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}(?![A-Za-z0-9_-])"
    );
    private static final Set<String> SENSITIVE_KEYS = Set.of(
            "access_token",
            "accesstoken",
            "article_body",
            "articlebody",
            "article_html",
            "articlehtml",
            "article_markdown",
            "articlemarkdown",
            "authorization",
            "body",
            "client_secret",
            "clientsecret",
            "content",
            "cookie",
            "email",
            "html",
            "id_token",
            "idtoken",
            "markdown",
            "password",
            "private_content",
            "privatecontent",
            "private_key",
            "privatekey",
            "private_media",
            "privatemedia",
            "private_storage_key",
            "privatestoragekey",
            "presigned_url",
            "presignedurl",
            "raw_content",
            "rawcontent",
            "refresh_token",
            "refreshtoken",
            "secret",
            "set_cookie",
            "setcookie",
            "signature",
            "signed_url",
            "signedurl",
            "storage_key",
            "storagekey",
            "token"
    );

    private AuditMetadataSanitizer() {
    }

    static Map<String, Object> sanitize(Map<String, ?> metadata) {
        Objects.requireNonNull(metadata, "metadata");
        return Collections.unmodifiableMap(sanitizeMap(metadata, 0));
    }

    static String sanitizeActorSubject(String subject) {
        Objects.requireNonNull(subject, "subject");
        String normalized = sanitizeString(subject);
        if (REDACTED.equals(normalized) || normalized.contains("@")) {
            return REDACTED;
        }
        return normalized;
    }

    private static Map<String, Object> sanitizeMap(Map<?, ?> metadata, int depth) {
        if (depth > MAX_DEPTH) {
            return Map.of("_redacted", REDACTED_DEPTH);
        }
        Map<String, Object> sanitized = new LinkedHashMap<>();
        int index = 0;
        for (Map.Entry<?, ?> entry : metadata.entrySet()) {
            if (index >= MAX_ENTRIES) {
                sanitized.put("_truncated", TRUNCATED);
                break;
            }
            String key = safeKey(entry.getKey(), index);
            Object value = isSensitiveKey(key)
                    ? REDACTED
                    : sanitizeValue(entry.getValue(), depth + 1);
            sanitized.put(key, value);
            index++;
        }
        return sanitized;
    }

    private static List<Object> sanitizeCollection(Collection<?> values, int depth) {
        List<Object> sanitized = new ArrayList<>();
        int index = 0;
        for (Object value : values) {
            if (index >= MAX_ITEMS) {
                sanitized.add(TRUNCATED);
                break;
            }
            sanitized.add(sanitizeValue(value, depth + 1));
            index++;
        }
        return Collections.unmodifiableList(sanitized);
    }

    private static List<Object> sanitizeArray(Object values, int depth) {
        int length = Array.getLength(values);
        List<Object> sanitized = new ArrayList<>();
        int limit = Math.min(length, MAX_ITEMS);
        for (int index = 0; index < limit; index++) {
            sanitized.add(sanitizeValue(Array.get(values, index), depth + 1));
        }
        if (length > MAX_ITEMS) {
            sanitized.add(TRUNCATED);
        }
        return Collections.unmodifiableList(sanitized);
    }

    private static Object sanitizeValue(Object value, int depth) {
        if (value == null) {
            return null;
        }
        if (depth > MAX_DEPTH) {
            return REDACTED_DEPTH;
        }
        if (value instanceof Map<?, ?> map) {
            return sanitizeMap(map, depth);
        }
        if (value instanceof Collection<?> collection) {
            return sanitizeCollection(collection, depth);
        }
        if (value.getClass().isArray()) {
            return sanitizeArray(value, depth);
        }
        if (value instanceof CharSequence text) {
            return sanitizeString(text.toString());
        }
        if (value instanceof Number number) {
            return sanitizeNumber(number);
        }
        if (value instanceof Boolean) {
            return value;
        }
        if (value instanceof Enum<?> enumeration) {
            return enumeration.name();
        }
        if (value instanceof UUID || value instanceof TemporalAccessor) {
            return value.toString();
        }
        return REDACTED_UNSUPPORTED;
    }

    private static Object sanitizeNumber(Number number) {
        if (number instanceof Double doubleValue && !Double.isFinite(doubleValue)) {
            return REDACTED_UNSUPPORTED;
        }
        if (number instanceof Float floatValue && !Float.isFinite(floatValue)) {
            return REDACTED_UNSUPPORTED;
        }
        return number;
    }

    private static String sanitizeString(String value) {
        String normalized = value.codePoints()
                .map(codePoint -> Character.isISOControl(codePoint) ? ' ' : codePoint)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        if (containsSignedUrl(normalized)
                || AUTHORIZATION_SCHEME.matcher(normalized).find()
                || JWT.matcher(normalized).find()) {
            return REDACTED;
        }
        if (normalized.length() <= MAX_STRING_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, MAX_STRING_LENGTH - TRUNCATED.length()) + TRUNCATED;
    }

    private static boolean containsSignedUrl(String value) {
        String lowerCase = value.toLowerCase(Locale.ROOT);
        boolean hasUrl = lowerCase.contains("http://") || lowerCase.contains("https://");
        boolean hasQuery = lowerCase.contains("?");
        boolean hasSignature = lowerCase.contains("x-amz-signature=")
                || lowerCase.contains("x-amz-credential=")
                || lowerCase.contains("x-amz-security-token=")
                || lowerCase.contains("signature=")
                || lowerCase.contains("sig=")
                || lowerCase.contains("token=");
        return hasUrl && hasQuery && hasSignature;
    }

    private static String safeKey(Object rawKey, int index) {
        if (rawKey == null) {
            return "field_" + index;
        }
        String key = rawKey.toString().strip();
        String normalized = key.codePoints()
                .map(codePoint -> Character.isISOControl(codePoint) ? -1 : codePoint)
                .filter(codePoint -> codePoint >= 0)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        if (normalized.isBlank()) {
            return "field_" + index;
        }
        return normalized.length() <= MAX_KEY_LENGTH
                ? normalized
                : normalized.substring(0, MAX_KEY_LENGTH);
    }

    private static boolean isSensitiveKey(String key) {
        String normalized = key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "");
        return SENSITIVE_KEYS.stream()
                .map(value -> value.replace("_", ""))
                .anyMatch(normalized::equals);
    }
}
