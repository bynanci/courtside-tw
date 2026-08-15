package tw.basketball.magazine.readerlibrary.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;

/** Contract-safe reader-library failure. */
public final class ReaderLibraryProblemException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final ProblemCode problemCode;
    private final ArrayList<FieldError> errors;

    public ReaderLibraryProblemException(ProblemCode problemCode, List<FieldError> errors) {
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

    public static ReaderLibraryProblemException invalid(
            String path,
            String code,
            String message
    ) {
        return new ReaderLibraryProblemException(
                ProblemCode.INVALID_REQUEST,
                List.of(new FieldError(path, code, message))
        );
    }

    public static ReaderLibraryProblemException notFound() {
        return new ReaderLibraryProblemException(ProblemCode.RESOURCE_NOT_FOUND, List.of());
    }

    public static ReaderLibraryProblemException conflict(
            String path,
            String code,
            String message
    ) {
        return new ReaderLibraryProblemException(
                ProblemCode.VERSION_CONFLICT,
                List.of(new FieldError(path, code, message))
        );
    }

    public static ReaderLibraryProblemException unavailable() {
        return new ReaderLibraryProblemException(
                ProblemCode.RIGHTS_OR_CONTENT_GATE,
                List.of(new FieldError(
                        "/articleId",
                        "article_unavailable",
                        "article is not available to the reader library"
                ))
        );
    }
}
