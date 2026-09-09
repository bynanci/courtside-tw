package tw.basketball.magazine.content.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tw.basketball.magazine.content.application.EditorialContributorService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** Editor-only contributor identities; archival preserves existing public credit. */
@RestController
@ConditionalOnBean(EditorialContributorService.class)
public final class EditorialContributorController {
    private static final String BASE = "/api/v1/editor/contributors";
    private final EditorialContributorService service;

    public EditorialContributorController(EditorialContributorService service) {
        this.service = service;
    }

    @GetMapping(BASE)
    public ResponseEntity<JsonNode> list(@RequestParam(required = false) String status,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.list(actor, status), actor.requestId());
    }

    @GetMapping(BASE + "/{contributorId}")
    public ResponseEntity<JsonNode> get(@PathVariable UUID contributorId,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.get(actor, contributorId), actor.requestId());
    }

    @PostMapping(path = BASE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> create(@RequestBody JsonNode body,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(201, service.create(actor, request.getHeader("Idempotency-Key"), body), actor.requestId());
    }

    @PatchMapping(path = BASE + "/{contributorId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> update(@PathVariable UUID contributorId, @RequestBody JsonNode body,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.update(actor, contributorId, Version.parseIfMatch(request.getHeader("If-Match")),
                request.getHeader("Idempotency-Key"), body, false), actor.requestId());
    }

    @PostMapping(path = BASE + "/{contributorId}:archive", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> archive(@PathVariable UUID contributorId, @RequestBody JsonNode body,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.update(actor, contributorId, Version.parseIfMatch(request.getHeader("If-Match")),
                request.getHeader("Idempotency-Key"), body, true), actor.requestId());
    }

    @GetMapping("/api/v1/editor/articles/{articleId}/revisions/{revisionId}/contributors")
    public ResponseEntity<JsonNode> credits(@PathVariable UUID articleId, @PathVariable UUID revisionId,
            Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.credits(actor, articleId, revisionId), actor.requestId());
    }

    @PutMapping(path = "/api/v1/editor/articles/{articleId}/revisions/{revisionId}/contributors", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> assign(@PathVariable UUID articleId, @PathVariable UUID revisionId,
            @RequestBody JsonNode body, Authentication authentication, HttpServletRequest request) {
        ActorContext actor = actor(authentication, request);
        return response(200, service.assign(actor, articleId, revisionId, Version.parseIfMatch(request.getHeader("If-Match")),
                request.getHeader("Idempotency-Key"), body), actor.requestId());
    }

    private static ResponseEntity<JsonNode> response(int status, JsonNode body, RequestId requestId) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore()).header("X-Request-Id", requestId.value());
        if (body.has("version")) {
            response.eTag(new Version(body.path("version").asLong()).toIfMatch());
        }
        return response.body(body);
    }

    private static ActorContext actor(Authentication authentication, HttpServletRequest request) {
        RequestId requestId = requestId(request);
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        Set<RoleCode> roles = new LinkedHashSet<>();
        authentication.getAuthorities().forEach(authority -> {
            for (RoleCode role : RoleCode.values()) {
                if (("ROLE_" + role.name()).equals(authority.getAuthority())) {
                    roles.add(role);
                }
            }
        });
        return ActorContext.user(authentication.getName(), roles, requestId);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String value = request.getHeader("X-Request-Id");
        if (value != null) {
            try {
                return RequestId.of(value);
            } catch (IllegalArgumentException ignored) {
                // Malformed caller input is never reflected.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
