package tw.basketball.magazine.media.api;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.identity.OidcRolePolicy;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.domain.PublicationWorkflowException;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/** HTTP adapter for signed media upload, completion and revocation. */
@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
public final class EditorialMediaController {
    private final ObjectProvider<EditorialWorkflowService> serviceProvider;
    private final EditorialWorkflowService fixedService;

    @Autowired
    public EditorialMediaController(ObjectProvider<EditorialWorkflowService> serviceProvider) {
        this.serviceProvider = Objects.requireNonNull(serviceProvider, "serviceProvider");
        this.fixedService = null;
    }

    EditorialMediaController(EditorialWorkflowService service) {
        this.serviceProvider = null;
        this.fixedService = Objects.requireNonNull(service, "service");
    }

    @PostMapping("/api/v1/editor/media/uploads")
    public ResponseEntity<EditorialWorkflowService.MediaUploadIntent> createUpload(
            @RequestBody MediaUploadInput input,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.status(201).body(service().createUploadIntent(
                input.filename(),
                input.contentType(),
                input.sizeBytes(),
                input.checksumSha256(),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/editor/media/{id}:complete")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> completeUpload(
            @PathVariable UUID id,
            @RequestBody MediaCompleteInput input,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.status(202).body(service().completeUpload(
                id,
                input.checksumSha256(),
                input.contentType(),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/publisher/media/{id}:revoke")
    public ResponseEntity<EditorialWorkflowService.RevokeImpactReport> revokeMedia(
            @PathVariable UUID id,
            @RequestBody RevokeInput input,
            @RequestHeader("If-Match") String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.PUBLISHER);
        return ResponseEntity.ok(service().revokeMedia(
                id,
                Version.parseIfMatch(ifMatch),
                input.reason(),
                actor,
                idempotencyKey
        ));
    }

    @ExceptionHandler(VersionConflictException.class)
    ResponseEntity<ProblemDetails> versionConflict(
            VersionConflictException exception,
            HttpServletRequest request
    ) {
        return problemResponse(ProblemDetailsMapper.fromVersionConflict(
                exception,
                request.getRequestURI(),
                requestId(request)
        ));
    }

    @ExceptionHandler(PublicationWorkflowException.class)
    ResponseEntity<ProblemDetails> workflowError(
            PublicationWorkflowException exception,
            HttpServletRequest request
    ) {
        return problemResponse(problem(
                exception.code().equals("ROLE_REQUIRED")
                        ? ProblemCode.FORBIDDEN
                        : ProblemCode.INVALID_REQUEST,
                exception.getMessage(),
                request
        ));
    }

    @ExceptionHandler(EditorialWorkflowService.ApiException.class)
    ResponseEntity<ProblemDetails> apiError(
            EditorialWorkflowService.ApiException exception,
            HttpServletRequest request
    ) {
        return problemResponse(problem(exception.code(), exception.getMessage(), request));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ProblemDetails> invalidArgument(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        return problemResponse(problem(ProblemCode.INVALID_REQUEST, exception.getMessage(), request));
    }

    private EditorialWorkflowService service() {
        if (fixedService != null) {
            return fixedService;
        }
        return Objects.requireNonNull(
                serviceProvider.getIfAvailable(),
                "editorial workflow requires a configured JDBC data source"
        );
    }

    private static String actor(HttpServletRequest request, RoleCode requiredRole) {
        Principal principal = request.getUserPrincipal();
        if (!(principal instanceof Authentication authentication)) {
            throw new EditorialWorkflowService.ApiException(
                    ProblemCode.AUTHENTICATION_REQUIRED,
                    "authentication is required"
            );
        }
        if (!OidcRolePolicy.allows(authentication.getAuthorities(), requiredRole)) {
            throw new EditorialWorkflowService.ApiException(
                    ProblemCode.FORBIDDEN,
                    "the requested media role is not granted"
            );
        }
        return authentication.getName();
    }

    private static ProblemDetails problem(ProblemCode code, String message, HttpServletRequest request) {
        String safeMessage = message == null || message.isBlank() ? code.defaultDetail() : message;
        return ProblemDetailsMapper.from(
                code,
                request.getRequestURI(),
                requestId(request),
                List.of(new FieldError("/request", code.name().toLowerCase(), safeMessage))
        );
    }

    private static ResponseEntity<ProblemDetails> problemResponse(ProblemDetails problem) {
        return ResponseEntity.status(problem.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String value = request.getHeader("X-Request-Id");
        try {
            return value == null || value.isBlank()
                    ? RequestId.of("req-" + UUID.randomUUID())
                    : RequestId.of(value);
        } catch (IllegalArgumentException exception) {
            return RequestId.of("req-" + UUID.randomUUID());
        }
    }

    public record MediaUploadInput(
            String filename,
            String contentType,
            long sizeBytes,
            String checksumSha256
    ) {
    }

    public record MediaCompleteInput(String checksumSha256, String contentType) {
    }

    public record RevokeInput(String reason) {
    }
}
