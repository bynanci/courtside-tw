package tw.basketball.magazine.publication.api;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.domain.PublicationWorkflowException;
import tw.basketball.magazine.media.api.EditorialMediaController;
import tw.basketball.magazine.media.api.EditorialMediaMetadataController;
import tw.basketball.magazine.media.api.PublisherMediaController;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.VersionConflictException;

/** Maps editorial failures to the stable RFC 9457 contract. */
@RestControllerAdvice(assignableTypes = {
    EditorialArticleController.class,
    EditorialMediaController.class,
    EditorialMediaMetadataController.class,
    EditorialIssueController.class,
    PublisherMediaController.class,
    EditorialAuditController.class
})
public final class EditorialApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    @ExceptionHandler(EditorialProblemException.class)
    public ResponseEntity<ProblemDetails> handleEditorialProblem(
            EditorialProblemException exception,
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
    public ResponseEntity<ProblemDetails> handleVersionConflict(
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

    @ExceptionHandler(PublicationWorkflowException.class)
    public ResponseEntity<ProblemDetails> handleWorkflowProblem(
            PublicationWorkflowException exception,
            HttpServletRequest request
    ) {
        ProblemCode problemCode = switch (exception.code()) {
            case "ROLE_REQUIRED" -> ProblemCode.FORBIDDEN;
            case "REVISION_CONFLICT", "INVALID_TRANSITION", "SCHEDULE_NOT_DUE" ->
                    ProblemCode.VERSION_CONFLICT;
            case "MEDIA_NOT_READY", "MEDIA_REVOKED", "RIGHTS_MISSING", "RIGHTS_EXPIRED",
                    "RIGHTS_REVOKED", "RIGHTS_WRONG_CHANNEL", "CONTENT_NOT_READY" ->
                    ProblemCode.RIGHTS_OR_CONTENT_GATE;
            default -> ProblemCode.INVALID_REQUEST;
        };
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.from(
                        problemCode,
                        request.getRequestURI(),
                        requestId,
                        List.of(new FieldError("/", exception.code(), exception.getMessage()))
                ),
                requestId
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetails> handleIllegalArgument(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return response(
                ProblemDetailsMapper.invalidRequest(
                        request.getRequestURI(),
                        requestId,
                        List.of(new FieldError("/", "INVALID_REQUEST", exception.getMessage()))
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
                // Invalid caller input is not echoed into logs or responses.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
