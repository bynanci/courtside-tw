package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

final class SecurityBoundaryTest {
    @Test
    void emitsSecurityHeadersWithoutUnsafeScriptOrRemoteCodeDirectives() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSecure(true);
        MockHttpServletResponse response = new MockHttpServletResponse();

        new SecurityHeadersFilter().doFilter(request, response, (ignoredRequest, ignoredResponse) -> {
        });

        assertEquals(SecurityBoundaryPolicy.CONTENT_SECURITY_POLICY, response.getHeader(
                "Content-Security-Policy"
        ));
        assertEquals("DENY", response.getHeader("X-Frame-Options"));
        assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
        assertEquals("no-referrer", response.getHeader("Referrer-Policy"));
        assertEquals(
                "max-age=31536000; includeSubDomains",
                response.getHeader("Strict-Transport-Security")
        );
        assertFalse(SecurityBoundaryPolicy.CONTENT_SECURITY_POLICY.contains("unsafe-inline"));
        assertFalse(SecurityBoundaryPolicy.CONTENT_SECURITY_POLICY.contains("unsafe-eval"));
    }

    @Test
    void rejectsOversizedRequestContentBeforeApplicationChain() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContentLengthLong(SecurityBoundaryPolicy.MAX_REQUEST_BODY_BYTES + 1);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reachedChain = new AtomicBoolean();

        new RequestPayloadLimitFilter().doFilter(request, response, (ignoredRequest, ignoredResponse) ->
                reachedChain.set(true)
        );

        assertEquals(413, response.getStatus());
        assertFalse(reachedChain.get());
    }

    @Test
    void keepsRateLimitsRouteSpecificAndIgnoresQueryContent() {
        assertEquals(
                10,
                RouteRateLimitPolicy.forPath("/api/v1/auth/siwe/challenge?wallet=ignored")
                        .maximumRequests()
        );
        assertEquals(
                20,
                RouteRateLimitPolicy.forPath("/api/v1/editor/media/uploads").maximumRequests()
        );
        assertEquals(
                120,
                RouteRateLimitPolicy.forPath("/api/v1/public/issues").maximumRequests()
        );
        assertTrue(
                RouteRateLimitPolicy.forPath("/api/v1/public/issues").window()
                        .compareTo(java.time.Duration.ofMinutes(1)) == 0
        );
    }
}
