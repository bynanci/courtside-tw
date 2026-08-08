package tw.basketball.magazine.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.profiles.active=api",
        "courtside.security.oidc.issuer=https://issuer.example.test",
        "courtside.security.oidc.audience=courtside-api",
        "courtside.security.oidc.jwk-set-uri=https://issuer.example.test/keys"
})
@AutoConfigureMockMvc
final class OidcSecurityProblemDetailsTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsContractProblemForProtectedRouteWithoutBearerToken() throws Exception {
        mockMvc.perform(get("/api/v1/me/bookmarks").header("X-Request-Id", "req-oidc"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(header().string("X-Request-Id", "req-oidc"))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
}
