package tw.basketball.magazine.taxonomy.api;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.VersionConflictException;
import tw.basketball.magazine.taxonomy.application.TaxonomyProblemException;

/** Stable RFC 9457 mapping for editor taxonomy failures. */
@RestControllerAdvice(assignableTypes = EditorialTaxonomyController.class)
public final class TaxonomyApiExceptionHandler {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    @ExceptionHandler(TaxonomyProblemException.class)
    public ResponseEntity<ProblemDetails> taxonomyProblem(
            TaxonomyProblemException exception,
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

    @ExceptionHandler(VersionConflictException.class)
    public ResponseEntity<ProblemDetails> versionConflict(
            VersionConflictException exception,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.fromVersionConflict(
                        exception,
                        request.getRequestURI(),
                        requestId
                ),
                requestId
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetails> invalidRequest(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.invalidRequest(
                        request.getRequestURI(),
                        requestId,
                        List.of(new FieldError("/", "invalid_request", exception.getMessage()))
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
                .body(problem);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is never reflected.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
