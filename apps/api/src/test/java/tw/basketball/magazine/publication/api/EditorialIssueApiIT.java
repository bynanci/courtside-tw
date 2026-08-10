package tw.basketball.magazine.publication.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialIssueApiIT extends EditorialApiIntegrationTestSupport {
    @BeforeEach
    void installIssueController() {
        EditorialIssueService service = new EditorialIssueService(
                new JdbcEditorialIssueRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                applicationClock
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialIssueController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    @Test
    void editorIssueCrudUsesIdempotencyAndConditionalPatch() throws Exception {
        Authentication editor = actor("issue-editor-1", RoleCode.EDITOR);
        UUID coverAssetId = seedCoverAsset();
        String body = """
                {"title":"Issue 4","slug":"issue-4","description":"A fixture issue","coverAssetId":"%s"}
                """.formatted(coverAssetId);

        MvcResult first = mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "issue-create-1")
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.issueNumber").value(1))
                .andExpect(jsonPath("$.version").value(1))
                .andReturn();
        MvcResult replay = mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "issue-create-1")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        assertEquals(first.getResponse().getContentAsString(), replay.getResponse().getContentAsString());

        String issueId = JSON.readTree(first.getResponse().getContentAsString()).path("issueId").asString();
        mockMvc.perform(patch("/api/v1/editor/issues")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "issue-patch-1")
                        .content("""
                                {"issueId":"%s","changes":{"title":"Issue 4 revised"}}
                                """.formatted(issueId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.title").value("Issue 4 revised"));

        mockMvc.perform(patch("/api/v1/editor/issues")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "issue-patch-stale")
                        .content("""
                                {"issueId":"%s","changes":{"title":"stale"}}
                                """.formatted(issueId)))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void publisherCannotMutateIssueDraft() throws Exception {
        mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(actor("issue-publisher", RoleCode.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "publisher-issue-create")
                        .content("""
                                {"title":"Blocked","slug":"blocked","coverAssetId":"00000000-0000-4000-8000-000000000001"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void publisherCanScheduleAndPublishAnApprovedIssue() throws Exception {
        Authentication editor = actor("issue-workflow-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-workflow-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "issue-workflow");
        jdbcTemplate.update("UPDATE publication_issue SET state = 'APPROVED' WHERE id = ?", issueId);

        mockMvc.perform(post("/api/v1/publisher/issues/{issueId}:schedule", issueId)
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "issue-schedule")
                        .content("""
                                {"publishAt":"2026-08-11T09:00:00","timezone":"Asia/Taipei"}
                                """))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-11T01:00:00Z"));

        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));

        mockMvc.perform(post("/api/v1/publisher/issues/{issueId}:publish", issueId)
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "issue-publish"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(3));

        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE target_type = 'ISSUE' AND target_id = ? AND action = 'ISSUE_PUBLISHED'",
                Integer.class,
                issueId));
    }

    @Test
    void editorCanManageAndReorderSectionsWithAggregateIfMatch() throws Exception {
        Authentication editor = actor("issue-section-editor", RoleCode.EDITOR);
        UUID issueId = createIssue(editor, "section-issue-create");

        MvcResult first = mockMvc.perform(post("/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "section-create-1")
                        .content("{\"title\":\"場邊現場\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.issueId").value(issueId.toString()))
                .andExpect(jsonPath("$.issueVersion").value(2))
                .andExpect(jsonPath("$.sections[0].position").value(1))
                .andExpect(jsonPath("$.sections[0].title").value("場邊現場"))
                .andReturn();
        String firstSectionId = JSON.readTree(first.getResponse().getContentAsString())
                .path("sections").get(0).path("sectionId").asString();

        MvcResult second = mockMvc.perform(post("/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "section-create-2")
                        .content("{\"title\":\"人物與方法\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.issueVersion").value(3))
                .andExpect(jsonPath("$.sections.length()").value(2))
                .andExpect(jsonPath("$.sections[1].position").value(2))
                .andReturn();
        String secondSectionId = JSON.readTree(second.getResponse().getContentAsString())
                .path("sections").get(1).path("sectionId").asString();

        MvcResult reordered = mockMvc.perform(patch(
                        "/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "section-reorder-1")
                        .content("""
                                {"sections":[
                                  {"sectionId":"%s","position":1},
                                  {"sectionId":"%s","position":2}
                                ]}
                                """.formatted(secondSectionId, firstSectionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueVersion").value(4))
                .andExpect(jsonPath("$.sections[0].sectionId").value(secondSectionId))
                .andExpect(jsonPath("$.sections[0].position").value(1))
                .andReturn();
        MvcResult replay = mockMvc.perform(patch(
                        "/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "section-reorder-1")
                        .content("""
                                {"sections":[
                                  {"sectionId":"%s","position":1},
                                  {"sectionId":"%s","position":2}
                                ]}
                                """.formatted(secondSectionId, firstSectionId)))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(
                reordered.getResponse().getContentAsString(),
                replay.getResponse().getContentAsString()
        );

        mockMvc.perform(patch(
                        "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
                        issueId,
                        secondSectionId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"4\"")
                        .header("Idempotency-Key", "section-rename-1")
                        .content("{\"title\":\"人物與方法｜修訂\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueVersion").value(5))
                .andExpect(jsonPath("$.sections[0].title").value("人物與方法｜修訂"));

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT position FROM issue_section WHERE id = ?", Integer.class,
                UUID.fromString(secondSectionId)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT position FROM issue_section WHERE id = ?", Integer.class,
                UUID.fromString(firstSectionId)));

        mockMvc.perform(delete(
                        "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
                        issueId,
                        firstSectionId)
                        .principal(editor)
                        .header(HttpHeaders.IF_MATCH, "\"5\"")
                        .header("Idempotency-Key", "section-delete-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueVersion").value(6))
                .andExpect(jsonPath("$.sections.length()").value(1))
                .andExpect(jsonPath("$.sections[0].sectionId").value(secondSectionId))
                .andExpect(jsonPath("$.sections[0].position").value(1));

        mockMvc.perform(delete(
                        "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
                        issueId,
                        secondSectionId)
                        .principal(editor)
                        .header(HttpHeaders.IF_MATCH, "\"6\"")
                        .header("Idempotency-Key", "section-delete-2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueVersion").value(7))
                .andExpect(jsonPath("$.sections.length()").value(0));
    }

    @Test
    void staleSectionReorderAndPublisherAccessAreRejected() throws Exception {
        Authentication editor = actor("issue-section-editor-stale", RoleCode.EDITOR);
        UUID issueId = createIssue(editor, "section-stale-create");
        mockMvc.perform(post("/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "section-stale-section")
                        .content("{\"title\":\"唯一章節\"}"))
                .andExpect(status().isCreated());

        String sectionId = jdbcTemplate.queryForObject(
                "SELECT id FROM issue_section WHERE issue_id = ?", String.class, issueId);
        mockMvc.perform(patch("/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "section-stale-reorder")
                        .content("{\"sections\":[{\"sectionId\":\"%s\",\"position\":1}]}"
                                .formatted(sectionId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mockMvc.perform(get("/api/v1/editor/issues/{issueId}/sections", issueId)
                        .principal(actor("issue-section-publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    private UUID createIssue(Authentication editor, String idempotencyKey) throws Exception {
        UUID coverAssetId = seedCoverAsset();
        MvcResult result = mockMvc.perform(post("/api/v1/editor/issues")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", idempotencyKey)
                        .content("""
                                {"title":"Issue 4","slug":"%s","description":"A fixture issue","coverAssetId":"%s"}
                                """.formatted(idempotencyKey, coverAssetId)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JSON.readTree(result.getResponse().getContentAsString())
                .path("issueId").asString());
    }

    private UUID seedCoverAsset() {
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'fixture cover', 'READY')
                """, assetId, "private/issue-cover/" + assetId, "a".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, 'cover', ?, ?, 'image/jpeg', 512, 10, 10)
                """, assetId, "issues/" + assetId + "/cover.jpg", "a".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit,
                    withdrawal_terms, status
                ) VALUES (?, 'Courtside TW', 'Fixture license', ARRAY['PUBLIC_WEB']::text[],
                    ARRAY['GLOBAL']::text[], ?, ?, 'Courtside TW', 'withdraw on notice', 'VALID')
                """, assetId,
                java.sql.Timestamp.from(java.time.Instant.parse("2026-08-09T00:00:00Z")),
                java.sql.Timestamp.from(java.time.Instant.parse("2026-08-12T00:00:00Z")));
        return assetId;
    }
}
