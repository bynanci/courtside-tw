package tw.basketball.magazine.taxonomy.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.taxonomy.application.TaxonomyService;

final class EditorialTaxonomyApiIT extends PublicIssueApiIntegrationTestSupport {
    private static final ObjectMapper JSON = new ObjectMapper();

    @BeforeEach
    void createTaxonomyController() {
        TaxonomyService service = new TaxonomyService(
                jdbcTemplate,
                new DataSourceTransactionManager(jdbcTemplate.getDataSource()),
                new JdbcAuditWriter(jdbcTemplate, JSON)
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialTaxonomyController(service))
                .setControllerAdvice(new TaxonomyApiExceptionHandler())
                .build();
    }

    @Test
    void editorCreatesRenamesAndAliasesTermsWithoutUsingNamesAsIdentifiers() throws Exception {
        MvcResult first = mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "key": "league-plg",
                                  "kind": "LEAGUE",
                                  "displayName": "台灣職籃",
                                  "locale": "zh-TW",
                                  "validFrom": "2026-08-01T00:00:00Z"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
                .andExpect(jsonPath("$.key").value("league-plg"))
                .andExpect(jsonPath("$.displayName").value("台灣職籃"))
                .andReturn();
        JsonNode firstBody = JSON.readTree(first.getResponse().getContentAsString());
        UUID firstId = UUID.fromString(firstBody.path("id").asString());

        MvcResult second = mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "key": "topic-pro-basketball",
                                  "kind": "TOPIC",
                                  "displayName": "台灣職籃",
                                  "locale": "zh-TW",
                                  "validFrom": "2026-08-01T00:00:00Z"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.displayName").value("台灣職籃"))
                .andReturn();
        UUID secondId = UUID.fromString(
                JSON.readTree(second.getResponse().getContentAsString()).path("id").asString()
        );
        assertNotEquals(firstId, secondId);

        mockMvc.perform(patch("/api/v1/editor/taxonomy/{termId}", firstId)
                        .principal(actor(RoleCode.EDITOR))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"PLG","status":"ACTIVE","clearValidUntil":false}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
                .andExpect(jsonPath("$.id").value(firstId.toString()))
                .andExpect(jsonPath("$.key").value("league-plg"))
                .andExpect(jsonPath("$.displayName").value("PLG"));

        mockMvc.perform(post("/api/v1/editor/taxonomy/{termId}/aliases", firstId)
                        .principal(actor(RoleCode.EDITOR))
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "alias":"P+ League",
                                  "locale":"en",
                                  "validFrom":"2026-08-01T00:00:00Z"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.ETAG, "\"2\""))
                .andExpect(jsonPath("$.aliases[0].alias").value("P+ League"))
                .andExpect(jsonPath("$.aliases[0].normalizedAlias").value("p league"));

        assertEquals(
                "p league",
                jdbcTemplate.queryForObject(
                        "SELECT normalized_alias FROM taxonomy_alias WHERE term_id = ?",
                        String.class,
                        firstId
                )
        );
        assertEquals(
                List.of(
                        "TAXONOMY_TERM_CREATED",
                        "TAXONOMY_TERM_UPDATED",
                        "TAXONOMY_ALIAS_CREATED"
                ),
                jdbcTemplate.queryForList(
                        """
                        SELECT action
                        FROM audit_event
                        WHERE target_type = 'TAXONOMY_TERM' AND target_id = ?
                        ORDER BY occurred_at, id
                        """,
                        String.class,
                        firstId
                )
        );
        assertEquals(
                3,
                jdbcTemplate.queryForObject(
                        """
                        SELECT count(*)
                        FROM audit_event
                        WHERE target_type = 'TAXONOMY_TERM'
                          AND target_id = ?
                          AND actor_subject = 'taxonomy-test'
                        """,
                        Integer.class,
                        firstId
                )
        );
    }

    @Test
    void staleVersionAndNonEditorMutationFailClosed() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "key":"team-dreamers",
                                  "kind":"TEAM",
                                  "displayName":"夢想家",
                                  "validFrom":"2026-08-01T00:00:00Z"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        String termId = JSON.readTree(created.getResponse().getContentAsString())
                .path("id").asString();

        mockMvc.perform(patch("/api/v1/editor/taxonomy/{termId}", termId)
                        .principal(actor(RoleCode.EDITOR))
                        .header(HttpHeaders.IF_MATCH, "\"9\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"福爾摩沙夢想家\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
                .andExpect(jsonPath("$.errors[0].code").value("current_version"))
                .andExpect(jsonPath("$.errors[0].message").value("\"0\""));

        mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"key":"team-kings","kind":"TEAM","displayName":"國王"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"key":"夢想家","kind":"TEAM","displayName":"夢想家"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].code").value("taxonomy_key_invalid"));
    }

    @Test
    void emptyPatchIsRejectedWithoutAdvancingTheTermVersion() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/editor/taxonomy")
                        .principal(actor(RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "key":"topic-empty-patch",
                                  "kind":"TOPIC",
                                  "displayName":"Empty patch"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        UUID termId = UUID.fromString(JSON.readTree(created.getResponse().getContentAsString())
                .path("id").asString());

        mockMvc.perform(patch("/api/v1/editor/taxonomy/{termId}", termId)
                        .principal(actor(RoleCode.EDITOR))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].code").value("taxonomy_patch_empty"));

        assertEquals(0L, jdbcTemplate.queryForObject(
                "SELECT version FROM taxonomy_term WHERE id = ?",
                Long.class,
                termId
        ));
    }

    @Test
    void auditFailureRollsBackTheTaxonomyMutation() {
        TaxonomyService service = new TaxonomyService(
                jdbcTemplate,
                new DataSourceTransactionManager(jdbcTemplate.getDataSource()),
                ignored -> {
                    throw new IllegalStateException("audit unavailable");
                }
        );
        ActorContext editor = ActorContext.user(
                "taxonomy-rollback-test",
                Set.of(RoleCode.EDITOR),
                RequestId.of("req-taxonomy-rollback")
        );

        assertThrows(
                IllegalStateException.class,
                () -> service.create(
                        editor,
                        new TaxonomyService.CreateTerm(
                                "topic-audit-rollback",
                                "TOPIC",
                                "Audit rollback",
                                "en",
                                null,
                                null
                        )
                )
        );

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM taxonomy_term WHERE term_key = 'topic-audit-rollback'",
                Integer.class
        ));
    }

    private static Authentication actor(RoleCode role) {
        return new UsernamePasswordAuthenticationToken(
                "taxonomy-test",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }
}
