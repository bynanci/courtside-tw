package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.api.EditorialBasketballIntakeController;
import tw.basketball.magazine.basketball.application.CanonicalBasketballIntake;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.basketball.persistence.JdbcBasketballFactStore;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.EvidenceStore;
import tw.basketball.magazine.evidence.JdbcEvidenceStore;

/** Real Spring HTTP binding, production role authority, immutable JDBC ports and forward migrations. */
final class EditorialBasketballIntakeApiIT {
    private static final Instant NOW = Instant.parse("2026-09-12T10:00:00Z");
    private static final String ROOT = "/api/v1/publisher/basketball";
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:18.6-alpine3.24@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2")
            .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("editorial_intake").withUsername("fixture").withPassword("fixture-only");
    private static DataSource dataSource;
    private static final ObjectMapper JSON = new ObjectMapper();
    private MockMvc http;
    private EvidenceStore evidence;
    private JdbcBasketballFactStore facts;

    @BeforeAll
    static void migrate() throws Exception {
        POSTGRES.start();
        dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        execute("CREATE ROLE courtside_app NOLOGIN");
        for (String name : List.of("V020__basketball_domain.sql", "V021__basketball_evidence.sql")) {
            try (var input = EditorialBasketballIntakeApiIT.class.getResourceAsStream("/db/migration/" + name)) {
                if (input == null) {
                    throw new IllegalStateException("missing migration " + name);
                }
                execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
    }

    @AfterAll
    static void stop() {
        POSTGRES.stop();
    }

    @BeforeEach
    void fixture() throws Exception {
        execute("TRUNCATE basketball_source, basketball_claim_revision, basketball_identity CASCADE");
        BasketballConfiguration configuration = new BasketballConfiguration();
        evidence = configuration.basketballEvidenceStore(dataSource);
        facts = new JdbcBasketballFactStore(dataSource);
        var reviewed = new ReviewedEvidenceIntake(evidence, configuration.basketballContradictionReview(evidence),
                () -> BasketballConfiguration.requirePublisher().getName(), () -> NOW);
        var catalog = configuration.basketballCatalogService(facts, configuration.basketballEvidenceLookup(evidence), JSON);
        var controller = new EditorialBasketballIntakeController(reviewed, new CanonicalBasketballIntake(catalog, reviewed, JSON), JSON);
        http = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @AfterEach
    void clearIdentity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void publisherCanBuildRecapInputsThroughHttpAndDataSurvivesJdbcRestart() throws Exception {
        Authentication publisher = actor("verified-oidc-publisher", "PUBLISHER");
        submit(publisher);
        http.perform(get(ROOT + "/evidence/{id}", id(3)).principal(publisher))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference.status").value("REPORTED"))
                .andExpect(jsonPath("$.snapshot.content").value("Synthetic permitted source reference"));
        http.perform(post(ROOT + "/evidence/{id}:confirm", id(3)).principal(publisher).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirmedEvidenceId\":\"" + id(4) + "\",\"rationale\":\"Checked official source\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"));
        append(publisher, "LEAGUE", CanonicalBasketballIntakeTest.identity(10, "League", 4), 201);
        append(publisher, "TEAM", CanonicalBasketballIntakeTest.identity(20, "Team", 4), 201);
        append(publisher, "SEASON", CanonicalBasketballIntakeTest.season(30, 10, 4), 201);
        append(publisher, "TEAM_SEASON", CanonicalBasketballIntakeTest.participation(40, 20, 10, 30, 4), 201);
        assertEquals(4, new JdbcBasketballFactStore(dataSource).history().size());
        assertEquals(Evidence.Status.REPORTED, new JdbcEvidenceStore(dataSource).reference(id(3)).orElseThrow().status());
        assertEquals("verified-oidc-publisher", new JdbcEvidenceStore(dataSource).events("basketball:fact:" + id(40)).get(1).reviewerId());
        append(publisher, "TEAM_SEASON", CanonicalBasketballIntakeTest.participation(40, 20, 10, 30, 4), 201);
        assertEquals(4, facts.history().size());
    }

    @Test
    void anonymousReaderAndEditorCannotSubmitOrReadPrivateSources() throws Exception {
        http.perform(post(ROOT + "/snapshots").contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                .andExpect(status().isUnauthorized());
        for (String role : List.of("READER", "EDITOR")) {
            Authentication caller = actor("unprivileged-" + role, role);
            http.perform(post(ROOT + "/snapshots").principal(caller).contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                    .andExpect(status().isForbidden());
            http.perform(get(ROOT + "/evidence/{id}", id(3)).principal(caller)).andExpect(status().isForbidden());
        }
        assertTrue(evidence.source(id(1)).isEmpty());
    }

    @Test
    void explicitAdminRouteUsesTheSameBoundedWorkflow() throws Exception {
        Authentication admin = actor("verified-admin", "ADMIN");
        http.perform(post("/api/v1/admin/basketball/snapshots").principal(admin).contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                .andExpect(status().isCreated());
        assertEquals("verified-admin", evidence.events("evidence:" + id(3)).get(0).reviewerId());
    }

    @Test
    void callerCannotSetConfirmationActorStatusOrRewriteSnapshot() throws Exception {
        Authentication publisher = actor("verified-publisher", "PUBLISHER");
        String forged = snapshot().replace("\"confidence\":0.9", "\"confidence\":0.9,\"status\":\"CONFIRMED\",\"reviewerId\":\"victim\"");
        http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON).content(forged))
                .andExpect(status().isBadRequest());
        assertTrue(evidence.source(id(1)).isEmpty());
        submit(publisher);
        append(publisher, "LEAGUE", CanonicalBasketballIntakeTest.identity(10, "League", 3), 400);
        http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON)
                        .content(snapshot().replace("Synthetic permitted source reference", "Silently rewritten")))
                .andExpect(status().isConflict());
        assertEquals("Synthetic permitted source reference", evidence.snapshot(id(2)).orElseThrow().content());
        assertTrue(facts.history().isEmpty());
    }

    private void submit(Authentication publisher) throws Exception {
        http.perform(post(ROOT + "/snapshots").principal(publisher).contentType(MediaType.APPLICATION_JSON).content(snapshot()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("REPORTED"));
    }

    private void append(Authentication publisher, String kind, String payload, int status) throws Exception {
        http.perform(post(ROOT + "/facts").principal(publisher).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"" + kind + "\",\"payload\":" + payload + ",\"rationale\":\"Checked official fact\"}"))
                .andExpect(status().is(status));
    }

    private static Authentication actor(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("controlled-test-token").header("alg", "RS256")
                .issuer("https://issuer.example.invalid").subject(subject).issuedAt(NOW.minusSeconds(60)).expiresAt(NOW.plusSeconds(60)).build();
        Authentication authentication = new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        return authentication;
    }

    private static String snapshot() {
        return "{\"source\":{\"id\":\"" + id(1) + "\",\"type\":\"LEAGUE\",\"name\":\"Synthetic official source\","
                + "\"sourceUrl\":\"https://example.invalid/official\",\"publicReferenceAllowed\":true},\"snapshotId\":\"" + id(2)
                + "\",\"evidenceId\":\"" + id(3) + "\",\"publishedAt\":\"2026-09-12T09:00:00Z\",\"effectiveAt\":\"2026-09-12T09:00:00Z\","
                + "\"content\":\"Synthetic permitted source reference\",\"rightsReference\":\"Written public-reference permission\","
                + "\"confidence\":0.9,\"staleAt\":\"2026-09-12T11:00:00Z\",\"expiresAt\":\"2026-09-12T12:00:00Z\"}";
    }

    private static UUID id(int suffix) {
        return CanonicalBasketballIntakeTest.id(suffix);
    }

    private static void execute(String sql) throws Exception {
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
