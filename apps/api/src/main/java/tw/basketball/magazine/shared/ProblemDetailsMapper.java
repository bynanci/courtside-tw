package tw.basketball.magazine.shared;

import java.util.List;
import java.util.Objects;

/** Builds only contract-approved, non-sensitive RFC 9457 problem responses. */
public final class ProblemDetailsMapper {
    private ProblemDetailsMapper() {
    }

    public static ProblemDetails from(
            ProblemCode code,
            String instance,
            RequestId requestId,
            List<FieldError> errors
    ) {
        Objects.requireNonNull(code, "code");
        return new ProblemDetails(
                code.type(),
                code.title(),
                code.status(),
                code.defaultDetail(),
                instance,
                Objects.requireNonNull(requestId, "requestId").value(),
                code.name(),
                errors == null ? List.of() : errors
        );
    }

    public static ProblemDetails fromVersionConflict(
            VersionConflictException exception,
            String instance,
            RequestId requestId
    ) {
        Objects.requireNonNull(exception, "exception");
        return from(
                ProblemCode.VERSION_CONFLICT,
                instance,
                requestId,
                List.of(FieldError.currentVersion(exception.current()))
        );
    }

    public static ProblemDetails invalidRequest(
            String instance,
            RequestId requestId,
            List<FieldError> errors
    ) {
        return from(ProblemCode.INVALID_REQUEST, instance, requestId, errors);
    }
}
