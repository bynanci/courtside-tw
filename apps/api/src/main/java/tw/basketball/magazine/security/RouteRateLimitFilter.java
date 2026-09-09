package tw.basketball.magazine.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectWriter;

import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Enforces distinct pre-authentication and authenticated route categories exactly once. */
public final class RouteRateLimitFilter extends OncePerRequestFilter {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final RouteRateLimiter limiter;
    private final ObjectWriter problemWriter;
    private final Stage stage;

    public RouteRateLimitFilter(RouteRateLimiter limiter, ObjectMapper objectMapper, Stage stage) {
        this.limiter = Objects.requireNonNull(limiter, "limiter");
        problemWriter = Objects.requireNonNull(objectMapper, "objectMapper").writerFor(ProblemDetails.class);
        this.stage = Objects.requireNonNull(stage, "stage");
    }

    @Override
    protected String getAlreadyFilteredAttributeName() {
        return getClass().getName() + "." + stage.name();
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        RouteRateLimitPolicy.Bucket bucket = RouteRateLimitPolicy.bucketForPath(path);
        boolean authenticationRoute = bucket == RouteRateLimitPolicy.Bucket.AUTHENTICATION;
        if (bucket == null || authenticationRoute != (stage == Stage.AUTHENTICATION)) {
            filterChain.doFilter(request, response);
            return;
        }
        RouteRateLimiter.Decision decision = limiter.acquire(bucket, identity(request));
        if (decision.allowed()) {
            filterChain.doFilter(request, response);
            return;
        }
        RequestId requestId = requestId(request, response);
        ProblemDetails problem = ProblemDetailsMapper.from(
                ProblemCode.RATE_LIMITED, safeInstance(path), requestId, List.of());
        response.setStatus(ProblemCode.RATE_LIMITED.status());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
        response.setHeader("Cache-Control", "no-store");
        response.setHeader(REQUEST_ID_HEADER, requestId.value());
        problemWriter.writeValue(response.getOutputStream(), problem);
    }

    private String identity(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (stage == Stage.APPLICATION && authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            if (authentication instanceof JwtAuthenticationToken jwt) {
                return digest("jwt", Objects.toString(jwt.getToken().getIssuer(), ""), authentication.getName());
            }
            return digest("principal", authentication.getClass().getName(), authentication.getName());
        }
        // Only the servlet peer address is accepted. Forwarded headers are not a trust boundary.
        return digest("peer", Objects.toString(request.getRemoteAddr(), "unknown"));
    }

    private static String digest(String... fields) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String field : fields) {
                byte[] value = field.getBytes(StandardCharsets.UTF_8);
                digest.update(Integer.toString(value.length).getBytes(StandardCharsets.US_ASCII));
                digest.update((byte) ':');
                digest.update(value);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Required SHA-256 digest is unavailable", exception);
        }
    }

    private static RequestId requestId(HttpServletRequest request, HttpServletResponse response) {
        String candidate = response.getHeader(REQUEST_ID_HEADER);
        if (candidate == null) {
            candidate = request.getHeader(REQUEST_ID_HEADER);
        }
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Generate a fresh correlation value instead of echoing untrusted input.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }

    private static String safeInstance(String path) {
        return path.isBlank() || path.length() > 2048 || path.codePoints().anyMatch(Character::isISOControl)
                ? "/api/v1" : path;
    }

    public enum Stage {
        AUTHENTICATION, APPLICATION
    }
}
