package tw.basketball.magazine.media.api;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.content.persistence.JdbcPublicArticleRepository;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.search.application.SearchService;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialMediaMetadataApiIT extends EditorialApiIntegrationTestSupport {
    private UUID assetId;

    @BeforeEach
    void installMetadataControllerAndSeedProcessingAsset() {
        EditorialMediaMetadataService service = new EditorialMediaMetadataService(
                jdbcTemplate,
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialMediaMetadataController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();

        assetId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, processing_state, version
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'PROCESSING', 0)
                """,
                assetId,
                "private/metadata/" + assetId,
                "a".repeat(64)
        );
        jdbcTemplate.update(
                """
                INSERT INTO media_variant (
                    asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, 'inline', ?, ?, 'image/jpeg', 512, 10, 10)
                """,
                assetId,
                "public/metadata/" + assetId,
                "b".repeat(64)
        );
    }

    @Test
    void editorPatchPersistsAltTextCreditRightsAndPromotesProcessedAsset() throws Exception {
        var editor = actor("metadata-editor", RoleCode.EDITOR);
        mockMvc.perform(get("/api/v1/editor/media/{id}", assetId).principal(editor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assetId").value(assetId.toString()))
                .andExpect(jsonPath("$.altText").value(nullValue()))
                .andExpect(jsonPath("$.rights").value(nullValue()));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .content(body()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
                .andExpect(jsonPath("$.altText").value("夜間球場全景"))
                .andExpect(jsonPath("$.state").value("READY"))
                .andExpect(jsonPath("$.rights.credit").value("Courtside TW"))
                .andExpect(jsonPath("$.rights.status").value("VALID"));

        assertEquals("夜間球場全景", jdbcTemplate.queryForObject(
                "SELECT alt_text FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals("READY", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals("Courtside TW", jdbcTemplate.queryForObject(
                "SELECT credit FROM rights_record WHERE asset_id = ?", String.class, assetId));
        assertEquals("VALID", jdbcTemplate.queryForObject(
                "SELECT status FROM rights_record WHERE asset_id = ?", String.class, assetId));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .content(body()))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .content(bodyWithoutRightsVersion()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors[0].code").value("RIGHTS_VERSION_REQUIRED"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT version FROM media_asset WHERE id = ?", Integer.class, assetId));
    }

    @Test
    void publisherCannotReadOrUpdateEditorMetadata() throws Exception {
        mockMvc.perform(get("/api/v1/editor/media/{id}", assetId)
                        .principal(actor("metadata-publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(actor("metadata-publisher", RoleCode.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .content(body()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void publishedRightsChangesLeaveMetadataEvidenceAndPublicProjectionUnchanged() throws Exception {
        initializeRights();
        ArticleFixture article = seedArticle(true, true);
        insertArticleSnapshot(jdbcTemplate, article, publishedSnapshot(article));
        UUID issueId = seedPublishedIssue(article);
        jdbcTemplate.update("""
                INSERT INTO search_document (article_id, revision_id, issue_id, slug, title, dek,
                    normalized_text, source_checksum_sha256, published_at)
                VALUES (?, ?, ?, ?, 'Rights boundary article', 'Fixture', 'rights boundary article', ?,
                    TIMESTAMPTZ '2026-08-10 00:00:00+00')
                """, article.id(), article.revisionId(), issueId, article.slug(), "c".repeat(64));
        var repository = new JdbcPublicArticleRepository(jdbcTemplate, JSON);
        var search = new SearchService(jdbcTemplate);
        var searchBefore = search.search("rights", null, "10", "article", null);
        assertEquals(1, searchBefore.items().size(), "fixture must have an active public search result");
        var publicBefore = repository.findBySlug(article.slug(), null, Instant.parse("2026-08-11T00:00:00Z"))
                .orElseThrow();
        assertEquals(1, publicBefore.media().size(), "fixture must expose the rights-bound image publicly");
        Map<String, JsonNode> before = databaseState(jdbcTemplate);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("rightsOwner", "Different owner");
        changes.put("licenseName", "Replacement license");
        changes.put("allowedChannels", List.of("OFFLINE"));
        changes.put("territories", List.of("TW"));
        changes.put("validFrom", "2026-09-01T00:00:00Z");
        changes.put("validUntil", "2026-08-10T12:00:00Z");
        changes.put("credit", "Replacement credit");
        changes.put("withdrawalTerms", "Replacement withdrawal terms");
        changes.put("status", "REVOKED");
        for (Map.Entry<String, Object> change : changes.entrySet()) {
            assertRightsEditRejected(patchMetadata(1, rightsBody(change.getKey(), change.getValue())));
            assertEquals(before, databaseState(jdbcTemplate), change.getKey() + " changed persistent state");
            assertEquals(publicBefore, repository.findBySlug(
                    article.slug(), null, Instant.parse("2026-08-11T00:00:00Z")
            ).orElseThrow(), change.getKey() + " changed the anonymous article projection");
            assertEquals(searchBefore, search.search("rights", null, "10", "article", null));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "impact-link", "historical-revision-media",
            "snapshot-cover", "snapshot-media", "published-revision", "published-issue-cover"
    })
    void everyPublishedOrHistoricalReferenceFreezesRights(String reference) throws Exception {
        initializeRights();
        seedReference(reference);
        Map<String, JsonNode> before = databaseState(jdbcTemplate);

        assertRightsEditRejected(patchMetadata(1, rightsBody("credit", "Unauthorized new credit")));

        assertEquals(before, databaseState(jdbcTemplate), reference + " allowed a rights mutation");
    }

    @Test
    void publishedAltTextAndIdenticalRightsEchoRemainEditableWithoutChangingRightsVersion() throws Exception {
        initializeRights();
        seedReference("impact-link");
        JsonNode rightsBefore = databaseState(jdbcTemplate).get("rights_record");
        JsonNode evidenceBefore = databaseState(jdbcTemplate).get("publication_impact_link");
        JsonNode outboxBefore = databaseState(jdbcTemplate).get("outbox_event");

        MvcResult altOnly = patchMetadata(1, "{\"altText\":\"Updated accessible description\"}");
        assertEquals(200, altOnly.getResponse().getStatus());
        assertEquals("\"2\"", altOnly.getResponse().getHeader(HttpHeaders.ETAG));
        assertEquals(rightsBefore, databaseState(jdbcTemplate).get("rights_record"));

        MvcResult echo = patchMetadata(2, rightsBody(null, null));
        assertEquals(200, echo.getResponse().getStatus());
        assertEquals("\"3\"", echo.getResponse().getHeader(HttpHeaders.ETAG));
        assertEquals(0, JSON.readTree(echo.getResponse().getContentAsString()).path("rights").path("version").asInt());
        assertEquals(rightsBefore, databaseState(jdbcTemplate).get("rights_record"));
        assertEquals(evidenceBefore, databaseState(jdbcTemplate).get("publication_impact_link"));
        assertEquals(outboxBefore, databaseState(jdbcTemplate).get("outbox_event"));
        assertEquals("READY", jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ?", String.class, assetId));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event", Integer.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "unreferenced", "draft-media", "draft-rights-reference", "draft-issue-cover", "removed-before-publication"
    })
    void unpublishedRightsRemainRepairable(String reference) throws Exception {
        initializeRights();
        if (reference.equals("draft-media") || reference.equals("draft-rights-reference")) {
            ArticleFixture article = seedArticle(false, true);
            if (reference.equals("draft-rights-reference")) {
                insertRightsReference(article);
            }
        } else if (reference.equals("draft-issue-cover")) {
            seedIssue(false);
        } else if (reference.equals("removed-before-publication")) {
            ArticleFixture article = seedArticle(false, true);
            // A draft readiness check can survive removal of the asset from that
            // same revision. It is not proof that the eventual snapshot used it.
            insertRightsReference(article);
            String replacement = """
                    {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[
                      {"id":"00000000-0000-4000-8000-000000000105","type":"paragraph","version":1,
                       "payload":{"content":[{"kind":"text","text":"The removed image is absent."}]}}
                    ]}
                    """;
            jdbcTemplate.queryForObject(
                    "SELECT 1 FROM replace_public_article_revision_media(?, '[]'::jsonb)",
                    Integer.class, article.revisionId());
            jdbcTemplate.update("UPDATE article_revision SET content_document = ?::jsonb, state = 'PUBLISHED' WHERE id = ?",
                    replacement, article.revisionId());
            jdbcTemplate.update("""
                    UPDATE article SET state = 'PUBLISHED', published_revision_id = ?,
                        published_at = TIMESTAMPTZ '2026-08-10 00:00:00+00' WHERE id = ?
                    """, article.revisionId(), article.id());
            insertArticleSnapshot(jdbcTemplate, article, JSON.writeValueAsString(Map.of(
                    "content", JSON.readTree(replacement), "media", List.of()
            )));
        }

        MvcResult result = patchMetadata(1, rightsBody("credit", "Corrected unpublished credit"));

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals("Corrected unpublished credit", jdbcTemplate.queryForObject(
                "SELECT credit FROM rights_record WHERE asset_id = ?", String.class, assetId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT version FROM rights_record WHERE asset_id = ?", Integer.class, assetId));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT version FROM media_asset WHERE id = ?", Integer.class, assetId));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM outbox_event", Integer.class));
    }

    @Test
    void rightsEditWaitingForPublisherLockRechecksCommittedPublicationBeforeAnyMutation() throws Exception {
        initializeRights();
        CountDownLatch editorStarted = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        try (Connection publisher = jdbcTemplate.getDataSource().getConnection()) {
            publisher.setAutoCommit(false);
            JdbcTemplate publicationTransaction = new JdbcTemplate(new SingleConnectionDataSource(publisher, true));
            int publisherPid = publicationTransaction.queryForObject("SELECT pg_backend_pid()", Integer.class);
            publicationTransaction.queryForObject(
                    "SELECT id FROM media_asset WHERE id = ? FOR UPDATE", UUID.class, assetId);
            Future<MvcResult> edit = executor.submit(() -> {
                editorStarted.countDown();
                return patchMetadata(1, rightsBody("status", "REVOKED"));
            });
            assertTrue(editorStarted.await(5, TimeUnit.SECONDS), "editor request did not start");
            awaitDatabaseLockWait(publisherPid, edit);

            // A separate transaction commits publication while the editor is queued on the same asset.
            // Capture the expected committed state on the publisher connection before releasing its lock.
            insertImpactLink(publicationTransaction);
            Map<String, JsonNode> publishedState = databaseState(publicationTransaction);
            publisher.commit();

            assertRightsEditRejected(edit.get(5, TimeUnit.SECONDS));
            assertEquals(publishedState, databaseState(jdbcTemplate));
        } finally {
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS), "editor thread did not terminate");
        }
    }

    private void initializeRights() throws Exception {
        assertEquals(200, patchMetadata(0, body()).getResponse().getStatus());
    }

    private MvcResult patchMetadata(long version, String request) throws Exception {
        return mockMvc.perform(patch("/api/v1/editor/media/{id}", assetId)
                        .principal(actor("metadata-editor", RoleCode.EDITOR))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"" + version + "\"")
                        .content(request))
                .andReturn();
    }

    private static void assertRightsEditRejected(MvcResult result) throws Exception {
        assertEquals(422, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        JsonNode problem = JSON.readTree(result.getResponse().getContentAsString());
        assertEquals("RIGHTS_OR_CONTENT_GATE", problem.path("code").asString());
        assertEquals("/rights", problem.path("errors").get(0).path("path").asString());
        assertEquals("PUBLISHED_RIGHTS_IMMUTABLE", problem.path("errors").get(0).path("code").asString());
    }

    private static String rightsBody(String changedField, Object value) throws Exception {
        ObjectNode request = (ObjectNode) JSON.readTree(body());
        request.put("altText", "Attempted metadata change");
        ObjectNode rights = (ObjectNode) request.get("rights");
        rights.put("version", 0);
        if (changedField != null) {
            rights.set(changedField, JSON.valueToTree(value));
        }
        return JSON.writeValueAsString(request);
    }

    private void seedReference(String reference) throws Exception {
        switch (reference) {
            case "impact-link" -> insertImpactLink(jdbcTemplate);
            case "historical-revision-media" -> {
                ArticleFixture article = seedArticle(false, true);
                insertArticleSnapshot(jdbcTemplate, article, "{}");
            }
            case "snapshot-cover" -> insertIssueSnapshot(jdbcTemplate, UUID.randomUUID(),
                    JSON.writeValueAsString(Map.of("coverAssetId", assetId.toString())));
            case "snapshot-media" -> insertIssueSnapshot(jdbcTemplate, UUID.randomUUID(),
                    JSON.writeValueAsString(Map.of("media", List.of(Map.of("assetId", assetId.toString())))));
            case "published-revision" -> seedArticle(true, true);
            case "published-issue-cover" -> seedIssue(true);
            default -> throw new IllegalArgumentException("unknown publication fixture " + reference);
        }
    }

    private ArticleFixture seedArticle(boolean published, boolean linkMedia) {
        ArticleFixture article = new ArticleFixture(UUID.randomUUID(), UUID.randomUUID(), "metadata-" + UUID.randomUUID());
        jdbcTemplate.update("INSERT INTO article (id, slug, state) VALUES (?, ?, 'DRAFT')",
                article.id(), article.slug());
        jdbcTemplate.update("""
                INSERT INTO article_revision (id, article_id, revision_number, title, dek, content_document, state)
                VALUES (?, ?, 1, 'Rights boundary article', 'Fixture', ?::jsonb, ?)
                """, article.revisionId(), article.id(), document(), published ? "PUBLISHED" : "DRAFT");
        if (linkMedia) {
            jdbcTemplate.update("""
                    INSERT INTO article_revision_media (article_revision_id, asset_id, required_channel, position)
                    VALUES (?, ?, 'PUBLIC_WEB', 1)
                    """, article.revisionId(), assetId);
        }
        if (published) {
            jdbcTemplate.update("""
                    UPDATE article SET state = 'PUBLISHED', published_revision_id = ?,
                        published_at = TIMESTAMPTZ '2026-08-10 00:00:00+00' WHERE id = ?
                    """, article.revisionId(), article.id());
        }
        return article;
    }

    private UUID seedIssue(boolean published) {
        UUID issueId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO publication_issue (id, issue_number, slug, title, summary, cover_asset_id, state, published_at)
                VALUES (?, 1, ?, 'Rights issue', 'Fixture', ?, ?, TIMESTAMPTZ '2026-08-10 00:00:00+00')
                """, issueId, "metadata-issue-" + issueId, assetId, published ? "PUBLISHED" : "DRAFT");
        return issueId;
    }

    private UUID seedPublishedIssue(ArticleFixture article) throws Exception {
        UUID issueId = seedIssue(true);
        insertIssueSnapshot(jdbcTemplate, issueId, JSON.writeValueAsString(Map.of(
                "slug", "metadata-issue-" + issueId,
                "sections", List.of(Map.of("articles", List.of(Map.of(
                        "articleId", article.id().toString(), "slug", article.slug(),
                        "title", "Rights boundary article", "position", 1
                ))))
        )));
        return issueId;
    }

    private void insertRightsReference(ArticleFixture article) {
        jdbcTemplate.update("""
                INSERT INTO publication_rights_reference (
                    aggregate_type, aggregate_id, revision_id, asset_id, required_channel, decision_code,
                    checked_by, rights_record_id, rights_record_version
                ) SELECT 'ARTICLE', ?, ?, ?, 'PUBLIC_WEB', 'RIGHTS_ALLOWED', 'fixture-publisher', id, version
                  FROM rights_record WHERE asset_id = ?
                """, article.id(), article.revisionId(), assetId, assetId);
    }

    private void insertImpactLink(JdbcTemplate database) {
        UUID snapshotId = insertIssueSnapshot(database, UUID.randomUUID(), "{}");
        database.update("""
                INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type)
                VALUES (?, ?, 'CONTENT_MEDIA')
                """, snapshotId, assetId);
    }

    private static void insertArticleSnapshot(JdbcTemplate database, ArticleFixture article, String document) {
        database.update("""
                INSERT INTO publication_snapshot (
                    aggregate_type, aggregate_id, revision_id, snapshot_version, content_document,
                    checksum_sha256, created_by
                ) VALUES ('ARTICLE', ?, ?, 1, ?::jsonb, ?, 'fixture-publisher')
                """, article.id(), article.revisionId(), document, "c".repeat(64));
    }

    private static UUID insertIssueSnapshot(JdbcTemplate database, UUID issueId, String document) {
        UUID snapshotId = UUID.randomUUID();
        database.update("""
                INSERT INTO publication_snapshot (
                    id, aggregate_type, aggregate_id, snapshot_version, content_document, checksum_sha256, created_by
                ) VALUES (?, 'ISSUE', ?, 1, ?::jsonb, ?, 'fixture-publisher')
                """, snapshotId, issueId, document, "c".repeat(64));
        return snapshotId;
    }

    private String document() {
        return """
                {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000105","type":"image","version":1,
                   "payload":{"assetId":"%s","variant":"inline","altText":"Published image"}}
                ]}
                """.formatted(assetId);
    }

    private String publishedSnapshot(ArticleFixture article) throws Exception {
        ObjectNode snapshot = JSON.createObjectNode();
        snapshot.put("slug", article.slug());
        snapshot.set("content", JSON.readTree(document()));
        ObjectNode media = JSON.createObjectNode();
        media.put("assetId", assetId.toString());
        media.put("variant", "inline");
        media.put("url", "/media/public/metadata/" + assetId);
        media.put("mimeType", "image/jpeg");
        media.put("width", 10);
        media.put("height", 10);
        media.put("altText", "Published image");
        media.put("credit", "Courtside TW");
        media.put("rightsOwner", "Courtside TW");
        media.put("licenseName", "Editorial license");
        snapshot.putArray("media").add(media);
        return JSON.writeValueAsString(snapshot);
    }

    private static Map<String, JsonNode> databaseState(JdbcTemplate database) throws Exception {
        Map<String, JsonNode> state = new LinkedHashMap<>();
        for (String table : List.of(
                "media_asset", "media_variant", "rights_record", "article", "article_revision",
                "article_revision_media", "publication_issue", "publication_snapshot", "publication_impact_link",
                "publication_rights_reference", "audit_event", "outbox_event", "search_document",
                "media_revocation_impact", "offline_withdrawal_manifest_state"
        )) {
            String rows = database.queryForObject(
                    "SELECT COALESCE(jsonb_agg(to_jsonb(state_row) ORDER BY to_jsonb(state_row)::text), '[]'::jsonb)::text FROM "
                            + table + " state_row",
                    String.class
            );
            state.put(table, JSON.readTree(rows));
        }
        return state;
    }

    private static void awaitDatabaseLockWait(int publisherPid, Future<MvcResult> edit) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            assertFalse(edit.isDone(), "editor must wait for the publisher's asset lock");
            boolean blocked = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                    SELECT EXISTS (
                        SELECT 1 FROM pg_stat_activity
                        WHERE datname = current_database() AND wait_event_type = 'Lock'
                          AND ? = ANY(pg_blocking_pids(pid))
                    )
                    """, Boolean.class, publisherPid));
            if (blocked) {
                return;
            }
            TimeUnit.MILLISECONDS.sleep(25);
        }
        throw new AssertionError("editor did not reach a database lock wait within five seconds");
    }

    private record ArticleFixture(UUID id, UUID revisionId, String slug) {
    }

    private static String body() {
        return """
                {
                  "altText":"夜間球場全景",
                  "rights":{
                    "rightsOwner":"Courtside TW",
                    "licenseName":"Editorial license",
                    "allowedChannels":["PUBLIC_WEB"],
                    "territories":["GLOBAL"],
                    "validFrom":"2026-08-10T00:00:00Z",
                    "validUntil":"2027-08-10T00:00:00Z",
                    "credit":"Courtside TW",
                    "withdrawalTerms":"Contact the rights desk.",
                    "status":"VALID"
                  }
                }
                """;
    }

    private static String bodyWithoutRightsVersion() {
        return body().replace("\"rightsOwner\"", "\"version\":null,\"rightsOwner\"");
    }
}
