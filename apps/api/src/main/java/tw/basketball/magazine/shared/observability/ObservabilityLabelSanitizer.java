package tw.basketball.magazine.shared.observability;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Keeps metric labels finite and independent from request or user content. */
final class ObservabilityLabelSanitizer {
    static final String UNKNOWN = "unknown";
    private static final int MAX_ALLOWED_VALUES = 100;
    private static final int MAX_VALUE_LENGTH = 96;

    private ObservabilityLabelSanitizer() {
    }

    static Set<String> boundedAllowlist(Set<String> values) {
        Objects.requireNonNull(values, "values");
        if (values.size() > MAX_ALLOWED_VALUES) {
            throw new IllegalArgumentException("observability allowlist is too large");
        }
        Set<String> bounded = new LinkedHashSet<>();
        for (String value : values) {
            String normalized = normalize(value);
            if (normalized == null) {
                throw new IllegalArgumentException("observability allowlist contains an invalid value");
            }
            bounded.add(normalized);
        }
        return Set.copyOf(bounded);
    }

    static String allowlisted(String value, Set<String> allowed) {
        String normalized = normalize(value);
        return normalized != null && allowed.contains(normalized) ? normalized : UNKNOWN;
    }

    static String safeMethod(String value) {
        String normalized = normalize(value);
        return normalized != null && Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
                .contains(normalized.toUpperCase(Locale.ROOT))
                ? normalized.toUpperCase(Locale.ROOT)
                : UNKNOWN;
    }

    static String statusBucket(int status) {
        if (status < 100 || status > 599) {
            return UNKNOWN;
        }
        return (status / 100) + "xx";
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.strip();
        if (normalized.isBlank()
                || normalized.length() > MAX_VALUE_LENGTH
                || normalized.codePoints().anyMatch(Character::isISOControl)) {
            return null;
        }
        return normalized;
    }
}
