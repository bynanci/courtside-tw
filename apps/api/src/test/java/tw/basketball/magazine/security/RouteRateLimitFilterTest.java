package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

final class RouteRateLimitFilterTest {
    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void appliesRouteCategoriesToQueryAndNestedUploadPaths() {
        assertEquals(RouteRateLimitPolicy.Bucket.SEARCH,
                RouteRateLimitPolicy.bucketForPath("/api/v1/public/search?query=anything"));
        assertEquals(RouteRateLimitPolicy.Bucket.MEDIA_UPLOAD,
                RouteRateLimitPolicy.bucketForPath("/api/v1/editor/media/uploads/intent"));
        assertEquals(RouteRateLimitPolicy.Bucket.BACKOFFICE,
                RouteRateLimitPolicy.bucketForPath("/api/v1/editor/media/uploads-other"));
        assertEquals(RouteRateLimitPolicy.Bucket.AUTHENTICATION,
                RouteRateLimitPolicy.bucketForPath("/api/v1/auth/siwe/verify"));
    }

    @Test
    void refusesSpoofedForwardedAddressesAndNeverEchoesThemInTheProblem() throws Exception {
        RouteRateLimitFilter filter = filter(RouteRateLimitFilter.Stage.AUTHENTICATION);
        for (int request = 0; request < 10; request++) {
            assertEquals(200, perform(filter, "/api/v1/auth/siwe/challenge", "192.0.2.1", "198.51.100." + request)
                    .getStatus());
        }
        MockHttpServletResponse denied = perform(filter, "/api/v1/auth/siwe/verify", "192.0.2.1", "203.0.113.100");
        assertEquals(429, denied.getStatus());
        assertEquals("application/problem+json", denied.getContentType().split(";", 2)[0]);
        long retryAfter = Long.parseLong(denied.getHeader("Retry-After"));
        assertTrue(retryAfter >= 1 && retryAfter <= 60);
        assertEquals("no-store", denied.getHeader("Cache-Control"));
        var problem = new ObjectMapper().readTree(denied.getContentAsString());
        assertEquals("RATE_LIMITED", problem.path("code").asString());
        assertEquals(denied.getHeader("X-Request-Id"), problem.path("requestId").asString());
        assertFalse(denied.getContentAsString().contains("203.0.113.100"));
        assertEquals(200, perform(filter, "/api/v1/auth/siwe/challenge", "192.0.2.2", "203.0.113.100").getStatus());
    }

    @Test
    void separatesVerifiedActorsFromRemoteAnonymousKeysAndIgnoresUnauthenticatedNames() throws Exception {
        RouteRateLimitFilter filter = filter(RouteRateLimitFilter.Stage.APPLICATION);
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("reader-a", "unused", List.of()));
        for (int request = 0; request < 30; request++) {
            assertEquals(200, perform(filter, "/api/v1/me/bookmarks", "192.0.2.1", null).getStatus());
        }
        assertEquals(429, perform(filter, "/api/v1/me/preferences", "192.0.2.2", null).getStatus());
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("reader-b", "unused", List.of()));
        assertEquals(200, perform(filter, "/api/v1/me/bookmarks", "192.0.2.1", null).getStatus());

        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "anonymous-key", "reader-a", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        for (int request = 0; request < 30; request++) {
            assertEquals(200, perform(filter, "/api/v1/me/bookmarks", "192.0.2.1", null).getStatus());
        }
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.unauthenticated("invented-reader", "unused"));
        assertEquals(429, perform(filter, "/api/v1/me/bookmarks", "192.0.2.1", null).getStatus());
    }

    @Test
    void sanitizesInvalidRequestIdsAndDoesNotChargeTwiceAcrossStages() throws Exception {
        RouteRateLimiter limiter = new RouteRateLimiter(Clock.systemUTC(), 100);
        RouteRateLimitFilter authentication = new RouteRateLimitFilter(limiter, new ObjectMapper(),
                RouteRateLimitFilter.Stage.AUTHENTICATION);
        RouteRateLimitFilter application = new RouteRateLimitFilter(limiter, new ObjectMapper(),
                RouteRateLimitFilter.Stage.APPLICATION);
        for (int attempt = 0; attempt <= 10; attempt++) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/siwe/challenge");
            request.addHeader("X-Request-Id", "invalid\nrequest-id");
            MockHttpServletResponse response = new MockHttpServletResponse();
            AtomicBoolean reachedApplication = new AtomicBoolean();
            authentication.doFilter(request, response, (nextRequest, nextResponse) ->
                    application.doFilter(nextRequest, nextResponse, (ignoredRequest, ignoredResponse) ->
                            reachedApplication.set(true)));
            assertEquals(attempt < 10, reachedApplication.get());
            if (attempt == 10) {
                assertEquals(429, response.getStatus());
                assertNotEquals("invalid\nrequest-id", response.getHeader("X-Request-Id"));
                assertTrue(response.getHeader("X-Request-Id").startsWith("req-"));
            }
        }
    }

    private static RouteRateLimitFilter filter(RouteRateLimitFilter.Stage stage) {
        return new RouteRateLimitFilter(new RouteRateLimiter(Clock.systemUTC(), 100), new ObjectMapper(), stage);
    }

    private static MockHttpServletResponse perform(
            RouteRateLimitFilter filter, String path, String remoteAddress, String forwardedAddress
    ) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setRemoteAddr(remoteAddress);
        request.addHeader("X-Request-Id", "req-rate-limit");
        if (forwardedAddress != null) {
            request.addHeader("X-Forwarded-For", forwardedAddress);
            request.addHeader("Forwarded", "for=" + forwardedAddress);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> { });
        return response;
    }
}
