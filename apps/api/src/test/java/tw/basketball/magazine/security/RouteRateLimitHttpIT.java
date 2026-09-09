package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.identity.OidcSecurityConfiguration;
import tw.basketball.magazine.identity.SecurityAuditFilter;
import tw.basketball.magazine.identity.VerifiedRoleAuditService;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.shared.RequestId;

/** Exercises real HTTP, servlet registration, token authentication, and the actual security chains. */
@SpringBootTest(classes = RouteRateLimitHttpIT.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
            "courtside.security.oidc.issuer=https://issuer.example.test",
            "courtside.security.oidc.audience=courtside-api",
            "courtside.security.oidc.jwk-set-uri=https://issuer.example.test/keys"
        })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
final class RouteRateLimitHttpIT {
    @Value("${local.server.port}")
    private int port;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private AuditWriter auditWriter;

    @MockitoBean
    private VerifiedRoleAuditService roleObservations;

    @Autowired
    private FilterChainProxy securityFilters;

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterEach
    void closeClient() {
        client.close();
    }

    @BeforeEach
    void configureTokenBoundary() {
        doAnswer(invocation -> {
            String token = invocation.getArgument(0);
            if (token.startsWith("invalid-")) {
                throw new BadJwtException("test invalid token");
            }
            return Jwt.withTokenValue(token)
                    .header("alg", "RS256")
                    .issuer("https://issuer.example.test")
                    .subject(token)
                    .claim("aud", List.of("courtside-api"))
                    .claim("roles", List.of("READER", "EDITOR"))
                    .issuedAt(Instant.now().minusSeconds(10))
                    .expiresAt(Instant.now().plusSeconds(300))
                    .build();
        }).when(jwtDecoder).decode(anyString());
    }

    @Test
    void preAuthenticationAdmissionPrecedesAuditCsrfAndTokenDecodingInTheActualChain() {
        var filters = securityFilters.getFilterChains().getFirst().getFilters();
        int rate = firstFilterIndex(filters, RouteRateLimitFilter.class);
        int audit = firstFilterIndex(filters, SecurityAuditFilter.class);
        int csrf = firstFilterIndex(filters, CsrfFilter.class);
        int bearer = firstFilterIndex(filters, BearerTokenAuthenticationFilter.class);
        int application = lastFilterIndex(filters, RouteRateLimitFilter.class);
        int verifiedAudit = lastFilterIndex(filters, SecurityAuditFilter.class);
        assertTrue(rate >= 0 && rate < audit, "admission must precede the audit boundary");
        assertTrue(audit < csrf, "CSRF denials must still be captured once");
        assertTrue(csrf < bearer, "pre-authentication admission must also precede token decoding");
        assertTrue(bearer < application && application < verifiedAudit,
                "application admission must follow verified authentication and precede role-observation writes");
    }

    @Test
    void csrfFloodIsRejectedBeforeAuditAfterItsBudgetWithoutReducingAnonymousReading() throws Exception {
        List<String> paths = List.of("/api/v1/editor/rate-limit-probe", "/api/v1/public/search",
                "/api/v1/editor/media/uploads", "/unknown-path", "/actuator/health");
        for (int attempt = 0; attempt < 10; attempt++) {
            HttpResponse<String> denied = request(paths.get(attempt % paths.size()), null, "POST");
            assertEquals(403, denied.statusCode());
            assertEquals("req-http-rate-limit", denied.headers().firstValue("X-Request-Id").orElseThrow());
        }
        var events = ArgumentCaptor.forClass(AuditEventDraft.class);
        verify(auditWriter, times(10)).append(events.capture());
        for (AuditEventDraft event : events.getAllValues()) {
            assertEquals("PERMISSION_DENIED", event.action());
            assertEquals("req-http-rate-limit", event.actor().requestId().value());
            assertEquals(403, event.metadata().get("status"));
        }
        for (String path : paths) {
            HttpResponse<String> denied = request(path, null, "POST");
            assertEquals(429, denied.statusCode());
            assertProblem(denied);
        }
        verifyNoInteractions(jwtDecoder);
        verifyNoMoreInteractions(auditWriter);
        assertBudget("/api/v1/public/issues", null, 120);
        assertEquals(200, request("/actuator/health", null).statusCode());
        verifyNoMoreInteractions(auditWriter);
    }

    @Test
    void unrecognizedSafePathsCannotBypassThePermissionDenialAuditBudget() throws Exception {
        for (int attempt = 0; attempt < 30; attempt++) {
            assertEquals(401, request("/unknown-path", null).statusCode());
        }
        verify(auditWriter, times(30)).append(org.mockito.ArgumentMatchers.any());
        HttpResponse<String> denied = request("/unknown-path", null);
        assertEquals(429, denied.statusCode());
        assertProblem(denied);
        verifyNoMoreInteractions(auditWriter);
        assertEquals(200, request("/actuator/health", null).statusCode());
    }

    @Test
    void overBudgetVerifiedRequestsCannotReachRoleObservation() throws Exception {
        for (int attempt = 0; attempt < 30; attempt++) {
            assertEquals(200, request("/api/v1/editor/rate-limit-probe", "editor-rate-limit").statusCode());
        }
        var identities = ArgumentCaptor.forClass(JwtAuthenticationToken.class);
        var requestIds = ArgumentCaptor.forClass(RequestId.class);
        verify(roleObservations, times(30)).observe(identities.capture(), requestIds.capture());
        for (int index = 0; index < 30; index++) {
            assertTrue(identities.getAllValues().get(index).isAuthenticated());
            assertEquals("editor-rate-limit", identities.getAllValues().get(index).getName());
            assertEquals("req-http-rate-limit", requestIds.getAllValues().get(index).value());
        }
        for (int attempt = 0; attempt < 20; attempt++) {
            assertEquals(429, request("/api/v1/editor/rate-limit-probe", "editor-rate-limit").statusCode());
        }
        assertEquals(429, request("/actuator/health", "editor-rate-limit").statusCode());
        assertEquals(200, request("/actuator/health", null).statusCode());
        verifyNoMoreInteractions(roleObservations);
        verifyNoInteractions(auditWriter);
    }

    @Test
    void enforcesAllApplicationCategoriesThroughTheRegisteredServerChain() throws Exception {
        assertBudget("/api/v1/public/issues", null, 120);
        assertBudget("/api/v1/public/search", null, 60);
        assertBudget("/api/v1/editor/media/uploads", "editor-rate-limit", 20);
        assertBudget("/api/v1/editor/rate-limit-probe", "editor-rate-limit", 30);
        assertEquals(200, request("/api/v1/editor/rate-limit-probe", "different-editor").statusCode());
    }

    @Test
    void boundsInvalidBearerDecodingAcrossSearchEditorialAndUploadRoutes() throws Exception {
        List<String> paths = List.of("/api/v1/public/search", "/api/v1/editor/rate-limit-probe",
                "/api/v1/editor/media/uploads");
        for (int attempt = 0; attempt < 10; attempt++) {
            assertEquals(401, request(paths.get(attempt % paths.size()), "invalid-" + attempt).statusCode());
        }
        for (String path : paths) {
            HttpResponse<String> denied = request(path, "invalid-next");
            assertEquals(429, denied.statusCode(), path);
            assertProblem(denied);
        }
        verify(jwtDecoder, times(10)).decode(anyString());
    }

    @Test
    void boundsConcurrentInvalidTokenDecodingBeforeAnyAuthenticationCompletes() throws Exception {
        CountDownLatch decoding = new CountDownLatch(10);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(invocation -> {
            decoding.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("decoder release timed out");
            }
            throw new BadJwtException("test concurrent invalid token");
        }).when(jwtDecoder).decode(anyString());
        var executor = Executors.newFixedThreadPool(20);
        var responses = new ExecutorCompletionService<HttpResponse<String>>(executor);
        try {
            for (int attempt = 0; attempt < 20; attempt++) {
                int tokenIndex = attempt;
                responses.submit(() -> request("/api/v1/public/search", "invalid-concurrent-" + tokenIndex));
            }
            assertTrue(decoding.await(10, TimeUnit.SECONDS));
            for (int denied = 0; denied < 10; denied++) {
                var response = responses.poll(10, TimeUnit.SECONDS);
                assertNotNull(response, "excess concurrent authentication must be rejected before decoder release");
                assertEquals(429, response.get().statusCode());
            }
            verify(jwtDecoder, times(10)).decode(anyString());
            release.countDown();
            for (int accepted = 0; accepted < 10; accepted++) {
                var response = responses.poll(10, TimeUnit.SECONDS);
                assertNotNull(response);
                assertEquals(401, response.get().statusCode());
            }
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void rejectsTheEleventhInvalidBearerAuthenticationAttemptBeforeTokenDecoding() throws Exception {
        for (int attempt = 0; attempt < 10; attempt++) {
            assertEquals(401, request("/api/v1/auth/siwe/challenge", "invalid-" + attempt).statusCode());
        }
        HttpResponse<String> denied = request("/api/v1/auth/siwe/verify", "invalid-eleventh");
        assertEquals(429, denied.statusCode());
        assertProblem(denied);
    }

    private void assertBudget(String path, String token, int budget) throws Exception {
        for (int request = 0; request < budget; request++) {
            assertEquals(200, request(path, token).statusCode(), path + " at " + request);
        }
        HttpResponse<String> denied = request(path, token);
        assertEquals(429, denied.statusCode(), path);
        assertProblem(denied);
    }

    private static void assertProblem(HttpResponse<String> response) throws Exception {
        assertEquals("application/problem+json", response.headers().firstValue("Content-Type").orElseThrow()
                .split(";", 2)[0]);
        assertFalse(response.headers().firstValue("Retry-After").orElseThrow().isBlank());
        var problem = new ObjectMapper().readTree(response.body());
        assertEquals("RATE_LIMITED", problem.path("code").asString());
        assertEquals(429, problem.path("status").asInt());
        assertEquals("req-http-rate-limit", problem.path("requestId").asString());
        assertEquals("req-http-rate-limit", response.headers().firstValue("X-Request-Id").orElseThrow());
    }

    private HttpResponse<String> request(String path, String token) throws Exception {
        return request(path, token, "GET");
    }

    private HttpResponse<String> request(String path, String token, String method) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .header("X-Request-Id", "req-http-rate-limit")
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static int firstFilterIndex(List<jakarta.servlet.Filter> filters, Class<?> type) {
        for (int index = 0; index < filters.size(); index++) {
            if (type.isInstance(filters.get(index))) {
                return index;
            }
        }
        return -1;
    }

    private static int lastFilterIndex(List<jakarta.servlet.Filter> filters, Class<?> type) {
        for (int index = filters.size() - 1; index >= 0; index--) {
            if (type.isInstance(filters.get(index))) {
                return index;
            }
        }
        return -1;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(excludeName = "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration")
    @Import({ OidcSecurityConfiguration.class, SecurityBoundaryConfiguration.class, ProbeController.class })
    static final class TestApplication {
    }

    @RestController
    static final class ProbeController {
        @GetMapping({
            "/api/v1/public/issues", "/api/v1/public/search", "/api/v1/editor/media/uploads",
            "/api/v1/editor/rate-limit-probe"
        })
        String read() {
            return "ok";
        }
    }
}
