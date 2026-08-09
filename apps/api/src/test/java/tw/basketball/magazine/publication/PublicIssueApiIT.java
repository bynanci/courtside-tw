package tw.basketball.magazine.publication;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

final class PublicIssueApiIT extends PublicIssueApiIntegrationTestSupport {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void listsOnlyPublishedRightsValidIssuesWithBoundedOpaqueKeysetPaginationAndEtags()
            throws Exception {
        IssueFixture newest = createIssue(
                "issue-2026-02",
                2,
                Instant.parse("2026-08-02T00:00:00Z"),
                "PUBLISHED",
                true
        );
        IssueFixture older = createIssue(
                "issue-2026-01",
                1,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        createIssue(
                "issue-draft-private",
                3,
                Instant.parse("2026-08-03T00:00:00Z"),
                "DRAFT",
                true
        );
        createIssue(
                "issue-withdrawn-private",
                4,
                Instant.parse("2026-08-04T00:00:00Z"),
                "WITHDRAWN",
                true
        );
        createIssue(
                "issue-invalid-rights",
                5,
                Instant.parse("2026-08-05T00:00:00Z"),
                "PUBLISHED",
                false
        );
        addArticle(newest, "Featured", 1, "opening-night", 1, "PUBLISHED");
        addArticle(older, "Archive", 1, "winter-final", 1, "PUBLISHED");

        MvcResult firstPage = mockMvc.perform(get("/api/v1/public/issues")
                        .param("limit", "1")
                        .header("X-Request-Id", "us1-public-list"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items[0].slug").value("issue-2026-02"))
                .andExpect(jsonPath("$.items[0].issueNumber").value(2))
                .andExpect(jsonPath("$.items[0].summary").value("Summary for issue-2026-02"))
                .andExpect(jsonPath("$.items[0].cover.url").value("/media/issues/issue-2026-02/cover.webp"))
                .andExpect(jsonPath("$.items[0].cover.width").value(1200))
                .andExpect(jsonPath("$.items[0].cover.height").value(1600))
                .andExpect(jsonPath("$.items[0].articleCount").value(1))
                .andExpect(jsonPath("$.page.limit").value(1))
                .andReturn();

        String etag = firstPage.getResponse().getHeader(HttpHeaders.ETAG);
        assertNotNull(etag);
        JsonNode firstPayload = OBJECT_MAPPER.readTree(firstPage.getResponse().getContentAsString());
        String nextCursor = firstPayload.at("/page/nextCursor").asText();
        assertFalse(nextCursor.isBlank());
        assertFalse(firstPage.getResponse().getContentAsString().contains("private"));

        mockMvc.perform(get("/api/v1/public/issues")
                        .param("limit", "1")
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotModified());

        mockMvc.perform(get("/api/v1/public/issues")
                        .param("limit", "1")
                        .param("cursor", nextCursor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].slug").value("issue-2026-01"))
                .andExpect(jsonPath("$.page.nextCursor").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void returnsVisibleSectionsAndArticlesInEditorOrderWithoutDraftMetadata() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-03",
                3,
                Instant.parse("2026-08-03T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Second", 2, "second-story", 1, "PUBLISHED");
        addArticle(issue, "First", 1, "first-story", 2, "PUBLISHED");
        addArticle(issue, "Private desk", 3, "draft-story-private", 1, "DRAFT");

        MvcResult result = mockMvc.perform(get("/api/v1/public/issues/issue-2026-03"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueNumber").value(3))
                .andExpect(jsonPath("$.cover.alt").value("《issue-2026-03》封面"))
                .andExpect(jsonPath("$.sections[0].title").value("First"))
                .andExpect(jsonPath("$.sections[0].position").value(1))
                .andExpect(jsonPath("$.sections[0].articles[0].slug").value("first-story"))
                .andExpect(jsonPath("$.sections[1].title").value("Second"))
                .andExpect(jsonPath("$.sections[1].position").value(2))
                .andReturn();

        assertFalse(result.getResponse().getContentAsString().contains("private"));
    }

    @Test
    void returnsSafeProblemDetailsForUnknownWithdrawnAndInvalidPublicRequests() throws Exception {
        createIssue(
                "issue-withdrawn-private",
                9,
                Instant.parse("2026-08-08T00:00:00Z"),
                "WITHDRAWN",
                true
        );

        mockMvc.perform(get("/api/v1/public/issues/unknown-issue")
                        .header("X-Request-Id", "us1-unknown"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        MvcResult withdrawn = mockMvc.perform(get("/api/v1/public/issues/issue-withdrawn-private"))
                .andExpect(status().isNotFound())
                .andReturn();
        assertFalse(withdrawn.getResponse().getContentAsString().contains("withdrawn-private"));

        mockMvc.perform(get("/api/v1/public/issues")
                        .param("limit", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/public/issues")
                        .param("cursor", "not-an-opaque-cursor"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsAFuturePublishedIssueInsteadOfLeakingScheduledMetadata() throws Exception {
        createIssue(
                "issue-future-private",
                10,
                Instant.now().plusSeconds(86_400),
                "PUBLISHED",
                true
        );

        MvcResult result = mockMvc.perform(get("/api/v1/public/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andReturn();

        assertFalse(result.getResponse().getContentAsString().contains("future-private"));
    }
}
