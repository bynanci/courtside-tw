package tw.basketball.magazine.publication.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** HTTP adapter for the Editorial article workflow. */
@RestController
public final class EditorialArticleController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    private final EditorialWorkflowService service;

    public EditorialArticleController(EditorialWorkflowService service) {
        this.service = service;
    }

    @PostMapping(path = "/api/v1/editor/articles", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> createArticle(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(service.createDraft(actor, idempotencyKey(request), body), requestId(request));
    }

    @PatchMapping(path = "/api/v1/editor/articles", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> patchArticle(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.patchDraft(
                        actor,
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @GetMapping(path = "/api/v1/editor/articles", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> listArticles(
            @RequestParam(defaultValue = "20") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.listEditorArticles(actor(authentication, request), limit),
                requestId(request)
        );
    }

    @GetMapping(path = "/api/v1/publisher/articles", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> listPublisherArticles(
            @RequestParam(defaultValue = "20") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.listPublisherArticles(actor(authentication, request), limit),
                requestId(request)
        );
    }

    @GetMapping(path = "/api/v1/publisher/articles/{articleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getPublisherArticle(
            @PathVariable String articleId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.getPublisherArticle(actor(authentication, request), uuid(articleId)),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/editor/articles/{articleId}:revise",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> createRevision(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.createRevision(
                        actor(authentication, request),
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/editor/articles/{articleId}:submit",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> submitArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.submit(
                        actor,
                        uuid(articleId),
                        null,
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(path = "/api/v1/publisher/articles/{articleId}:approve")
    public ResponseEntity<String> approveArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.approve(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/publisher/articles/{articleId}:request-changes",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> requestChanges(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.requestChanges(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/publisher/articles/{articleId}:schedule",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> scheduleArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.schedule(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(path = "/api/v1/publisher/articles/{articleId}:publish")
    public ResponseEntity<String> publishArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.publish(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/publisher/articles/{articleId}:withdraw",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> withdrawArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.withdraw(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(path = "/api/v1/publisher/articles/{articleId}:archive")
    public ResponseEntity<String> archiveArticle(
            @PathVariable String articleId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        return response(
                service.archive(
                        actor,
                        uuid(articleId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        idempotencyKey(request),
                        body
                ),
                requestId(request)
        );
    }

    private static ResponseEntity<String> response(
            EditorialWorkflowService.OperationResult result,
            RequestId requestId
    ) {
        MediaType contentType = result.statusCode() == ProblemCode.RIGHTS_OR_CONTENT_GATE.status()
                ? MediaType.APPLICATION_PROBLEM_JSON
                : MediaType.APPLICATION_JSON;
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.statusCode())
                .contentType(contentType)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value());
        if (result.version() > 0) {
            builder.eTag(new Version(result.version()).toIfMatch());
        }
        return builder.body(result.body());
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

    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid("/articleId", "UUID_INVALID", "value must be a UUID");
        }
    }

    private static String idempotencyKey(HttpServletRequest request) {
        return request.getHeader(IDEMPOTENCY_HEADER);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is not echoed.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
