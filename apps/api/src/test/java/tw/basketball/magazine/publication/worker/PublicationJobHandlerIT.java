package tw.basketball.magazine.publication.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
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
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "worker-submit")
                        .content("""{"revisionId":"%s"}""".formatted(article.revisionId())))
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
                        .content("""{"publishAt":"2026-08-11T09:00:00","timezone":"Asia/Taipei"}"""))
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

        PublicationJobHandler dueHandler = new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse("2026-08-11T01:00:00Z"), ZoneOffset.UTC)
        );
        dueHandler.handle(event);
        dueHandler.handle(event);
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
                        .content("""{"revisionId":"%s"}""".formatted(article.revisionId())))
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
                        .content("""{"publishAt":"2026-08-11T09:00:00","timezone":"Asia/Taipei"}"""))
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
                UUID.fromString(node.path("articleId").asText()),
                UUID.fromString(node.path("revisionId").asText())
        );
    }

    private record MvcArticle(UUID id, UUID revisionId) {
    }
}
