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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** HTTP adapter for editor-owned media metadata and rights evidence. */
@RestController
@ConditionalOnBean(EditorialMediaMetadataService.class)
public final class EditorialMediaMetadataController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final EditorialMediaMetadataService service;

    public EditorialMediaMetadataController(EditorialMediaMetadataService service) {
        this.service = service;
    }

    @GetMapping(path = "/api/v1/editor/media/{assetId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getMetadata(
            @PathVariable String assetId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.get(actor(authentication, request), uuid(assetId)),
                requestId(request)
        );
    }

    @PatchMapping(
            path = "/api/v1/editor/media/{assetId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> updateMetadata(
            @PathVariable String assetId,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return response(
                service.update(
                        actor(authentication, request),
                        uuid(assetId),
                        Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                        body
                ),
                requestId(request)
        );
    }

    private static ResponseEntity<String> response(
            EditorialWorkflowService.OperationResult result,
            RequestId requestId
    ) {
        return ResponseEntity.status(result.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .eTag(new Version(result.version()).toIfMatch())
                .body(result.body());
    }

    private static ActorContext actor(Authentication authentication, HttpServletRequest request) {
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
                    // Unknown authorities never widen the editor boundary.
                }
            }
        });
        return ActorContext.user(authentication.getName(), roles, requestId(request));
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
                // Invalid correlation input is never echoed.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
