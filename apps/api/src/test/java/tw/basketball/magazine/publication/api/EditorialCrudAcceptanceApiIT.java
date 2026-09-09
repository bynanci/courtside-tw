package tw.basketball.magazine.publication.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tw.basketball.magazine.content.persistence.JdbcPublicArticleRepository;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.shared.RoleCode;

/** Editorial preview remains private through create, edit, review and archival. */
class EditorialCrudAcceptanceApiIT extends EditorialApiIntegrationTestSupport {
    @Test
    void fullArticleLifecyclePreservesPrivatePreviewAndImmutablePublicationHistory() throws Exception {
        var editor = actor("crud-editor", RoleCode.EDITOR);
        var publisher = actor("crud-publisher", RoleCode.PUBLISHER);
        String created = mockMvc.perform(post("/api/v1/editor/articles").principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "crud-create")
                        .content("""
                                {"title":"Private preview","slug":"private-preview","dek":"Draft summary",
                                "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000061",
                                "blocks":[{"id":"00000000-0000-4000-8000-000000000161","type":"paragraph","version":1,
                                "payload":{"content":[{"kind":"text","text":"Private editorial preview canary"}]}}]}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        CreatedArticle article = readCreatedArticle(created);
        mockMvc.perform(get("/api/v1/editor/articles/" + article.articleId()).principal(editor))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.content.blocks[0].payload.content[0].text").value("Private editorial preview canary"));
        JdbcPublicArticleRepository publicArticles = new JdbcPublicArticleRepository(jdbcTemplate, JSON);
        assertTrue(publicArticles.findBySlug("private-preview", null, applicationClock.now()).isEmpty());
        mockMvc.perform(get("/api/v1/editor/articles/" + article.articleId()).principal(actor("reader", RoleCode.READER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/v1/editor/articles").principal(editor).contentType(MediaType.APPLICATION_JSON)
                        .header("If-Match", "\"1\"").header("Idempotency-Key", "crud-patch")
                        .content("{\"articleId\":\"" + article.articleId() + "\",\"changes\":{\"title\":\"Reviewed preview\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        mockMvc.perform(post("/api/v1/editor/articles/" + article.articleId() + ":submit").principal(editor)
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "crud-submit")
                        .content("{\"revisionId\":\"" + article.revisionId() + "\"}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.version").value(3));
        assertTrue(publicArticles.findBySlug("private-preview", null, applicationClock.now()).isEmpty());
        for (String action : new String[] {"approve", "publish", "archive"}) {
            int expectedVersion = switch (action) { case "approve" -> 3; case "publish" -> 4; default -> 5; };
            mockMvc.perform(post("/api/v1/publisher/articles/" + article.articleId() + ":" + action).principal(publisher)
                            .header("If-Match", "\"" + expectedVersion + "\"").header("Idempotency-Key", "crud-" + action))
                    .andExpect(status().isAccepted()).andExpect(jsonPath("$.version").value(expectedVersion + 1));
        }
        assertEquals("ARCHIVED", jdbcTemplate.queryForObject("SELECT state FROM article WHERE id = ?", String.class, article.articleId()));
        assertTrue(publicArticles.findBySlug("private-preview", null, applicationClock.now()).isEmpty());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ?", Integer.class, article.articleId()));
        assertEquals("Reviewed preview", JSON.readTree(jdbcTemplate.queryForObject(
                "SELECT content_document::text FROM publication_snapshot WHERE aggregate_id = ?", String.class, article.articleId())).path("title").asString());
        assertEquals(6, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE target_type = 'ARTICLE' AND target_id = ?", Integer.class, article.articleId()));
    }
}
