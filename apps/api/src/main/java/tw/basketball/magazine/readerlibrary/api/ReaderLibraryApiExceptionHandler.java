package tw.basketball.magazine.readerlibrary.api;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import tw.basketball.magazine.readerlibrary.application.ReaderLibraryProblemException;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Stable RFC 9457 mapping for the reader-library surface. */
@RestControllerAdvice(assignableTypes = ReaderLibraryController.class)
public final class ReaderLibraryApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    @ExceptionHandler(ReaderLibraryProblemException.class)
    public ResponseEntity<ProblemDetails> handleReaderLibraryProblem(
            ReaderLibraryProblemException exception,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.from(
                        exception.problemCode(),
                        request.getRequestURI(),
                        requestId,
                        exception.errors()
                ),
                requestId
        );
    }

    @ExceptionHandler({IllegalArgumentException.class, NullPointerException.class})
    public ResponseEntity<ProblemDetails> handleInvalidInput(
            RuntimeException exception,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.from(
                        ProblemCode.INVALID_REQUEST,
                        request.getRequestURI(),
                        requestId,
                        List.of(new FieldError(
                                "/",
                                "invalid_request",
                                "reader-library input is invalid"
                        ))
                ),
                requestId
        );
    }

    private static ResponseEntity<ProblemDetails> response(
            ProblemDetails problem,
            RequestId requestId
    ) {
        return ResponseEntity.status(problem.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .header("X-Content-Type-Options", "nosniff")
                .body(problem);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is not reflected.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
