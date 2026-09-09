package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.identity.OidcSecurityConfiguration;

/** Exercises real HTTP, servlet registration, token authentication, and the actual security chains. */
@SpringBootTest(classes = RouteRateLimitHttpIT.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
            "courtside.security.oidc.issuer=https://issuer.example.test",
            "courtside.security.oidc.audience=courtside-api",
            "courtside.security.oidc.jwk-set-uri=https://issuer.example.test/keys"
        })
final class RouteRateLimitHttpIT {
    @Value("${local.server.port}")
    private int port;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterEach
    void closeClient() {
        client.close();
    }

    @BeforeEach
    void configureTokenBoundary() {
        when(jwtDecoder.decode(anyString())).thenAnswer(invocation -> {
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
        });
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
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .header("X-Request-Id", "req-http-rate-limit")
                .GET();
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
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
