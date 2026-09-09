package tw.basketball.magazine.publication.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
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
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.publication.worker.IssuePublicationJobHandler;
import tw.basketball.magazine.publication.worker.PublicationExternalInvalidator;
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
        EditorialWorkflowService articleService = new EditorialWorkflowService(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                applicationClock
        );
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new EditorialIssueController(service), new EditorialArticleController(articleService))
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
    void publisherCanReadIssueQueueAndVersionWithoutEditorAuthority() throws Exception {
        UUID issueId = createIssue(actor("read-queue-editor", RoleCode.EDITOR), "publisher-queue");
        Authentication publisher = actor("read-queue-publisher", RoleCode.PUBLISHER);
        mockMvc.perform(get("/api/v1/publisher/issues").principal(publisher)
                        .header("X-Request-Id", "publisher-queue-request"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].issueId").value(issueId.toString()))
                .andExpect(jsonPath("$.items[0].version").value(1))
                .andExpect(jsonPath("$.page.limit").value(20));
        mockMvc.perform(get("/api/v1/publisher/issues/{id}", issueId).principal(publisher))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string(HttpHeaders.ETAG, "\"1\""))
                .andExpect(jsonPath("$.issueId").value(issueId.toString()))
                .andExpect(jsonPath("$.state").value("DRAFT"));
        mockMvc.perform(get("/api/v1/publisher/issues/{id}", UUID.randomUUID()).principal(publisher))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void publisherReadRoleIsExplicitAndDoesNotGrantEditorMutations() throws Exception {
        UUID issueId = createIssue(actor("read-boundary-editor", RoleCode.EDITOR), "publisher-read-boundary");
        for (String url : List.of("/api/v1/publisher/issues", "/api/v1/publisher/issues/" + issueId)) {
            mockMvc.perform(get(url).principal(actor("only-editor", RoleCode.EDITOR)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
            mockMvc.perform(get(url)).andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
            Authentication editorPublisher = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                    "editor-publisher", null, List.of(
                            new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_EDITOR"),
                            new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PUBLISHER")));
            mockMvc.perform(get(url).principal(editorPublisher)).andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/v1/editor/issues").principal(actor("only-publisher", RoleCode.PUBLISHER)))
                .andExpect(status().isForbidden());
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
        reviewIssue(editor, publisher, issueId, 1);

        mockMvc.perform(post("/api/v1/publisher/issues/{issueId}:schedule", issueId)
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "issue-schedule")
                        .content("""
                                {"publishAt":"2026-08-11T09:00:00","timezone":"Asia/Taipei"}
                                """))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.version").value(4))
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-11T01:00:00Z"));

        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));

        mockMvc.perform(post("/api/v1/publisher/issues/{issueId}:publish", issueId)
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"4\"")
                        .header("Idempotency-Key", "issue-publish"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(5));

        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE target_type = 'ISSUE' AND target_id = ? AND action = 'ISSUE_PUBLISHED'",
                Integer.class,
                issueId));
    }

    @Test
    void populatedIssueCompletesLifecycleAndRetriesPreserveOneImmutableSnapshot() throws Exception {
        Authentication editor = actor("issue-lifecycle-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-lifecycle-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "populated-lifecycle");
        CreatedArticle article = createArticle(editor, "populated-article");
        publishArticle(editor, publisher, article);
        populateIssue(editor, issueId, article.articleId());
        reviewIssue(editor, publisher, issueId, 2);

        MvcResult published = issueCommand(publisher, issueId, "publish", 4, "populated-publish")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(5))
                .andReturn();
        String snapshot = issueSnapshot(issueId);
        var document = JSON.readTree(snapshot);
        assertEquals(1, document.path("sections").size());
        assertEquals(1, document.path("sections").get(0).path("articles").size());
        var publishedArticle = document.path("sections").get(0).path("articles").get(0);
        assertEquals(article.articleId().toString(), publishedArticle.path("articleId").asString());
        assertEquals(article.revisionId().toString(), publishedArticle.path("revisionId").asString());
        assertEquals(1, publishedArticle.path("revisionNumber").asInt());
        for (int retry = 0; retry < 10; retry++) {
            MvcResult replay = issueCommand(publisher, issueId, "publish", 4, "populated-publish")
                    .andExpect(status().isAccepted())
                    .andReturn();
            assertEquals(published.getResponse().getContentAsString(), replay.getResponse().getContentAsString());
        }
        assertEquals(1, issueEventCount(issueId, "ISSUE_PUBLISHED"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                Integer.class, issueId));
        issueCommand(publisher, issueId, "publish", 4, "new-key-stale-publish")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        MvcResult archived = issueCommand(publisher, issueId, "archive", 5, "populated-archive")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.version").value(6))
                .andReturn();
        MvcResult archiveReplay = issueCommand(publisher, issueId, "archive", 5, "populated-archive")
                .andExpect(status().isAccepted())
                .andReturn();
        assertEquals(archived.getResponse().getContentAsString(), archiveReplay.getResponse().getContentAsString());
        assertEquals("ARCHIVED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(List.of("SUBMITTED", "APPROVED"), jdbcTemplate.queryForList(
                "SELECT decision FROM publication_review WHERE aggregate_type = 'ISSUE' AND aggregate_id = ? ORDER BY occurred_at, id",
                String.class, issueId));
        assertEquals(1, issueEventCount(issueId, "ISSUE_CREATED"));
        assertEquals(1, issueEventCount(issueId, "ISSUE_SUBMITTED"));
        assertEquals(1, issueEventCount(issueId, "ISSUE_APPROVED"));
        assertEquals(1, issueEventCount(issueId, "ISSUE_ARCHIVED"));
        assertEquals(snapshot, issueSnapshot(issueId));
        assertThrows(DataAccessException.class, () -> jdbcTemplate.update(
                "UPDATE publication_snapshot SET content_document = '{}'::jsonb WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                issueId));
        assertEquals(snapshot, issueSnapshot(issueId));
    }

    @Test
    void includedUnapprovedRevisionBlocksIssueBeforeAnyPublicationSideEffect() throws Exception {
        Authentication editor = actor("issue-unapproved-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-unapproved-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "unapproved-revision-issue");
        CreatedArticle article = createArticle(editor, "unapproved-revision-article");
        populateIssue(editor, issueId, article.articleId());
        reviewIssue(editor, publisher, issueId, 2);

        issueCommand(publisher, issueId, "publish", 4, "reject-unapproved-revision")
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value("ISSUE_NOT_READY"));
        assertEquals("DRAFT", jdbcTemplate.queryForObject(
                "SELECT state FROM article_revision WHERE id = ?", String.class, article.revisionId()));
        assertEquals("APPROVED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(4L, jdbcTemplate.queryForObject(
                "SELECT version FROM publication_issue WHERE id = ?", Long.class, issueId));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                Integer.class, issueId));
        assertEquals(0, issueEventCount(issueId, "ISSUE_PUBLISHED"));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_idempotency WHERE idempotency_key = 'reject-unapproved-revision'",
                Integer.class));

        publishArticle(editor, publisher, article);
        issueCommand(publisher, issueId, "publish", 4, "reject-unapproved-revision")
                .andExpect(status().isAccepted());
        assertEquals(article.revisionId().toString(), JSON.readTree(issueSnapshot(issueId))
                .path("sections").get(0).path("articles").get(0).path("revisionId").asString());
    }

    @Test
    void issueWorkflowRejectsSkippedTransitionsStaleWritesAndNonPublisherArchive() throws Exception {
        Authentication editor = actor("issue-boundary-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-boundary-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "issue-boundaries");
        for (String command : List.of("approve", "publish", "archive")) {
            issueCommand(publisher, issueId, command, 1, "skip-" + command)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
                    .andExpect(jsonPath("$.errors[0].code").value("INVALID_TRANSITION"));
        }
        for (RoleCode role : List.of(RoleCode.READER, RoleCode.EDITOR, RoleCode.ADMIN)) {
            issueCommand(actor("archive-" + role.name(), role), issueId, "archive", 1, "denied-" + role.name())
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        issueCommand(publisher, issueId, "archive", 0, "stale-archive")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
        assertEquals("DRAFT", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(0, issueEventCount(issueId, "ISSUE_ARCHIVED"));
    }

    @Test
    void publicationReadinessLocksTheExactReferencedRevisionUntilSnapshotCreation() throws Exception {
        Authentication editor = actor("issue-lock-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-lock-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "issue-lock");
        CreatedArticle article = createArticle(editor, "article-lock");
        publishArticle(editor, publisher, article);
        populateIssue(editor, issueId, article.articleId());
        JdbcEditorialIssueRepository repository = new JdbcEditorialIssueRepository(jdbcTemplate, JSON);
        try (Connection otherTransaction = java.util.Objects.requireNonNull(jdbcTemplate.getDataSource())
                .getConnection(); Statement statement = otherTransaction.createStatement()) {
            statement.execute("SET lock_timeout = '100ms'");
            new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource()))
                    .executeWithoutResult(status -> {
                        repository.findForUpdate(issueId).orElseThrow();
                        assertTrue(repository.readyForPublication(issueId, applicationClock.now()));
                        SQLException blocked = assertThrows(SQLException.class, () -> statement.executeUpdate(
                                "UPDATE article_revision SET state = 'WITHDRAWN' WHERE id = '" + article.revisionId() + "'"));
                        assertEquals("55P03", blocked.getSQLState());
                        var snapshot = JSON.readTree(repository.publicationSnapshotDocument(issueId));
                        assertEquals(article.revisionId().toString(), snapshot.path("sections").get(0)
                                .path("articles").get(0).path("revisionId").asString());
                    });
        }
    }

    @Test
    void issuePublishAndArchiveOutboxRetryUntilInvalidationIsAcknowledged() throws Exception {
        Authentication editor = actor("issue-outbox-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-outbox-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "issue-outbox");
        CreatedArticle article = createArticle(editor, "article-outbox");
        publishArticle(editor, publisher, article);
        populateIssue(editor, issueId, article.articleId());
        reviewIssue(editor, publisher, issueId, 2);
        issueCommand(publisher, issueId, "publish", 4, "issue-outbox-publish")
                .andExpect(status().isAccepted());
        String snapshot = issueSnapshot(issueId);
        issueCommand(publisher, issueId, "archive", 5, "issue-outbox-archive")
                .andExpect(status().isAccepted());
        issueCommand(publisher, issueId, "archive", 5, "issue-outbox-archive")
                .andExpect(status().isAccepted());
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_job WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                Integer.class, issueId));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE event_type = 'publication.issue.command' AND aggregate_id = ?",
                Integer.class, issueId));

        OutboxEvent archiveEvent = issueOutbox(issueId, "ARCHIVE");
        IssuePublicationJobHandler unavailable = issueHandler(PublicationExternalInvalidator.unavailable());
        OutboxHandlerException failure = assertThrows(OutboxHandlerException.class,
                () -> unavailable.handle(archiveEvent));
        assertTrue(failure.retryable());
        assertEquals("PENDING", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE aggregate_id = ? AND operation = 'ARCHIVE'",
                String.class, issueId));
        assertEquals("ARCHIVED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));

        List<PublicationExternalInvalidator.Request> invalidations = new ArrayList<>();
        IssuePublicationJobHandler worker = issueHandler(invalidations::add);
        worker.handle(archiveEvent);
        worker.handle(archiveEvent);
        // Late publish delivery must invalidate the current archived state, never republish it.
        worker.handle(issueOutbox(issueId, "PUBLISH"));
        assertEquals(2, invalidations.size());
        for (PublicationExternalInvalidator.Request invalidation : invalidations) {
            assertEquals(List.of("issue:" + issueId, "issues", "search:issues", "sitemap:issues"),
                    invalidation.surrogateKeys());
        }
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_job WHERE aggregate_id = ? AND status = 'SUCCEEDED'",
                Integer.class, issueId));
        assertEquals("ARCHIVED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(snapshot, issueSnapshot(issueId));
        assertEquals(1, issueEventCount(issueId, "ISSUE_PUBLISHED"));
        assertEquals(1, issueEventCount(issueId, "ISSUE_ARCHIVED"));
    }

    @Test
    void scheduledPublicationCommitsBeforePurgeAndRetriesWithoutRepublishing() throws Exception {
        Authentication editor = actor("issue-scheduled-editor", RoleCode.EDITOR);
        Authentication publisher = actor("issue-scheduled-publisher", RoleCode.PUBLISHER);
        UUID issueId = createIssue(editor, "issue-scheduled-populated");
        CreatedArticle article = createArticle(editor, "article-scheduled-populated");
        publishArticle(editor, publisher, article);
        populateIssue(editor, issueId, article.articleId());
        reviewIssue(editor, publisher, issueId, 2);
        mockMvc.perform(post("/api/v1/publisher/issues/{id}:schedule", issueId)
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"4\"")
                        .header("Idempotency-Key", "populated-schedule")
                        .content("{\"publishAt\":\"2026-08-11T09:00:00\",\"timezone\":\"Asia/Taipei\"}"))
                .andExpect(status().isAccepted());
        OutboxEvent event = issueOutbox(issueId, "SCHEDULE");
        Clock due = Clock.fixed(java.time.Instant.parse("2026-08-11T01:00:00Z"), ZoneOffset.UTC);
        IssuePublicationJobHandler unavailable = issueHandler(PublicationExternalInvalidator.unavailable(), due);
        assertTrue(assertThrows(OutboxHandlerException.class, () -> unavailable.handle(event)).retryable());
        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                Integer.class, issueId));
        assertEquals("PENDING", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE aggregate_id = ? AND operation = 'SCHEDULE'",
                String.class, issueId));
        String committedSnapshot = issueSnapshot(issueId);
        List<PublicationExternalInvalidator.Request> invalidations = new ArrayList<>();
        IssuePublicationJobHandler worker = issueHandler(request -> {
            try (Connection observer = java.util.Objects.requireNonNull(jdbcTemplate.getDataSource())
                    .getConnection(); Statement query = observer.createStatement();
                    var result = query.executeQuery("""
                            SELECT state, (SELECT count(*) FROM publication_snapshot
                              WHERE aggregate_type = 'ISSUE' AND aggregate_id = publication_issue.id) AS snapshots
                            FROM publication_issue WHERE id = '%s'
                            """.formatted(issueId))) {
                assertTrue(result.next());
                assertEquals("PUBLISHED", result.getString("state"));
                assertEquals(1, result.getInt("snapshots"));
            } catch (SQLException exception) {
                throw new IllegalStateException("unable to inspect committed publication at purge time", exception);
            }
            invalidations.add(request);
        }, due);
        worker.handle(event);
        worker.handle(event);
        assertEquals(1, invalidations.size());
        assertEquals("PUBLISHED", jdbcTemplate.queryForObject(
                "SELECT state FROM publication_issue WHERE id = ?", String.class, issueId));
        assertEquals("SUCCEEDED", jdbcTemplate.queryForObject(
                "SELECT status FROM publication_job WHERE aggregate_id = ? AND operation = 'SCHEDULE'",
                String.class, issueId));
        assertEquals(article.revisionId().toString(), JSON.readTree(issueSnapshot(issueId))
                .path("sections").get(0).path("articles").get(0).path("revisionId").asString());
        assertEquals(committedSnapshot, issueSnapshot(issueId));
        assertEquals(1, issueEventCount(issueId, "ISSUE_PUBLISHED"));
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

    private IssuePublicationJobHandler issueHandler(PublicationExternalInvalidator invalidator) {
        return issueHandler(invalidator, Clock.fixed(applicationClock.now(), ZoneOffset.UTC));
    }

    private IssuePublicationJobHandler issueHandler(PublicationExternalInvalidator invalidator, Clock clock) {
        return new IssuePublicationJobHandler(
                new JdbcEditorialIssueRepository(jdbcTemplate, JSON),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                JSON,
                clock,
                invalidator
        );
    }

    private OutboxEvent issueOutbox(UUID issueId, String action) {
        UUID eventId = jdbcTemplate.queryForObject("""
                SELECT id FROM outbox_event
                WHERE event_type = 'publication.issue.command' AND aggregate_id = ? AND payload ->> 'action' = ?
                """, UUID.class, issueId, action);
        return new OutboxRepository(jdbcTemplate).findById(java.util.Objects.requireNonNull(eventId)).orElseThrow();
    }

    private org.springframework.test.web.servlet.ResultActions issueCommand(
            Authentication publisher, UUID issueId, String command, long version, String key
    ) throws Exception {
        return mockMvc.perform(post("/api/v1/publisher/issues/{id}:" + command, issueId)
                .principal(publisher)
                .header(HttpHeaders.IF_MATCH, "\"" + version + "\"")
                .header("Idempotency-Key", key));
    }

    private void reviewIssue(
            Authentication editor, Authentication publisher, UUID issueId, long version
    ) throws Exception {
        mockMvc.perform(post("/api/v1/editor/issues/{id}:submit", issueId)
                        .principal(editor)
                        .header(HttpHeaders.IF_MATCH, "\"" + version + "\"")
                        .header("Idempotency-Key", "submit-" + issueId))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("IN_REVIEW"))
                .andExpect(jsonPath("$.version").value(version + 1));
        issueCommand(publisher, issueId, "approve", version + 1, "approve-" + issueId)
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.version").value(version + 2));
    }

    private CreatedArticle createArticle(Authentication editor, String slug) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "create-" + slug)
                        .content("""
                                {"title":"Populated issue article","slug":"%s","dek":"Fixture article",
                                 "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001",
                                   "blocks":[{"id":"00000000-0000-4000-8000-000000000101","type":"paragraph","version":1,
                                     "payload":{"content":[{"kind":"text","text":"Populated issue fixture"}]}}]}}
                                """.formatted(slug)))
                .andExpect(status().isCreated())
                .andReturn();
        return readCreatedArticle(result.getResponse().getContentAsString());
    }

    private void publishArticle(Authentication editor, Authentication publisher, CreatedArticle article)
            throws Exception {
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "article-submit-" + article.articleId())
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted());
        for (int index = 0; index < 2; index++) {
            String command = index == 0 ? "approve" : "publish";
            mockMvc.perform(post("/api/v1/publisher/articles/{id}:" + command, article.articleId())
                            .principal(publisher)
                            .header(HttpHeaders.IF_MATCH, "\"" + (index + 2) + "\"")
                            .header("Idempotency-Key", "article-" + command + "-" + article.articleId()))
                    .andExpect(status().isAccepted());
        }
    }

    private void populateIssue(Authentication editor, UUID issueId, UUID articleId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/editor/issues/{id}/sections", issueId)
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "populated-section-" + issueId)
                        .content("{\"title\":\"Published articles\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        UUID sectionId = UUID.fromString(JSON.readTree(result.getResponse().getContentAsString())
                .path("sections").get(0).path("sectionId").asString());
        // Membership is fixture arrangement; every issue and article state transition uses HTTP.
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, position)
                VALUES (?, ?, ?, 1)
                """, issueId, sectionId, articleId);
    }

    private String issueSnapshot(UUID issueId) {
        return jdbcTemplate.queryForObject(
                "SELECT content_document::text FROM publication_snapshot WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?",
                String.class, issueId);
    }

    private int issueEventCount(UUID issueId, String action) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE target_type = 'ISSUE' AND target_id = ? AND action = ?",
                Integer.class, issueId, action);
        return java.util.Objects.requireNonNull(count);
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
