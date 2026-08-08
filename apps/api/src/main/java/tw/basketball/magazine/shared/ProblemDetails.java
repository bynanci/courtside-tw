package tw.basketball.magazine.shared;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Objects;

/** RFC 9457-compatible JSON representation matching the v1 OpenAPI contract. */
public record ProblemDetails(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        String requestId,
        String code,
        @JsonInclude(JsonInclude.Include.NON_EMPTY) List<FieldError> errors
) {
    public ProblemDetails {
        type = bounded(type, "type", 2048);
        title = bounded(title, "title", 200);
        if (status < 400 || status > 599) {
            throw new IllegalArgumentException("problem status must be between 400 and 599");
        }
        detail = bounded(detail, "detail", 1000);
        instance = bounded(instance, "instance", 2048);
        requestId = Objects.requireNonNull(RequestId.of(requestId), "requestId").value();
        ProblemCode problemCode = ProblemCode.valueOf(bounded(code, "code", 80));
        if (!problemCode.type().equals(type)
                || !problemCode.title().equals(title)
                || problemCode.status() != status) {
            throw new IllegalArgumentException("problem metadata does not match its stable code");
        }
        errors = List.copyOf(Objects.requireNonNull(errors, "errors"));
        if (errors.size() > 100) {
            throw new IllegalArgumentException("problem errors cannot contain more than 100 items");
        }
    }

    private static String bounded(String value, String name, int maximumLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximumLength || containsControlCharacter(value)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }

    private static boolean containsControlCharacter(String value) {
        return value.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint));
    }
}
