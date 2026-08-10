package tw.basketball.magazine.publication.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

final class EditorialPublicationApiIT {
    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new Object()).build();

    @Test
    void editorCanCreateDraftAndReceivesAnOpaqueVersion() throws Exception {
        mockMvc.perform(post("/api/v1/editor/issues")
                        .header("Authorization", "Bearer editor-fixture")
                        .header("Idempotency-Key", "editor-issue-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"第 1 期","slug":"issue-1","description":"主場開季"}
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void staleIfMatchReturnsVersionConflictProblemDetails() throws Exception {
        mockMvc.perform(patch("/api/v1/editor/articles")
                        .header("Authorization", "Bearer editor-fixture")
                        .header("If-Match", "\"0\"")
                        .header("Idempotency-Key", "article-patch-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "articleId":"00000000-0000-4000-8000-000000000601",
                                  "changes":{"title":"修訂後標題"}
                                }
                                """))
                .andExpect(status().isConflict());
    }

    @Test
    void publisherAndEditorCommandsRemainDistinctAndIdempotent() throws Exception {
        mockMvc.perform(post(
                        "/api/v1/publisher/issues/00000000-0000-4000-8000-000000000602:schedule")
                        .header("Authorization", "Bearer publisher-fixture")
                        .header("If-Match", "\"1\"")
                        .header("Idempotency-Key", "schedule-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"publishAt":"2026-08-12T08:00:00Z","timezone":"Asia/Taipei"}
                                """))
                .andExpect(status().isAccepted());
    }
}
