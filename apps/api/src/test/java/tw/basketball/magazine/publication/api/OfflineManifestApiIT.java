package tw.basketball.magazine.publication.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.publication.application.OfflineManifestService;

/**
 * T071 RED contract for the public offline manifest boundary.
 *
 * T071 remains the executable contract boundary for the T072 manifest
 * service/controller implementation; it must fail closed for non-published or
 * rights-ineligible data while exposing only bounded versioned metadata.
 */
final class OfflineManifestApiIT extends PublicIssueApiIntegrationTestSupport {
    @BeforeEach
    void createOfflineManifestController() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                new OfflineManifestController(new OfflineManifestService(jdbcTemplate))
        ).build();
    }

    @Test
    void returnsABoundedVersionedManifestForAPublishedIssue() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-01",
                1,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Featured", 1, "opening-night", 1, "PUBLISHED");

        mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", issue.slug()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.issueSlug").value(issue.slug()))
                .andExpect(jsonPath("$.manifestVersion").value(2))
                .andExpect(jsonPath("$.checksum").value(Matchers.matchesPattern("[0-9a-f]{64}")))
                .andExpect(jsonPath("$.expiresAt").exists())
                .andExpect(jsonPath("$.assetBytes").value(512))
                .andExpect(jsonPath("$.assets[0].byteSize").value(512))
                .andExpect(jsonPath("$.assets[0].checksum").value(Matchers.matchesPattern("[0-9a-f]{64}")))
                .andExpect(jsonPath("$.assets[0].expiresAt").exists())
                .andExpect(jsonPath("$.articles[0].slug").value("opening-night"))
                .andExpect(jsonPath("$.articles[0].title").value("Article opening-night"))
                .andExpect(jsonPath("$.articles[0].position").value(1))
                .andExpect(jsonPath("$.articles[0].revisionId").isNotEmpty())
                .andExpect(jsonPath("$.articles[0].revisionNumber").value(1))
                .andExpect(jsonPath("$.articles[0].checksum").value(Matchers.matchesPattern("[0-9a-f]{64}")));
    }

    @Test
    void honorsStandardQuotedIfNoneMatchHeader() throws Exception {
        IssueFixture issue = createIssue(
                "issue-2026-01-etag",
                5,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Featured", 1, "etag-article", 1, "PUBLISHED");

        MvcResult initial = mockMvc.perform(
                get("/api/v1/public/offline/issues/{issueSlug}/manifest", issue.slug())
        ).andExpect(status().isOk()).andReturn();
        String responseTag = initial.getResponse().getHeader(HttpHeaders.ETAG);
        if (responseTag == null) {
            throw new AssertionError("offline manifest response must include an ETag");
        }
        String standardTag = responseTag.startsWith("\"") ? responseTag : "\"" + responseTag + "\"";

        mockMvc.perform(
                get("/api/v1/public/offline/issues/{issueSlug}/manifest", issue.slug())
                        .header(HttpHeaders.IF_NONE_MATCH, standardTag)
        ).andExpect(status().isNotModified());
    }

    @Test
    void returnsAVersionedWithdrawalManifestForOfflineClients() throws Exception {
        mockMvc.perform(get("/api/v1/public/withdrawals"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.version").value(Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.generatedAt").exists())
                .andExpect(jsonPath("$.withdrawals").isArray())
                .andExpect(jsonPath("$.checksum").value(Matchers.matchesPattern("[0-9a-f]{64}")));
    }

    @Test
    void deniesDraftWithdrawnAndOfflineIneligibleIssuesWithoutLeakingMetadata() throws Exception {
        createIssue(
                "issue-draft",
                2,
                Instant.parse("2026-08-02T00:00:00Z"),
                "DRAFT",
                true
        );
        createIssue(
                "issue-withdrawn",
                3,
                Instant.parse("2026-08-03T00:00:00Z"),
                "WITHDRAWN",
                true
        );
        createIssue(
                "issue-reader-only",
                4,
                Instant.parse("2026-08-04T00:00:00Z"),
                "PUBLISHED",
                false
        );

        mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", "issue-draft"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", "issue-withdrawn"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", "issue-reader-only"))
                .andExpect(status().isNotFound());
    }
}
