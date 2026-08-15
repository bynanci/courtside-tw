package tw.basketball.magazine.identity.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;

/** Contract-safe account export and erasure failure. */
public final class AccountProblemException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final ProblemCode problemCode;
    private final ArrayList<FieldError> errors;

    public AccountProblemException(ProblemCode problemCode, List<FieldError> errors) {
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

    public static AccountProblemException invalid(String path, String code, String message) {
        return new AccountProblemException(
                ProblemCode.INVALID_REQUEST,
                List.of(new FieldError(path, code, message))
        );
    }

    public static AccountProblemException forbidden(String code, String message) {
        return new AccountProblemException(
                ProblemCode.FORBIDDEN,
                List.of(new FieldError("/", code, message))
        );
    }

    public static AccountProblemException conflict() {
        return new AccountProblemException(ProblemCode.VERSION_CONFLICT, List.of());
    }
}
