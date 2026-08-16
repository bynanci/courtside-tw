package tw.basketball.magazine.publication.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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
    private static final ObjectMapper JSON = new ObjectMapper();

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

    @Test
    void deniesAPublicWebOnlyIssueFromTheOfflineChannel() throws Exception {
        IssueFixture issue = createIssue(
                "issue-public-web-only",
                6,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Featured", 1, "web-only-article", 1, "PUBLISHED");
        jdbcTemplate.update("""
                UPDATE rights_record
                SET allowed_channels = ARRAY['PUBLIC_WEB']::text[]
                WHERE asset_id = (SELECT cover_asset_id FROM publication_issue WHERE id = ?)
                """, issue.id());

        mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", issue.slug()))
                .andExpect(status().isNotFound());
    }

    @Test
    void freezesArticleRevisionIdentityUntilTheIssueSnapshotAdvances() throws Exception {
        IssueFixture issue = createIssue(
                "issue-frozen-revision",
                7,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Featured", 1, "frozen-article", 1, "PUBLISHED");

        MvcResult firstResult = manifest(issue.slug());
        JsonNode first = json(firstResult);
        String frozenRevisionId = first.at("/articles/0/revisionId").asString();
        String frozenChecksum = first.get("checksum").asString();
        String frozenEtag = firstResult.getResponse().getHeader(HttpHeaders.ETAG);
        long frozenVersion = first.get("manifestVersion").asLong();

        UUID replacementRevisionId = publishReplacementRevision("frozen-article");
        MvcResult beforeIssueRepublishResult = manifest(issue.slug());
        JsonNode beforeIssueRepublish = json(beforeIssueRepublishResult);
        assertEquals(frozenRevisionId, beforeIssueRepublish.at("/articles/0/revisionId").asString());
        assertEquals(frozenChecksum, beforeIssueRepublish.get("checksum").asString());
        assertEquals(frozenEtag, beforeIssueRepublishResult.getResponse().getHeader(HttpHeaders.ETAG));

        refreshSnapshot(issue.id());
        MvcResult afterIssueRepublishResult = manifest(issue.slug());
        JsonNode afterIssueRepublish = json(afterIssueRepublishResult);
        assertEquals(
                replacementRevisionId.toString(),
                afterIssueRepublish.at("/articles/0/revisionId").asString()
        );
        assertTrue(afterIssueRepublish.get("manifestVersion").asLong() > frozenVersion);
        assertNotEquals(frozenChecksum, afterIssueRepublish.get("checksum").asString());
        assertNotEquals(
                frozenEtag,
                afterIssueRepublishResult.getResponse().getHeader(HttpHeaders.ETAG)
        );
    }

    @Test
    void servesChecksummedArticleContentDeclaredByTheManifest() throws Exception {
        IssueFixture issue = createIssue(
                "issue-offline-content",
                8,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "Featured", 1, "offline-content", 1, "PUBLISHED");

        MvcResult manifestResult = mockMvc.perform(
                get("/api/v1/public/offline/issues/{issueSlug}/manifest", issue.slug())
        )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.articles[0].contentUrl").isNotEmpty())
                .andExpect(jsonPath("$.articles[0].byteSize").value(Matchers.greaterThan(0)))
                .andReturn();
        JsonNode article = json(manifestResult).at("/articles/0");

        MvcResult contentResult = mockMvc.perform(get(article.get("contentUrl").asString()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.slug").value("offline-content"))
                .andExpect(jsonPath("$.content.blocks[0].type").value("paragraph"))
                .andExpect(jsonPath("$.issueNavigation.issueSlug").value(issue.slug()))
                .andReturn();
        byte[] bytes = contentResult.getResponse().getContentAsByteArray();
        assertEquals(article.get("byteSize").asLong(), bytes.length);
        assertEquals(article.get("checksum").asString(), digest(bytes));
    }

    @Test
    void advancesWithdrawalVersionForEveryNewWithdrawalAndChecksumsCanonicalPayload()
            throws Exception {
        IssueFixture issue = createIssue(
                "issue-withdrawal-sequence",
                9,
                Instant.parse("2026-08-01T00:00:00Z"),
                "PUBLISHED",
                true
        );
        addArticle(issue, "First", 1, "withdrawal-high-version", 1, "PUBLISHED");
        addArticle(issue, "Second", 2, "withdrawal-low-version", 2, "PUBLISHED");
        jdbcTemplate.update("UPDATE article SET version = 10 WHERE slug = 'withdrawal-high-version'");

        long before = json(mockMvc.perform(get("/api/v1/public/withdrawals"))
                .andExpect(status().isOk())
                .andReturn()).get("version").asLong();
        jdbcTemplate.update("""
                UPDATE article
                SET state = 'WITHDRAWN', version = version + 1
                WHERE slug = 'withdrawal-low-version'
                """);

        JsonNode manifest = json(mockMvc.perform(get("/api/v1/public/withdrawals"))
                .andExpect(status().isOk())
                .andReturn());
        long after = manifest.get("version").asLong();
        assertTrue(after > before, "withdrawal version must advance independently of entity maxima");
        List<String> withdrawals = new java.util.ArrayList<>();
        manifest.get("withdrawals").forEach(value -> withdrawals.add(value.asString()));
        withdrawals.sort(String::compareTo);
        String canonical = after + "\n" + String.join("\n", withdrawals);
        assertEquals(
                digest(canonical.getBytes(StandardCharsets.UTF_8)),
                manifest.get("checksum").asString()
        );
    }

    private MvcResult manifest(String issueSlug) throws Exception {
        return mockMvc.perform(get("/api/v1/public/offline/issues/{issueSlug}/manifest", issueSlug))
                .andExpect(status().isOk())
                .andReturn();
    }

    private static JsonNode json(MvcResult result) throws Exception {
        return JSON.readTree(result.getResponse().getContentAsByteArray());
    }

    private static String digest(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
}
