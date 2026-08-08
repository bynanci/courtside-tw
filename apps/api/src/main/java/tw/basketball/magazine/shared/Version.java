package tw.basketball.magazine.shared;

import java.io.Serializable;

/** Immutable non-negative optimistic-lock version. */
public record Version(long value) implements Serializable {
    private static final long serialVersionUID = 1L;

    public Version {
        if (value < 0) {
            throw new IllegalArgumentException("version must be non-negative");
        }
    }

    public static Version initial() {
        return new Version(0);
    }

    public static Version parseIfMatch(String rawValue) {
        if (rawValue == null) {
            throw new IllegalArgumentException("If-Match is required");
        }
        String value = stripOptionalWhitespace(rawValue);
        if (value.equals("*") || value.startsWith("W/")) {
            throw new IllegalArgumentException("If-Match must be an exact version");
        }
        if (value.length() >= 2 && value.startsWith(""") && value.endsWith(""")) {
            value = value.substring(1, value.length() - 1);
        }
        if (value.isEmpty()
                || value.chars().anyMatch(character -> character < '0' || character > '9')
                || (value.length() > 1 && value.charAt(0) == '0')) {
            throw new IllegalArgumentException("If-Match must contain a canonical non-negative decimal version");
        }
        try {
            return new Version(Long.parseLong(value));
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("If-Match version is out of range", exception);
        }
    }

    public Version next() {
        try {
            return new Version(Math.addExact(value, 1));
        } catch (ArithmeticException exception) {
            throw new IllegalStateException("version cannot advance beyond the supported range", exception);
        }
    }

    public String toIfMatch() {
        return '"' + Long.toString(value) + '"';
    }

    private static String stripOptionalWhitespace(String rawValue) {
        if (rawValue.chars().anyMatch(character -> Character.isISOControl(character)
                && character != ' '
                && character != '\t')) {
            throw new IllegalArgumentException("If-Match contains unsupported control characters");
        }
        int start = 0;
        int end = rawValue.length();
        while (start < end && isOptionalWhitespace(rawValue.charAt(start))) {
            start++;
        }
        while (end > start && isOptionalWhitespace(rawValue.charAt(end - 1))) {
            end--;
        }
        return rawValue.substring(start, end);
    }

    private static boolean isOptionalWhitespace(char character) {
        return character == ' ' || character == '\t';
    }
}
