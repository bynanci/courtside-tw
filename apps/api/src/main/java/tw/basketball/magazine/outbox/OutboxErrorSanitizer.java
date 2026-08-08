package tw.basketball.magazine.outbox;

import java.util.regex.Pattern;

final class OutboxErrorSanitizer {
    private static final int MAX_ERROR_LENGTH = 4000;
    private static final Pattern SECRET_PATTERN = Pattern.compile(
            "(?i)(authorization|cookie|token|password|secret|signed[-_ ]?url)"
                    + "(\\s*[=:]\\s*)[^\\r\\n,;]+"
    );

    private OutboxErrorSanitizer() {
    }

    static String sanitize(Throwable failure) {
        String type = failure.getClass().getSimpleName();
        String message = failure.getMessage();
        String raw = type + ": " + (message == null || message.isBlank() ? "failure" : message);
        String normalized = raw.codePoints()
                .map(codePoint -> Character.isISOControl(codePoint) ? ' ' : codePoint)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        String redacted = SECRET_PATTERN.matcher(normalized).replaceAll("$1$2[REDACTED]");
        return redacted.length() <= MAX_ERROR_LENGTH
                ? redacted
                : redacted.substring(0, MAX_ERROR_LENGTH);
    }
}
