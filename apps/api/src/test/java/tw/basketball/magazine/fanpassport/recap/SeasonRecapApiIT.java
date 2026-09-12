package tw.basketball.magazine.fanpassport.recap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.JdbcEvidenceStore;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;

/** Synthetic canonical records through a real Spring controller/bean graph and PostgreSQL18. */
final class SeasonRecapApiIT extends PublicIssueApiIntegrationTestSupport {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    private AnnotationConfigWebApplicationContext context;
    private MockMvc recapMvc;

    @BeforeAll
    static void recapMigrations() throws Exception {
        for (String file : List.of("V020__basketball_domain.sql", "V021__basketball_evidence.sql", "V024__season_recap_projection.sql")) {
            jdbcTemplate.execute(Files.readString(Path.of(System.getProperty("courtside.repoRoot"),
                    "apps/api/src/main/resources/db/migration", file)));
        }
    }

    @BeforeEach
    void realSpringGraph() {
        jdbcTemplate.execute("TRUNCATE basketball_identity,basketball_source,basketball_claim_revision CASCADE");
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(WebConfiguration.class, SeasonRecapConfiguration.class, SeasonRecapController.class,
                tw.basketball.magazine.shared.ApiExceptionHandler.class);
        context.refresh();
        assertTrue(context.getBean(SeasonRecapProjectionService.class) != null);
        recapMvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @AfterEach
    void closeContext() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void generatorPublishesOnlyServerDerivedImmutableMetricsThroughExistingArticleSsr() throws Exception {
        Fixture fixture = fixture();
        String request = JSON.writeValueAsString(fixture.command());
        recapMvc.perform(post("/api/v1/publisher/season-recaps").contentType("application/json").content(request))
                .andExpect(status().isUnauthorized()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("https://courtside.tw/problems/authentication_required"))
                .andExpect(jsonPath("$.errors[0].code").value("authentication_required"))
                .andExpect(header().exists("X-Request-Id"));
        recapMvc.perform(post("/api/v1/publisher/season-recaps").principal(reader("READER"))
                        .contentType("application/json").content(request)).andExpect(status().isForbidden());
        JsonNode document = generate(fixture);
        assertEquals(0.5, document.path("blocks").path(0).path("payload").path("parameters").path("values").path(0).asDouble());
        assertEquals(document, generate(fixture));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM season_recap_projection", Integer.class));
        recapMvc.perform(get(publicPath(fixture))).andExpect(status().isNotFound());

        publish(fixture, document);
        String body = recapMvc.perform(get(publicPath(fixture)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(jsonPath("$.content.blocks[0].payload.parameters.values[0]").value(0.5))
                .andExpect(jsonPath("$.poster.url").value(org.hamcrest.Matchers.startsWith("/media/")))
                .andExpect(jsonPath("$.canonicalPath").value("/articles/" + fixture.slug()))
                .andReturn().getResponse().getContentAsString();
        for (String forbidden : List.of("subject", "readerId", "reviewer", "sourceUrl", "private_storage_key", "confidence", "accessToken")) {
            assertFalse(body.contains('"' + forbidden + '"'));
        }
        mockMvc.perform(get("/api/v1/public/articles/" + fixture.slug()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.blocks[0].payload.presetId").value("season-recap-v1"));
        recapMvc.perform(get(privatePath(fixture))).andExpect(status().isUnauthorized());
        recapMvc.perform(get(privatePath(fixture)).principal(reader("READER"))).andExpect(status().isNotFound());
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbcTemplate.update("UPDATE season_recap_projection SET payload='{}'::jsonb"));
    }

    @Test
    void rawArticleAuthoringCannotChangeApprovedValuesOrInventProjectionIds() throws Exception {
        Fixture fixture = fixture();
        JsonNode document = generate(fixture);
        ObjectNode forged = document.deepCopy();
        ((ObjectNode) forged.path("blocks").path(0).path("payload").path("parameters"))
                .set("values", JSON.valueToTree(List.of(0.99)));
        var repository = new JdbcEditorialArticleRepository(jdbcTemplate);
        assertThrows(IllegalArgumentException.class, () -> repository.insertDraft("Forged", "forged-recap", "", forged));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM article WHERE slug='forged-recap'", Integer.class));
        assertTrue(SeasonRecapPublicationGuard.validate(document, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
        assertFalse(SeasonRecapPublicationGuard.validate(forged, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
        ((ObjectNode) forged.path("blocks").path(0).path("payload")).put("projectionId", UUID.randomUUID().toString());
        assertFalse(SeasonRecapPublicationGuard.validate(forged, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
    }

    @Test
    void withdrawalAndExpiryOutrankPreviouslyRetrievedRecapsAndConditionalRequests() throws Exception {
        Fixture fixture = fixture();
        JsonNode document = generate(fixture);
        publish(fixture, document);
        for (String state : List.of("BLOCKED", "REVOKED", "EXPIRED")) {
            jdbcTemplate.update("UPDATE rights_record SET status=? WHERE asset_id=?", state, fixture.poster());
            recapMvc.perform(get(publicPath(fixture)).header("If-None-Match", "\"stale-recap\""))
                    .andExpect(status().isNotFound()).andExpect(header().string("Cache-Control", "no-store"));
            assertFalse(SeasonRecapPublicationGuard.validate(document, jdbcTemplate, JSON, NOW, "OFFLINE"));
            mockMvc.perform(get("/api/v1/public/articles/" + fixture.slug())).andExpect(status().isNotFound());
        }
    }

    @Test
    void unresolvedContradictionAndStaleEvidenceSuppressTheStoredProjection() throws Exception {
        Fixture fixture = fixture();
        JsonNode document = generate(fixture);
        publish(fixture, document);
        // Isolate time expiry while the review is still confirmed and poster rights remain valid.
        assertThrows(IllegalArgumentException.class,
                () -> new JdbcSeasonRecapSource(jdbcTemplate, JSON, () -> NOW.plusSeconds(7200))
                        .validatedPayload(fixture.command().projectionId(), "PUBLIC_WEB"));
        assertTrue(SeasonRecapPublicationGuard.validate(document, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
        var store = new JdbcEvidenceStore(jdbcTemplate.getDataSource());
        var review = new ContradictionReview(store, actor -> { });
        review.propose(UUID.randomUUID(), fixture.claim(), "conflicting synthetic period", List.of(fixture.reference()),
                Evidence.Status.CONFIRMED, Evidence.Origin.HUMAN, NOW.plusSeconds(1));
        recapMvc.perform(get(publicPath(fixture))).andExpect(status().isNotFound());
        assertFalse(SeasonRecapPublicationGuard.validate(document, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
    }

    @Test
    void generationRejectsCrossSeasonFutureDuplicateAndUnknownInputsWithoutPersisting() throws Exception {
        Fixture fixture = fixture();
        var valid = fixture.command();
        for (var input : List.of(
                new SeasonRecapApplication.Generate(valid.projectionId(), UUID.randomUUID(), valid.posterAssetId(), valid.asOf(), valid.factIds()),
                new SeasonRecapApplication.Generate(valid.projectionId(), valid.seasonId(), valid.posterAssetId(), NOW.plusSeconds(3600), valid.factIds()),
                new SeasonRecapApplication.Generate(valid.projectionId(), valid.seasonId(), valid.posterAssetId(), valid.asOf(), List.of(valid.factIds().getFirst(), valid.factIds().getFirst())),
                new SeasonRecapApplication.Generate(valid.projectionId(), valid.seasonId(), valid.posterAssetId(), valid.asOf(), List.of(UUID.randomUUID())))) {
            recapMvc.perform(post("/api/v1/publisher/season-recaps").principal(reader("PUBLISHER"))
                    .contentType("application/json").content(JSON.writeValueAsString(input)))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.errors[0].code").value("recap_evidence_or_rights_unavailable"));
        }
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM season_recap_projection", Integer.class));
        ObjectNode untrusted = JSON.valueToTree(valid);
        untrusted.set("values", JSON.valueToTree(List.of(0.99)));
        recapMvc.perform(post("/api/v1/publisher/season-recaps").principal(reader("PUBLISHER"))
                .contentType("application/json").content(JSON.writeValueAsString(untrusted)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void currentRightsTimeAndArticleWithdrawalAreRecheckedWithoutAStatusMutation() throws Exception {
        Fixture fixture = fixture();
        JsonNode document = generate(fixture);
        publish(fixture, document);
        jdbcTemplate.update("UPDATE article SET state='WITHDRAWN' WHERE slug=?", fixture.slug());
        recapMvc.perform(get(publicPath(fixture))).andExpect(status().isNotFound());
        jdbcTemplate.update("UPDATE article SET state='PUBLISHED' WHERE slug=?", fixture.slug());
        jdbcTemplate.update("UPDATE rights_record SET valid_until=? WHERE asset_id=?",
                java.sql.Timestamp.from(NOW.minusSeconds(1)), fixture.poster());
        assertFalse(SeasonRecapPublicationGuard.validate(document, jdbcTemplate, JSON, NOW, "PUBLIC_WEB"));
        recapMvc.perform(get(publicPath(fixture))).andExpect(status().isNotFound());
    }

    private JsonNode generate(Fixture fixture) throws Exception {
        String body = recapMvc.perform(post("/api/v1/publisher/season-recaps").principal(reader("PUBLISHER"))
                        .contentType("application/json").content(JSON.writeValueAsString(fixture.command())))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        return JSON.readTree(body);
    }

    private Fixture fixture() {
        String slug = "synthetic-recap-" + UUID.randomUUID();
        IssueFixture issue = createIssue(slug, 1, NOW.minusSeconds(60), "PUBLISHED", true);
        UUID poster = jdbcTemplate.queryForObject("SELECT cover_asset_id FROM publication_issue WHERE id=?", UUID.class, issue.id());
        jdbcTemplate.update("""
                INSERT INTO media_variant(id,asset_id,variant,public_storage_key,checksum_sha256,mime_type,byte_size,width,height)
                VALUES(?,?,'poster',?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','image/webp',512,1200,1600)
                """, UUID.randomUUID(), poster, "recaps/" + slug + ".webp");
        UUID sourceId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID referenceId = UUID.randomUUID();
        URI url = URI.create("https://synthetic.example.test/recap");
        var store = new JdbcEvidenceStore(jdbcTemplate.getDataSource());
        store.appendSource(new Evidence.Source(sourceId, Evidence.SourceType.LEAGUE, "Synthetic test only", url, true));
        store.appendSnapshot(new Evidence.SourceSnapshot(snapshotId, sourceId, url, NOW.minusSeconds(600), null,
                "Synthetic calendar fact", Evidence.digest("Synthetic calendar fact"), "Synthetic public test rights"));
        store.appendReference(new Evidence.EvidenceRef(referenceId, sourceId, Evidence.SourceType.LEAGUE, url,
                NOW.minusSeconds(600), null, NOW.minusSeconds(900), 1, Evidence.Status.CONFIRMED, "fresh", snapshotId,
                NOW.plusSeconds(3600), NOW.plusSeconds(7200), "Synthetic only"));
        String claim = "recap:" + referenceId;
        var review = new ContradictionReview(store, actor -> { });
        UUID proposal = UUID.randomUUID();
        review.propose(proposal, claim, "synthetic season period", List.of(referenceId), Evidence.Status.CONFIRMED,
                Evidence.Origin.HUMAN, NOW.minusSeconds(500));
        review.decide(UUID.randomUUID(), claim, proposal, Evidence.Status.CONFIRMED, "synthetic-reviewer",
                "Synthetic fixture review", 1, NOW.minusSeconds(400));

        UUID league = UUID.randomUUID();
        UUID season = UUID.randomUUID();
        UUID team = UUID.randomUUID();
        UUID fact = UUID.randomUUID();
        for (var entry : Map.of(league, "LEAGUE", season, "SEASON", team, "TEAM").entrySet()) {
            jdbcTemplate.update("INSERT INTO basketball_identity(id,entity_kind) VALUES(?,?)", entry.getKey(), entry.getValue());
        }
        LocalDate asOf = NOW.atZone(ZoneOffset.UTC).toLocalDate();
        Map<String, Object> seasonPayload = Map.of("id", season, "leagueId", league, "officialLabel", "Synthetic",
                "period", Map.of("startDate", asOf.minusDays(100), "endDate", asOf.plusDays(100)), "evidenceIds", List.of(referenceId));
        Map<String, Object> factPayload = Map.of("id", fact, "teamId", team, "leagueId", league, "seasonId", season,
                "status", "ACTIVE", "period", Map.of("startDate", asOf.minusDays(50), "endDate", asOf.plusDays(100)),
                "evidenceIds", List.of(referenceId));
        insertFact(season, season, "SEASON", seasonPayload, referenceId, asOf.minusDays(100));
        insertFact(fact, team, "TEAM_SEASON", factPayload, referenceId, asOf.minusDays(50));
        return new Fixture(issue, slug, poster, referenceId, claim,
                new SeasonRecapApplication.Generate(UUID.randomUUID(), season, poster, NOW, List.of(fact)));
    }

    private void insertFact(UUID id, UUID owner, String kind, Object payload, UUID ref, LocalDate start) {
        jdbcTemplate.update("""
                INSERT INTO basketball_fact(id,owner_id,fact_kind,valid_from,payload,evidence_ids)
                VALUES(?,?,?,?,?::jsonb,ARRAY[?]::uuid[])
                """, id, owner, kind, java.sql.Date.valueOf(start), JSON.writeValueAsString(payload), ref);
    }

    private void publish(Fixture fixture, JsonNode document) {
        addArticle(fixture.issue(), "Synthetic recap", 1, fixture.slug(), 1, "PUBLISHED");
        UUID article = jdbcTemplate.queryForObject("SELECT id FROM article WHERE slug=?", UUID.class, fixture.slug());
        UUID revision = jdbcTemplate.queryForObject("SELECT published_revision_id FROM article WHERE id=?", UUID.class, article);
        UUID snapshot = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot(id,aggregate_type,aggregate_id,revision_id,snapshot_version,content_document,checksum_sha256,created_by)
                VALUES(?,'ARTICLE',?,?,2,?::jsonb,?,'synthetic-test')
                """, snapshot, article, revision, JSON.writeValueAsString(document), "b".repeat(64));
        jdbcTemplate.update("INSERT INTO publication_impact_link(snapshot_id,asset_id,impact_type) VALUES(?,?,'CONTENT_MEDIA')",
                snapshot, fixture.poster());
    }

    private static JwtAuthenticationToken reader(String role) {
        Jwt jwt = Jwt.withTokenValue("synthetic-recap-token").header("alg", "RS256")
                .issuer("https://synthetic.example.test").subject("synthetic-reader")
                .issuedAt(NOW.minusSeconds(10)).expiresAt(NOW.plusSeconds(3600)).build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private static String publicPath(Fixture fixture) {
        return "/api/v1/public/seasons/" + fixture.command().seasonId() + "/recaps/" + fixture.command().projectionId();
    }

    private static String privatePath(Fixture fixture) {
        return "/api/v1/me/seasons/" + fixture.command().seasonId() + "/recaps/" + fixture.command().projectionId();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    static class WebConfiguration {
        @Bean
        JdbcTemplate recapJdbc() {
            return jdbcTemplate;
        }

        @Bean
        ObjectMapper recapJson() {
            return JSON;
        }

        @Bean
        PlatformTransactionManager recapTransactions() {
            return new DataSourceTransactionManager(jdbcTemplate.getDataSource());
        }
    }

    private record Fixture(IssueFixture issue, String slug, UUID poster, UUID reference, String claim,
                           SeasonRecapApplication.Generate command) { }
}
