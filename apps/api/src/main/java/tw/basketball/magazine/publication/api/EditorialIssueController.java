package tw.basketball.magazine.publication.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** HTTP adapter for issue draft CRUD. */
@RestController
@ConditionalOnBean(EditorialIssueService.class)
public final class EditorialIssueController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String REQUEST_ID_ATTRIBUTE = EditorialIssueController.class.getName() + ".requestId";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final EditorialIssueService service;

    public EditorialIssueController(EditorialIssueService service) {
        this.service = service;
    }

    @PostMapping(path = "/api/v1/editor/issues", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> createIssue(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(service.createIssue(
                actor(authentication, request), request.getHeader("Idempotency-Key"), body
        ), requestId(request));
    }

    @GetMapping(path = "/api/v1/editor/issues", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> listIssues(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.listIssues(actor(authentication, request), cursor, limit),
                requestId(request)
        );
    }

    @PatchMapping(path = "/api/v1/editor/issues", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> patchIssue(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(service.patchIssue(
                actor(authentication, request),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        ), requestId(request));
    }

    @PostMapping(path = "/api/v1/editor/issues/{issueId}:submit")
    public ResponseEntity<JsonNode> submitIssue(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(service.submitIssue(
                actor,
                uuid(issueId, "/id"),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        ), requestId(request));
    }

    @PostMapping(path = "/api/v1/publisher/issues/{issueId}:approve")
    public ResponseEntity<JsonNode> approveIssue(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(service.approveIssue(
                actor,
                uuid(issueId, "/id"),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        ), requestId(request));
    }

    @PostMapping(path = "/api/v1/publisher/issues/{issueId}:publish")
    public ResponseEntity<JsonNode> publishIssue(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(service.publishIssue(
                actor(authentication, request),
                uuid(issueId, "/id"),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        ), requestId(request));
    }

    @PostMapping(
            path = "/api/v1/publisher/issues/{issueId}:schedule",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> scheduleIssue(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(service.scheduleIssue(
                actor(authentication, request),
                uuid(issueId, "/id"),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        ), requestId(request));
    }

    @GetMapping(path = "/api/v1/editor/issues/{issueId}/sections", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> listSections(
            @PathVariable String issueId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.listSections(actor(authentication, request), uuid(issueId, "/issueId")),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/editor/issues/{issueId}/sections",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> createSection(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.createSection(
                        actor(authentication, request),
                        uuid(issueId, "/issueId"),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        request.getHeader("Idempotency-Key"),
                        body
                ),
                requestId(request)
        );
    }

    @PatchMapping(
            path = "/api/v1/editor/issues/{issueId}/sections",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> reorderSections(
            @PathVariable String issueId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.reorderSections(
                        actor(authentication, request),
                        uuid(issueId, "/issueId"),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        request.getHeader("Idempotency-Key"),
                        body
                ),
                requestId(request)
        );
    }

    @PatchMapping(
            path = "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> patchSection(
            @PathVariable String issueId,
            @PathVariable String sectionId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.patchSection(
                        actor(authentication, request),
                        uuid(issueId, "/issueId"),
                        uuid(sectionId, "/sectionId"),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        request.getHeader("Idempotency-Key"),
                        body
                ),
                requestId(request)
        );
    }

    @DeleteMapping(path = "/api/v1/editor/issues/{issueId}/sections/{sectionId}")
    public ResponseEntity<JsonNode> deleteSection(
            @PathVariable String issueId,
            @PathVariable String sectionId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.deleteSection(
                        actor(authentication, request),
                        uuid(issueId, "/issueId"),
                        uuid(sectionId, "/sectionId"),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        request.getHeader("Idempotency-Key")
                ),
                requestId(request)
        );
    }

    private static ResponseEntity<JsonNode> response(
            EditorialWorkflowService.OperationResult result,
            RequestId requestId
    ) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .header("X-Content-Type-Options", "nosniff");
        if (result.version() > 0) {
            builder.eTag(new Version(result.version()).toIfMatch());
        }
        return builder.body(json(result.body()));
    }

    private static JsonNode json(String body) {
        try {
            return OBJECT_MAPPER.readTree(body);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Editorial issue service returned invalid JSON", exception);
        }
    }

    private static ActorContext actor(Authentication authentication, HttpServletRequest request) {
        RequestId requestId = requestId(request);
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        Set<RoleCode> roles = new LinkedHashSet<>();
        authentication.getAuthorities().forEach(authority -> {
            String value = authority.getAuthority();
            if (value != null && value.startsWith("ROLE_")) {
                try {
                    roles.add(RoleCode.valueOf(value.substring("ROLE_".length())));
                } catch (IllegalArgumentException ignored) {
                    // Unknown authorities do not widen this boundary.
                }
            }
        });
        return ActorContext.user(authentication.getName(), roles, requestId);
    }

    private static RequestId requestId(HttpServletRequest request) {
        Object cached = request.getAttribute(REQUEST_ID_ATTRIBUTE);
        if (cached instanceof RequestId requestId) {
            return requestId;
        }
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                RequestId requestId = RequestId.of(candidate);
                request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
                return requestId;
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is not echoed.
            }
        }
        RequestId generated = RequestId.of("req-" + UUID.randomUUID());
        request.setAttribute(REQUEST_ID_ATTRIBUTE, generated);
        return generated;
    }

    private static UUID uuid(String value, String path) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid(path, "UUID_INVALID", "value must be a UUID");
        }
    }
}
