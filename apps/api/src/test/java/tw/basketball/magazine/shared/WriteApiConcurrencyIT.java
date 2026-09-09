package tw.basketball.magazine.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.content.api.EditorialContributorController;
import tw.basketball.magazine.content.application.EditorialContributorService;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.api.EditorialMediaMetadataController;
import tw.basketball.magazine.media.api.PublisherMediaController;
import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.media.application.PublisherMediaService;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.api.EditorialIssueController;
import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.taxonomy.api.EditorialTaxonomyController;
import tw.basketball.magazine.taxonomy.api.TaxonomyApiExceptionHandler;
import tw.basketball.magazine.taxonomy.application.TaxonomyService;

/** DEV-037: actual PostgreSQL mutations, every implemented If-Match route, and revision-guarded submission. */
final class WriteApiConcurrencyIT extends EditorialApiIntegrationTestSupport {
    private UUID articleId;
    private UUID revisionId;
    private UUID issueId;
    private UUID sectionId;
    private UUID assetId;
    private UUID termId;
    private UUID contributorId;

    @BeforeEach
    void installRealServicesAndCreateDraftsThroughHttp() throws Exception {
        var transactions = new DataSourceTransactionManager(jdbcTemplate.getDataSource());
        var template = new TransactionTemplate(transactions);
        var audit = new JdbcAuditWriter(jdbcTemplate, JSON);
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new EditorialArticleController(new EditorialWorkflowService(
                                new JdbcEditorialArticleRepository(jdbcTemplate), audit, template, JSON, applicationClock)),
                        new EditorialIssueController(new EditorialIssueService(
                                new JdbcEditorialIssueRepository(jdbcTemplate), audit, template, JSON, applicationClock)),
                        new EditorialMediaMetadataController(new EditorialMediaMetadataService(
                                jdbcTemplate, audit, template, JSON)),
                        new PublisherMediaController(new PublisherMediaService(jdbcTemplate, audit, template, JSON)),
                        new EditorialTaxonomyController(new TaxonomyService(jdbcTemplate, transactions, audit)),
                        new EditorialContributorController(new EditorialContributorService(jdbcTemplate, audit, template, JSON)))
                .setControllerAdvice(new EditorialApiExceptionHandler(), new TaxonomyApiExceptionHandler(),
                        new ApiExceptionHandler())
                .build();
        JsonNode article = create("/api/v1/editor/articles", """
                {"title":"Contract fixture","slug":"contract-fixture","dek":"Contract test",
                 "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001",
                  "blocks":[{"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"Contract body"}]}}]}}
                """, "article");
        articleId = UUID.fromString(article.path("articleId").asString());
        revisionId = UUID.fromString(article.path("revisionId").asString());
        // Media storage is an external boundary; seed one ready asset, then test real metadata writes.
        assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state, version)
                VALUES (?, ?, ?, 'image/jpeg', 100, 10, 10, 'Contract cover', 'READY', 1)
                """, assetId, "private/contract/" + assetId, "a".repeat(64));
        JsonNode issue = create("/api/v1/editor/issues", """
                {"title":"Contract issue","slug":"contract-issue","description":"Contract issue","coverAssetId":"%s"}
                """.formatted(assetId), "issue");
        issueId = UUID.fromString(issue.path("issueId").asString());
        sectionId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO issue_section (id, issue_id, title, position) VALUES (?, ?, 'Contract section', 1)",
                sectionId, issueId);
        JsonNode term = create("/api/v1/editor/taxonomy", """
                {"key":"topic-contract","kind":"TOPIC","displayName":"Contract taxonomy",
                 "locale":"zh-TW","validFrom":"2026-08-01T00:00:00Z"}
                """, "taxonomy");
        termId = UUID.fromString(term.path("id").asString());
        mockMvc.perform(patch("/api/v1/editor/taxonomy/{id}", termId)
                        .principal(actor("contract-editor", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON).header("If-Match", "\"0\"")
                        .content("{\"displayName\":\"Contract taxonomy revised\"}"))
                .andExpect(status().isOk()).andExpect(header().string("ETag", "\"1\""));
        JsonNode contributor = create("/api/v1/editor/contributors", """
                {"slug":"contract-contributor","displayName":"Contract Contributor"}
                """, "contributor");
        contributorId = UUID.fromString(contributor.path("contributorId").asString());
    }

    @Test
    void everyConditionalWriteRejectsMissingMalformedAndStaleVersionsWithoutMutatingPersistence() throws Exception {
        List<ConditionalWrite> writes = conditionalWrites();
        assertEquals(25, writes.size(), "The endpoint closure must track all implemented conditional writes");
        List<String> before = persistenceSnapshot();
        for (ConditionalWrite write : writes) {
            for (String version : List.of("", "*", "W/\"1\"", "\"0\"")) {
                String requestId = "write-contract-" + UUID.randomUUID();
                var builder = request(write.method(), write.path())
                        .principal(actor("contract-" + write.role().name(), write.role()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "matrix-" + UUID.randomUUID())
                        .header("X-Request-Id", requestId).content(write.body());
                if (!version.isEmpty()) {
                    builder.header("If-Match", version);
                }
                boolean stale = version.equals("\"0\"");
                var result = mockMvc.perform(builder)
                        .andExpect(status().is(stale ? 409 : 400))
                        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                        .andExpect(header().string("X-Request-Id", requestId))
                        .andExpect(jsonPath("$.requestId").value(requestId))
                        .andExpect(jsonPath("$.instance").value(write.path()))
                        .andExpect(jsonPath("$.code").value(stale ? "VERSION_CONFLICT" : "INVALID_REQUEST"));
                if (stale) {
                    result.andExpect(jsonPath("$.errors[0].path").value("/version"))
                            .andExpect(jsonPath("$.errors[0].code").value("current_version"))
                            .andExpect(jsonPath("$.errors[0].message").value("\"1\""));
                }
                assertEquals(before, persistenceSnapshot(), write.method() + " " + write.path() + " " + version);
            }
        }
    }

    @Test
    void revisionGuardedSubmitRejectsTheWrongRevisionInsteadOfOverwritingCurrentContent() throws Exception {
        List<String> before = persistenceSnapshot();
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", articleId)
                        .principal(actor("contract-editor", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "wrong-revision")
                        .header("X-Request-Id", "contract-revision-conflict")
                        .content("{\"revisionId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
                .andExpect(jsonPath("$.requestId").value("contract-revision-conflict"))
                .andExpect(jsonPath("$.errors[0].code").value("REVISION_CONFLICT"));
        assertEquals(before, persistenceSnapshot());
    }

    @Test
    void blockedPublishAndItsReplayUseTheActualHttpInstanceAndCurrentCorrelationId() throws Exception {
        linkMedia(revisionId, "READY", "VALID", Set.of("PUBLIC_WEB"));
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", articleId)
                        .principal(actor("contract-editor", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "submit-for-block")
                        .content("{\"revisionId\":\"" + revisionId + "\"}"))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", articleId)
                        .principal(actor("contract-publisher", RoleCode.PUBLISHER))
                        .header("If-Match", "\"2\"").header("Idempotency-Key", "approve-for-block"))
                .andExpect(status().isAccepted());
        jdbcTemplate.update("UPDATE rights_record SET status = 'REVOKED' WHERE asset_id IN "
                + "(SELECT asset_id FROM article_revision_media WHERE article_revision_id = ?)", revisionId);
        String url = "/api/v1/publisher/articles/" + articleId + ":publish";
        for (String requestId : List.of("publish-block-first", "publish-block-replay")) {
            mockMvc.perform(post(url).principal(actor("contract-publisher", RoleCode.PUBLISHER))
                            .header("If-Match", "\"3\"").header("Idempotency-Key", "blocked-publish")
                            .header("X-Request-Id", requestId))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.instance").value(url))
                    .andExpect(jsonPath("$.requestId").value(requestId))
                    .andExpect(header().string("X-Request-Id", requestId))
                    .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"));
        }
        assertEquals("APPROVED", jdbcTemplate.queryForObject("SELECT state FROM article WHERE id = ?", String.class, articleId));
        assertEquals(0L, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_snapshot", Long.class));
    }

    private List<ConditionalWrite> conditionalWrites() {
        List<ConditionalWrite> writes = new ArrayList<>();
        add(writes, "PATCH", "/editor/articles", "{\"articleId\":\"" + articleId + "\",\"changes\":{\"title\":\"Updated\"}}");
        add(writes, "POST", "/editor/articles/" + articleId + ":revise", "{\"title\":\"Revision title\"}");
        for (String action : List.of("approve", "publish", "archive", "request-changes", "withdraw", "schedule")) {
            add(writes, "POST", "/publisher/articles/" + articleId + ":" + action, workflowBody(action));
        }
        add(writes, "PATCH", "/editor/issues", "{\"issueId\":\"" + issueId + "\",\"changes\":{\"title\":\"Updated\"}}");
        add(writes, "POST", "/editor/issues/" + issueId + ":submit", "{}");
        for (String action : List.of("approve", "publish", "archive", "schedule")) {
            add(writes, "POST", "/publisher/issues/" + issueId + ":" + action, workflowBody(action));
        }
        String sections = "/editor/issues/" + issueId + "/sections";
        add(writes, "POST", sections, "{\"title\":\"New section\"}");
        add(writes, "PATCH", sections, "{\"sections\":[{\"sectionId\":\"" + sectionId + "\",\"position\":1}]}");
        add(writes, "PATCH", sections + "/" + sectionId, "{\"title\":\"Renamed section\"}");
        add(writes, "DELETE", sections + "/" + sectionId, "{}");
        add(writes, "PATCH", "/editor/media/" + assetId, "{\"altText\":\"Updated alt\"}");
        add(writes, "POST", "/publisher/media/" + assetId + ":revoke", "{\"reason\":\"Contract test\"}");
        add(writes, "PATCH", "/editor/taxonomy/" + termId, "{\"displayName\":\"Updated term\"}");
        add(writes, "POST", "/editor/taxonomy/" + termId + "/aliases",
                "{\"alias\":\"Term alias\",\"locale\":\"en\",\"validFrom\":\"2026-08-01T00:00:00Z\"}");
        add(writes, "PATCH", "/editor/contributors/" + contributorId, "{\"displayName\":\"Updated Contributor\"}");
        add(writes, "POST", "/editor/contributors/" + contributorId + ":archive", "{\"reason\":\"Contract test\"}");
        add(writes, "PUT", "/editor/articles/" + articleId + "/revisions/" + revisionId + "/contributors",
                "{\"contributors\":[{\"contributorId\":\"" + contributorId + "\",\"role\":\"AUTHOR\"}]}");
        return writes;
    }

    private static String workflowBody(String action) {
        return switch (action) {
            case "schedule" -> "{\"publishAt\":\"2026-08-11T00:00:00Z\",\"timezone\":\"Asia/Taipei\"}";
            case "request-changes", "withdraw" -> "{\"reason\":\"Contract test\"}";
            default -> "{}";
        };
    }

    private static void add(List<ConditionalWrite> writes, String method, String path, String body) {
        writes.add(new ConditionalWrite(HttpMethod.valueOf(method), "/api/v1" + path, body,
                path.startsWith("/publisher/") ? RoleCode.PUBLISHER : RoleCode.EDITOR));
    }

    private JsonNode create(String url, String body, String key) throws Exception {
        MvcResult result = mockMvc.perform(post(url).principal(actor("contract-editor", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "create-" + key)
                        .content(body))
                .andExpect(status().isCreated()).andReturn();
        return JSON.readTree(result.getResponse().getContentAsString());
    }

    private List<String> persistenceSnapshot() {
        List<String> rows = new ArrayList<>();
        for (String table : List.of("article", "article_revision", "publication_issue", "issue_section",
                "media_asset", "taxonomy_term", "taxonomy_alias", "contributor", "article_contributor",
                "publication_review", "publication_snapshot", "publication_job", "publication_idempotency",
                "contributor_command_receipt", "audit_event", "outbox_event")) {
            // Identifiers are a closed literal list, never input from the HTTP request.
            rows.addAll(jdbcTemplate.queryForList("SELECT row_to_json(t)::text FROM " + table
                    + " t ORDER BY row_to_json(t)::text", String.class));
        }
        return rows;
    }

    private record ConditionalWrite(HttpMethod method, String path, String body, RoleCode role) {
    }
}
