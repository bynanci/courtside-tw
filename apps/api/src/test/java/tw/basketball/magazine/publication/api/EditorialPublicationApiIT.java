package tw.basketball.magazine.publication.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tw.basketball.magazine.identity.OidcRolePolicy;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialPublicationApiIT {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        EditorialWorkflowService service = EditorialWorkflowService.inMemory(
                URI.create("https://signed.example.test/upload")
        );
        mockMvc = MockMvcBuilders.standaloneSetup(
                new EditorialPublicationController(service)
        ).build();
    }

    @Test
    void editorCanCreateDraftAndReceivesAnOpaqueVersion() throws Exception {
        mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(editor())
                        .header("Idempotency-Key", "editor-issue-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"第 1 期","slug":"issue-1","description":"主場開季"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.state").value("DRAFT"));
    }

    @Test
    void staleIfMatchReturnsVersionConflictProblemDetails() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor())
                        .header("Idempotency-Key", "article-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"主場燈光亮起之前","slug":"opening-night"}
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        UUID articleId = UUID.fromString(
                OBJECT_MAPPER.readTree(created.getResponse().getContentAsString())
                        .get("articleId")
                        .asText()
        );

        mockMvc.perform(patch("/api/v1/editor/articles")
                        .principal(editor())
                        .header("If-Match", "\"0\"")
                        .header("Idempotency-Key", "article-patch-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "articleId":"%s",
                                  "changes":{"title":"修訂後標題"}
                                }
                                """.formatted(articleId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void publisherCannotCreateEditorDraftAndEditorRetryIsIdempotent() throws Exception {
        mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(publisher())
                        .header("Idempotency-Key", "publisher-cannot-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"不應建立","slug":"forbidden-issue"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        MvcResult created = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor())
                        .header("Idempotency-Key", "article-create-2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"可提交文章",
                                  "slug":"submittable-article",
                                  "content":{
                                    "schemaVersion":1,
                                    "documentId":"00000000-0000-4000-8000-000000000611",
                                    "blocks":[
                                      {
                                        "id":"00000000-0000-4000-8000-000000000612",
                                        "type":"paragraph",
                                        "version":1,
                                        "payload":{"content":[]}
                                      }
                                    ]
                                  }
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode article = OBJECT_MAPPER.readTree(created.getResponse().getContentAsString());
        UUID articleId = UUID.fromString(article.get("articleId").asText());
        String revisionId = article.get("revisionId").asText();

        MvcResult first = mockMvc.perform(post(
                        "/api/v1/editor/articles/" + articleId + ":submit")
                        .principal(editor())
                        .header("Idempotency-Key", "submit-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"revisionId\":\"%s\"}".formatted(revisionId)))
                .andExpect(status().isAccepted())
                .andReturn();
        String operationId = OBJECT_MAPPER.readTree(first.getResponse().getContentAsString())
                .get("operationId")
                .asText();

        mockMvc.perform(post("/api/v1/editor/articles/" + articleId + ":submit")
                        .principal(editor())
                        .header("Idempotency-Key", "submit-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"revisionId\":\"%s\"}".formatted(revisionId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.operationId").value(operationId));
    }

    private static UsernamePasswordAuthenticationToken editor() {
        return authentication("editor-fixture", RoleCode.EDITOR);
    }

    private static UsernamePasswordAuthenticationToken publisher() {
        return authentication("publisher-fixture", RoleCode.PUBLISHER);
    }

    private static UsernamePasswordAuthenticationToken authentication(
            String subject,
            RoleCode role
    ) {
        return new UsernamePasswordAuthenticationToken(
                subject,
                "test-only",
                List.of(new SimpleGrantedAuthority(OidcRolePolicy.authority(role)))
        );
    }
}
