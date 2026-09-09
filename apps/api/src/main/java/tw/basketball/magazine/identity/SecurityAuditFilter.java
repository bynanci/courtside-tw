package tw.basketball.magazine.identity;

import java.io.IOException;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;

/** Manually registered security-chain filters; no servlet-container filter bean. */
public final class SecurityAuditFilter extends OncePerRequestFilter {
    public enum Stage { BOUNDARY, VERIFIED_IDENTITY }
    private final AuditWriter audit;
    private final VerifiedRoleAuditService observations;
    private final Stage stage;

    public SecurityAuditFilter(AuditWriter audit, VerifiedRoleAuditService observations, Stage stage) {
        this.audit = Objects.requireNonNull(audit, "audit");
        this.observations = observations;
        this.stage = Objects.requireNonNull(stage, "stage");
    }

    @Override
    protected String getAlreadyFilteredAttributeName() {
        return SecurityAuditFilter.class.getName() + "." + stage;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        RequestId requestId = requestId(request, response);
        if (stage == Stage.VERIFIED_IDENTITY) {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (observations != null && authentication instanceof JwtAuthenticationToken jwt && jwt.isAuthenticated()) {
                observations.observe(jwt, requestId);
            }
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest correlated = new HttpServletRequestWrapper(request) {
            @Override
            public String getHeader(String name) {
                return "X-Request-Id".equalsIgnoreCase(name) ? requestId.value() : super.getHeader(name);
            }

            @Override
            public java.util.Enumeration<String> getHeaders(String name) {
                return "X-Request-Id".equalsIgnoreCase(name)
                        ? java.util.Collections.enumeration(java.util.List.of(requestId.value())) : super.getHeaders(name);
            }

            @Override
            public java.util.Enumeration<String> getHeaderNames() {
                java.util.Set<String> names = new java.util.LinkedHashSet<>(java.util.Collections.list(super.getHeaderNames()));
                names.add("X-Request-Id");
                return java.util.Collections.enumeration(names);
            }
        };
        try {
            chain.doFilter(correlated, response);
        } finally {
            if (response.getStatus() == 401 || response.getStatus() == 403) {
                Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
                ActorContext actor = ActorContext.anonymous(requestId);
                if (authentication instanceof JwtAuthenticationToken jwt && jwt.isAuthenticated()
                        && jwt.getToken().getIssuer() != null && jwt.getToken().getSubject() != null) {
                    actor = ActorContext.user(VerifiedRoleAuditService.identityDigest(jwt), Set.of(), requestId);
                }
                audit.append(new AuditEventDraft(actor, "PERMISSION_DENIED", "SECURITY_BOUNDARY", null,
                        Map.of("status", response.getStatus(), "method", safeMethod(request.getMethod()),
                                "boundary", boundary(request.getRequestURI()))));
            }
        }
    }

    private static RequestId requestId(HttpServletRequest request, HttpServletResponse response) {
        Object stored = request.getAttribute(SecurityAuditFilter.class.getName() + ".requestId");
        if (stored instanceof RequestId id) {
            return id;
        }
        String candidate = request.getHeader("X-Request-Id");
        RequestId id = null;
        if (candidate != null) {
            try {
                id = RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Never echo invalid input.
            }
        }
        if (id == null) {
            id = RequestId.of("req-" + UUID.randomUUID());
        }
        request.setAttribute(SecurityAuditFilter.class.getName() + ".requestId", id);
        response.setHeader("X-Request-Id", id.value());
        return id;
    }

    private static String safeMethod(String method) {
        return Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS").contains(method) ? method : "OTHER";
    }

    private static String boundary(String uri) {
        if (uri != null) {
            for (String segment : new String[] {"editor", "publisher", "admin", "me", "public"}) {
                if (uri.equals("/api/v1/" + segment) || uri.startsWith("/api/v1/" + segment + "/")) {
                    return segment.equals("me") ? "READER" : segment.toUpperCase(java.util.Locale.ROOT);
                }
            }
        }
        return "OTHER";
    }
}
