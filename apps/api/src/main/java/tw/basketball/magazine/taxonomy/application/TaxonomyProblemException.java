package tw.basketball.magazine.taxonomy.application;

import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;

/** Stable application error for taxonomy management. */
public final class TaxonomyProblemException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final ProblemCode problemCode;
    private final List<FieldError> errors;

    public TaxonomyProblemException(ProblemCode problemCode, List<FieldError> errors) {
        super(Objects.requireNonNull(problemCode, "problemCode").defaultDetail());
        this.problemCode = problemCode;
        this.errors = List.copyOf(Objects.requireNonNull(errors, "errors"));
    }

    public ProblemCode problemCode() {
        return problemCode;
    }

    public List<FieldError> errors() {
        return errors;
    }

    public static TaxonomyProblemException invalid(String path, String code, String message) {
        return new TaxonomyProblemException(
                ProblemCode.INVALID_REQUEST,
                List.of(new FieldError(path, code, message))
        );
    }

    public static TaxonomyProblemException forbidden() {
        return new TaxonomyProblemException(
                ProblemCode.FORBIDDEN,
                List.of(new FieldError("/role", "role_required", "EDITOR role is required"))
        );
    }

    public static TaxonomyProblemException notFound(String path) {
        return new TaxonomyProblemException(
                ProblemCode.RESOURCE_NOT_FOUND,
                List.of(new FieldError(path, "not_found", "taxonomy resource was not found"))
        );
    }
}
