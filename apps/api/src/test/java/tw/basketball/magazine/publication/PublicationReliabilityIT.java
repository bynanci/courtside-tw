package tw.basketball.magazine.publication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
import tw.basketball.magazine.outbox.OutboxClaim;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.outbox.OutboxRetryPolicy;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.worker.PublicationJobHandler;
import tw.basketball.magazine.shared.RoleCode;

/**
 * Reliability proof for publication workers and the public origin boundary.
 *
 * <p>External cache/search delivery is represented by the durable outbox
 * contract in these tests. The provider probe deliberately fails once so the
 * origin boundary is verified independently of external purge timing.</p>
 */
final class PublicationReliabilityIT extends EditorialApiIntegrationTestSupport {
    private static final String CREATE_BODY = """
            {
              "title":"Reliability fixture",
              "slug":"reliability-fixture",
              "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000103","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Reliability fixture"}]}}]}
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
    void duplicateWorkerDeliveryProducesOneSnapshot() throws Exception {
        MvcArticle article = createAndSchedule("duplicate-worker");
        OutboxEvent event = scheduleEvent("duplicate-worker-schedule");
        PublicationJobHandler handler = handlerAt("2026-08-10T01:01:00Z");

        handler.handle(event);
        handler.handle(event);

        assertEquals("SUCCEEDED", jobStatus("duplicate-worker-schedule"));
        assertEquals("PUBLISHED", articleState(article.id()));
        assertEquals(1, snapshotCount(article.id(), article.revisionId()));
    }

    @Test
    void concurrentWorkersProduceOneSnapshotAndOneSucceededJob() throws Exception {
        MvcArticle article = createAndSchedule("concurrent-worker");
        OutboxEvent event = scheduleEvent("concurrent-worker-schedule");
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = workers.submit(() -> handle(event));
            Future<?> second = workers.submit(() -> handle(event));
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        } finally {
            workers.shutdownNow();
            workers.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals("SUCCEEDED", jobStatus("concurrent-worker-schedule"));
        assertEquals("PUBLISHED", articleState(article.id()));
        assertEquals(1, snapshotCount(article.id(), article.revisionId()));
    }

    @Test
    void expiredRightsAtExecutionBlocksWithoutPublishing() throws Exception {
        Authentication editor = actor("expired-rights-editor", RoleCode.EDITOR);
        Authentication publisher = actor("expired-rights-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor, "expired-rights-create");
        linkMedia(article.revisionId(), "READY", "VALID", java.util.Set.of("PUBLIC_WEB"));
        submit(article, editor, "expired-rights-submit");
        approve(article, publisher, "expired-rights-approve");
        schedule(article, publisher, "expired-rights-schedule");

        jdbcTemplate.update(
                """
                UPDATE rights_record
                SET valid_until = ?
                WHERE asset_id IN (
                    SELECT asset_id FROM article_revision_media WHERE article_revision_id = ?
                )
                """,
                Timestamp.from(Instant.parse("2026-08-10T00:30:00Z")),
                article.revisionId()
        );

        OutboxEvent event = scheduleEvent("expired-rights-schedule");
        handlerAt("2026-08-10T01:01:00Z").handle(event);

        assertEquals("BLOCKED", jobStatus("expired-rights-schedule"));
        assertEquals("SCHEDULED", articleState(article.id()));
        assertEquals(0, snapshotCount(article.id(), article.revisionId()));
        assertEquals(
                "RIGHTS_EXPIRED",
                jdbcTemplate.queryForObject(
                        "SELECT decision_code FROM publication_rights_reference WHERE aggregate_id = ? ORDER BY checked_at DESC LIMIT 1",
                        String.class,
                        article.id()
                )
        );
    }

    @Test
    void partialExternalFailureRetriesInvalidationWithoutReopeningWithdrawnOrigin() throws Exception {
        MvcArticle article = createAndSchedule("partial-external");
        OutboxRepository outbox = new OutboxRepository(jdbcTemplate);
        OutboxEvent schedule = scheduleEvent("partial-external-schedule");
        handlerAt("2026-08-10T01:01:00Z").handle(schedule);
        Instant firstAttemptAt = Instant.parse("2026-08-10T01:02:00Z");
        OutboxClaim scheduleClaim = onlyClaim(outbox, schedule.id(), firstAttemptAt);
        outbox.complete(scheduleClaim, firstAttemptAt);

        Authentication publisher = actor("partial-external-publisher", RoleCode.PUBLISHER);
        int publishedVersion = jdbcTemplate.queryForObject(
                "SELECT version FROM article WHERE id = ?",
                Integer.class,
                article.id()
        );
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:withdraw", article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"%s\"".formatted(publishedVersion))
                        .header("Idempotency-Key", "partial-external-withdraw")
                        .content("{\"reason\":\"emergency rights withdrawal\"}"))
                .andExpect(status().isAccepted());

        OutboxEvent event = publicationEvent("WITHDRAW", "partial-external-withdraw");
        var payload = JSON.readTree(event.payloadJson());
        List<String> keys = new ArrayList<>();
        payload.path("surrogateKeys").forEach(node -> keys.add(node.asText()));
        assertTrue(keys.contains("article:" + article.id()));
        assertTrue(keys.contains("article:" + article.id() + ":revision:" + article.revisionId()));
        assertTrue(keys.contains("search:article:" + article.id()));
        assertTrue(keys.contains("sitemap:articles"));

        PublicArticleService origin = new PublicArticleService(
                new JdbcPublicArticleRepository(jdbcTemplate),
                Clock.fixed(Instant.parse("2026-08-10T00:00:00Z"), ZoneOffset.UTC)
        );
        assertTrue(origin.findBySlug("reliability-fixture", null).isEmpty());

        OutboxRetryPolicy retryPolicy = new OutboxRetryPolicy(
                3,
                Duration.ofSeconds(10),
                Duration.ofMinutes(1)
        );
        PartialExternalInvalidation probe = new PartialExternalInvalidation();
        OutboxClaim firstClaim = onlyClaim(outbox, event.id(), firstAttemptAt);
        assertThrows(IllegalStateException.class, () -> probe.invalidate(payload));
        outbox.fail(firstClaim, new IllegalStateException("cache purge failed"), firstAttemptAt, retryPolicy);
        assertEquals("FAILED", outbox.findById(event.id()).orElseThrow().status().name());
        assertTrue(origin.findBySlug("reliability-fixture", null).isEmpty());

        OutboxEvent failed = outbox.findById(event.id()).orElseThrow();
        OutboxClaim retryClaim = onlyClaim(outbox, event.id(), failed.availableAt().plusSeconds(1));
        probe.invalidate(payload);
        outbox.complete(retryClaim, failed.availableAt().plusSeconds(1));
        assertEquals("COMPLETED", outbox.findById(event.id()).orElseThrow().status().name());
        assertEquals(2, probe.attempts);
        assertEquals(keys, probe.lastKeys);
        assertTrue(origin.findBySlug("reliability-fixture", null).isEmpty());
    }

    @Test
    void withdrawnOriginDeniesContentBeforeExternalPurgeCompletes() {
        UUID issueId = UUID.randomUUID();
        UUID coverAssetId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        UUID contributorId = UUID.randomUUID();
        Instant publishedAt = Instant.parse("2026-08-01T00:00:00Z");

        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, 'private/reliability-cover.webp', ?, 'image/webp', 1024, 1200, 1600, 'cover', 'READY')
                """, coverAssetId, "c".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO publication_issue (
                    id, issue_number, slug, title, summary, cover_asset_id, state, published_at
                ) VALUES (?, 99, 'reliability-origin', 'Reliability issue', 'Reliability issue', ?, 'PUBLISHED', ?)
                """, issueId, coverAssetId, Timestamp.from(publishedAt));
        jdbcTemplate.update("""
                INSERT INTO issue_section (id, issue_id, title, position)
                VALUES (?, ?, 'Reliability', 1)
                """, sectionId, issueId);
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, published_revision_id, published_at)
                VALUES (?, 'withdrawn-origin', 'WITHDRAWN', ?, ?)
                """, articleId, revisionId, Timestamp.from(publishedAt));
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 1, 'Withdrawn origin', 'Withdrawn origin', ?::jsonb, 'WITHDRAWN')
                """, revisionId, articleId, CREATE_BODY_CONTENT);
        jdbcTemplate.update("""
                INSERT INTO contributor (id, slug, display_name)
                VALUES (?, 'reliability-editor', 'Reliability editor')
                """, contributorId);
        jdbcTemplate.update("""
                INSERT INTO article_contributor (article_revision_id, contributor_id, role, position)
                VALUES (?, ?, 'EDITOR', 1)
                """, revisionId, contributorId);
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, position)
                VALUES (?, ?, ?, 1)
                """, issueId, sectionId, articleId);

        PublicArticleService origin = new PublicArticleService(
                new JdbcPublicArticleRepository(jdbcTemplate),
                Clock.fixed(Instant.parse("2026-08-10T00:00:00Z"), ZoneOffset.UTC)
        );

        assertTrue(origin.findBySlug("withdrawn-origin", null).isEmpty());
    }

    private static final String CREATE_BODY_CONTENT = """
            {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000103","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Reliability fixture"}]}}]}
            """;

    private void handle(OutboxEvent event) {
        try {
            handlerAt("2026-08-10T01:01:00Z").handle(event);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private MvcArticle createAndSchedule(String prefix) throws Exception {
        Authentication editor = actor(prefix + "-editor", RoleCode.EDITOR);
        Authentication publisher = actor(prefix + "-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor, prefix + "-create");
        submit(article, editor, prefix + "-submit");
        approve(article, publisher, prefix + "-approve");
        schedule(article, publisher, prefix + "-schedule");
        return article;
    }

    private MvcArticle create(Authentication editor, String key) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andReturn();
        var node = JSON.readTree(result.getResponse().getContentAsString());
        return new MvcArticle(
                UUID.fromString(node.path("articleId").asText()),
                UUID.fromString(node.path("revisionId").asText())
        );
    }

    private void submit(MvcArticle article, Authentication editor, String key) throws Exception {
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .content("""{"revisionId":"%s"}""".formatted(article.revisionId())))
                .andExpect(status().isAccepted());
    }

    private void approve(MvcArticle article, Authentication publisher, String key) throws Exception {
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.id())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", key))
                .andExpect(status().isAccepted());
    }

    private void schedule(MvcArticle article, Authentication publisher, String key) throws Exception {
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:schedule", article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", key)
                        .content("""
                                {"publishAt":"2026-08-10T09:00:00","timezone":"Asia/Taipei"}
                                """))
                .andExpect(status().isAccepted());
    }

    private OutboxEvent scheduleEvent(String key) {
        return publicationEvent("SCHEDULE", key);
    }

    private OutboxEvent publicationEvent(String action, String key) {
        UUID eventId = jdbcTemplate.queryForObject(
                """
                SELECT id FROM outbox_event
                WHERE event_type = 'publication.article.command'
                  AND payload->>'action' = ?
                  AND payload->>'idempotencyKey' = ?
                """,
                UUID.class,
                action,
                key
        );
        return new OutboxRepository(jdbcTemplate).findById(eventId).orElseThrow();
    }

    private OutboxClaim onlyClaim(OutboxRepository outbox, UUID eventId, Instant now) {
        List<OutboxClaim> claims = outbox.claim(
                "publication-reliability-test",
                1,
                Duration.ofMinutes(5),
                now,
                3
        );
        assertEquals(1, claims.size());
        assertEquals(eventId, claims.getFirst().event().id());
        return claims.getFirst();
    }

    private PublicationJobHandler handlerAt(String instant) {
        return new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)
        );
    }

    private String articleState(UUID articleId) {
        return jdbcTemplate.queryForObject("SELECT state FROM article WHERE id = ?", String.class, articleId);
    }

    private String jobStatus(String key) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE idempotency_key = ?",
                String.class,
                key
        );
    }

    private int snapshotCount(UUID articleId, UUID revisionId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ? AND revision_id = ?",
                Integer.class,
                articleId,
                revisionId
        );
    }

    private record MvcArticle(UUID id, UUID revisionId) {
    }

    private static final class PartialExternalInvalidation {
        private int attempts;
        private List<String> lastKeys = List.of();

        private void invalidate(tools.jackson.databind.JsonNode payload) {
            attempts++;
            lastKeys = new ArrayList<>();
            payload.path("surrogateKeys").forEach(node -> lastKeys.add(node.asText()));
            if (attempts == 1) {
                throw new IllegalStateException("simulated partial external purge failure");
            }
        }
    }
}
