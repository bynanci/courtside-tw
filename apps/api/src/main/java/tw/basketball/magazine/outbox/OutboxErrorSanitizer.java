package tw.basketball.magazine.outbox;

import java.util.regex.Pattern;

final class OutboxErrorSanitizer {
    private static final int MAX_ERROR_LENGTH = 4000;
    private static final Pattern SECRET_PATTERN = Pattern.compile(
            "(?i)((?:authorization|cookie|token|password|secret|signed[-_ ]?url)"
                    + "\\s*[\"']?\\s*[:=]\\s*[\"']?)"
                    + "([^\\r\\n,;}\\]]+?)(?=[\"']?(?:[\\r\\n,;}\\]]|$))"
    );
    private static final Pattern AUTHORIZATION_SCHEME_PATTERN = Pattern.compile(
            "(?i)\\b(?:bearer|basic)\\s+[A-Za-z0-9._~+/=-]{8,}"
    );

    private OutboxErrorSanitizer() {
    }

    static String sanitize(Throwable failure) {
        String type = failure.getClass().getSimpleName();
        String message = failure.getMessage();
        String raw = type + ": " + (message == null || message.isBlank() ? "failure" : message);
        String redacted = SECRET_PATTERN.matcher(raw).replaceAll("$1[REDACTED]");
        redacted = AUTHORIZATION_SCHEME_PATTERN.matcher(redacted).replaceAll("[REDACTED]");
        String normalized = redacted.codePoints()
                .map(codePoint -> Character.isISOControl(codePoint) ? ' ' : codePoint)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        return normalized.length() <= MAX_ERROR_LENGTH
                ? normalized
                : normalized.substring(0, MAX_ERROR_LENGTH);
    }
}
