package tw.basketball.magazine.taxonomy.api;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.taxonomy.application.TaxonomyProblemException;
import tw.basketball.magazine.taxonomy.application.TaxonomyService;
import tw.basketball.magazine.taxonomy.application.TaxonomyService.CreateAlias;
import tw.basketball.magazine.taxonomy.application.TaxonomyService.CreateTerm;
import tw.basketball.magazine.taxonomy.application.TaxonomyService.TaxonomyTerm;
import tw.basketball.magazine.taxonomy.application.TaxonomyService.UpdateTerm;

/** Editor-only taxonomy management keyed by UUID and immutable term key. */
@RestController
@ConditionalOnBean(TaxonomyService.class)
public final class EditorialTaxonomyController {
    private static final String BASE_PATH = "/api/v1/editor/taxonomy";
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String REQUEST_ID_ATTRIBUTE =
            EditorialTaxonomyController.class.getName() + ".requestId";

    private final TaxonomyService service;

    public EditorialTaxonomyController(TaxonomyService service) {
        this.service = service;
    }

    @GetMapping(path = BASE_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> list(
            @RequestParam(required = false) String kind,
            @RequestParam(required = false) String status,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        requireEditor(actor);
        return response(HttpStatus.OK, service.list(kind, status), null, requestId(request));
    }

    @PostMapping(
            path = BASE_PATH,
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> create(
            @RequestBody CreateTerm command,
            Authentication authentication,
            HttpServletRequest request
    ) {
        TaxonomyTerm term = service.create(actor(authentication, request), command);
        return response(HttpStatus.CREATED, term, term.version(), requestId(request));
    }

    @PatchMapping(
            path = BASE_PATH + "/{termId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> update(
            @PathVariable String termId,
            @RequestBody UpdateTerm command,
            Authentication authentication,
            HttpServletRequest request
    ) {
        TaxonomyTerm term = service.update(
                actor(authentication, request),
                uuid(termId),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                command
        );
        return response(HttpStatus.OK, term, term.version(), requestId(request));
    }

    @PostMapping(
            path = BASE_PATH + "/{termId}/aliases",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> addAlias(
            @PathVariable String termId,
            @RequestBody CreateAlias command,
            Authentication authentication,
            HttpServletRequest request
    ) {
        TaxonomyTerm term = service.addAlias(
                actor(authentication, request),
                uuid(termId),
                Version.parseIfMatch(request.getHeader(HttpHeaders.IF_MATCH)),
                command
        );
        return response(HttpStatus.CREATED, term, term.version(), requestId(request));
    }

    private static ResponseEntity<?> response(
            HttpStatus status,
            Object body,
            Long version,
            RequestId requestId
    ) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .header("X-Content-Type-Options", "nosniff");
        if (version != null) {
            builder.eTag(new Version(version).toIfMatch());
        }
        return builder.body(body);
    }

    private static ActorContext actor(Authentication authentication, HttpServletRequest request) {
        RequestId requestId = requestId(request);
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new TaxonomyProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        Set<RoleCode> roles = new LinkedHashSet<>();
        authentication.getAuthorities().forEach(authority -> {
            String value = authority.getAuthority();
            if (value != null && value.startsWith("ROLE_")) {
                try {
                    roles.add(RoleCode.valueOf(value.substring("ROLE_".length())));
                } catch (IllegalArgumentException ignored) {
                    // Unknown authorities never widen this boundary.
                }
            }
        });
        return ActorContext.user(authentication.getName(), roles, requestId);
    }

    private static void requireEditor(ActorContext actor) {
        if (!actor.hasRole(RoleCode.EDITOR)) {
            throw TaxonomyProblemException.forbidden();
        }
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
                // Invalid caller input is never reflected.
            }
        }
        RequestId generated = RequestId.of("req-" + UUID.randomUUID());
        request.setAttribute(REQUEST_ID_ATTRIBUTE, generated);
        return generated;
    }

    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw TaxonomyProblemException.invalid(
                    "/termId",
                    "taxonomy_id_invalid",
                    "termId must be a UUID"
            );
        }
    }
}
