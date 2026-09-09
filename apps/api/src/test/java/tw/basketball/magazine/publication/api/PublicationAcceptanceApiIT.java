package tw.basketball.magazine.publication.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.worker.PublicationJobHandler;
import tw.basketball.magazine.search.worker.SearchProjection;
import tw.basketball.magazine.shared.RoleCode;

/** T086 acceptance for FR-014/016/023 and SC-009 (DEV-027/042/044). */
final class PublicationAcceptanceApiIT extends EditorialApiIntegrationTestSupport {
    private static final Instant EXECUTED_AT = Instant.parse("2026-08-11T01:00:00Z");
    private static final String CREATE_BODY = """
            {
              "title":"Publication acceptance",
              "slug":"publication-acceptance",
              "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000081",
                "blocks":[{"id":"00000000-0000-4000-8000-000000000181","type":"paragraph","version":1,
                  "payload":{"content":[{"kind":"text","text":"Publication acceptance fixture"}]}}]}
            }
            """;

    @BeforeEach
    void installTransactionalOutboxController() {
        EditorialWorkflowService service = new EditorialWorkflowService(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                transactions(),
                JSON,
                applicationClock,
                new OutboxRepository(jdbcTemplate)
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialArticleController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    @Test
    void editorCannotApprovePublishWithdrawOrArchiveWhilePublisherCanCompleteEachTransition() throws Exception {
        Authentication editor = actor("acceptance-editor", RoleCode.EDITOR);
        Authentication publisher = actor("acceptance-publisher", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor);
        submit(article, editor);

        String[] actions = {"approve", "publish", "withdraw", "archive"};
        String[] states = {"IN_REVIEW", "APPROVED", "PUBLISHED", "WITHDRAWN", "ARCHIVED"};
        for (int index = 0; index < actions.length; index++) {
            String action = actions[index];
            int version = index + 2;
            int snapshots = version < 4 ? 0 : 1;
            int jobs = Math.max(0, index - 1);
            String reason = "withdraw".equals(action)
                    ? "{\"reason\":\"Emergency rights withdrawal\"}" : "";

            publisherCommand(article, editor, action, version, "editor-denied-" + action, reason)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));

            assertArticleState(article, states[index], version, snapshots);
            assertEquals(jobs, count("publication_job", "aggregate_id", article.articleId()));
            assertEquals(jobs, count("outbox_event", "aggregate_id", article.articleId()));
            assertEquals(0, successfulAuditCount(article, action.toUpperCase(java.util.Locale.ROOT)));

            publisherCommand(article, publisher, action, version, "publisher-allowed-" + action, reason)
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.version").value(version + 1));

            assertArticleState(article, states[index + 1], version + 1, index == 0 ? 0 : 1);
            assertEquals(1, successfulAuditCount(article, action.toUpperCase(java.util.Locale.ROOT)));
        }
    }

    @Test
    void tenPublishRetriesPreserveOnePublicRevisionAuditOutboxAndWorkerSideEffect() throws Exception {
        Authentication editor = actor("retry-editor", RoleCode.EDITOR);
        Authentication publisher = actor("retry-publisher", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor);
        submit(article, editor);
        approve(article, publisher);

        MvcResult initial = publisherCommand(article, publisher, "publish", 3, "ten-publish-retries", "")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(4))
                .andExpect(jsonPath("$.revisionId").value(article.revisionId().toString()))
                .andReturn();
        String publishedSnapshot = snapshotBytes(article);
        AtomicInteger projections = new AtomicInteger();
        SearchProjection projection = new SearchProjection() {
            @Override
            public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
                assertEquals(article.articleId(), articleId);
                assertEquals(article.revisionId(), revisionId);
                projections.incrementAndGet();
            }

            @Override
            public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
                throw new AssertionError("A publish retry must not withdraw the article");
            }
        };
        AtomicInteger invalidations = new AtomicInteger();
        PublicationJobHandler worker = worker(projection, request -> {
            assertTrue(!org.springframework.transaction.support.TransactionSynchronizationManager
                    .isActualTransactionActive());
            assertTrue(request.surrogateKeys().contains("article:" + article.articleId()));
            invalidations.incrementAndGet();
        });
        OutboxEvent event = publicationEvent(article, "PUBLISH");
        worker.handle(event);

        // SC-009 requires an initial request plus TEN retries, not ten requests in total.
        for (int retry = 1; retry <= 10; retry++) {
            MvcResult replay = publisherCommand(article, publisher, "publish", 3, "ten-publish-retries", "")
                    .andExpect(status().isAccepted())
                    .andReturn();
            assertEquals(initial.getResponse().getContentAsString(), replay.getResponse().getContentAsString());
            assertEquals(initial.getResponse().getHeader(HttpHeaders.ETAG),
                    replay.getResponse().getHeader(HttpHeaders.ETAG));
            worker.handle(event);
            assertEquals(publishedSnapshot, snapshotBytes(article));
            assertEquals(article.revisionId(), jdbcTemplate.queryForObject(
                    "SELECT published_revision_id FROM article WHERE id = ?", UUID.class, article.articleId()));
        }

        assertArticleState(article, "PUBLISHED", 4, 1);
        assertEquals(1, count("article_revision", "article_id", article.articleId()));
        assertEquals(1, successfulAuditCount(article, "PUBLISH"));
        assertEquals(1, count("publication_job", "aggregate_id", article.articleId()));
        assertEquals(1, count("outbox_event", "aggregate_id", article.articleId()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_idempotency WHERE idempotency_key = 'ten-publish-retries'",
                Integer.class));
        assertEquals("SUCCEEDED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE aggregate_id = ?", String.class, article.articleId()));
        assertEquals(1, projections.get());
        assertEquals(1, invalidations.get());
    }

    @ParameterizedTest
    @CsvSource({"UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING", "VALID,OFFLINE,RIGHTS_WRONG_CHANNEL"})
    void persistedUnknownAndWrongChannelRightsBlockSubmission(
            String rightsStatus,
            String channel,
            String blockingCode
    ) throws Exception {
        Authentication editor = actor("rights-submit-editor", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor);
        linkMedia(article.revisionId(), "READY", rightsStatus, Set.of(channel));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM rights_record WHERE status = ? AND allowed_channels = ?::text[]",
                Integer.class, rightsStatus, "{" + channel + "}"));

        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "rights-blocked-submit")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value(blockingCode));

        assertBlockedCommand(article, "DRAFT", 1, "SUBMIT", blockingCode);
        assertEquals(0, count("publication_review", "aggregate_id", article.articleId()));
    }

    @ParameterizedTest
    @CsvSource({"UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING", "VALID,OFFLINE,RIGHTS_WRONG_CHANNEL"})
    void immediatePublishRechecksRightsAfterApprovalWithoutAdvancingPublicState(
            String rightsStatus,
            String channel,
            String blockingCode
    ) throws Exception {
        Authentication editor = actor("rights-publish-editor", RoleCode.EDITOR);
        Authentication publisher = actor("rights-publish-publisher", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor);
        linkMedia(article.revisionId(), "READY", "VALID", Set.of("PUBLIC_WEB"));
        submit(article, editor);
        approve(article, publisher);
        changeRights(article, rightsStatus, channel);

        publisherCommand(article, publisher, "publish", 3, "rights-blocked-publish", "")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value(blockingCode));

        assertBlockedCommand(article, "APPROVED", 3, "PUBLISH", blockingCode);
    }

    @ParameterizedTest
    @CsvSource({"UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING", "VALID,OFFLINE,RIGHTS_WRONG_CHANNEL"})
    void scheduledWorkerRechecksRightsAtActualExecutionWithoutPublishing(
            String rightsStatus,
            String channel,
            String blockingCode
    ) throws Exception {
        Authentication editor = actor("rights-worker-editor", RoleCode.EDITOR);
        Authentication publisher = actor("rights-worker-publisher", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor);
        linkMedia(article.revisionId(), "READY", "VALID", Set.of("PUBLIC_WEB"));
        submit(article, editor);
        approve(article, publisher);
        publisherCommand(article, publisher, "schedule", 3, "rights-worker-schedule",
                "{\"publishAt\":\"2026-08-11T09:00:00\",\"timezone\":\"Asia/Taipei\"}")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(4));
        changeRights(article, rightsStatus, channel);
        int auditCount = count("audit_event", "target_id", article.articleId());
        SearchProjection deniedProjection = new SearchProjection() {
            @Override
            public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
                throw new AssertionError("Blocked rights must not enter the public search projection");
            }

            @Override
            public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
                throw new AssertionError("A blocked schedule must not withdraw a publication");
            }
        };
        PublicationJobHandler worker = worker(deniedProjection);
        OutboxEvent event = publicationEvent(article, "SCHEDULE");
        worker.handle(event);
        worker.handle(event);

        assertArticleState(article, "SCHEDULED", 4, 0);
        assertNull(jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?", UUID.class, article.articleId()));
        assertEquals(0, successfulAuditCount(article, "PUBLISH"));
        assertEquals(auditCount, count("audit_event", "target_id", article.articleId()));
        assertEquals(1, count("publication_job", "aggregate_id", article.articleId()));
        assertEquals(1, count("outbox_event", "aggregate_id", article.articleId()));
        assertEquals("BLOCKED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE aggregate_id = ?", String.class, article.articleId()));
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT last_error FROM publication_job WHERE aggregate_id = ?",
                String.class, article.articleId()).contains(blockingCode));
        assertEquals(1, jdbcTemplate.queryForObject(
                """
                SELECT count(*) FROM publication_rights_reference
                WHERE aggregate_id = ? AND decision_code = ? AND checked_by = 'system:publication-worker'
                """, Integer.class, article.articleId(), blockingCode));
    }

    private CreatedArticle createArticle(Authentication editor) throws Exception {
        return readCreatedArticle(mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "acceptance-create")
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private void submit(CreatedArticle article, Authentication editor) throws Exception {
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "acceptance-submit")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(2));
    }

    private void approve(CreatedArticle article, Authentication publisher) throws Exception {
        publisherCommand(article, publisher, "approve", 2, "acceptance-approve", "")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(3));
    }

    private org.springframework.test.web.servlet.ResultActions publisherCommand(
            CreatedArticle article, Authentication actor, String action, int version, String key, String body
    ) throws Exception {
        return mockMvc.perform(post("/api/v1/publisher/articles/{id}:" + action, article.articleId())
                .principal(actor)
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.IF_MATCH, "\"%d\"".formatted(version))
                .header("Idempotency-Key", key)
                .content(body));
    }

    private void changeRights(CreatedArticle article, String rightsStatus, String channel) {
        assertEquals(1, jdbcTemplate.update("""
                UPDATE rights_record SET status = ?, allowed_channels = ?::text[], version = version + 1
                WHERE asset_id IN (SELECT asset_id FROM article_revision_media WHERE article_revision_id = ?)
                """, rightsStatus, "{" + channel + "}", article.revisionId()));
    }

    private void assertBlockedCommand(
            CreatedArticle article, String state, int version, String action, String blockingCode
    ) {
        assertArticleState(article, state, version, 0);
        assertNull(jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?", UUID.class, article.articleId()));
        assertEquals(0, count("publication_job", "aggregate_id", article.articleId()));
        assertEquals(0, count("outbox_event", "aggregate_id", article.articleId()));
        assertEquals(0, successfulAuditCount(article, action));
        // Rejection remains auditable; its recorded version must remain the unchanged version.
        assertEquals(1, jdbcTemplate.queryForObject("""
                SELECT count(*) FROM audit_event WHERE target_id = ? AND action = ?
                  AND metadata->>'status' = 'BLOCKED' AND (metadata->>'version')::int = ?
                  AND metadata->'blockingCodes' @> ?::jsonb
                """, Integer.class, article.articleId(), "ARTICLE_" + action, version,
                "[\"" + blockingCode + "\"]"));
    }

    private void assertArticleState(CreatedArticle article, String state, int version, int snapshots) {
        assertEquals(state, jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.articleId()));
        assertEquals(version, jdbcTemplate.queryForObject(
                "SELECT version FROM article WHERE id = ?", Integer.class, article.articleId()));
        assertEquals("SCHEDULED".equals(state) ? version - 1 : version, jdbcTemplate.queryForObject(
                "SELECT version FROM article_revision WHERE id = ?", Integer.class, article.revisionId()));
        assertEquals("SCHEDULED".equals(state) ? "APPROVED" : state, jdbcTemplate.queryForObject(
                "SELECT state FROM article_revision WHERE id = ?", String.class, article.revisionId()));
        assertEquals(snapshots, count("publication_snapshot", "aggregate_id", article.articleId()));
    }

    private int successfulAuditCount(CreatedArticle article, String action) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*) FROM audit_event WHERE target_id = ? AND action = ?
                  AND metadata->>'status' IN ('ACCEPTED', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED')
                """, Integer.class, article.articleId(), "ARTICLE_" + action);
    }

    private int count(String table, String column, UUID id) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM " + table + " WHERE " + column + " = ?",
                Integer.class, id);
    }

    private String snapshotBytes(CreatedArticle article) {
        return jdbcTemplate.queryForObject("""
                SELECT content_document::text FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ? AND revision_id = ?
                """, String.class, article.articleId(), article.revisionId());
    }

    private OutboxEvent publicationEvent(CreatedArticle article, String action) {
        UUID id = jdbcTemplate.queryForObject("""
                SELECT id FROM outbox_event WHERE aggregate_id = ?
                  AND event_type = 'publication.article.command' AND payload->>'action' = ?
                """, UUID.class, article.articleId(), action);
        return new OutboxRepository(jdbcTemplate).findById(id).orElseThrow();
    }

    private PublicationJobHandler worker(SearchProjection projection) {
        return worker(projection, request -> {
            throw new AssertionError("Blocked schedule must not invoke external invalidation");
        });
    }

    private PublicationJobHandler worker(
            SearchProjection projection,
            tw.basketball.magazine.publication.worker.PublicationExternalInvalidator invalidator
    ) {
        return new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate), transactions(), JSON,
                Clock.fixed(EXECUTED_AT, ZoneOffset.UTC),
                invalidator,
                projection
        );
    }

    private TransactionTemplate transactions() {
        return new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource()));
    }
}
