package tw.basketball.magazine.media.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import tw.basketball.magazine.media.application.PrivateMediaPreviewService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** Private binary responses stay behind the normal role-authorized API/BFF boundary. */
@RestController
@ConditionalOnBean(PrivateMediaPreviewService.class)
public final class PrivateMediaPreviewController {
    private final PrivateMediaPreviewService service;

    public PrivateMediaPreviewController(PrivateMediaPreviewService service) {
        this.service = Objects.requireNonNull(service, "service");
    }

    @GetMapping(path = {"/api/v1/editor/media", "/api/v1/publisher/media"}, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PrivateMediaPreviewService.MediaPage> list(
            @RequestParam(defaultValue = "25") String limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "false") String archived,
            Authentication authentication, HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        ActorContext actor = actor(authentication, requestId);
        if (!"true".equals(archived) && !"false".equals(archived)) {
            throw EditorialProblemException.invalid("/archived", "ARCHIVED_INVALID", "archived must be true or false");
        }
        int pageLimit;
        UUID pageCursor;
        try {
            pageLimit = Integer.parseInt(limit);
            pageCursor = cursor == null ? null : UUID.fromString(cursor);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid("/pagination", "PAGINATION_INVALID", "pagination parameters are invalid");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Request-Id", requestId.value()).header("X-Content-Type-Options", "nosniff")
                .body(service.list(actor, pageLimit, pageCursor, Boolean.parseBoolean(archived)));
    }

    @GetMapping(path = {"/api/v1/editor/media/{assetId}/preview", "/api/v1/publisher/media/{assetId}/preview"})
    public ResponseEntity<byte[]> preview(
            @PathVariable String assetId, Authentication authentication, HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        ActorContext actor = actor(authentication, requestId);
        UUID id;
        try {
            id = UUID.fromString(assetId);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid("/assetId", "UUID_REQUIRED", "assetId must be a UUID");
        }
        PrivateMediaPreviewService.Preview preview = service.read(actor, id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(preview.mimeType()))
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Request-Id", requestId.value())
                .header("X-Content-Type-Options", "nosniff")
                .body(preview.bytes());
    }

    @ExceptionHandler(EditorialProblemException.class)
    public ResponseEntity<ProblemDetails> problem(EditorialProblemException exception, HttpServletRequest request) {
        RequestId requestId = requestId(request);
        ProblemDetails body = ProblemDetailsMapper.from(exception.problemCode(), request.getRequestURI(),
                requestId, exception.errors());
        return ResponseEntity.status(body.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Request-Id", requestId.value()).header("X-Content-Type-Options", "nosniff").body(body);
    }

    private static ActorContext actor(Authentication authentication, RequestId requestId) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        Set<RoleCode> roles = new LinkedHashSet<>();
        authentication.getAuthorities().forEach(authority -> {
            String name = authority.getAuthority();
            if (name != null && name.startsWith("ROLE_")) {
                try {
                    roles.add(RoleCode.valueOf(name.substring(5)));
                } catch (IllegalArgumentException ignored) {
                    // Unknown authorities cannot grant preview access.
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
                // Use a bounded correlation ID for malformed caller input.
            }
        }
        return RequestId.of(UUID.randomUUID().toString());
    }
}
