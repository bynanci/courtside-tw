package tw.basketball.magazine.media.api;

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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.media.application.PublisherMediaService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** HTTP adapter for publisher-only media withdrawal. */
@RestController
@ConditionalOnBean(PublisherMediaService.class)
public final class PublisherMediaController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final PublisherMediaService service;

    public PublisherMediaController(PublisherMediaService service) {
        this.service = service;
    }

    @PostMapping(
            path = "/api/v1/publisher/media/{assetId}:revoke",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> revoke(
            @PathVariable String assetId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        EditorialWorkflowService.OperationResult result = service.revoke(
                actor(authentication, request),
                uuid(assetId),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                request.getHeader("Idempotency-Key"),
                body
        );
        return ResponseEntity.status(result.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId(request).value())
                .eTag(new Version(result.version()).toIfMatch())
                .body(result.body());
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
            throw EditorialProblemException.invalid("/id", "UUID_INVALID", "value must be a UUID");
        }
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
