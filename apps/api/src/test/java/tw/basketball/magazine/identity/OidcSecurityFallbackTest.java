package tw.basketball.magazine.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {
        "spring.profiles.active=api"
})
@WebAppConfiguration
final class OidcSecurityFallbackTest {
    @Autowired
    private WebApplicationContext webApplicationContext;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(webApplicationContext.getBean(FilterChainProxy.class))
                .build();
    }

    @Test
    void keepsPublicReadingAnonymousWhenIssuerIsUnconfigured() throws Exception {
        mockMvc.perform(get("/api/v1/public/issues"))
                .andExpect(status().isNotFound());
    }

    @Test
    void returnsContractProblemForProtectedRouteWithoutIssuer() throws Exception {
        mockMvc.perform(get("/api/v1/me/bookmarks").header("X-Request-Id", "req-fallback"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(header().string("X-Request-Id", "req-fallback"))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void protectsTheExactAccountDeletionPathWithoutIssuer() throws Exception {
        mockMvc.perform(delete("/api/v1/me")
                        .header("Authorization", "Bearer fixture")
                        .header("X-Request-Id", "req-delete-fallback"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(header().string("X-Request-Id", "req-delete-fallback"))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
}
