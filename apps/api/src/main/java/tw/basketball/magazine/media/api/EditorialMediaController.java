package tw.basketball.magazine.media.api;

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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.media.application.EditorialMediaService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** HTTP adapter for the signed, private-original media lifecycle. */
@RestController
@ConditionalOnBean(EditorialMediaService.class)
public final class EditorialMediaController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    private final EditorialMediaService service;

    public EditorialMediaController(EditorialMediaService service) {
        this.service = service;
    }

    @PostMapping(
            path = "/api/v1/editor/media/uploads",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> createUploadIntent(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.createUploadIntent(
                        actor(authentication, request),
                        request.getHeader(IDEMPOTENCY_HEADER),
                        body
                ),
                requestId(request)
        );
    }

    @PostMapping(
            path = "/api/v1/editor/media/{assetId}:complete",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> completeUpload(
            @PathVariable String assetId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.completeUpload(
                        actor(authentication, request),
                        uuid(assetId),
                        request.getHeader(IDEMPOTENCY_HEADER),
                        body
                ),
                requestId(request)
        );
    }

    private static ResponseEntity<String> response(
            EditorialMediaService.OperationResult result,
            RequestId requestId
    ) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value());
        if (result.version() > 0) {
            builder.eTag('"' + Long.toString(result.version()) + '"');
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
