package tw.basketball.magazine.fanpassport.recap;

import java.util.List;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

@RestController
public final class SeasonRecapController {
    private final ObjectProvider<SeasonRecapApplication> application;

    public SeasonRecapController(ObjectProvider<SeasonRecapApplication> application) {
        this.application = application;
    }

    @PostMapping(path = "/api/v1/publisher/season-recaps", consumes = "application/json", produces = "application/json")
    public ResponseEntity<?> generate(@RequestBody SeasonRecapApplication.Generate input, Authentication authentication,
            HttpServletRequest request) {
        if (!oidc(authentication)) {
            return problem(ProblemCode.AUTHENTICATION_REQUIRED, "authentication_required", request);
        }
        if (authentication.getAuthorities().stream().noneMatch(a -> "ROLE_PUBLISHER".equals(a.getAuthority()))) {
            return problem(ProblemCode.FORBIDDEN, "publisher_required", request);
        }
        return response(200, service().generate(input), request);
    }

    @GetMapping("/api/v1/public/seasons/{seasonId}/recaps/{projectionId}")
    public ResponseEntity<?> published(@PathVariable UUID seasonId, @PathVariable UUID projectionId,
            HttpServletRequest request) {
        var published = service().published(seasonId, projectionId);
        if (published.isEmpty()) {
            return problem(ProblemCode.RESOURCE_NOT_FOUND, "recap_unavailable", request);
        }
        return response(200, published.get(), request);
    }

    @GetMapping("/api/v1/me/seasons/{seasonId}/recaps/{projectionId}")
    public ResponseEntity<?> privateRecap(@PathVariable UUID seasonId, @PathVariable UUID projectionId,
            Authentication authentication, HttpServletRequest request) {
        if (!oidc(authentication)) {
            return problem(ProblemCode.AUTHENTICATION_REQUIRED, "authentication_required", request);
        }
        if (authentication.getAuthorities().stream().noneMatch(a -> "ROLE_READER".equals(a.getAuthority()))) {
            return problem(ProblemCode.FORBIDDEN, "reader_required", request);
        }
        // No owner-scoped projections exist. An OIDC login/stamp never authorizes another reader's history.
        return problem(ProblemCode.RESOURCE_NOT_FOUND, "recap_unavailable", request);
    }

    @ExceptionHandler({IllegalArgumentException.class, NullPointerException.class})
    public ResponseEntity<?> invalidInput(HttpServletRequest request) {
        return problem(ProblemCode.RIGHTS_OR_CONTENT_GATE, "recap_evidence_or_rights_unavailable", request);
    }

    private SeasonRecapApplication service() {
        SeasonRecapApplication service = application.getIfAvailable();
        if (service == null) {
            throw JdbcSeasonRecapSource.unavailable();
        }
        return service;
    }

    private static boolean oidc(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            return false;
        }
        String subject = jwt.getSubject();
        return subject != null && !subject.isBlank() && jwt.getClaimAsString("iss") != null;
    }

    private static ResponseEntity<?> response(int status, Object body, HttpServletRequest request) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("X-Request-Id", requestId(request).value())
                .header("Vary", "Authorization").header("X-Content-Type-Options", "nosniff").body(body);
    }

    private static ResponseEntity<?> problem(ProblemCode code, String errorCode, HttpServletRequest request) {
        RequestId id = requestId(request);
        return ResponseEntity.status(code.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore()).header("X-Request-Id", id.value())
                .header("Vary", "Authorization").header("X-Content-Type-Options", "nosniff")
                .body(ProblemDetailsMapper.from(code, request.getRequestURI(), id,
                        List.of(new FieldError("/", errorCode, "recap request is unavailable or unauthorized"))));
    }

    private static RequestId requestId(HttpServletRequest request) {
        String value = request.getHeader("X-Request-Id");
        if (value != null) {
            try {
                return RequestId.of(value);
            } catch (IllegalArgumentException ignored) {
                // Do not reflect malformed caller input.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
