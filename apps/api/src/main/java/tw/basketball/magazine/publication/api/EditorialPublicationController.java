package tw.basketball.magazine.publication.api;

import java.security.Principal;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

/** HTTP adapter for editor drafts and publisher publication commands. */
@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
public final class EditorialPublicationController {
    private final ObjectProvider<EditorialWorkflowService> serviceProvider;
    private final EditorialWorkflowService fixedService;

    @Autowired
    public EditorialPublicationController(ObjectProvider<EditorialWorkflowService> serviceProvider) {
        this.serviceProvider = Objects.requireNonNull(serviceProvider, "serviceProvider");
        this.fixedService = null;
    }

    EditorialPublicationController(EditorialWorkflowService service) {
        this.serviceProvider = null;
        this.fixedService = Objects.requireNonNull(service, "service");
    }

    @PostMapping("/api/v1/editor/issues")
    public ResponseEntity<EditorialWorkflowService.IssueDraft> createIssue(
            @RequestBody IssueInput input,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.status(201).body(service().createIssue(
                input.title(),
                input.slug(),
                input.description(),
                actor,
                idempotencyKey
        ));
    }

    @GetMapping("/api/v1/editor/issues")
    public ResponseEntity<EditorialPage<EditorialWorkflowService.IssueDraft>> listIssues(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String limit,
            HttpServletRequest request
    ) {
        actor(request, RoleCode.EDITOR);
        return ResponseEntity.ok(new EditorialPage<>(
                service().listIssues(),
                new PageMeta(null, 100)
        ));
    }

    @PatchMapping("/api/v1/editor/issues")
    public ResponseEntity<EditorialWorkflowService.IssueDraft> patchIssue(
            @RequestBody IssuePatch input,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.ok(service().patchIssue(
                input.issueId(),
                input.changes(),
                Version.parseIfMatch(ifMatch),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/editor/articles")
    public ResponseEntity<EditorialWorkflowService.ArticleDraft> createArticle(
            @RequestBody ArticleInput input,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.status(201).body(service().createArticle(
                input.title(),
                input.slug(),
                input.content(),
                actor,
                idempotencyKey
        ));
    }

    @GetMapping("/api/v1/editor/articles")
    public ResponseEntity<EditorialPage<EditorialWorkflowService.ArticleDraft>> listArticles(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String limit,
            HttpServletRequest request
    ) {
        actor(request, RoleCode.EDITOR);
        return ResponseEntity.ok(new EditorialPage<>(
                service().listArticles(),
                new PageMeta(null, 100)
        ));
    }

    @PatchMapping("/api/v1/editor/articles")
    public ResponseEntity<EditorialWorkflowService.ArticleDraft> patchArticle(
            @RequestBody ArticlePatch input,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return ResponseEntity.ok(service().patchArticle(
                input.articleId(),
                input.changes(),
                Version.parseIfMatch(ifMatch),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/editor/articles/{id}:submit")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> submitArticle(
            @PathVariable UUID id,
            @RequestBody SubmitRequest input,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.EDITOR);
        return workflowResponse(service().submitArticle(
                id,
                input.revisionId(),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/publisher/articles/{id}:approve")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> approveArticle(
            @PathVariable UUID id,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.PUBLISHER);
        return workflowResponse(service().approveArticle(
                id,
                Version.parseIfMatch(ifMatch),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/publisher/issues/{id}:publish")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> publishIssue(
            @PathVariable UUID id,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.PUBLISHER);
        return workflowResponse(service().publishIssue(
                id,
                Version.parseIfMatch(ifMatch),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/publisher/issues/{id}:schedule")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> scheduleIssue(
            @PathVariable UUID id,
            @RequestBody ScheduleRequest input,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.PUBLISHER);
        return workflowResponse(service().scheduleIssue(
                id,
                Version.parseIfMatch(ifMatch),
                input.publishAt(),
                input.timezone(),
                actor,
                idempotencyKey
        ));
    }

    @PostMapping("/api/v1/publisher/articles/{id}:withdraw")
    public ResponseEntity<EditorialWorkflowService.WorkflowResult> withdrawArticle(
            @PathVariable UUID id,
            @RequestBody WithdrawRequest input,
            @RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest request
    ) {
        String actor = actor(request, RoleCode.PUBLISHER);
        return workflowResponse(service().withdrawArticle(
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
        ProblemDetails problem = ProblemDetailsMapper.fromVersionConflict(
                exception,
                request.getRequestURI(),
                requestId(request)
        );
        return problemResponse(problem);
    }

    @ExceptionHandler(PublicationWorkflowException.class)
    ResponseEntity<ProblemDetails> workflowError(
            PublicationWorkflowException exception,
            HttpServletRequest request
    ) {
        ProblemCode code = switch (exception.code()) {
            case "ROLE_REQUIRED" -> ProblemCode.FORBIDDEN;
            case "SCHEDULE_NOT_DUE", "INVALID_TRANSITION" -> ProblemCode.VERSION_CONFLICT;
            case "CONTENT_NOT_READY", "RIGHTS_MISSING", "RIGHTS_EXPIRED", "RIGHTS_REVOKED",
                    "RIGHTS_WRONG_CHANNEL" -> ProblemCode.RIGHTS_OR_CONTENT_GATE;
            default -> ProblemCode.INVALID_REQUEST;
        };
        return problemResponse(problem(code, exception.getMessage(), request));
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

    private ResponseEntity<EditorialWorkflowService.WorkflowResult> workflowResponse(
            EditorialWorkflowService.WorkflowResult result
    ) {
        return ResponseEntity.status(result.status().equals("BLOCKED") ? 422 : 202).body(result);
    }

    private EditorialWorkflowService service() {
        EditorialWorkflowService service = fixedService;
        if (service != null) {
            return service;
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
                    "the requested editorial role is not granted"
            );
        }
        String subject = authentication.getName();
        if (subject == null || subject.isBlank()) {
            throw new EditorialWorkflowService.ApiException(
                    ProblemCode.AUTHENTICATION_REQUIRED,
                    "the authenticated subject is missing"
            );
        }
        return subject;
    }

    private static ProblemDetails problem(ProblemCode code, String message, HttpServletRequest request) {
        String safeMessage = message == null || message.isBlank() ? code.defaultDetail() : message;
        return ProblemDetailsMapper.from(
                code,
                request.getRequestURI(),
                requestId(request),
                List.of(new FieldError("/request", code.name().toLowerCase(Locale.ROOT), safeMessage))
        );
    }

    private static ResponseEntity<ProblemDetails> problemResponse(ProblemDetails problem) {
        return ResponseEntity.status(problem.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String value = request.getHeader("X-Request-Id");
        if (value == null || value.isBlank()) {
            return RequestId.of("req-" + UUID.randomUUID());
        }
        try {
            return RequestId.of(value);
        } catch (IllegalArgumentException exception) {
            return RequestId.of("req-" + UUID.randomUUID());
        }
    }

    public record IssueInput(String title, String slug, String description) {
    }

    public record IssuePatch(UUID issueId, Map<String, Object> changes) {
        public IssuePatch {
            changes = immutableMap(changes);
        }
    }

    public record ArticleInput(String title, String slug, Map<String, Object> content) {
        public ArticleInput {
            content = content == null ? null : immutableMap(content);
        }
    }

    public record ArticlePatch(UUID articleId, Map<String, Object> changes) {
        public ArticlePatch {
            changes = immutableMap(changes);
        }
    }

    public record SubmitRequest(UUID revisionId) {
    }

    public record ScheduleRequest(Instant publishAt, String timezone) {
    }

    public record WithdrawRequest(String reason) {
    }

    public record EditorialPage<T>(List<T> items, PageMeta page) {
        public EditorialPage {
            items = List.copyOf(items);
            page = Objects.requireNonNull(page, "page");
        }
    }

    public record PageMeta(String nextCursor, int limit) {
    }

    private static Map<String, Object> immutableMap(Map<String, Object> value) {
        return Collections.unmodifiableMap(new HashMap<>(Objects.requireNonNull(value, "value")));
    }
}
