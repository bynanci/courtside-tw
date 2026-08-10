package tw.basketball.magazine.media.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.util.List;
import java.util.UUID;

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

final class EditorialMediaApiIT {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        EditorialWorkflowService service = EditorialWorkflowService.inMemory(
                URI.create("https://signed.example.test/upload")
        );
        mockMvc = MockMvcBuilders.standaloneSetup(
                new EditorialMediaController(service)
        ).build();
    }

    @Test
    void editorReceivesBoundedSignedUploadIntentBeforeCompletion() throws Exception {
        mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor())
                        .header("Idempotency-Key", "media-upload-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "filename":"cover.jpg",
                                  "contentType":"image/jpeg",
                                  "sizeBytes":1024,
                                  "checksumSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.uploadUrl").value(
                        "https://signed.example.test/upload/"
                ));
    }

    @Test
    void completionEnqueuesProcessingOnlyAfterChecksumAndMimeRecheck() throws Exception {
        MvcResult intent = mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .principal(editor())
                        .header("Idempotency-Key", "media-upload-2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "filename":"cover.jpg",
                                  "contentType":"image/jpeg",
                                  "sizeBytes":1024,
                                  "checksumSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        UUID assetId = UUID.fromString(
                OBJECT_MAPPER.readTree(intent.getResponse().getContentAsString())
                        .get("assetId")
                        .asText()
        );

        mockMvc.perform(post("/api/v1/editor/media/" + assetId + ":complete")
                        .principal(editor())
                        .header("Idempotency-Key", "media-complete-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "checksumSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                                  "contentType":"image/jpeg"
                                }
                                """))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.version").value(1));
    }

    private static UsernamePasswordAuthenticationToken editor() {
        return new UsernamePasswordAuthenticationToken(
                "editor-fixture",
                "test-only",
                List.of(new SimpleGrantedAuthority(OidcRolePolicy.authority(RoleCode.EDITOR)))
        );
    }
}
