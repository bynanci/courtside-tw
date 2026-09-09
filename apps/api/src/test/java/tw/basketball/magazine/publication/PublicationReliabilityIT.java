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
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

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
import tw.basketball.magazine.content.application.PublicArticleService;
import tw.basketball.magazine.content.persistence.JdbcPublicArticleRepository;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.outbox.OutboxClaim;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.outbox.OutboxRetryPolicy;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.worker.PublicationExternalInvalidator;
import tw.basketball.magazine.publication.worker.PublicationJobHandler;
import tw.basketball.magazine.publication.worker.PublicationInvalidationKeys;
import tw.basketball.magazine.search.worker.SearchProjection;
import tw.basketball.magazine.search.worker.SearchProjectionHandler;
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
        CyclicBarrier bothPurgesStarted = new CyclicBarrier(2);
        AtomicInteger purgeAttempts = new AtomicInteger();
        PublicationJobHandler handler = handlerAt("2026-08-10T01:01:00Z", request -> {
            purgeAttempts.incrementAndGet();
            try {
                bothPurgesStarted.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError(exception);
            } catch (java.util.concurrent.BrokenBarrierException | java.util.concurrent.TimeoutException exception) {
                throw new AssertionError("Both deliveries must reach the committed purge boundary", exception);
            }
        });
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = workers.submit(() -> handle(event, handler));
            Future<?> second = workers.submit(() -> handle(event, handler));
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        } finally {
            workers.shutdownNow();
            workers.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals("SUCCEEDED", jobStatus("concurrent-worker-schedule"));
        assertEquals("PUBLISHED", articleState(article.id()));
        assertEquals(1, snapshotCount(article.id(), article.revisionId()));
        assertEquals(2, purgeAttempts.get());
    }

    @Test
    void unconfiguredProviderCannotCompletePublicationDespiteCommittedOrigin() throws Exception {
        MvcArticle article = createAndSchedule("unconfigured-purge");
        OutboxEvent event = scheduleEvent("unconfigured-purge-schedule");
        PublicationJobHandler handler = handlerAt("2026-08-10T01:01:00Z",
                PublicationExternalInvalidator.unavailable());

        for (int delivery = 0; delivery < 2; delivery++) {
            OutboxHandlerException failure = assertThrows(OutboxHandlerException.class, () -> handler.handle(event));
            assertTrue(failure.retryable());
            assertEquals("PENDING", jobStatus("unconfigured-purge-schedule"));
            assertEquals("PUBLISHED", articleState(article.id()));
            assertEquals(1, snapshotCount(article.id(), article.revisionId()));
        }
    }

    @Test
    void delayedPublishPurgeAfterWithdrawalNeverReopensOrigin() throws Exception {
        MvcArticle article = createAndSchedule("late-publish-purge");
        OutboxEvent event = scheduleEvent("late-publish-purge-schedule");
        PartialExternalInvalidation probe = new PartialExternalInvalidation();
        PublicationJobHandler handler = handlerAt("2026-08-10T01:01:00Z", probe);
        assertThrows(OutboxHandlerException.class, () -> handler.handle(event));
        int version = jdbcTemplate.queryForObject("SELECT version FROM article WHERE id = ?",
                Integer.class, article.id());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:withdraw", article.id())
                        .principal(actor("late-publish-purge-publisher", RoleCode.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"%s\"".formatted(version))
                        .header("Idempotency-Key", "late-publish-purge-withdraw")
                        .content("{\"reason\":\"withdraw before purge retry\"}"))
                .andExpect(status().isAccepted());

        handler.handle(event);
        handler.handle(event);

        assertEquals("WITHDRAWN", articleState(article.id()));
        assertEquals("SUCCEEDED", jobStatus("late-publish-purge-schedule"));
        assertEquals(1, snapshotCount(article.id(), article.revisionId()));
        assertEquals(2, probe.attempts);
        assertEquals(probe.idempotencyKeys.get(0), probe.idempotencyKeys.get(1));
    }

    @ParameterizedTest
    @CsvSource({"SCHEDULE,false", "SCHEDULE,true", "PUBLISH,false", "PUBLISH,true"})
    void committedRevisionPurgeSurvivesNewerDraftOrPublication(String action, boolean publishNext) throws Exception {
        String prefix = "committed-purge-" + action.toLowerCase(java.util.Locale.ROOT) + "-" + publishNext;
        Authentication editor = actor(prefix + "-editor", RoleCode.EDITOR);
        Authentication publisher = actor(prefix + "-publisher", RoleCode.PUBLISHER);
        MvcArticle first = create(editor, prefix + "-create");
        submit(first, editor, prefix + "-submit");
        approve(first, publisher, prefix + "-approve");
        String jobKey = prefix + "-initial";
        if ("SCHEDULE".equals(action)) {
            schedule(first, publisher, jobKey);
        } else {
            publisherCommand(first, publisher, "publish", jobKey);
        }
        OutboxEvent event = publicationEvent(action, jobKey);
        PartialExternalInvalidation probe = new PartialExternalInvalidation();
        List<UUID> projectedRevisions = new ArrayList<>();
        PublicationJobHandler handler = handlerAt("2026-08-10T01:01:00Z", probe, new SearchProjection() {
            @Override
            public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
                assertEquals(first.id(), articleId);
                projectedRevisions.add(revisionId);
            }

            @Override
            public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
                throw new AssertionError("A purge retry must not change the current search projection");
            }
        });
        assertThrows(OutboxHandlerException.class, () -> handler.handle(event));
        assertEquals("PENDING", jobStatus(jobKey));
        assertEquals(1, snapshotCount(first.id(), first.revisionId()));
        assertEquals(List.of(first.revisionId()), projectedRevisions);

        MvcResult revised = mockMvc.perform(post("/api/v1/editor/articles/{id}:revise", first.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, currentIfMatch(first.id()))
                        .header("Idempotency-Key", prefix + "-revise")
                        .content("{\"title\":\"Newer editorial revision\",\"content\":%s}".formatted(CREATE_BODY_CONTENT)))
                .andExpect(status().isCreated()).andReturn();
        UUID nextRevision = UUID.fromString(JSON.readTree(revised.getResponse().getContentAsString())
                .path("revisionId").asString());
        MvcArticle next = new MvcArticle(first.id(), nextRevision);
        if (publishNext) {
            submit(next, editor, prefix + "-next-submit");
            publisherCommand(next, publisher, "approve", prefix + "-next-approve");
            publisherCommand(next, publisher, "publish", prefix + "-next-publish");
        }
        String expectedState = publishNext ? "PUBLISHED" : "DRAFT";
        String currentVersion = currentIfMatch(first.id());
        assertEquals(expectedState, articleState(first.id()));

        handler.handle(event);
        handler.handle(event);

        assertEquals("SUCCEEDED", jobStatus(jobKey));
        assertEquals(expectedState, articleState(first.id()));
        assertEquals(currentVersion, currentIfMatch(first.id()));
        assertEquals(publishNext ? nextRevision : first.revisionId(), jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?", UUID.class, first.id()));
        assertEquals(nextRevision, new JdbcEditorialArticleRepository(jdbcTemplate).find(first.id()).orElseThrow().revisionId());
        assertEquals(1, snapshotCount(first.id(), first.revisionId()));
        assertEquals(publishNext ? 1 : 0, snapshotCount(first.id(), nextRevision));
        assertEquals(List.of(first.revisionId()), projectedRevisions);
        assertEquals(2, probe.attempts);
        assertEquals(probe.idempotencyKeys.get(0), probe.idempotencyKeys.get(1));
        assertEquals(PublicationInvalidationKeys.forArticle(first.id(), first.revisionId()), probe.lastKeys);
    }

    @ParameterizedTest
    @CsvSource({
            "WITHDRAW,false,false", "WITHDRAW,false,true", "WITHDRAW,true,false", "WITHDRAW,true,true",
            "ARCHIVE,false,false", "ARCHIVE,false,true", "ARCHIVE,true,false", "ARCHIVE,true,true"
    })
    void committedRemovalPurgeSurvivesNewerDraftOrPublication(
            String action, boolean publishNext, boolean attemptedBeforeRevision
    ) throws Exception {
        String prefix = "removal-purge-" + action.toLowerCase(java.util.Locale.ROOT)
                + "-" + publishNext + "-" + attemptedBeforeRevision;
        Authentication editor = actor(prefix + "-editor", RoleCode.EDITOR);
        Authentication publisher = actor(prefix + "-publisher", RoleCode.PUBLISHER);
        MvcArticle first = create(editor, prefix + "-create");
        attachIssueForSearchProjection(first.id());
        submit(first, editor, prefix + "-submit");
        approve(first, publisher, prefix + "-approve");
        publisherCommand(first, publisher, "publish", prefix + "-publish");
        SearchProjection projection = new SearchProjectionHandler(jdbcTemplate, JSON);
        handlerAt("2026-08-10T01:01:00Z", request -> { }, projection)
                .handle(publicationEvent("PUBLISH", prefix + "-publish"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM search_document WHERE article_id = ? AND revision_id = ? AND active",
                Integer.class, first.id(), first.revisionId()));

        String jobKey = prefix + "-remove";
        removePublication(first, publisher, action, jobKey);
        OutboxEvent event = publicationEvent(action, jobKey);
        PartialExternalInvalidation probe = new PartialExternalInvalidation();
        PublicationJobHandler removal = handlerAt("2026-08-10T01:02:00Z", probe, projection);
        if (attemptedBeforeRevision) {
            OutboxHandlerException failure = assertThrows(OutboxHandlerException.class, () -> removal.handle(event));
            assertTrue(failure.retryable());
            assertEquals(1, probe.attempts);
            assertEquals("PENDING", jobStatus(jobKey));
        }

        // Exercise the public command boundary: both WITHDRAWN and ARCHIVED allow a new revision.
        MvcArticle next = revise(first, editor, prefix + "-revise");
        if (publishNext) {
            submit(next, editor, prefix + "-next-submit");
            publisherCommand(next, publisher, "approve", prefix + "-next-approve");
            publisherCommand(next, publisher, "publish", prefix + "-next-publish");
            handlerAt("2026-08-10T01:03:00Z", request -> { }, projection)
                    .handle(publicationEvent("PUBLISH", prefix + "-next-publish"));
        }
        String expectedState = publishNext ? "PUBLISHED" : "DRAFT";
        String currentVersion = currentIfMatch(first.id());
        var projectionBeforeRetry = jdbcTemplate.queryForList(
                "SELECT revision_id, active, version FROM search_document WHERE article_id = ? ORDER BY revision_id",
                first.id());
        assertEquals(expectedState, articleState(first.id()));
        if (!attemptedBeforeRevision) {
            OutboxHandlerException failure = assertThrows(OutboxHandlerException.class, () -> removal.handle(event));
            assertTrue(failure.retryable(), "a newer revision must not dead-letter an outstanding purge");
            assertEquals(1, probe.attempts, "first delivery must reach the committed purge obligation");
            assertEquals("PENDING", jobStatus(jobKey));
        }

        removal.handle(event);
        removal.handle(event);

        assertEquals("SUCCEEDED", jobStatus(jobKey));
        assertEquals(expectedState, articleState(first.id()));
        assertEquals(currentVersion, currentIfMatch(first.id()));
        assertEquals(next.revisionId(), new JdbcEditorialArticleRepository(jdbcTemplate)
                .find(first.id()).orElseThrow().revisionId());
        assertEquals(publishNext ? next.revisionId() : first.revisionId(), jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?", UUID.class, first.id()));
        assertEquals(1, snapshotCount(first.id(), first.revisionId()));
        assertEquals(publishNext ? 1 : 0, snapshotCount(first.id(), next.revisionId()));
        assertEquals(projectionBeforeRetry, jdbcTemplate.queryForList(
                "SELECT revision_id, active, version FROM search_document WHERE article_id = ? ORDER BY revision_id",
                first.id()), "an old removal must not alter the newer search projection");
        assertEquals(2, probe.attempts);
        assertEquals(probe.idempotencyKeys.get(0), probe.idempotencyKeys.get(1));
        assertEquals(PublicationInvalidationKeys.forArticle(first.id(), first.revisionId()), probe.lastKeys);
    }

    @Test
    void committedWithdrawalPurgeSurvivesArchiveOfTheSameRevision() throws Exception {
        Authentication editor = actor("withdraw-archive-editor", RoleCode.EDITOR);
        Authentication publisher = actor("withdraw-archive-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor, "withdraw-archive-create");
        attachIssueForSearchProjection(article.id());
        submit(article, editor, "withdraw-archive-submit");
        approve(article, publisher, "withdraw-archive-approve");
        publisherCommand(article, publisher, "publish", "withdraw-archive-publish");
        SearchProjection projection = new SearchProjectionHandler(jdbcTemplate, JSON);
        handlerAt("2026-08-10T01:01:00Z", request -> { }, projection)
                .handle(publicationEvent("PUBLISH", "withdraw-archive-publish"));
        removePublication(article, publisher, "WITHDRAW", "withdraw-archive-withdraw");
        removePublication(article, publisher, "ARCHIVE", "withdraw-archive-archive");
        String currentVersion = currentIfMatch(article.id());
        List<PublicationExternalInvalidator.Request> purges = new ArrayList<>();
        PublicationJobHandler removal = handlerAt("2026-08-10T01:02:00Z", purges::add, projection);
        OutboxEvent event = publicationEvent("WITHDRAW", "withdraw-archive-withdraw");

        removal.handle(event);
        removal.handle(event);

        assertEquals("SUCCEEDED", jobStatus("withdraw-archive-withdraw"));
        assertEquals("PENDING", jobStatus("withdraw-archive-archive"));
        assertEquals("ARCHIVED", articleState(article.id()));
        assertEquals(currentVersion, currentIfMatch(article.id()));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM search_document WHERE article_id = ? AND active", Integer.class, article.id()));
        assertEquals(1, purges.size());
        assertEquals(PublicationInvalidationKeys.forArticle(article.id(), article.revisionId()),
                purges.getFirst().surrogateKeys());
    }

    @ParameterizedTest
    @CsvSource({"WITHDRAW", "ARCHIVE"})
    void removalBeforeFirstPublicationStillDeliversItsCommittedPurge(String action) throws Exception {
        Authentication editor = actor("never-published-editor", RoleCode.EDITOR);
        Authentication publisher = actor("never-published-publisher", RoleCode.PUBLISHER);
        MvcArticle article = create(editor, "never-published-create");
        submit(article, editor, "never-published-submit");
        approve(article, publisher, "never-published-approve");
        removePublication(article, publisher, "WITHDRAW", "never-published-withdraw");
        String jobKey = "never-published-withdraw";
        if ("ARCHIVE".equals(action)) {
            jobKey = "never-published-archive";
            removePublication(article, publisher, "ARCHIVE", jobKey);
        }
        List<PublicationExternalInvalidator.Request> purges = new ArrayList<>();
        PublicationJobHandler removal = handlerAt("2026-08-10T01:02:00Z", purges::add,
                new SearchProjectionHandler(jdbcTemplate, JSON));
        OutboxEvent event = publicationEvent(action, jobKey);

        removal.handle(event);
        removal.handle(event);

        assertEquals("ARCHIVE".equals(action) ? "ARCHIVED" : "WITHDRAWN", articleState(article.id()));
        assertEquals("SUCCEEDED", jobStatus(jobKey));
        assertEquals(0, snapshotCount(article.id(), article.revisionId()));
        assertEquals(1, purges.size());
        assertEquals(PublicationInvalidationKeys.forArticle(article.id(), article.revisionId()),
                purges.getFirst().surrogateKeys());
    }

    @ParameterizedTest
    @CsvSource({"PUBLISH", "WITHDRAW", "ARCHIVE"})
    void committedSearchReconciliationRaceRetriesWithoutLosingPurge(String action) throws Exception {
        String prefix = "search-race-" + action.toLowerCase(java.util.Locale.ROOT);
        Authentication editor = actor(prefix + "-editor", RoleCode.EDITOR);
        Authentication publisher = actor(prefix + "-publisher", RoleCode.PUBLISHER);
        MvcArticle first = create(editor, prefix + "-create");
        attachIssueForSearchProjection(first.id());
        submit(first, editor, prefix + "-submit");
        approve(first, publisher, prefix + "-approve");
        String jobKey = prefix + "-publish";
        publisherCommand(first, publisher, "publish", jobKey);
        SearchProjection delegate = new SearchProjectionHandler(jdbcTemplate, JSON);
        if (!"PUBLISH".equals(action)) {
            handlerAt("2026-08-10T01:01:00Z", request -> { }, delegate)
                    .handle(publicationEvent("PUBLISH", jobKey));
            jobKey = prefix + "-remove";
            removePublication(first, publisher, action, jobKey);
        }
        OutboxEvent event = publicationEvent(action, jobKey);
        List<PublicationExternalInvalidator.Request> purges = new ArrayList<>();
        AtomicBoolean raced = new AtomicBoolean();
        AtomicReference<MvcArticle> next = new AtomicReference<>();
        ExecutorService competingEditor = Executors.newSingleThreadExecutor();
        try {
            SearchProjection racingProjection = new SearchProjection() {
                @Override
                public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
                    commitNewRevision();
                    delegate.project(articleId, revisionId, indexedAt);
                }

                @Override
                public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
                    commitNewRevision();
                    delegate.withdraw(articleId, revisionId, indexedAt);
                }

                private void commitNewRevision() {
                    if (raced.compareAndSet(false, true)) {
                        // A separate thread uses its own transaction/connection. Its committed
                        // edit must survive rollback of the worker's failed reconciliation.
                        Future<MvcArticle> revised = competingEditor.submit(() -> revise(first, editor, prefix + "-revise"));
                        try {
                            next.set(revised.get(5, TimeUnit.SECONDS));
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                            throw new AssertionError(exception);
                        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException exception) {
                            throw new AssertionError("The competing revision must commit before projection reads", exception);
                        }
                    }
                }
            };
            PublicationJobHandler handler = handlerAt("2026-08-10T01:02:00Z", purges::add, racingProjection);
            OutboxHandlerException failure = assertThrows(OutboxHandlerException.class, () -> handler.handle(event));
            assertTrue(failure.retryable(), "a committed purge must not be dead-lettered by a source-state race");
            assertTrue(raced.get());
            assertEquals("PENDING", jobStatus(jobKey));
            assertEquals("DRAFT", articleState(first.id()));
            assertEquals(next.get().revisionId(), new JdbcEditorialArticleRepository(jdbcTemplate)
                    .find(first.id()).orElseThrow().revisionId());
            assertEquals(0, purges.size());
            String currentVersion = currentIfMatch(first.id());

            handler.handle(event);
            handler.handle(event);

            assertEquals("SUCCEEDED", jobStatus(jobKey));
            assertEquals("DRAFT", articleState(first.id()));
            assertEquals(currentVersion, currentIfMatch(first.id()));
            assertEquals(1, snapshotCount(first.id(), first.revisionId()));
            assertEquals(0, snapshotCount(first.id(), next.get().revisionId()));
            assertEquals(1, purges.size());
            assertEquals(PublicationInvalidationKeys.forArticle(first.id(), first.revisionId()),
                    purges.getFirst().surrogateKeys());
        } finally {
            competingEditor.shutdownNow();
            competingEditor.awaitTermination(10, TimeUnit.SECONDS);
        }
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
        payload.path("surrogateKeys").forEach(node -> keys.add(node.asString()));
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
        PublicationJobHandler firstDelivery = handlerAt("2026-08-10T01:02:00Z", probe);
        OutboxHandlerException firstFailure = assertThrows(
                OutboxHandlerException.class,
                () -> firstDelivery.handle(event)
        );
        assertTrue(firstFailure.retryable());
        assertEquals(1, probe.attempts);
        outbox.fail(firstClaim, new IllegalStateException("cache purge failed"), firstAttemptAt, retryPolicy);
        assertEquals("FAILED", outbox.findById(event.id()).orElseThrow().status().name());
        assertTrue(origin.findBySlug("reliability-fixture", null).isEmpty());

        OutboxEvent failed = outbox.findById(event.id()).orElseThrow();
        OutboxClaim retryClaim = onlyClaim(outbox, event.id(), failed.availableAt().plusSeconds(1));
        PublicationJobHandler retryDelivery = handlerAt("2026-08-10T01:03:00Z", probe);
        retryDelivery.handle(event);
        outbox.complete(retryClaim, failed.availableAt().plusSeconds(1));
        assertEquals("COMPLETED", outbox.findById(event.id()).orElseThrow().status().name());
        assertEquals("SUCCEEDED", jobStatus("partial-external-withdraw"));
        assertEquals(2, probe.attempts);
        String purgeKey = "article-publication:" + jdbcTemplate.queryForObject(
                "SELECT id FROM publication_job WHERE idempotency_key = 'partial-external-withdraw'", UUID.class);
        assertEquals(List.of(purgeKey, purgeKey), probe.idempotencyKeys);
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
                ) VALUES (?, 99, 'reliability-origin', 'Reliability issue', 'Reliability issue', ?, 'DRAFT', ?)
                """, issueId, coverAssetId, Timestamp.from(publishedAt));
        jdbcTemplate.update("""
                INSERT INTO issue_section (id, issue_id, title, position)
                VALUES (?, ?, 'Reliability', 1)
                """, sectionId, issueId);
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, published_revision_id, published_at)
                VALUES (?, 'withdrawn-origin', 'DRAFT', NULL, NULL)
                """, articleId);
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 1, 'Withdrawn origin', 'Withdrawn origin', ?::jsonb, 'DRAFT')
                """, revisionId, articleId, CREATE_BODY_CONTENT);
        jdbcTemplate.update("""
                INSERT INTO contributor (id, slug, display_name)
                VALUES (?, 'reliability-editor', 'Reliability editor')
                """, contributorId);
        jdbcTemplate.update("""
                INSERT INTO article_contributor (article_revision_id, contributor_id, role, position)
                VALUES (?, ?, 'EDITOR', 1)
                """, revisionId, contributorId);
        jdbcTemplate.update("UPDATE article_revision SET state = 'WITHDRAWN' WHERE id = ?", revisionId);
        jdbcTemplate.update("""
                UPDATE article
                SET state = 'WITHDRAWN', published_revision_id = ?, published_at = ?
                WHERE id = ?
                """, revisionId, Timestamp.from(publishedAt), articleId);
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, revision_id, position)
                VALUES (?, ?, ?, ?, 1)
                """, issueId, sectionId, articleId, revisionId);
        jdbcTemplate.update("UPDATE publication_issue SET state = 'PUBLISHED' WHERE id = ?", issueId);

        PublicArticleService origin = new PublicArticleService(
                new JdbcPublicArticleRepository(jdbcTemplate),
                Clock.fixed(Instant.parse("2026-08-10T00:00:00Z"), ZoneOffset.UTC)
        );

        assertTrue(origin.findBySlug("withdrawn-origin", null).isEmpty());
    }

    private static final String CREATE_BODY_CONTENT = """
            {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000103","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Reliability fixture"}]}}]}
            """;

    private void handle(OutboxEvent event, PublicationJobHandler handler) {
        try {
            handler.handle(event);
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
                UUID.fromString(node.path("articleId").asString()),
                UUID.fromString(node.path("revisionId").asString())
        );
    }

    private void submit(MvcArticle article, Authentication editor, String key) throws Exception {
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
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

    private String currentIfMatch(UUID articleId) {
        return "\"%s\"".formatted(jdbcTemplate.queryForObject(
                "SELECT version FROM article WHERE id = ?", Long.class, articleId));
    }

    private void publisherCommand(MvcArticle article, Authentication publisher, String action, String key) throws Exception {
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:" + action, article.id())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, currentIfMatch(article.id()))
                        .header("Idempotency-Key", key))
                .andExpect(status().isAccepted());
    }

    private MvcArticle revise(MvcArticle article, Authentication editor, String key) throws Exception {
        MvcResult revised = mockMvc.perform(post("/api/v1/editor/articles/{id}:revise", article.id())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, currentIfMatch(article.id()))
                        .header("Idempotency-Key", key)
                        .content("{\"title\":\"Newer editorial revision\",\"content\":%s}".formatted(CREATE_BODY_CONTENT)))
                .andExpect(status().isCreated()).andReturn();
        return new MvcArticle(article.id(), UUID.fromString(JSON.readTree(revised.getResponse().getContentAsString())
                .path("revisionId").asString()));
    }

    private void removePublication(MvcArticle article, Authentication publisher, String action, String key)
            throws Exception {
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:" + action.toLowerCase(java.util.Locale.ROOT), article.id())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, currentIfMatch(article.id()))
                        .header("Idempotency-Key", key)
                        .content("WITHDRAW".equals(action) ? "{\"reason\":\"committed purge fixture\"}" : "{}"))
                .andExpect(status().isAccepted());
    }

    private void attachIssueForSearchProjection(UUID articleId) {
        UUID assetId = UUID.randomUUID();
        UUID issueId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state)
                VALUES (?, 'private/reliability-cover.webp', ?, 'image/webp', 1024, 1200, 1600, 'cover', 'READY')
                """, assetId, "c".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO publication_issue (id, issue_number, slug, title, summary, cover_asset_id, state)
                VALUES (?, 91, 'reliability-search-issue', 'Reliability issue', 'Search projection fixture', ?, 'DRAFT')
                """, issueId, assetId);
        jdbcTemplate.update("""
                INSERT INTO issue_section (id, issue_id, title, position) VALUES (?, ?, 'Reliability section', 1)
                """, sectionId, issueId);
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, position) VALUES (?, ?, ?, 1)
                """, issueId, sectionId, articleId);
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
        // Successful local provider seam; real HTTP acknowledgement is tested by the adapter suite.
        return handlerAt(instant, request -> assertTrue(!request.surrogateKeys().isEmpty()));
    }

    private PublicationJobHandler handlerAt(
            String instant,
            PublicationExternalInvalidator invalidator
    ) {
        return handlerAt(instant, invalidator, SearchProjection.noop());
    }

    private PublicationJobHandler handlerAt(
            String instant,
            PublicationExternalInvalidator invalidator,
            SearchProjection projection
    ) {
        return new PublicationJobHandler(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC),
                invalidator,
                projection
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

    private static final class PartialExternalInvalidation
            implements PublicationExternalInvalidator {
        private int attempts;
        private List<String> lastKeys = List.of();
        private final List<String> idempotencyKeys = new ArrayList<>();

        @Override
        public void invalidate(PublicationExternalInvalidator.Request request) {
            attempts++;
            idempotencyKeys.add(request.idempotencyKey());
            lastKeys = new ArrayList<>(request.surrogateKeys());
            if (attempts == 1) {
                throw new IllegalStateException("simulated partial external purge failure");
            }
        }
    }
}
