package tw.basketball.magazine.content.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.content.application.EditorialContributorService;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.shared.RoleCode;

/** Actual database and HTTP proof for editable bylines and frozen revision credit. */
class EditorialContributorApiIT extends EditorialApiIntegrationTestSupport {
    @BeforeEach
    void configureContributorAdapter() {
        jdbcTemplate.execute("TRUNCATE contributor_command_receipt, contributor CASCADE");
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialContributorController(
                new EditorialContributorService(jdbcTemplate, new JdbcAuditWriter(jdbcTemplate, JSON),
                        new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())), JSON)))
                .setControllerAdvice(new EditorialApiExceptionHandler()).build();
    }

    @Test
    void createEditReadArchiveAreAuditedAndTenRetriesReplayExactlyOnce() throws Exception {
        var editor = actor("editor-contributor", RoleCode.EDITOR);
        String created = mockMvc.perform(post("/api/v1/editor/contributors").principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "create-person")
                        .content("{\"slug\":\"court-reporter\",\"displayName\":\"Court Reporter\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(1))
                .andReturn().getResponse().getContentAsString();
        for (int retry = 0; retry < 10; retry++) {
            assertEquals(created, mockMvc.perform(post("/api/v1/editor/contributors").principal(editor)
                            .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "create-person")
                            .content("{\"slug\":\"court-reporter\",\"displayName\":\"Court Reporter\"}"))
                    .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        }
        String id = JSON.readTree(created).path("contributorId").asString();
        mockMvc.perform(patch("/api/v1/editor/contributors/" + id).principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("If-Match", "\"1\"")
                        .header("Idempotency-Key", "rename-person").content("{\"displayName\":\"Updated Credit\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        mockMvc.perform(patch("/api/v1/editor/contributors/" + id).principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("If-Match", "\"1\"")
                        .header("Idempotency-Key", "stale-person").content("{\"displayName\":\"Stale\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
        mockMvc.perform(get("/api/v1/editor/contributors/" + id).principal(editor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Updated Credit"));
        mockMvc.perform(post("/api/v1/editor/contributors/" + id + ":archive").principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("If-Match", "\"2\"")
                        .header("Idempotency-Key", "archive-person").content("{\"reason\":\"No further assignments\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ARCHIVED"));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE target_type = 'CONTRIBUTOR'", Integer.class));
        assertApplicationMutationDenied("UPDATE audit_event SET action = 'ERASED' WHERE target_type = 'CONTRIBUTOR'");
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ERASED'", Integer.class));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE target_type = 'CONTRIBUTOR'", Integer.class));
    }

    @Test
    void bylineCanOnlyChangeOnCurrentDraftAndCannotBindArchivedContributor() throws Exception {
        var editor = actor("editor-credit", RoleCode.EDITOR);
        UUID contributor = UUID.randomUUID();
        UUID article = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO contributor (id, slug, display_name, version) VALUES (?, 'author-one', 'Author One', 1)", contributor);
        jdbcTemplate.update("INSERT INTO article (id, slug, version) VALUES (?, 'byline-story', 1)", article);
        jdbcTemplate.update("INSERT INTO article_revision (id, article_id, revision_number, title, dek, content_document) VALUES (?, ?, 1, 'Story', '', '{}'::jsonb)", revision, article);
        String path = "/api/v1/editor/articles/" + article + "/revisions/" + revision + "/contributors";
        String body = "{\"contributors\":[{\"contributorId\":\"" + contributor + "\",\"role\":\"AUTHOR\"}]}";
        mockMvc.perform(put(path).principal(editor).contentType(MediaType.APPLICATION_JSON)
                        .header("If-Match", "\"1\"").header("Idempotency-Key", "assign-credit").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.contributors[0].displayName").value("Author One"));
        mockMvc.perform(get(path).principal(editor)).andExpect(status().isOk())
                .andExpect(jsonPath("$.contributors[0].displayName").value("Author One"))
                .andExpect(jsonPath("$.version").value(2));
        mockMvc.perform(patch("/api/v1/editor/contributors/" + contributor).principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("If-Match", "\"1\"")
                        .header("Idempotency-Key", "rename-assigned-credit").content("{\"displayName\":\"Changed credit\"}"))
                .andExpect(status().isConflict());
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbcTemplate.update("UPDATE contributor SET display_name = 'Cannot rewrite credit' WHERE id = ?", contributor));
        jdbcTemplate.update("UPDATE article_revision SET state = 'IN_REVIEW' WHERE id = ?", revision);
        mockMvc.perform(put(path).principal(editor).contentType(MediaType.APPLICATION_JSON)
                        .header("If-Match", "\"2\"").header("Idempotency-Key", "frozen-credit").content("{\"contributors\":[]}"))
                .andExpect(status().isConflict());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM article_contributor WHERE article_revision_id = ?", Integer.class, revision));
        jdbcTemplate.update("UPDATE article_revision SET state = 'DRAFT' WHERE id = ?", revision);
        jdbcTemplate.update("UPDATE contributor SET status = 'ARCHIVED' WHERE id = ?", contributor);
        mockMvc.perform(put(path).principal(editor).contentType(MediaType.APPLICATION_JSON)
                        .header("If-Match", "\"2\"").header("Idempotency-Key", "archived-credit").content(body))
                .andExpect(status().isConflict());
        assertEquals(2L, jdbcTemplate.queryForObject("SELECT version FROM article WHERE id = ?", Long.class, article));
    }

    @Test
    void publisherAndReaderCannotMutateContributorAndReusedKeyCannotChangePayload() throws Exception {
        for (RoleCode role : new RoleCode[] {RoleCode.READER, RoleCode.PUBLISHER, RoleCode.ADMIN}) {
            mockMvc.perform(post("/api/v1/editor/contributors").principal(actor("non-editor", role))
                            .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "denied-person")
                            .content("{\"slug\":\"denied\",\"displayName\":\"Denied\"}"))
                    .andExpect(status().isForbidden());
        }
        var editor = actor("editor-key", RoleCode.EDITOR);
        for (String name : new String[] {"First", "Second"}) {
            mockMvc.perform(post("/api/v1/editor/contributors").principal(editor)
                            .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "same-key")
                            .content("{\"slug\":\"same-person\",\"displayName\":\"" + name + "\"}"))
                    .andExpect(name.equals("First") ? status().isCreated() : status().isConflict());
        }
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM contributor", Integer.class));
    }
}
