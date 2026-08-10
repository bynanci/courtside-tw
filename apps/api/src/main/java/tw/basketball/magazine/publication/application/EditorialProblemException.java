package tw.basketball.magazine.publication.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;

/** Stable, non-sensitive application error for the editorial HTTP boundary. */
public final class EditorialProblemException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final ProblemCode problemCode;
    private final ArrayList<FieldError> errors;

    public EditorialProblemException(ProblemCode problemCode, List<FieldError> errors) {
        super(Objects.requireNonNull(problemCode, "problemCode").defaultDetail());
        this.problemCode = problemCode;
        this.errors = new ArrayList<>(Objects.requireNonNull(errors, "errors"));
    }

    public ProblemCode problemCode() {
        return problemCode;
    }

    public List<FieldError> errors() {
        return List.copyOf(errors);
    }

    public static EditorialProblemException invalid(
            String path,
            String code,
            String message
    ) {
        return new EditorialProblemException(
                ProblemCode.INVALID_REQUEST,
                List.of(new FieldError(path, code, message))
        );
    }

    public static EditorialProblemException forbidden(String path, String message) {
        return new EditorialProblemException(
                ProblemCode.FORBIDDEN,
                List.of(new FieldError(path, "role_required", message))
        );
    }

    public static EditorialProblemException notFound(String path, String message) {
        return new EditorialProblemException(
                ProblemCode.RESOURCE_NOT_FOUND,
                List.of(new FieldError(path, "not_found", message))
        );
    }

    public static EditorialProblemException gate(
            String path,
            String code,
            String message
    ) {
        return new EditorialProblemException(
                ProblemCode.RIGHTS_OR_CONTENT_GATE,
                List.of(new FieldError(path, code, message))
        );
    }
}
