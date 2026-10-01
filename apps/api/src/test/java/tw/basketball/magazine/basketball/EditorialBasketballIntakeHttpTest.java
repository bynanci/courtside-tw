package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.api.EditorialBasketballIntakeController;
import tw.basketball.magazine.basketball.application.CanonicalBasketballIntake;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.evidence.MemoryEvidenceStore;

/** Spring JSON binding and private response contracts; JDBC durability is proven separately by ApiIT. */
final class EditorialBasketballIntakeHttpTest {
    private static final String ROOT = "/api/v1/publisher/basketball";
    private static final ObjectMapper JSON = new ObjectMapper();
    private final MemoryEvidenceStore evidence = new MemoryEvidenceStore();
    private final CanonicalBasketballIntakeTest.MemoryFacts facts = new CanonicalBasketballIntakeTest.MemoryFacts();
    private MockMvc http;

    @BeforeEach
    void fixture() {
        BasketballConfiguration configuration = new BasketballConfiguration();
        var reviewed = new ReviewedEvidenceIntake(evidence, configuration.basketballContradictionReview(evidence),
                () -> BasketballConfiguration.requirePublisher().getName(), () -> Instant.parse("2026-09-12T10:00:00Z"));
        var catalog = configuration.basketballCatalogService(facts, configuration.basketballEvidenceLookup(evidence), JSON);
        http = MockMvcBuilders.standaloneSetup(new EditorialBasketballIntakeController(reviewed,
                new CanonicalBasketballIntake(catalog, reviewed, JSON), JSON)).build();
    }

    @AfterEach
    void clearIdentity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void actualSpringBindingPreservesReportThenExplicitReviewAndPrivateHeaders() throws Exception {
        Authentication publisher = actor("PUBLISHER");
        http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                .andExpect(status().isCreated()).andExpect(header().exists("X-Request-Id"))
                .andExpect(header().string("Cache-Control", "no-store"));
        http.perform(post(ROOT + "/evidence/{id}:confirm", CanonicalBasketballIntakeTest.id(3)).principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"confirmedEvidenceId\":\"" + CanonicalBasketballIntakeTest.id(4)
                                + "\",\"rationale\":\"Checked official source\"}"))
                .andExpect(status().isCreated());
        http.perform(post(ROOT + "/facts").principal(publisher).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"LEAGUE\",\"payload\":" + CanonicalBasketballIntakeTest.identity(10, "League", 4)
                                + ",\"rationale\":\"Checked league record\"}"))
                .andExpect(status().isCreated());
        assertEquals(1, facts.history().size());
    }

    @Test
    void actualSpringBindingRejectsUnauthorizedAndUnknownAuthorityFieldsAsProblemDetails() throws Exception {
        var anonymous = http.perform(get(ROOT + "/evidence/{id}", CanonicalBasketballIntakeTest.id(3)))
                .andExpect(status().isUnauthorized()).andReturn().getResponse();
        assertEquals("AUTHENTICATION_REQUIRED", JSON.readTree(anonymous.getContentAsString()).path("code").asString());
        Authentication reader = actor("READER");
        http.perform(post(ROOT + "/snapshots").principal(reader).contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                .andExpect(status().isForbidden());
        Authentication publisher = actor("PUBLISHER");
        var invalid = http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON)
                        .content(snapshot().replace("\"confidence\":0.9", "\"confidence\":0.9,\"reviewerId\":\"victim\"")))
                .andExpect(status().isBadRequest()).andExpect(header().exists("X-Request-Id")).andReturn().getResponse();
        assertEquals("INVALID_REQUEST", JSON.readTree(invalid.getContentAsString()).path("code").asString());
        assertTrue(evidence.source(CanonicalBasketballIntakeTest.id(1)).isEmpty());
    }

    @Test
    void ambiguousScalarAndDuplicateRightsValuesAreRejectedBeforeWrites() throws Exception {
        Authentication publisher = actor("PUBLISHER");
        for (String invalid : List.of(snapshot().replace("\"confidence\":0.9", "\"confidence\":\"0.9\""),
                snapshot().replace("\"publicReferenceAllowed\":true", "\"publicReferenceAllowed\":\"true\""),
                snapshot().replace("\"publicReferenceAllowed\":true", "\"publicReferenceAllowed\":false,\"publicReferenceAllowed\":true"))) {
            http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        assertTrue(evidence.source(CanonicalBasketballIntakeTest.id(1)).isEmpty());
    }

    @Test
    void productionConfigurationRegistersRoutesWhenDatasourceIsPresent() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(IntakeTestContext.class);
            context.refresh();
            assertEquals(1, context.getBeansOfType(ReviewedEvidenceIntake.class).size());
            assertEquals(1, context.getBeansOfType(EditorialBasketballIntakeController.class).size());
            MockMvc application = MockMvcBuilders.webAppContextSetup(context).build();
            application.perform(post(ROOT + "/snapshots").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void applicationStartsWithoutDatasourceAndRejectsBeforeResolvingPersistence() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(NoDatasourceContext.class);
            context.refresh();
            assertTrue(context.getBeansOfType(DataSource.class).isEmpty());
            MockMvc application = MockMvcBuilders.webAppContextSetup(context).build();
            application.perform(post(ROOT + "/snapshots").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isUnauthorized());
            application.perform(post(ROOT + "/snapshots").principal(actor("PUBLISHER")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableWebMvc
    @Import(BasketballConfiguration.class)
    @ComponentScan(basePackageClasses = EditorialBasketballIntakeController.class)
    static class NoDatasourceContext {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableWebMvc
    @Import(BasketballConfiguration.class)
    @ComponentScan(basePackageClasses = EditorialBasketballIntakeController.class)
    static class IntakeTestContext {
        @Bean
        DataSource dataSource() {
            return new DriverManagerDataSource("jdbc:postgresql://unreachable.invalid/intake");
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }

    private static Authentication actor(String role) {
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated("authenticated-publisher", null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        return authentication;
    }

    private static String snapshot() {
        return "{\"source\":{\"id\":\"" + CanonicalBasketballIntakeTest.id(1)
                + "\",\"type\":\"LEAGUE\",\"name\":\"Synthetic source\",\"sourceUrl\":\"https://example.invalid/official\","
                + "\"publicReferenceAllowed\":true},\"snapshotId\":\"" + CanonicalBasketballIntakeTest.id(2)
                + "\",\"evidenceId\":\"" + CanonicalBasketballIntakeTest.id(3)
                + "\",\"publishedAt\":null,\"effectiveAt\":\"2026-09-12T09:00:00Z\",\"content\":\"Synthetic reference\","
                + "\"rightsReference\":\"Written permission\",\"confidence\":0.9,\"staleAt\":\"2026-09-12T11:00:00Z\","
                + "\"expiresAt\":\"2026-09-12T12:00:00Z\"}";
    }
}
