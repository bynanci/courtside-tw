package tw.basketball.magazine.shared;

import java.util.Objects;

public record FieldError(String path, String code, String message) {
    public FieldError {
        path = bounded(path, "path", 200);
        code = bounded(code, "code", 80);
        message = bounded(message, "message", 500);
    }

    private static String bounded(String value, String name, int maximumLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximumLength || containsControlCharacter(value)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }

    private static boolean containsControlCharacter(String value) {
        return value.chars().anyMatch(character -> character < 0x20 || character == 0x7F);
    }
}
