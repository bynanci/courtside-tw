package tw.basketball.magazine.publication.application;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.ObjectMapper;

import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.publication.domain.PublicationAction;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.domain.PublicationWorkflow;
import tw.basketball.magazine.publication.domain.PublicationWorkflowException;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/**
 * Application boundary for the editorial workflow.
 *
 * <p>The JDBC path is used by the running API when a data source is available.
 * The in-memory path is deliberately package-visible through {@link
 * #inMemory(URI)} so HTTP contract tests can exercise role, version and
 * idempotency behavior without requiring an external database.</p>
 */
public final class EditorialWorkflowService {
    private static final long MAX_MEDIA_BYTES = 20L * 1024L * 1024L;
    private static final String DEFAULT_CONTENT = """
            {"schemaVersion":1,"documentId":"%s","blocks":[]}
            """;
    private static final List<String> MEDIA_TYPES =
            List.of("image/avif", "image/jpeg", "image/png", "image/webp");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final URI uploadBaseUrl;
    private final PublicationWorkflow workflow;
    private final ConcurrentMap<UUID, IssueRecord> memoryIssues = new ConcurrentHashMap<>();
    private final ConcurrentMap<UUID, ArticleRecord> memoryArticles = new ConcurrentHashMap<>();
    private final ConcurrentMap<UUID, MediaRecord> memoryMedia = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> memoryIdempotency = new ConcurrentHashMap<>();

    public EditorialWorkflowService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            Clock clock,
            URI uploadBaseUrl
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.uploadBaseUrl = uploadBaseUrl;
        this.workflow = new PublicationWorkflow(new PublicationReadinessService());
    }

    public static EditorialWorkflowService inMemory(URI uploadBaseUrl) {
        return new EditorialWorkflowService(
                null,
                new ObjectMapper(),
                Clock.systemUTC(),
                Objects.requireNonNull(uploadBaseUrl, "uploadBaseUrl")
        );
    }

    @Transactional
    public IssueDraft createIssue(String title, String slug, String summary, String actor, String key) {
        validateTitleAndSlug(title, slug);
        String boundedSummary = bounded(summary == null ? title : summary, "description", 1000);
        if (jdbcTemplate == null) {
            UUID issueId = UUID.randomUUID();
            memoryIssues.put(
                    issueId,
                    new IssueRecord(issueId, 1, title, slug, boundedSummary, "DRAFT", null)
            );
            return issueDraft(memoryIssues.get(issueId));
        }

        UUID issueId = UUID.randomUUID();
        UUID coverAssetId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state, version
                ) VALUES (?, ?, ?, 'image/webp', 1, 1, 1, ?, 'PENDING', 0)
                """,
                coverAssetId,
                "editorial/placeholders/" + coverAssetId,
                "0".repeat(64),
                "待補封面"
        );
        Integer nextIssueNumber = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(issue_number), 0) + 1 FROM publication_issue",
                Integer.class
        );
        jdbcTemplate.update(
                """
                INSERT INTO publication_issue (
                    id, issue_number, slug, title, summary, cover_asset_id, state, version
                ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 1)
                """,
                issueId,
                Objects.requireNonNull(nextIssueNumber, "database returned no issue number"),
                slug,
                title,
                boundedSummary,
                coverAssetId
        );
        return new IssueDraft(issueId, 1, title, slug, "DRAFT");
    }

    @Transactional
    public IssueDraft patchIssue(
            UUID issueId,
            Map<String, Object> changes,
            Version expected,
            String actor,
            String key
    ) {
        Objects.requireNonNull(issueId, "issueId");
        Objects.requireNonNull(changes, "changes");
        Objects.requireNonNull(expected, "expected");
        if (jdbcTemplate == null) {
            IssueRecord current = requireMemoryIssue(issueId);
            requireVersion(expected, current.version());
            String title = stringChange(changes, "title", current.title());
            String slug = stringChange(changes, "slug", current.slug());
            String summary = stringChange(changes, "description", current.summary());
            validateTitleAndSlug(title, slug);
            IssueRecord next = new IssueRecord(
                    issueId,
                    expected.next().value(),
                    title,
                    slug,
                    bounded(summary, "description", 1000),
                    current.state(),
                    current.scheduledFor()
            );
            memoryIssues.put(issueId, next);
            return issueDraft(next);
        }

        IssueRecord current = jdbcIssue(issueId);
        requireVersion(expected, current.version());
        if (!"DRAFT".equals(current.state())) {
            throw new PublicationWorkflowException(
                    "INVALID_TRANSITION",
                    "only draft issues can be edited"
            );
        }
        String title = stringChange(changes, "title", current.title());
        String slug = stringChange(changes, "slug", current.slug());
        String summary = stringChange(changes, "description", current.summary());
        validateTitleAndSlug(title, slug);
        int updated = jdbcTemplate.update(
                """
                UPDATE publication_issue
                SET title = ?, slug = ?, summary = ?, version = ?, updated_at = transaction_timestamp()
                WHERE id = ? AND version = ?
                """,
                title,
                slug,
                bounded(summary, "description", 1000),
                expected.next().value(),
                issueId,
                expected.value()
        );
        if (updated != 1) {
            throw versionConflict(issueId, true, expected);
        }
        return issueDraft(jdbcIssue(issueId));
    }

    @Transactional
    public ArticleDraft createArticle(String title, String slug, Map<String, Object> content, String actor, String key) {
        validateTitleAndSlug(title, slug);
        UUID articleId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        String contentJson = content == null
                ? DEFAULT_CONTENT.formatted(revisionId)
                : json(content);
        if (jdbcTemplate == null) {
            memoryArticles.put(
                    articleId,
                    new ArticleRecord(
                            articleId,
                            1,
                            title,
                            slug,
                            "DRAFT",
                            revisionId,
                            1,
                            contentJson,
                            null
                    )
            );
            return articleDraft(memoryArticles.get(articleId));
        }

        jdbcTemplate.update(
                """
                INSERT INTO article (id, slug, state, version)
                VALUES (?, ?, 'DRAFT', 1)
                """,
                articleId,
                slug
        );
        jdbcTemplate.update(
                """
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state, version
                ) VALUES (?, ?, 1, ?, '', ?::jsonb, 'DRAFT', 1)
                """,
                revisionId,
                articleId,
                title,
                contentJson
        );
        return new ArticleDraft(articleId, 1, title, slug, "DRAFT");
    }

    @Transactional
    public ArticleDraft patchArticle(
            UUID articleId,
            Map<String, Object> changes,
            Version expected,
            String actor,
            String key
    ) {
        Objects.requireNonNull(changes, "changes");
        ArticleRecord current = article(articleId);
        requireVersion(expected, current.version());
        if (!"DRAFT".equals(current.state())) {
            throw new PublicationWorkflowException(
                    "INVALID_TRANSITION",
                    "only draft articles can be edited"
            );
        }

        String title = stringChange(changes, "title", current.title());
        String slug = stringChange(changes, "slug", current.slug());
        validateTitleAndSlug(title, slug);
        String contentJson = current.contentJson();
        Object content = changes.get("content");
        if (content != null) {
            contentJson = json(content);
        }

        if (jdbcTemplate == null) {
            ArticleRecord next = new ArticleRecord(
                    articleId,
                    expected.next().value(),
                    title,
                    slug,
                    current.state(),
                    UUID.randomUUID(),
                    current.revisionNumber() + 1,
                    contentJson,
                    current.scheduledFor()
            );
            memoryArticles.put(articleId, next);
            return articleDraft(next);
        }

        UUID revisionId = UUID.randomUUID();
        int revisionNumber = current.revisionNumber() + 1;
        int updated = jdbcTemplate.update(
                """
                UPDATE article
                SET slug = ?, version = ?, updated_at = transaction_timestamp()
                WHERE id = ? AND version = ?
                """,
                slug,
                expected.next().value(),
                articleId,
                expected.value()
        );
        if (updated != 1) {
            throw versionConflict(articleId, false, expected);
        }
        jdbcTemplate.update(
                """
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state, version
                ) VALUES (?, ?, ?, ?, '', ?::jsonb, 'DRAFT', 1)
                """,
                revisionId,
                articleId,
                revisionNumber,
                title,
                contentJson
        );
        return new ArticleDraft(articleId, expected.next().value(), title, slug, "DRAFT");
    }

    @Transactional
    public WorkflowResult submitArticle(
            UUID articleId,
            UUID revisionId,
            String actor,
            String key
    ) {
        ArticleRecord current = article(articleId);
        if (revisionId != null && !revisionId.equals(current.revisionId())) {
            throw new ApiException(ProblemCode.VERSION_CONFLICT, "revision is no longer the working revision");
        }
        return transitionArticle(
                current,
                PublicationAction.SUBMIT,
                new Version(current.version()),
                actor,
                key,
                null,
                null
        );
    }

    @Transactional
    public WorkflowResult approveArticle(
            UUID articleId,
            Version expected,
            String actor,
            String key
    ) {
        return transitionArticle(
                article(articleId),
                PublicationAction.APPROVE,
                expected,
                actor,
                key,
                null,
                null
        );
    }

    @Transactional
    public WorkflowResult withdrawArticle(
            UUID articleId,
            Version expected,
            String reason,
            String actor,
            String key
    ) {
        return transitionArticle(
                article(articleId),
                PublicationAction.WITHDRAW,
                expected,
                actor,
                key,
                null,
                bounded(reason, "reason", 500)
        );
    }

    @Transactional
    public WorkflowResult scheduleIssue(
            UUID issueId,
            Version expected,
            Instant publishAt,
            String timezone,
            String actor,
            String key
    ) {
        Objects.requireNonNull(publishAt, "publishAt");
        validateTimezone(timezone);
        return transitionIssue(
                issue(issueId),
                PublicationAction.SCHEDULE,
                expected,
                actor,
                key,
                publishAt,
                timezone
        );
    }

    @Transactional
    public WorkflowResult publishIssue(
            UUID issueId,
            Version expected,
            String actor,
            String key
    ) {
        return transitionIssue(
                issue(issueId),
                PublicationAction.PUBLISH,
                expected,
                actor,
                key,
                null,
                null
        );
    }

    @Transactional
    public MediaUploadIntent createUploadIntent(
            String filename,
            String contentType,
            long sizeBytes,
            String checksumSha256,
            String actor,
            String key
    ) {
        bounded(filename, "filename", 255);
        if (!MEDIA_TYPES.contains(contentType)) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "contentType is not an allowed image MIME");
        }
        if (sizeBytes < 1 || sizeBytes > MAX_MEDIA_BYTES) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "sizeBytes exceeds the media policy");
        }
        if (checksumSha256 == null || !checksumSha256.matches("[0-9a-fA-F]{64}")) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "checksumSha256 must be a SHA-256 hex digest");
        }
        if (uploadBaseUrl == null) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "media upload signer is not configured");
        }

        UUID assetId = UUID.randomUUID();
        UUID uploadId = UUID.randomUUID();
        URI uploadUrl = URI.create(
                uploadBaseUrl.toString().replaceAll("/$", "") + "/" + assetId + "/" + uploadId
        );
        Instant expiresAt = clock.instant().plusSeconds(300);
        if (jdbcTemplate == null) {
            memoryMedia.put(
                    assetId,
                    new MediaRecord(assetId, uploadId, checksumSha256, contentType, sizeBytes, "PENDING", 0)
            );
        } else {
            jdbcTemplate.update(
                    """
                    INSERT INTO media_asset (
                        id, private_storage_key, checksum_sha256, mime_type, byte_size, processing_state, version
                    ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0)
                    """,
                    assetId,
                    "media/originals/" + assetId + "/" + uploadId,
                    checksumSha256,
                    contentType,
                    sizeBytes
            );
        }
        return new MediaUploadIntent(assetId, uploadUrl, expiresAt, MAX_MEDIA_BYTES);
    }

    @Transactional
    public WorkflowResult completeUpload(
            UUID assetId,
            String checksumSha256,
            String contentType,
            String actor,
            String key
    ) {
        MediaRecord current = media(assetId);
        if (!current.checksumSha256().equalsIgnoreCase(checksumSha256)
                || !current.contentType().equals(contentType)) {
            throw new ApiException(ProblemCode.RIGHTS_OR_CONTENT_GATE, "checksum or MIME recheck failed");
        }
        if (!"PENDING".equals(current.state())) {
            throw new ApiException(ProblemCode.VERSION_CONFLICT, "media upload is no longer pending");
        }
        long nextVersion = current.version() + 1;
        if (jdbcTemplate == null) {
            memoryMedia.put(assetId, new MediaRecord(
                    assetId,
                    current.uploadId(),
                    current.checksumSha256(),
                    current.contentType(),
                    current.sizeBytes(),
                    "PROCESSING",
                    nextVersion
            ));
        } else {
            int updated = jdbcTemplate.update(
                    """
                    UPDATE media_asset
                    SET processing_state = 'PROCESSING', version = ?, updated_at = transaction_timestamp()
                    WHERE id = ? AND version = 0 AND processing_state = 'PENDING'
                    """,
                    nextVersion,
                    assetId
            );
            if (updated != 1) {
                throw new ApiException(ProblemCode.VERSION_CONFLICT, "media upload changed during completion");
            }
            jdbcTemplate.update(
                    """
                    INSERT INTO outbox_event (
                        event_type, aggregate_type, aggregate_id, idempotency_key, payload
                    ) VALUES (
                        'MEDIA_PROCESSING_REQUESTED', 'MEDIA', ?, ?, ?::jsonb
                    )
                    ON CONFLICT (idempotency_key) DO NOTHING
                    """,
                    assetId,
                    key,
                    "{\"assetId\":\"" + assetId + "\"}"
            );
        }
        return new WorkflowResult(UUID.randomUUID(), "ACCEPTED", nextVersion, List.of());
    }

    @Transactional
    public RevokeImpactReport revokeMedia(
            UUID assetId,
            Version expected,
            String reason,
            String actor,
            String key
    ) {
        bounded(reason, "reason", 500);
        MediaRecord current = media(assetId);
        requireVersion(expected, current.version());
        long nextVersion = expected.next().value();
        List<UUID> affected = new ArrayList<>();
        if (jdbcTemplate == null) {
            memoryMedia.put(assetId, new MediaRecord(
                    assetId,
                    current.uploadId(),
                    current.checksumSha256(),
                    current.contentType(),
                    current.sizeBytes(),
                    "REVOKED",
                    nextVersion
            ));
            memoryArticles.values().stream()
                    .filter(article -> article.contentJson().contains(assetId.toString()))
                    .map(ArticleRecord::articleId)
                    .forEach(affected::add);
        } else {
            int updated = jdbcTemplate.update(
                    """
                    UPDATE media_asset
                    SET processing_state = 'REVOKED', version = ?, updated_at = transaction_timestamp()
                    WHERE id = ? AND version = ?
                    """,
                    nextVersion,
                    assetId,
                    expected.value()
            );
            if (updated != 1) {
                throw new ApiException(ProblemCode.VERSION_CONFLICT, "media version changed");
            }
            jdbcTemplate.update(
                    "UPDATE rights_record SET status = 'REVOKED', updated_at = transaction_timestamp() WHERE asset_id = ?",
                    assetId
            );
            affected.addAll(jdbcTemplate.query(
                    """
                    SELECT DISTINCT article_id
                    FROM article_revision
                    WHERE content_document::text LIKE ?
                    """,
                    (resultSet, rowNumber) -> UUID.fromString(resultSet.getString("article_id")),
                    "%" + assetId + "%"
            ));
        }
        return new RevokeImpactReport(assetId, List.copyOf(affected), "REVOKED");
    }

    public List<IssueDraft> listIssues() {
        if (jdbcTemplate == null) {
            return memoryIssues.values().stream().map(EditorialWorkflowService::issueDraft).toList();
        }
        return jdbcTemplate.query(
                """
                SELECT id, version, title, slug, state
                FROM publication_issue
                ORDER BY issue_number DESC, id DESC
                LIMIT 100
                """,
                (resultSet, rowNumber) -> new IssueDraft(
                        UUID.fromString(resultSet.getString("id")),
                        resultSet.getLong("version"),
                        resultSet.getString("title"),
                        resultSet.getString("slug"),
                        resultSet.getString("state")
                )
        );
    }

    public List<ArticleDraft> listArticles() {
        if (jdbcTemplate == null) {
            return memoryArticles.values().stream().map(EditorialWorkflowService::articleDraft).toList();
        }
        return jdbcTemplate.query(
                """
                SELECT article.id, article.version, article.slug, article.state,
                       revision.title
                FROM article
                JOIN article_revision revision
                  ON revision.article_id = article.id
                 AND revision.revision_number = (
                     SELECT MAX(inner_revision.revision_number)
                     FROM article_revision inner_revision
                     WHERE inner_revision.article_id = article.id
                 )
                ORDER BY article.updated_at DESC, article.id DESC
                LIMIT 100
                """,
                (resultSet, rowNumber) -> new ArticleDraft(
                        UUID.fromString(resultSet.getString("id")),
                        resultSet.getLong("version"),
                        resultSet.getString("title"),
                        resultSet.getString("slug"),
                        resultSet.getString("state")
                )
        );
    }

    private WorkflowResult transitionArticle(
            ArticleRecord current,
            PublicationAction action,
            Version expected,
            String actor,
            String key,
            Instant publishAt,
            String withdrawalReason
    ) {
        WorkflowResult cached = cachedWorkflow(actor, action.name(), key);
        if (cached != null) {
            return cached;
        }
        requireVersion(expected, current.version());
        PublicationWorkflow.PublicationCommand command = new PublicationWorkflow.PublicationCommand(
                action,
                action == PublicationAction.SUBMIT
                        ? tw.basketball.magazine.shared.RoleCode.EDITOR
                        : tw.basketball.magazine.shared.RoleCode.PUBLISHER,
                expected,
                clock.instant(),
                publishAt,
                withdrawalReason
        );
        PublicationWorkflow.PublicationResult result = workflow.apply(
                new PublicationWorkflow.PublicationSnapshot(
                        current.articleId(),
                        PublicationState.valueOf(current.state()),
                        expected,
                        contentReady(current.contentJson()),
                        List.<PublicationReadinessService.MediaRequirement>of()
                ),
                command
        );
        WorkflowResult response = toWorkflowResult(result);
        if (result.status() == PublicationWorkflow.PublicationResult.Status.BLOCKED) {
            return rememberWorkflow(actor, action.name(), key, response);
        }

        ArticleRecord next = new ArticleRecord(
                current.articleId(),
                result.snapshot().version().value(),
                current.title(),
                current.slug(),
                result.snapshot().state().name(),
                current.revisionId(),
                current.revisionNumber(),
                current.contentJson(),
                result.snapshot().scheduledFor()
        );
        if (jdbcTemplate == null) {
            memoryArticles.put(current.articleId(), next);
        } else {
            updateJdbcArticle(current, next);
        }
        recordWorkflowEvidence(
                "ARTICLE",
                current.articleId(),
                current.revisionId(),
                action,
                actor,
                key,
                result,
                current.contentJson()
        );
        return rememberWorkflow(actor, action.name(), key, response);
    }

    private WorkflowResult transitionIssue(
            IssueRecord current,
            PublicationAction action,
            Version expected,
            String actor,
            String key,
            Instant publishAt,
            String timezone
    ) {
        WorkflowResult cached = cachedWorkflow(actor, action.name(), key);
        if (cached != null) {
            return cached;
        }
        requireVersion(expected, current.version());
        PublicationWorkflow.PublicationResult result = workflow.apply(
                new PublicationWorkflow.PublicationSnapshot(
                        current.issueId(),
                        PublicationState.valueOf(current.state()),
                        expected,
                        true,
                        List.<PublicationReadinessService.MediaRequirement>of()
                ),
                new PublicationWorkflow.PublicationCommand(
                        action,
                        tw.basketball.magazine.shared.RoleCode.PUBLISHER,
                        expected,
                        clock.instant(),
                        publishAt,
                        null
                )
        );
        WorkflowResult response = toWorkflowResult(result);
        if (result.status() == PublicationWorkflow.PublicationResult.Status.BLOCKED) {
            return rememberWorkflow(actor, action.name(), key, response);
        }

        IssueRecord next = new IssueRecord(
                current.issueId(),
                result.snapshot().version().value(),
                current.title(),
                current.slug(),
                current.summary(),
                result.snapshot().state().name(),
                result.snapshot().scheduledFor()
        );
        if (jdbcTemplate == null) {
            memoryIssues.put(current.issueId(), next);
        } else {
            updateJdbcIssue(current, next);
        }
        recordWorkflowEvidence(
                "ISSUE",
                current.issueId(),
                null,
                action,
                actor,
                key,
                result,
                "{}"
        );
        return rememberWorkflow(actor, action.name(), key, response);
    }

    private void updateJdbcArticle(ArticleRecord current, ArticleRecord next) {
        String publishedAt = next.state().equals("PUBLISHED") ? "transaction_timestamp()" : "NULL";
        String sql = """
                UPDATE article
                SET state = ?, version = ?, published_at = %s, published_revision_id = ?
                WHERE id = ? AND version = ?
                """.formatted(publishedAt);
        int updated = jdbcTemplate.update(
                sql,
                next.state(),
                next.version(),
                current.revisionId(),
                current.articleId(),
                current.version()
        );
        if (updated != 1) {
            throw versionConflict(current.articleId(), false, new Version(current.version()));
        }
        jdbcTemplate.update(
                "UPDATE article_revision SET state = ? WHERE id = ?",
                next.state(),
                current.revisionId()
        );
    }

    private void updateJdbcIssue(IssueRecord current, IssueRecord next) {
        String publishedAt = next.state().equals("PUBLISHED") ? "transaction_timestamp()" : "NULL";
        String sql = """
                UPDATE publication_issue
                SET state = ?, version = ?, published_at = %s, updated_at = transaction_timestamp()
                WHERE id = ? AND version = ?
                """.formatted(publishedAt);
        int updated = jdbcTemplate.update(
                sql,
                next.state(),
                next.version(),
                current.issueId(),
                current.version()
        );
        if (updated != 1) {
            throw versionConflict(current.issueId(), true, new Version(current.version()));
        }
    }

    private void recordWorkflowEvidence(
            String aggregateType,
            UUID aggregateId,
            UUID revisionId,
            PublicationAction action,
            String actor,
            String key,
            PublicationWorkflow.PublicationResult result,
            String contentJson
    ) {
        if (jdbcTemplate == null) {
            return;
        }
        String decision = switch (action) {
            case SUBMIT -> "SUBMITTED";
            case APPROVE -> "APPROVED";
            case WITHDRAW -> "WITHDRAWN";
            default -> null;
        };
        if (decision != null) {
            jdbcTemplate.update(
                    """
                    INSERT INTO publication_review (
                        aggregate_type, aggregate_id, revision_id, reviewer_subject,
                        reviewer_role, decision
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    aggregateType,
                    aggregateId,
                    revisionId,
                    actor,
                    action == PublicationAction.SUBMIT ? "EDITOR" : "PUBLISHER",
                    decision
            );
        }
        if (action == PublicationAction.PUBLISH) {
            jdbcTemplate.update(
                    """
                    INSERT INTO publication_snapshot (
                        aggregate_type, aggregate_id, revision_id, snapshot_version,
                        content_document, checksum_sha256, created_by
                    ) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
                    """,
                    aggregateType,
                    aggregateId,
                    revisionId,
                    result.snapshot().version().value(),
                    contentJson,
                    sha256(contentJson),
                    actor
            );
        }
        jdbcTemplate.update(
                """
                INSERT INTO publication_job (
                    aggregate_type, aggregate_id, operation, idempotency_key,
                    requested_by, scheduled_at, timezone, status, payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCEEDED', ?::jsonb)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                aggregateType,
                aggregateId,
                action.name(),
                key,
                actor,
                result.snapshot().scheduledFor() == null
                        ? null
                        : java.sql.Timestamp.from(result.snapshot().scheduledFor()),
                action == PublicationAction.SCHEDULE ? "Asia/Taipei" : null,
                "{}"
        );
    }

    private WorkflowResult cachedWorkflow(String actor, String operation, String key) {
        String boundedKey = bounded(key, "idempotencyKey", 512);
        if (jdbcTemplate == null) {
            Object cached = memoryIdempotency.get(actor + "|" + operation + "|" + boundedKey);
            return cached instanceof WorkflowResult result ? result : null;
        }
        List<String> responses = jdbcTemplate.query(
                """
                SELECT response::text
                FROM publication_idempotency
                WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?
                """,
                (resultSet, rowNumber) -> resultSet.getString(1),
                actor,
                operation,
                boundedKey
        );
        if (responses.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(responses.get(0), WorkflowResult.class);
        } catch (Exception exception) {
            throw new IllegalStateException("stored workflow response cannot be decoded", exception);
        }
    }

    private WorkflowResult rememberWorkflow(
            String actor,
            String operation,
            String key,
            WorkflowResult response
    ) {
        String boundedKey = bounded(key, "idempotencyKey", 512);
        if (jdbcTemplate == null) {
            memoryIdempotency.putIfAbsent(actor + "|" + operation + "|" + boundedKey, response);
            return response;
        }
        String responseJson = json(response);
        jdbcTemplate.update(
                """
                INSERT INTO publication_idempotency (
                    actor_subject, operation, idempotency_key, request_hash_sha256, response
                ) VALUES (?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (actor_subject, operation, idempotency_key) DO NOTHING
                """,
                actor,
                operation,
                boundedKey,
                sha256(operation + "|" + boundedKey),
                responseJson
        );
        return response;
    }

    private ArticleRecord article(UUID articleId) {
        if (jdbcTemplate == null) {
            return requireMemoryArticle(articleId);
        }
        return jdbcTemplate.queryForObject(
                """
                SELECT article.id, article.slug, article.state, article.version,
                       revision.id AS revision_id, revision.revision_number,
                       revision.title, revision.content_document::text AS content_json
                FROM article
                JOIN article_revision revision ON revision.article_id = article.id
                WHERE article.id = ?
                ORDER BY revision.revision_number DESC
                LIMIT 1
                """,
                (resultSet, rowNumber) -> new ArticleRecord(
                        UUID.fromString(resultSet.getString("id")),
                        resultSet.getLong("version"),
                        resultSet.getString("title"),
                        resultSet.getString("slug"),
                        resultSet.getString("state"),
                        UUID.fromString(resultSet.getString("revision_id")),
                        resultSet.getInt("revision_number"),
                        resultSet.getString("content_json"),
                        null
                ),
                articleId
        );
    }

    private IssueRecord issue(UUID issueId) {
        if (jdbcTemplate == null) {
            return requireMemoryIssue(issueId);
        }
        return jdbcIssue(issueId);
    }

    private IssueRecord jdbcIssue(UUID issueId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT id, title, slug, summary, state, version, published_at
                FROM publication_issue
                WHERE id = ?
                """,
                (resultSet, rowNumber) -> new IssueRecord(
                        UUID.fromString(resultSet.getString("id")),
                        resultSet.getLong("version"),
                        resultSet.getString("title"),
                        resultSet.getString("slug"),
                        resultSet.getString("summary"),
                        resultSet.getString("state"),
                        resultSet.getTimestamp("published_at") == null
                                ? null
                                : resultSet.getTimestamp("published_at").toInstant()
                ),
                issueId
        );
    }

    private MediaRecord media(UUID assetId) {
        if (jdbcTemplate == null) {
            MediaRecord current = memoryMedia.get(assetId);
            if (current == null) {
                throw new ApiException(ProblemCode.RESOURCE_NOT_FOUND, "media asset was not found");
            }
            return current;
        }
        return jdbcTemplate.queryForObject(
                """
                SELECT id, private_storage_key, checksum_sha256, mime_type,
                       byte_size, processing_state, version
                FROM media_asset
                WHERE id = ?
                """,
                (resultSet, rowNumber) -> new MediaRecord(
                        UUID.fromString(resultSet.getString("id")),
                        UUID.nameUUIDFromBytes(resultSet.getString("private_storage_key")
                                .getBytes(StandardCharsets.UTF_8)),
                        resultSet.getString("checksum_sha256"),
                        resultSet.getString("mime_type"),
                        resultSet.getLong("byte_size"),
                        resultSet.getString("processing_state"),
                        resultSet.getLong("version")
                ),
                assetId
        );
    }

    private IssueRecord requireMemoryIssue(UUID issueId) {
        IssueRecord current = memoryIssues.get(issueId);
        if (current == null) {
            throw new ApiException(ProblemCode.RESOURCE_NOT_FOUND, "issue was not found");
        }
        return current;
    }

    private ArticleRecord requireMemoryArticle(UUID articleId) {
        ArticleRecord current = memoryArticles.get(articleId);
        if (current == null) {
            throw new ApiException(ProblemCode.RESOURCE_NOT_FOUND, "article was not found");
        }
        return current;
    }

    private static IssueDraft issueDraft(IssueRecord issue) {
        return new IssueDraft(issue.issueId(), issue.version(), issue.title(), issue.slug(), issue.state());
    }

    private static ArticleDraft articleDraft(ArticleRecord article) {
        return new ArticleDraft(
                article.articleId(),
                article.version(),
                article.title(),
                article.slug(),
                article.state()
        );
    }

    private static WorkflowResult toWorkflowResult(PublicationWorkflow.PublicationResult result) {
        return new WorkflowResult(
                UUID.randomUUID(),
                result.status().name(),
                result.snapshot().version().value(),
                result.blockingCodes()
        );
    }

    private static boolean contentReady(String contentJson) {
        return contentJson != null && !contentJson.replace(" ", "").contains("\"blocks\":[]");
    }

    private static void requireVersion(Version expected, long current) {
        if (expected.value() != current) {
            throw new VersionConflictException(expected, new Version(current));
        }
    }

    private VersionConflictException versionConflict(UUID id, boolean issue, Version expected) {
        long current = issue ? issue(id).version() : article(id).version();
        return new VersionConflictException(expected, new Version(current));
    }

    private static String stringChange(Map<String, Object> changes, String name, String fallback) {
        Object value = changes.get(name);
        return value == null ? fallback : bounded(String.valueOf(value), name, name.equals("description") ? 1000 : 250);
    }

    private static void validateTitleAndSlug(String title, String slug) {
        bounded(title, "title", 250);
        bounded(slug, "slug", 128);
        if (!slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "slug must be a lowercase path segment");
        }
    }

    private static String bounded(String value, String name, int maxLength) {
        if (value == null
                || value.isBlank()
                || value.length() > maxLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, name + " is invalid or unbounded");
        }
        return value;
    }

    private static void validateTimezone(String timezone) {
        bounded(timezone, "timezone", 128);
        try {
            ZoneId.of(timezone);
        } catch (RuntimeException exception) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "timezone must be an IANA zone");
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new ApiException(ProblemCode.INVALID_REQUEST, "request JSON cannot be serialized");
        }
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                hex.append(String.format("%02x", item));
            }
            return hex.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record IssueDraft(UUID issueId, long version, String title, String slug, String state) {
    }

    public record ArticleDraft(UUID articleId, long version, String title, String slug, String state) {
    }

    public record WorkflowResult(
            UUID operationId,
            String status,
            long version,
            List<String> blockingCodes
    ) {
        public WorkflowResult {
            blockingCodes = List.copyOf(blockingCodes);
        }
    }

    public record MediaUploadIntent(
            UUID assetId,
            URI uploadUrl,
            Instant expiresAt,
            long maxSizeBytes
    ) {
    }

    public record RevokeImpactReport(
            UUID assetId,
            List<UUID> affectedArticles,
            String status
    ) {
        public RevokeImpactReport {
            affectedArticles = List.copyOf(affectedArticles);
        }
    }

    private record IssueRecord(
            UUID issueId,
            long version,
            String title,
            String slug,
            String summary,
            String state,
            Instant scheduledFor
    ) {
    }

    private record ArticleRecord(
            UUID articleId,
            long version,
            String title,
            String slug,
            String state,
            UUID revisionId,
            int revisionNumber,
            String contentJson,
            Instant scheduledFor
    ) {
    }

    private record MediaRecord(
            UUID assetId,
            UUID uploadId,
            String checksumSha256,
            String contentType,
            long sizeBytes,
            String state,
            long version
    ) {
    }

    public static final class ApiException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final ProblemCode code;

        public ApiException(ProblemCode code, String message) {
            super(message);
            this.code = Objects.requireNonNull(code, "code");
        }

        public ProblemCode code() {
            return code;
        }
    }
}
