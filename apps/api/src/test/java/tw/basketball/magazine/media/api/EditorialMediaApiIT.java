package tw.basketball.magazine.media.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialMediaApiIT extends EditorialApiIntegrationTestSupport {
    private static final String CREATE_BODY = """
            {
              "title": "Rights fixture",
              "slug": "rights-fixture",
              "dek": "A rights fixture",
              "content": {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000002","blocks":[{"id":"00000000-0000-4000-8000-000000000104","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Rights fixture"}]}}]}
            }
            """;

    @Test
    void nonReadyMediaBlocksBeforeRightsEvaluationAndKeepsAssetIdentity() throws Exception {
        var editor = actor("media-editor-1", RoleCode.EDITOR);
        var article = createArticle(editor, "media-create-not-ready");
        linkMedia(article.revisionId(), "PROCESSING", "VALID", Set.of("PUBLIC_WEB"));

        submitRequest(article, editor, "media-processing")
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value("MEDIA_NOT_READY"))
                .andExpect(jsonPath("$.errors[0].path").value(org.hamcrest.Matchers.startsWith("/media/")));
    }

    @Test
    void expiredRightsBlocksSubmitWithStableCodeAndDoesNotAdvanceArticle() throws Exception {
        var editor = actor("media-editor-2", RoleCode.EDITOR);
        var article = createArticle(editor, "media-create-expired");
        linkMedia(article.revisionId(), "READY", "EXPIRED", Set.of("PUBLIC_WEB"));

        submitRequest(article, editor, "media-expired")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value("RIGHTS_EXPIRED"));

        org.junit.jupiter.api.Assertions.assertEquals(
                "DRAFT",
                jdbcTemplate.queryForObject(
                        "SELECT state FROM article WHERE id = ?", String.class, article.articleId()
                )
        );
        org.junit.jupiter.api.Assertions.assertEquals(
                1L,
                jdbcTemplate.queryForObject(
                        "SELECT version FROM article WHERE id = ?", Long.class, article.articleId()
                )
        );
    }

    private CreatedArticle createArticle(
            org.springframework.security.core.Authentication editor,
            String key
    ) throws Exception {
        var result = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andReturn();
        return readCreatedArticle(result.getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions submitRequest(
            CreatedArticle article,
            org.springframework.security.core.Authentication editor,
            String key
    ) throws Exception {
        MockHttpServletRequestBuilder request = post(
                "/api/v1/editor/articles/{id}:submit", article.articleId()
        )
                .principal(editor)
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key)
                .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId()));
        return mockMvc.perform(request);
    }
}
