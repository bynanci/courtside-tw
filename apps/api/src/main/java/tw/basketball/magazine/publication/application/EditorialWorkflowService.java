package tw.basketball.magazine.publication.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.content.application.PublishedArticleSnapshotFactory;
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.publication.domain.PublicationAction;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.domain.PublicationWorkflow;
import tw.basketball.magazine.publication.domain.PublicationWorkflowException;
import tw.basketball.magazine.publication.persistence.EditorialArticleRepository;
import tw.basketball.magazine.outbox.OutboxEventDraft;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.worker.PublicationInvalidationKeys;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.UuidV7Generator;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/** Application boundary for the first Editorial API/persistence slice. */
public final class EditorialWorkflowService {
    private static final String REQUIRED_CHANNEL = RightsPolicy.PUBLIC_WEB_CHANNEL;
    private static final int MAX_IDEMPOTENCY_KEY_LENGTH = 512;
    private static final Pattern TAXONOMY_KEY = Pattern.compile(
            "[a-z0-9]+(?:-[a-z0-9]+)*"
    );

    private final EditorialArticleRepository repository;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final ApplicationClock applicationClock;
    private final PublicationWorkflow workflow;
    private final UuidV7Generator operationIdGenerator;
    private final OutboxRepository outboxRepository;
    private final ContentDocumentValidator contentDocumentValidator;
    private final ContentDocumentExtractor contentDocumentExtractor;
    private final PublishedArticleSnapshotFactory snapshotFactory;

    public EditorialWorkflowService(
            EditorialArticleRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock
    ) {
        this(
                repository,
                auditWriter,
                transactionTemplate,
                objectMapper,
                applicationClock,
                null
        );
    }

    public EditorialWorkflowService(
            EditorialArticleRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock,
            OutboxRepository outboxRepository
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.applicationClock = Objects.requireNonNull(applicationClock, "applicationClock");
        this.workflow = new PublicationWorkflow(new PublicationReadinessService());
        this.operationIdGenerator = UuidV7Generator.system();
        this.outboxRepository = outboxRepository;
        this.contentDocumentValidator = new ContentDocumentValidator();
        this.contentDocumentExtractor = new ContentDocumentExtractor();
        this.snapshotFactory = new PublishedArticleSnapshotFactory(objectMapper);
    }

    public OperationResult createDraft(
            ActorContext actor,
            String idempotencyKey,
            String requestBody
    ) {
        requireRole(actor, RoleCode.EDITOR);
        JsonNode request = object(requestBody);
        String title = requiredText(request, "title", "/title", 250);
        String slug = requiredText(request, "slug", "/slug", 128);
        validateSlug(slug);
        String dek = optionalText(request, "dek", "/dek", 1000);
        JsonNode content = optionalObject(request, "content", "/content");
        List<String> taxonomyKeys = optionalTaxonomy(request, "taxonomy", "/taxonomy");
        String hash = requestHash("CREATE_ARTICLE", null, null, request);

        return idempotent(
                actor,
                "CREATE_ARTICLE",
                idempotencyKey,
                hash,
                () -> {
                    EditorialArticleRepository.ArticleRecord created = repository.insertDraft(
                            title,
                            slug,
                            dek,
                            content
                    );
                    repository.replaceTaxonomy(created.revisionId(), taxonomyKeys);
                    created = requireArticle(created.articleId());
                    auditWriter.append(new AuditEventDraft(
                            actor,
                            "ARTICLE_CREATED",
                            "ARTICLE",
                            created.articleId(),
                            metadata(created, "DRAFT", null)
                    ));
                    return new OperationResult(
                            201,
                            json(articleJson(created)),
                            created.version()
                    );
                }
        );
    }

    public OperationResult patchDraft(
            ActorContext actor,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        requireRole(actor, RoleCode.EDITOR);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(requestBody);
        UUID articleId = requiredUuid(request, "articleId", "/articleId");
        JsonNode changes = request.get("changes");
        if (changes == null || !changes.isObject() || changes.size() == 0) {
            throw EditorialProblemException.invalid(
                    "/changes",
                    "CHANGES_REQUIRED",
                    "changes must be a non-empty object"
            );
        }
        List<String> taxonomyKeys = changes.has("taxonomy")
                ? taxonomy(changes.get("taxonomy"), "/changes/taxonomy")
                : null;
        String hash = requestHash("PATCH_ARTICLE", articleId, expectedVersion, request);

        return idempotent(
                actor,
                "PATCH_ARTICLE",
                idempotencyKey,
                hash,
                () -> {
                    EditorialArticleRepository.ArticleRecord current = requireArticle(articleId);
                    if (current.version() != expectedVersion.value()) {
                        throw new VersionConflictException(expectedVersion, new Version(current.version()));
                    }
                    if (current.state() != PublicationState.DRAFT
                            || current.revisionState() != PublicationState.DRAFT) {
                        throw new PublicationWorkflowException(
                                "INVALID_TRANSITION",
                                "only a draft revision can be patched"
                        );
                    }

                    String title = changedText(changes, "title", "/changes/title", current.title(), 250);
                    String slug = changedText(changes, "slug", "/changes/slug", current.slug(), 128);
                    validateSlug(slug);
                    String dek = changedText(changes, "dek", "/changes/dek", current.dek(), 1000);
                    JsonNode content = changedObject(
                            changes,
                            "content",
                            "/changes/content",
                            current.content()
                    );
                    if (!repository.updateDraft(
                            articleId,
                            current.revisionId(),
                            expectedVersion.value(),
                            current.revisionVersion(),
                            title,
                            slug,
                            dek,
                            content
                    )) {
                        EditorialArticleRepository.ArticleRecord latest = requireArticle(articleId);
                        throw new VersionConflictException(
                                expectedVersion,
                                new Version(latest.version())
                        );
                    }
                    if (taxonomyKeys != null) {
                        repository.replaceTaxonomy(current.revisionId(), taxonomyKeys);
                    }
                    EditorialArticleRepository.ArticleRecord updated = requireArticle(articleId);
                    auditWriter.append(new AuditEventDraft(
                            actor,
                            "ARTICLE_DRAFT_PATCHED",
                            "ARTICLE",
                            articleId,
                            metadata(updated, "DRAFT", null)
                    ));
                    return new OperationResult(200, json(articleJson(updated)), updated.version());
                }
        );
    }

    public OperationResult listEditorArticles(ActorContext actor, int limit) {
        requireRole(actor, RoleCode.EDITOR);
        return listArticles(limit);
    }

    public OperationResult getEditorArticle(ActorContext actor, UUID articleId) {
        requireRole(actor, RoleCode.EDITOR);
        EditorialArticleRepository.ArticleRecord article = requireArticle(articleId);
        return new OperationResult(200, json(articleJson(article)), article.version());
    }

    public OperationResult listPublisherArticles(ActorContext actor, int limit) {
        requireRole(actor, RoleCode.PUBLISHER);
        return listArticles(limit);
    }

    private OperationResult listArticles(int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> items = repository.list(boundedLimit).stream()
                .map(this::articleJson)
                .toList();
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("nextCursor", null);
        page.put("limit", boundedLimit);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("page", page);
        return new OperationResult(
                200,
                json(response),
                0
        );
    }

    public OperationResult getPublisherArticle(ActorContext actor, UUID articleId) {
        requireRole(actor, RoleCode.PUBLISHER);
        EditorialArticleRepository.ArticleRecord article = requireArticle(articleId);
        return new OperationResult(200, json(articleJson(article)), article.version());
    }

    public OperationResult createRevision(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        requireRole(actor, RoleCode.EDITOR);
        Objects.requireNonNull(articleId, "articleId");
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(requestBody);
        String title = requiredText(request, "title", "/title", 250);
        String dek = optionalText(request, "dek", "/dek", 1000);
        JsonNode content = optionalObject(request, "content", "/content");
        List<String> requestedTaxonomy = request.has("taxonomy")
                ? taxonomy(request.get("taxonomy"), "/taxonomy")
                : null;
        String hash = requestHash("CREATE_REVISION", articleId, expectedVersion, request);
        return idempotent(
                actor,
                "CREATE_REVISION",
                idempotencyKey,
                hash,
                () -> {
                    EditorialArticleRepository.ArticleRecord current = requireArticle(articleId);
                    List<String> taxonomyKeys = requestedTaxonomy == null
                            ? repository.taxonomyKeys(current.revisionId())
                            : requestedTaxonomy;
                    if (!repository.createRevision(
                            articleId,
                            expectedVersion.value(),
                            title,
                            dek,
                            content
                    )) {
                        EditorialArticleRepository.ArticleRecord latest = requireArticle(articleId);
                        throw new VersionConflictException(
                                expectedVersion,
                                new Version(latest.version())
                        );
                    }
                    EditorialArticleRepository.ArticleRecord revision = requireArticle(articleId);
                    repository.replaceTaxonomy(revision.revisionId(), taxonomyKeys);
                    revision = requireArticle(articleId);
                    auditWriter.append(new AuditEventDraft(
                            actor,
                            "ARTICLE_REVISION_CREATED",
                            "ARTICLE",
                            articleId,
                            metadata(revision, "DRAFT", null)
                    ));
                    return new OperationResult(201, json(articleJson(revision)), revision.version());
                }
        );
    }

    public OperationResult submit(
            ActorContext actor,
            UUID articleId,
            UUID revisionId,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.SUBMIT,
                articleId,
                null,
                revisionId,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult approve(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.APPROVE,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult requestChanges(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.REQUEST_CHANGES,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult schedule(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.SCHEDULE,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult publish(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.PUBLISH,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult withdraw(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.WITHDRAW,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    public OperationResult archive(
            ActorContext actor,
            UUID articleId,
            Version expectedVersion,
            String idempotencyKey,
            String requestBody
    ) {
        return applyWorkflow(
                actor,
                PublicationAction.ARCHIVE,
                articleId,
                expectedVersion,
                null,
                idempotencyKey,
                requestBody,
                null
        );
    }

    private OperationResult applyWorkflow(
            ActorContext actor,
            PublicationAction action,
            UUID articleId,
            Version expectedVersion,
            UUID requestedRevisionId,
            String idempotencyKey,
            String requestBody,
            ScheduleInput scheduleInput
    ) {
        RoleCode requiredRole = action == PublicationAction.SUBMIT
                ? RoleCode.EDITOR
                : RoleCode.PUBLISHER;
        requireRole(actor, requiredRole);
        JsonNode request = emptyBodyAllowed(action, requestBody)
                ? objectMapper.createObjectNode()
                : object(requestBody);
        ScheduleInput effectiveScheduleInput = action == PublicationAction.SCHEDULE
                ? parseSchedule(requestBody)
                : scheduleInput;
        UUID bodyRevisionId = action == PublicationAction.SUBMIT
                ? requiredUuid(request, "revisionId", "/revisionId")
                : null;
        String reason = switch (action) {
            case REQUEST_CHANGES, WITHDRAW -> requiredText(
                    request,
                    "reason",
                    "/reason",
                    action == PublicationAction.WITHDRAW ? 500 : 2000
            );
            default -> null;
        };
        UUID effectiveRevisionId = requestedRevisionId == null ? bodyRevisionId : requestedRevisionId;
        String hash = requestHash(action.name(), articleId, expectedVersion, request);
        return idempotent(
                actor,
                action.name(),
                idempotencyKey,
                hash,
                () -> {
                    EditorialArticleRepository.ArticleRecord current = requireArticle(articleId);
                    Version currentVersion = new Version(current.version());
                    Version commandVersion = expectedVersion == null ? currentVersion : expectedVersion;
                    if (!commandVersion.equals(currentVersion)) {
                        throw new VersionConflictException(commandVersion, currentVersion);
                    }
                    UUID commandRevisionId = effectiveRevisionId == null
                            ? current.revisionId()
                            : effectiveRevisionId;
                    PublicationAction commandAction = action;
                    Instant requestedAt = applicationClock.now();
                    List<PublicationReadinessService.MediaRequirement> mediaRequirements =
                            action == PublicationAction.PUBLISH
                                    ? repository.lockMediaRequirements(commandRevisionId)
                                    : repository.mediaRequirements(commandRevisionId);
                    PublicationWorkflow.PublicationSnapshot snapshot = new PublicationWorkflow.PublicationSnapshot(
                            current.articleId(),
                            current.revisionId(),
                            current.state(),
                            currentVersion,
                            contentReady(current),
                            mediaRequirements,
                            current.scheduledFor()
                    );
                    PublicationWorkflow.PublicationCommand command = command(
                            commandAction,
                            requiredRole,
                            commandVersion,
                            commandRevisionId,
                            requestedAt,
                            reason,
                            effectiveScheduleInput
                    );
                    PublicationWorkflow.PublicationResult result = workflow.apply(snapshot, command);
                    appendRightsEvidence(
                            actor,
                            current.articleId(),
                            current.revisionId(),
                            mediaRequirements,
                            requestedAt
                    );
                    UUID operationId = operationIdGenerator.next();
                    if (result.status() == PublicationWorkflow.PublicationResult.Status.BLOCKED) {
                        List<FieldError> errors = blockingErrors(result.blockers());
                        ProblemDetails problem = ProblemDetailsMapper.from(
                                ProblemCode.RIGHTS_OR_CONTENT_GATE,
                                "/api/v1/editor/articles/" + current.articleId() + ":submit",
                                actor.requestId(),
                                errors
                        );
                        auditWorkflow(actor, current, action, result.status().name(), result.blockingCodes());
                        return new OperationResult(422, json(problem), current.version());
                    }

                    PublicationState nextState = result.snapshot().state();
                    PublicationState nextRevisionState = nextRevisionState(action);
                    Instant publishedAt = action == PublicationAction.PUBLISH ? requestedAt : null;
                    if (!repository.transition(
                            current.articleId(),
                            current.revisionId(),
                            current.version(),
                            current.revisionVersion(),
                            current.state(),
                            nextState,
                            nextRevisionState,
                            publishedAt
                    )) {
                        EditorialArticleRepository.ArticleRecord latest = requireArticle(articleId);
                        throw new VersionConflictException(
                                commandVersion,
                                new Version(latest.version())
                        );
                    }
                    if (action == PublicationAction.PUBLISH) {
                        EditorialArticleRepository.ArticleRecord published = requireArticle(articleId);
                        JsonNode publicSnapshot = snapshotFactory.create(
                                published.articleId(),
                                published.revisionId(),
                                published.revisionNumber(),
                                published.slug(),
                                published.title(),
                                published.dek(),
                                published.content(),
                                repository.contributors(published.revisionId()),
                                repository.publicMedia(published.revisionId(), requestedAt),
                                requestedAt,
                                published.revisionUpdatedAt()
                        );
                        repository.appendPublicationSnapshot(
                                published.articleId(),
                                published.revisionId(),
                                repository.nextSnapshotVersion(published.articleId()),
                                publicSnapshot,
                                sha256(canonicalJson(publicSnapshot)),
                                actor.subject(),
                                mediaRequirements.stream().map(
                                        PublicationReadinessService.MediaRequirement::assetId
                                ).toList()
                        );
                    }
                    appendReview(actor, action, current, reason);
                    if (action == PublicationAction.SCHEDULE) {
                        repository.appendPublicationJob(
                                current.articleId(),
                                current.revisionId(),
                                action.name(),
                                idempotencyKey,
                                actor.subject(),
                                result.snapshot().scheduledFor(),
                                Objects.requireNonNull(effectiveScheduleInput, "scheduleInput").timezone()
                        );
                    }
                    if (action == PublicationAction.PUBLISH
                            || action == PublicationAction.WITHDRAW
                            || action == PublicationAction.ARCHIVE) {
                        repository.appendPublicationJob(
                                current.articleId(),
                                current.revisionId(),
                                action.name(),
                                idempotencyKey,
                                actor.subject(),
                                null,
                                null
                        );
                    }
                    enqueuePublicationCommand(
                            actor,
                            current,
                            action,
                            idempotencyKey,
                            result.status().name(),
                            action == PublicationAction.SCHEDULE
                                    ? Objects.requireNonNull(result.snapshot().scheduledFor(), "scheduledFor")
                                    : applicationClock.now()
                    );
                    EditorialArticleRepository.ArticleRecord updated = requireArticle(articleId);
                    auditWorkflow(actor, updated, action, result.status().name(), List.of());
                    String scheduledAt = result.snapshot().scheduledFor() == null
                            ? null
                            : result.snapshot().scheduledFor().toString();
                    Map<String, Object> response = workflowJson(
                            operationId,
                            result.status().name(),
                            updated.version(),
                            updated.revisionId(),
                            scheduledAt,
                            List.of()
                    );
                    return new OperationResult(202, json(response), updated.version());
                }
        );
    }

    private void enqueuePublicationCommand(
            ActorContext actor,
            EditorialArticleRepository.ArticleRecord article,
            PublicationAction action,
            String idempotencyKey,
            String status,
            Instant availableAt
    ) {
        if (outboxRepository == null
                || (action != PublicationAction.PUBLISH
                && action != PublicationAction.SCHEDULE
                && action != PublicationAction.WITHDRAW
                && action != PublicationAction.ARCHIVE)) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("articleId", article.articleId());
        payload.put("revisionId", article.revisionId());
        payload.put("action", action.name());
        payload.put("status", status);
        payload.put("idempotencyKey", idempotencyKey);
        payload.put("requestedBy", actor.subject());
        payload.put(
                "surrogateKeys",
                PublicationInvalidationKeys.forArticle(article.articleId(), article.revisionId())
        );
        outboxRepository.enqueue(new OutboxEventDraft(
                "publication.article.command",
                "ARTICLE",
                article.articleId(),
                "publication.command:" + article.articleId() + ":" + action.name()
                        + ":" + idempotencyKey,
                json(payload),
                availableAt
        ));
    }

    private PublicationWorkflow.PublicationCommand command(
            PublicationAction action,
            RoleCode role,
            Version version,
            UUID revisionId,
            Instant requestedAt,
            String reason,
            ScheduleInput scheduleInput
    ) {
        if (action == PublicationAction.SCHEDULE) {
            ScheduleInput schedule = Objects.requireNonNull(scheduleInput, "scheduleInput");
            return PublicationWorkflow.PublicationCommand.scheduled(
                    role,
                    version,
                    revisionId,
                    requestedAt,
                    schedule.publishAt()
            );
        }
        if (reason != null) {
            return PublicationWorkflow.PublicationCommand.withReason(
                    action,
                    role,
                    version,
                    revisionId,
                    requestedAt,
                    reason
            );
        }
        return PublicationWorkflow.PublicationCommand.of(
                action,
                role,
                version,
                revisionId,
                requestedAt
        );
    }

    private OperationResult idempotent(
            ActorContext actor,
            String operation,
            String idempotencyKey,
            String requestHash,
            Supplier<OperationResult> work
    ) {
        validateIdempotencyKey(idempotencyKey);
        OperationResult result = transactionTemplate.execute(status -> {
            repository.lockIdempotencyScope(actor.subject(), operation, idempotencyKey);
            Optional<EditorialArticleRepository.IdempotencyRecord> existing = repository.findIdempotency(
                    actor.subject(),
                    operation,
                    idempotencyKey
            );
            if (existing.isPresent()) {
                EditorialArticleRepository.IdempotencyRecord receipt = existing.get();
                if (!receipt.requestHashSha256().equals(requestHash)) {
                    throw new EditorialProblemException(
                            ProblemCode.VERSION_CONFLICT,
                            List.of(new FieldError(
                                    "/Idempotency-Key",
                                    "IDEMPOTENCY_KEY_REUSE",
                                    "the idempotency key is already bound to another request"
                            ))
                    );
                }
                String replayBody = canonicalJson(receipt.response());
                return new OperationResult(
                        replayStatus(operation, replayBody),
                        replayBody,
                        versionFrom(replayBody)
                );
            }
            OperationResult computed = work.get();
            repository.insertIdempotency(
                    actor.subject(),
                    operation,
                    idempotencyKey,
                    requestHash,
                    computed.body()
            );
            String persistedBody = repository.findIdempotency(
                    actor.subject(),
                    operation,
                    idempotencyKey
            ).orElseThrow(() -> new IllegalStateException("idempotency receipt disappeared"))
                    .response();
            return new OperationResult(
                    computed.statusCode(),
                    canonicalJson(persistedBody),
                    computed.version()
            );
        });
        return Objects.requireNonNull(result, "transaction returned no editorial result");
    }

    private void appendRightsEvidence(
            ActorContext actor,
            UUID articleId,
            UUID revisionId,
            List<PublicationReadinessService.MediaRequirement> requirements,
            Instant checkedAt
    ) {
        for (PublicationReadinessService.MediaRequirement requirement : requirements) {
            if (requirement.processingState() != MediaProcessingState.READY) {
                continue;
            }
            RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                    requirement.assetId(),
                    requirement.rightsRecords(),
                    REQUIRED_CHANNEL,
                    checkedAt
            );
            repository.appendRightsReference(
                    articleId,
                    revisionId,
                    requirement.assetId(),
                    REQUIRED_CHANNEL,
                    decision.allowed() ? "RIGHTS_ALLOWED" : decision.blockingCode(),
                    actor.subject(),
                    checkedAt,
                    decision.rightsRecordId(),
                    decision.rightsRecordVersion()
            );
        }
    }

    private void appendReview(
            ActorContext actor,
            PublicationAction action,
            EditorialArticleRepository.ArticleRecord article,
            String reason
    ) {
        String decision = switch (action) {
            case SUBMIT -> "SUBMITTED";
            case APPROVE -> "APPROVED";
            case REQUEST_CHANGES -> "REJECTED";
            case WITHDRAW -> "WITHDRAWN";
            default -> null;
        };
        if (decision != null) {
            repository.appendReview(
                    article.articleId(),
                    article.revisionId(),
                    actor.subject(),
                    actor.hasRole(RoleCode.EDITOR) ? RoleCode.EDITOR.name() : RoleCode.PUBLISHER.name(),
                    decision,
                    reason
            );
        }
    }

    private void auditWorkflow(
            ActorContext actor,
            EditorialArticleRepository.ArticleRecord article,
            PublicationAction action,
            String status,
            List<String> blockingCodes
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("action", action.name());
        metadata.put("status", status);
        metadata.put("revisionId", article.revisionId().toString());
        metadata.put("version", article.version());
        if (!blockingCodes.isEmpty()) {
            metadata.put("blockingCodes", blockingCodes);
        }
        auditWriter.append(new AuditEventDraft(
                actor,
                "ARTICLE_" + action.name(),
                "ARTICLE",
                article.articleId(),
                metadata
        ));
    }

    private Map<String, Object> metadata(
            EditorialArticleRepository.ArticleRecord article,
            String state,
            String scheduledAt
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("revisionId", article.revisionId().toString());
        metadata.put("version", article.version());
        metadata.put("state", state);
        if (scheduledAt != null) {
            metadata.put("scheduledAt", scheduledAt);
        }
        return metadata;
    }

    private Map<String, Object> articleJson(EditorialArticleRepository.ArticleRecord article) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("articleId", article.articleId().toString());
        response.put("revisionId", article.revisionId().toString());
        response.put("revisionNumber", article.revisionNumber());
        response.put("version", article.version());
        response.put("title", article.title());
        response.put("slug", article.slug());
        response.put("dek", article.dek());
        response.put("content", article.content());
        response.put("taxonomy", repository.taxonomyKeys(article.revisionId()));
        response.put("state", article.state().name());
        if (article.scheduledFor() != null) {
            response.put("scheduledAt", article.scheduledFor().toString());
        }
        response.put("readiness", readinessJson(article));
        return response;
    }

    private Map<String, Object> readinessJson(EditorialArticleRepository.ArticleRecord article) {
        PublicationReadinessService.ReadinessReport report = new PublicationReadinessService()
                .evaluate(
                        contentReady(article),
                        repository.mediaRequirements(article.revisionId()),
                        applicationClock.now()
                );
        List<Map<String, Object>> blockers = report.blockers().stream().map(blocker -> {
            Map<String, Object> value = new LinkedHashMap<>();
            if (blocker.assetId() != null) {
                value.put("assetId", blocker.assetId().toString());
            }
            value.put("code", blocker.code());
            if (blocker.rightsRecordId() != null) {
                value.put("rightsRecordId", blocker.rightsRecordId().toString());
            }
            if (blocker.rightsRecordVersion() != null) {
                value.put("rightsRecordVersion", blocker.rightsRecordVersion());
            }
            return value;
        }).toList();
        return Map.of("ready", report.ready(), "blockingCodes", report.blockingCodes(), "blockers", blockers);
    }

    private Map<String, Object> workflowJson(
            UUID operationId,
            String status,
            long version,
            UUID revisionId,
            String scheduledAt,
            List<String> blockingCodes
    ) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("operationId", operationId.toString());
        response.put("status", status);
        response.put("version", version);
        response.put("revisionId", revisionId.toString());
        if (scheduledAt != null) {
            response.put("scheduledAt", scheduledAt);
        }
        if (!blockingCodes.isEmpty()) {
            response.put("blockingCodes", blockingCodes);
        }
        return response;
    }

    private EditorialArticleRepository.ArticleRecord requireArticle(UUID articleId) {
        return repository.find(articleId).orElseThrow(() -> EditorialProblemException.notFound(
                "/articleId",
                "article was not found"
        ));
    }

    private static PublicationState nextRevisionState(PublicationAction action) {
        return switch (action) {
            case SUBMIT -> PublicationState.IN_REVIEW;
            case REQUEST_CHANGES -> PublicationState.DRAFT;
            case APPROVE -> PublicationState.APPROVED;
            case SCHEDULE -> null;
            case PUBLISH -> PublicationState.PUBLISHED;
            case WITHDRAW -> PublicationState.WITHDRAWN;
            case ARCHIVE -> PublicationState.ARCHIVED;
        };
    }

    private boolean contentReady(EditorialArticleRepository.ArticleRecord article) {
        if (article.title().isBlank()
                || article.content() == null
                || !article.content().isObject()
                || !contentDocumentValidator.validate(article.content().toString()).valid()) {
            return false;
        }
        try {
            return !contentDocumentExtractor.extract(article.content()).plainText().isBlank();
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static void requireRole(ActorContext actor, RoleCode role) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.authenticated()) {
            throw new EditorialProblemException(
                    ProblemCode.AUTHENTICATION_REQUIRED,
                    List.of()
            );
        }
        if (!actor.hasRole(role)) {
            throw EditorialProblemException.forbidden(
                    "/roles",
                    "operation requires role " + role.name()
            );
        }
    }

    private JsonNode object(String body) {
        if (body == null || body.isBlank()) {
            throw EditorialProblemException.invalid("/", "JSON_REQUIRED", "a JSON object is required");
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            if (node == null || !node.isObject()) {
                throw EditorialProblemException.invalid("/", "OBJECT_REQUIRED", "request body must be an object");
            }
            return node;
        } catch (EditorialProblemException exception) {
            throw exception;
        } catch (JacksonException exception) {
            throw EditorialProblemException.invalid("/", "MALFORMED_JSON", "request body is not valid JSON");
        }
    }

    private static String requiredText(JsonNode request, String name, String path, int maxLength) {
        JsonNode value = request.get(name);
        if (value == null || !value.isString()) {
            throw EditorialProblemException.invalid(path, "TEXT_REQUIRED", "a text value is required");
        }
        String text = value.asString();
        if (text.isBlank() || text.length() > maxLength || hasControl(text)) {
            throw EditorialProblemException.invalid(path, "TEXT_OUT_OF_RANGE", "text is outside the allowed bounds");
        }
        return text;
    }

    private static String optionalText(JsonNode request, String name, String path, int maxLength) {
        JsonNode value = request.get(name);
        if (value == null || value.isNull()) {
            return "";
        }
        if (!value.isString()) {
            throw EditorialProblemException.invalid(path, "TEXT_REQUIRED", "a text value is required");
        }
        String text = value.asString();
        if (text.length() > maxLength || hasControl(text)) {
            throw EditorialProblemException.invalid(path, "TEXT_OUT_OF_RANGE", "text is outside the allowed bounds");
        }
        return text;
    }

    private static String changedText(
            JsonNode changes,
            String name,
            String path,
            String current,
            int maxLength
    ) {
        return changes.has(name)
                ? requiredText(changes, name, path, maxLength)
                : current;
    }

    private JsonNode optionalObject(JsonNode request, String name, String path) {
        JsonNode value = request.get(name);
        if (value == null || value.isNull()) {
            return objectMapper.createObjectNode();
        }
        if (!value.isObject()) {
            throw EditorialProblemException.invalid(path, "OBJECT_REQUIRED", "content must be an object");
        }
        return value;
    }

    private JsonNode changedObject(JsonNode changes, String name, String path, JsonNode current) {
        if (!changes.has(name)) {
            return current;
        }
        JsonNode value = changes.get(name);
        if (value == null || !value.isObject()) {
            throw EditorialProblemException.invalid(path, "OBJECT_REQUIRED", "content must be an object");
        }
        return value;
    }

    private static List<String> optionalTaxonomy(
            JsonNode request,
            String name,
            String path
    ) {
        return request.has(name) ? taxonomy(request.get(name), path) : List.of();
    }

    private static List<String> taxonomy(JsonNode value, String path) {
        if (value == null || !value.isArray() || value.size() > 20) {
            throw EditorialProblemException.invalid(
                    path,
                    "TAXONOMY_INVALID",
                    "taxonomy must be an array containing at most 20 stable keys"
            );
        }
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (JsonNode item : value) {
            if (!item.isString()
                    || item.asString().length() > 256
                    || !TAXONOMY_KEY.matcher(item.asString()).matches()
                    || !keys.add(item.asString())) {
                throw EditorialProblemException.invalid(
                        path,
                        "TAXONOMY_INVALID",
                        "taxonomy keys must be distinct bounded lowercase slugs"
                );
            }
        }
        return List.copyOf(keys);
    }

    private static UUID requiredUuid(JsonNode request, String name, String path) {
        String value = requiredText(request, name, path, 80);
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid(path, "UUID_INVALID", "value must be a UUID");
        }
    }

    private static void validateSlug(String slug) {
        if (!slug.matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")) {
            throw EditorialProblemException.invalid(
                    "/slug",
                    "SLUG_INVALID",
                    "slug must contain lower-case letters, numbers, and hyphens"
            );
        }
    }

    private static boolean hasControl(String value) {
        return value.codePoints().anyMatch(Character::isISOControl);
    }

    private static void validateIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > MAX_IDEMPOTENCY_KEY_LENGTH || hasControl(value)) {
            throw EditorialProblemException.invalid(
                    "/Idempotency-Key",
                    "IDEMPOTENCY_KEY_REQUIRED",
                    "Idempotency-Key must be a bounded non-empty value"
            );
        }
    }

    private String requestHash(
            String operation,
            UUID articleId,
            Version expectedVersion,
            JsonNode request
    ) {
        String scope = operation + "|"
                + (articleId == null ? "" : articleId) + "|"
                + (expectedVersion == null ? "" : expectedVersion.value()) + "|"
                + canonicalJson(request);
        return sha256(scope);
    }

    private String canonicalJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize JSON", exception);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize JSON", exception);
        }
    }

    private String canonicalJson(String json) {
        try {
            return canonicalJson(objectMapper.readTree(json));
        } catch (Exception exception) {
            throw new IllegalStateException("stored idempotency response is not valid JSON", exception);
        }
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static int replayStatus(String operation, String body) {
        if ("CREATE_ARTICLE".equals(operation) || "CREATE_REVISION".equals(operation)) {
            return 201;
        }
        if ("PATCH_ARTICLE".equals(operation)) {
            return 200;
        }
        return body.contains("\"status\":\"BLOCKED\"")
                || body.contains("\"code\":\"RIGHTS_OR_CONTENT_GATE\"")
                ? 422
                : 202;
    }

    private static long versionFrom(String body) {
        int marker = body.indexOf("\"version\":");
        if (marker < 0) {
            return 0L;
        }
        int start = marker + "\"version\":".length();
        int end = start;
        while (end < body.length() && Character.isDigit(body.charAt(end))) {
            end++;
        }
        try {
            return Long.parseLong(body.substring(start, end));
        } catch (RuntimeException exception) {
            return 0L;
        }
    }

    private ScheduleInput parseSchedule(String body) {
        JsonNode request = object(body);
        String rawPublishAt = requiredText(request, "publishAt", "/publishAt", 80);
        String timezone = requiredText(request, "timezone", "/timezone", 128);
        ZoneId zone;
        try {
            zone = ZoneId.of(timezone);
        } catch (DateTimeException exception) {
            throw EditorialProblemException.invalid(
                    "/timezone",
                    "TIMEZONE_INVALID",
                    "timezone must be a valid IANA timezone"
            );
        }
        Instant publishAt;
        try {
            publishAt = parseInstant(rawPublishAt, zone);
        } catch (DateTimeException exception) {
            throw EditorialProblemException.invalid(
                    "/publishAt",
                    "SCHEDULE_TIME_INVALID",
                    "publishAt must be an ISO local or offset date-time"
            );
        }
        return new ScheduleInput(publishAt, timezone);
    }

    private static Instant parseInstant(String value, ZoneId zone) {
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeException ignored) {
            ZonedDateTime zoned = LocalDateTime.parse(value).atZone(zone);
            return zoned.toInstant();
        }
    }

    private static boolean emptyBodyAllowed(PublicationAction action, String body) {
        return (action == PublicationAction.APPROVE
                || action == PublicationAction.PUBLISH
                || action == PublicationAction.ARCHIVE)
                && (body == null || body.isBlank());
    }

    private static List<FieldError> blockingErrors(
            List<PublicationReadinessService.ReadinessBlock> blockers
    ) {
        List<FieldError> errors = new ArrayList<>(blockers.size());
        for (PublicationReadinessService.ReadinessBlock blocker : blockers) {
            String path = blocker.assetId() == null
                    ? "/content"
                    : "/media/" + blocker.assetId();
            errors.add(new FieldError(path, blocker.code(), "publication readiness gate is not satisfied"));
        }
        return errors;
    }

    public record OperationResult(int statusCode, String body, long version) {
        public OperationResult {
            if (statusCode < 200 || statusCode > 599) {
                throw new IllegalArgumentException("status code must be an HTTP status");
            }
            Objects.requireNonNull(body, "body");
            if (version < 0) {
                throw new IllegalArgumentException("version must be non-negative");
            }
        }
    }

    private record ScheduleInput(Instant publishAt, String timezone) {
        private ScheduleInput {
            Objects.requireNonNull(publishAt, "publishAt");
            Objects.requireNonNull(timezone, "timezone");
        }
    }
}
