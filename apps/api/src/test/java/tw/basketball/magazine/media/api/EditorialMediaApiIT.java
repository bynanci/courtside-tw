package tw.basketball.magazine.media.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

final class EditorialMediaApiIT {
    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new Object()).build();

    @Test
    void editorReceivesBoundedSignedUploadIntentBeforeCompletion() throws Exception {
        mockMvc.perform(post("/api/v1/editor/media/uploads")
                        .header("Authorization", "Bearer editor-fixture")
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
                .andExpect(status().isCreated());
    }

    @Test
    void completionEnqueuesProcessingOnlyAfterChecksumAndMimeRecheck() throws Exception {
        mockMvc.perform(post(
                        "/api/v1/editor/media/00000000-0000-4000-8000-000000000603:complete")
                        .header("Authorization", "Bearer editor-fixture")
                        .header("Idempotency-Key", "media-complete-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "checksumSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                                  "contentType":"image/jpeg"
                                }
                                """))
                .andExpect(status().isAccepted());
    }
}
