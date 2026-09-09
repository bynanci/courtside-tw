package tw.basketball.magazine.identity;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.FactorGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

import tw.basketball.magazine.MagazineApplication;

/** FR-032 / DEV-046: production filter chain and role converter, controlled token decoding only. */
@SpringBootTest(
        classes = {MagazineApplication.class, OidcRoleMatrixTest.MatrixConfiguration.class},
        properties = {
                "spring.profiles.active=api",
                "courtside.security.oidc.issuer=https://issuer.example.test",
                "courtside.security.oidc.audience=courtside-api",
                "courtside.security.oidc.jwk-set-uri=https://issuer.example.test/keys"
        }
)
@WebAppConfiguration
final class OidcRoleMatrixTest {
    @Autowired
    private WebApplicationContext applicationContext;

    private MockMvc mockMvc;

    @BeforeEach
    void installProductionFilterChain() {
        mockMvc = MockMvcBuilders.webAppContextSetup(applicationContext)
                .addFilters(applicationContext.getBean(FilterChainProxy.class))
                .build();
    }

    @ParameterizedTest
    @CsvSource({
            "READER,me,200", "READER,editor,403", "READER,publisher,403", "READER,admin,403",
            "EDITOR,me,403", "EDITOR,editor,200", "EDITOR,publisher,403", "EDITOR,admin,403",
            "PUBLISHER,me,403", "PUBLISHER,editor,403", "PUBLISHER,publisher,200", "PUBLISHER,admin,403",
            "ADMIN,me,403", "ADMIN,editor,403", "ADMIN,publisher,403", "ADMIN,admin,200"
    })
    void fourCanonicalRolesAuthorizeOnlyTheirExplicitReadAndWriteBoundary(
            String role, String boundary, int expectedStatus
    ) throws Exception {
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.POST)) {
            ResultActions result = mockMvc.perform(request(method, "/api/v1/" + boundary + "/role-matrix")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + role))
                    .andExpect(status().is(expectedStatus));
            if (expectedStatus == 200) {
                result.andExpect(jsonPath("$.subject").value("matrix-" + role))
                        // Spring Security 7 also identifies the verified bearer factor.
                        // Assert the complete authority set so extra application roles fail.
                        .andExpect(jsonPath("$.authorities", containsInAnyOrder(
                                "ROLE_" + role, FactorGrantedAuthority.BEARER_AUTHORITY)));
            } else {
                result.andExpect(jsonPath("$.code").value("FORBIDDEN"));
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"me", "editor", "publisher", "admin"})
    void anonymousAndMissingRoleClaimsCannotEnterAnyProtectedBoundary(String boundary) throws Exception {
        mockMvc.perform(get("/api/v1/" + boundary + "/role-matrix"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
        mockMvc.perform(get("/api/v1/" + boundary + "/role-matrix")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer NO_ROLES"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_PUBLISHER", "OWNER", "SCALAR_ROLE"})
    void invalidRoleClaimsFailDuringCanonicalJwtConversion(String token) throws Exception {
        mockMvc.perform(get("/api/v1/publisher/role-matrix")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void multipleExplicitRolesGrantOnlyTheirListedBoundaries() throws Exception {
        for (String boundary : List.of("me", "editor")) {
            mockMvc.perform(get("/api/v1/" + boundary + "/role-matrix")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer READER_EDITOR"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.authorities", containsInAnyOrder(
                            "ROLE_READER", "ROLE_EDITOR", FactorGrantedAuthority.BEARER_AUTHORITY)));
        }
        for (String boundary : List.of("publisher", "admin")) {
            mockMvc.perform(get("/api/v1/" + boundary + "/role-matrix")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer READER_EDITOR"))
                    .andExpect(status().isForbidden());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class MatrixConfiguration {
        @Bean
        @Primary
        JwtDecoder matrixJwtDecoder() {
            // Cryptographic verification is isolated here; the real bearer filter and converter still run.
            return value -> {
                Instant now = Instant.now();
                Jwt.Builder token = Jwt.withTokenValue(value)
                        .header("alg", "RS256")
                        .issuer("https://issuer.example.test")
                        .audience(List.of("courtside-api"))
                        .subject("matrix-" + value)
                        .issuedAt(now.minusSeconds(10))
                        .expiresAt(now.plusSeconds(300));
                switch (value) {
                    case "NO_ROLES" -> token.claim("scope", "ROLE_ADMIN ROLE_PUBLISHER");
                    case "SCALAR_ROLE" -> token.claim("roles", "PUBLISHER");
                    case "READER_EDITOR" -> token.claim("roles", List.of("READER", "EDITOR"));
                    default -> token.claim("roles", List.of(value));
                }
                return token.build();
            };
        }

        @Bean
        RoleMatrixProbe roleMatrixProbe() {
            return new RoleMatrixProbe();
        }
    }

    @TestComponent
    @RestController
    static final class RoleMatrixProbe {
        @RequestMapping(
                path = {
                        "/api/v1/me/role-matrix", "/api/v1/editor/role-matrix",
                        "/api/v1/publisher/role-matrix", "/api/v1/admin/role-matrix"
                },
                method = {RequestMethod.GET, RequestMethod.POST}
        )
        Map<String, Object> probe(Authentication authentication) {
            return Map.of(
                    "subject", authentication.getName(),
                    "authorities", authentication.getAuthorities().stream()
                            .map(GrantedAuthority::getAuthority).toList()
            );
        }
    }
}
