package tw.basketball.magazine.publication.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.search.worker.SearchProjectionHandler;
import tw.basketball.magazine.shared.RoleCode;

final class PublicationJobHandlerIT extends EditorialApiIntegrationTestSupport {
    private static final String CREATE_BODY = """
            {
              "title":"Worker fixture",
              "slug":"worker-fixture",
              "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000103","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Worker fixture"}]}}]}
            }
            """;

    @BeforeEach
    void installOutboxBackedArticleController() {
        EditorialWorkflowService service = new EditorialWorkflowService(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                applicationClock,
                new OutboxRepository(jdbcTemplate)
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialArticleController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    @Test
    void scheduledCommandIsAcknowledgedIdempotentlyByTheWorker() throws Exception {
        var editor = actor("worker-editor", RoleCode.EDITOR);
        var publisher = actor("worker-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor);
        attachIssueForSearchProjection(article.id());
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "worker-submit")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.id())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "worker-approve"))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:schedule", article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "worker-schedule")
                        .content("{\"publishAt\":\"2026-08-11T09:00:00\",\"timezone\":\"Asia/Taipei\"}"))
                .andExpect(status().isAccepted());

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE payload->>'action' IN ('SUBMIT', 'APPROVE')",
                Integer.class
        ));

        UUID eventId = jdbcTemplate.queryForObject(
                "SELECT id FROM outbox_event "
                        + "WHERE event_type = 'publication.article.command' "
                        + "AND payload->>'action' = 'SCHEDULE'",
                UUID.class
        );
        OutboxEvent event = new OutboxRepository(jdbcTemplate).findById(eventId).orElseThrow();
        PublicationJobHandler handler = new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse("2026-08-10T00:01:00Z"), ZoneOffset.UTC)
        );
        OutboxHandlerException early = assertThrows(
                OutboxHandlerException.class,
                () -> handler.handle(event)
        );
        assertTrue(early.retryable());
        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.id()
        ));
        assertEquals("PENDING", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = 'worker-schedule'",
                String.class
        ));

        List<PublicationExternalInvalidator.Request> invalidations = new ArrayList<>();
        PublicationJobHandler dueHandler = new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse("2026-08-11T01:00:00Z"), ZoneOffset.UTC),
                request -> {
                    assertTrue(!TransactionSynchronizationManager.isActualTransactionActive());
                    // A fresh connection models a cache refilling from committed origin data.
                    try (var connection = jdbcTemplate.getDataSource().getConnection();
                            var statement = connection.prepareStatement(
                                    "SELECT state, (SELECT count(*) FROM publication_snapshot "
                                            + "WHERE aggregate_id = article.id), (SELECT count(*) FROM search_document "
                                            + "WHERE article_id = article.id AND active) FROM article WHERE id = ?")) {
                        statement.setObject(1, article.id());
                        try (var result = statement.executeQuery()) {
                            assertTrue(result.next());
                            assertEquals("PUBLISHED", result.getString(1));
                            assertEquals(1, result.getInt(2));
                            assertEquals(1, result.getInt(3));
                        }
                    } catch (java.sql.SQLException exception) {
                        throw new AssertionError(exception);
                    }
                    invalidations.add(request);
                    if (invalidations.size() == 1) {
                        throw new IllegalStateException("test provider unavailable after origin commit");
                    }
                },
                new SearchProjectionHandler(jdbcTemplate, JSON)
        );
        OutboxHandlerException failedPurge = assertThrows(OutboxHandlerException.class,
                () -> dueHandler.handle(event));
        assertTrue(failedPurge.retryable());
        assertEquals("PENDING", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = 'worker-schedule'",
                String.class));
        dueHandler.handle(event);
        dueHandler.handle(event);
        assertEquals(2, invalidations.size());
        assertEquals(invalidations.get(0), invalidations.get(1));
        assertEquals(PublicationInvalidationKeys.forArticle(article.id(), article.revisionId()),
                invalidations.get(0).surrogateKeys());
        assertEquals("SUCCEEDED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = 'worker-schedule'",
                String.class
        ));
        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.id()
        ));
        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM article_revision WHERE id = ?", String.class, article.revisionId()
        ));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ? AND revision_id = ?",
                Integer.class,
                article.id(),
                article.revisionId()
        ));
        var snapshot = JSON.readTree(jdbcTemplate.queryForObject(
                """
                SELECT content_document::text FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ? AND revision_id = ?
                """,
                String.class,
                article.id(),
                article.revisionId()
        ));
        assertEquals("published-article", snapshot.path("snapshotType").asString());
        assertEquals("worker-fixture", snapshot.path("slug").asString());
        assertEquals("Worker fixture", snapshot.path("plainText").asString());
        assertEquals(1, snapshot.path("readingTimeMinutes").asInt());
        assertEquals("/articles/worker-fixture", snapshot.path("canonicalPath").asString());
        assertEquals("2026-08-11T01:00:00Z", snapshot.path("publishedAt").asString());
        assertTrue(snapshot.path("updatedAt").isString());
        assertTrue(snapshot.path("contributors").isArray());
        assertTrue(snapshot.path("content").path("blocks").isArray());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_job WHERE idempotency_key = 'worker-schedule'",
                Integer.class
        ));
    }

    @Test
    void dueWorkerRechecksRightsAndBlocksWithoutPublishingOrCreatingSnapshot() throws Exception {
        var editor = actor("worker-rights-editor", RoleCode.EDITOR);
        var publisher = actor("worker-rights-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor);
        linkMedia(article.revisionId(), "READY", "VALID", Set.of("PUBLIC_WEB"));
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "worker-rights-submit")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.id())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "worker-rights-approve"))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:schedule", article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "worker-rights-schedule")
                        .content("{\"publishAt\":\"2026-08-11T09:00:00\",\"timezone\":\"Asia/Taipei\"}"))
                .andExpect(status().isAccepted());

        jdbcTemplate.update("UPDATE rights_record SET status = 'REVOKED' WHERE asset_id IN (SELECT asset_id FROM article_revision_media WHERE article_revision_id = ?)", article.revisionId());
        OutboxEvent event = new OutboxRepository(jdbcTemplate).findById(jdbcTemplate.queryForObject(
                "SELECT id FROM outbox_event "
                        + "WHERE event_type = 'publication.article.command' "
                        + "AND payload->>'action' = 'SCHEDULE'",
                UUID.class
        )).orElseThrow();
        PublicationJobHandler handler = new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse("2026-08-11T01:00:00Z"), ZoneOffset.UTC)
        );

        handler.handle(event);
        handler.handle(event);

        assertEquals("BLOCKED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = 'worker-rights-schedule'",
                String.class
        ));
        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.id()
        ));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ?",
                Integer.class,
                article.id()
        ));
        assertEquals("RIGHTS_REVOKED", jdbcTemplate.queryForObject(
                "SELECT decision_code FROM publication_rights_reference WHERE aggregate_id = ? ORDER BY checked_at DESC LIMIT 1",
                String.class,
                article.id()
        ));
    }

    @Test
    void dueWorkerBlocksReaderInvisibleContentBeforePublicationTransition() throws Exception {
        var editor = actor("worker-divider-editor", RoleCode.EDITOR);
        var publisher = actor("worker-divider-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor);
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "worker-divider-submit")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.id())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "worker-divider-approve"))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:schedule", article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "worker-divider-schedule")
                        .content("{\"publishAt\":\"2026-08-11T09:00:00\",\"timezone\":\"Asia/Taipei\"}"))
                .andExpect(status().isAccepted());
        jdbcTemplate.update("""
                UPDATE article_revision
                SET content_document = '{
                  "schemaVersion":1,
                  "documentId":"00000000-0000-7000-8000-000000000025",
                  "blocks":[{
                    "id":"00000000-0000-4000-8000-000000000125",
                    "type":"divider",
                    "version":1,
                    "payload":{"style":"space"}
                  }]
                }'::jsonb
                WHERE id = ?
                """, article.revisionId());

        OutboxEvent event = new OutboxRepository(jdbcTemplate).findById(jdbcTemplate.queryForObject(
                "SELECT id FROM outbox_event "
                        + "WHERE event_type = 'publication.article.command' "
                        + "AND payload->>'action' = 'SCHEDULE'",
                UUID.class
        )).orElseThrow();
        PublicationJobHandler handler = new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse("2026-08-11T01:00:00Z"), ZoneOffset.UTC)
        );

        handler.handle(event);

        assertEquals("BLOCKED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = 'worker-divider-schedule'",
                String.class));
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT last_error FROM publication_job WHERE idempotency_key = 'worker-divider-schedule'",
                String.class).contains("CONTENT_NOT_READY"));
        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.id()));
        assertEquals("APPROVED", jdbcTemplate.queryForObject(
                "SELECT state FROM article_revision WHERE id = ?", String.class, article.revisionId()));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ?",
                Integer.class,
                article.id()));
    }

    private void attachIssueForSearchProjection(UUID articleId) {
        UUID assetId = UUID.randomUUID();
        UUID issueId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state)
                VALUES (?, 'private/worker-cover.webp', ?, 'image/webp', 1024, 1200, 1600, 'cover', 'READY')
                """, assetId, "c".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO publication_issue (id, issue_number, slug, title, summary, cover_asset_id, state)
                VALUES (?, 91, 'worker-search-issue', 'Worker issue', 'Search projection fixture', ?, 'DRAFT')
                """, issueId, assetId);
        jdbcTemplate.update("""
                INSERT INTO issue_section (id, issue_id, title, position) VALUES (?, ?, 'Worker section', 1)
                """, sectionId, issueId);
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, position) VALUES (?, ?, ?, 1)
                """, issueId, sectionId, articleId);
    }

    private MvcArticle create(org.springframework.security.core.Authentication editor) throws Exception {
        var result = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "worker-create")
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andReturn();
        var node = JSON.readTree(result.getResponse().getContentAsString());
        return new MvcArticle(
                UUID.fromString(node.path("articleId").asString()),
                UUID.fromString(node.path("revisionId").asString())
        );
    }

    private record MvcArticle(UUID id, UUID revisionId) {
    }
}
