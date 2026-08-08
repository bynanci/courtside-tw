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
        String value = rawValue.trim();
        if (value.equals("*") || value.startsWith("W/")) {
            throw new IllegalArgumentException("If-Match must be an exact version");
        }
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1);
        }
        if (value.isEmpty() || value.chars().anyMatch(character -> character < '0' || character > '9')) {
            throw new IllegalArgumentException("If-Match must contain a non-negative decimal version");
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
}
