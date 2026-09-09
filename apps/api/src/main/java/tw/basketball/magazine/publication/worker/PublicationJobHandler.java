package tw.basketball.magazine.publication.worker;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.application.PublishedArticleSnapshotFactory;
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxEventHandler;
import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.publication.domain.PublicationAction;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.domain.PublicationWorkflow;
import tw.basketball.magazine.publication.persistence.EditorialArticleRepository;
import tw.basketball.magazine.search.worker.SearchProjection;
import tw.basketball.magazine.search.worker.SearchProjectionException;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** Executes the durable side effect for a scheduled publication command. */
public final class PublicationJobHandler implements OutboxEventHandler {
    public static final String EVENT_TYPE = "publication.article.command";
    private static final String WORKER_ACTOR = "system:publication-worker";

    private final EditorialArticleRepository repository;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final PublicationWorkflow workflow;
    private final ContentDocumentValidator contentDocumentValidator;
    private final ContentDocumentExtractor contentDocumentExtractor;
    private final PublishedArticleSnapshotFactory snapshotFactory;
    private final PublicationExternalInvalidator externalInvalidator;
    private final SearchProjection searchProjection;

    public PublicationJobHandler(
            EditorialArticleRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this(
                repository,
                transactionTemplate,
                objectMapper,
                clock,
                PublicationExternalInvalidator.unavailable(),
                SearchProjection.noop()
        );
    }

    public PublicationJobHandler(
            EditorialArticleRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock,
            PublicationExternalInvalidator externalInvalidator
    ) {
        this(
                repository,
                transactionTemplate,
                objectMapper,
                clock,
                externalInvalidator,
                SearchProjection.noop()
        );
    }

    public PublicationJobHandler(
            EditorialArticleRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock,
            PublicationExternalInvalidator externalInvalidator,
            SearchProjection searchProjection
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.externalInvalidator = Objects.requireNonNull(externalInvalidator, "externalInvalidator");
        this.searchProjection = Objects.requireNonNull(searchProjection, "searchProjection");
        this.workflow = new PublicationWorkflow(new PublicationReadinessService());
        this.contentDocumentValidator = new ContentDocumentValidator();
        this.contentDocumentExtractor = new ContentDocumentExtractor();
        this.snapshotFactory = new PublishedArticleSnapshotFactory(objectMapper);
    }

    @Override
    public void handle(OutboxEvent event) throws OutboxHandlerException {
        if (!EVENT_TYPE.equals(event.eventType()) || !"ARTICLE".equals(event.aggregateType())) {
            throw new OutboxHandlerException("publication handler received an unexpected event", false);
        }
        Command command;
        try {
            command = parseCommand(event);
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("publication job payload is invalid", exception, false);
        }

        try {
            PendingInvalidation pending = transactionTemplate.execute(status -> process(command));
            if (pending == null) {
                return;
            }
            // Commit the origin and search projection before a purged cache can refill.
            // The stable job identity also separates equal caller keys on different articles.
            externalInvalidator.invalidate(new PublicationExternalInvalidator.Request(
                    "article-publication:" + pending.jobId(), pending.surrogateKeys()
            ));
            transactionTemplate.executeWithoutResult(status -> acknowledge(command, pending));
        } catch (RetryableJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, true);
        } catch (PermanentJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, false);
        } catch (SearchProjectionException exception) {
            throw new OutboxHandlerException(
                    exception.getMessage(),
                    exception,
                    exception.retryable()
            );
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("publication job execution failed", exception, true);
        }
    }

    private void acknowledge(Command command, PendingInvalidation pending) {
        // A concurrent delivery can acknowledge the same purge while this request is in flight.
        EditorialArticleRepository.PublicationJobRecord current = repository.findPublicationJob(
                command.requestedBy(), command.action(), command.idempotencyKey()
        ).orElseThrow(() -> new PermanentJobException("publication job disappeared before acknowledgement"));
        if (!pending.jobId().equals(current.jobId())) {
            throw new PermanentJobException("publication job changed before acknowledgement");
        }
        if (!"SUCCEEDED".equals(current.status()) && !"BLOCKED".equals(current.status())) {
            repository.markPublicationJobSucceeded(pending.jobId(), clock.instant());
        }
    }

    private PendingInvalidation process(Command command) {
        EditorialArticleRepository.PublicationJobRecord job = repository.findPublicationJob(
                command.requestedBy(),
                command.action(),
                command.idempotencyKey()
        ).orElseThrow(() -> new PermanentJobException("publication job is missing"));
        if (!command.articleId().equals(job.articleId())) {
            throw new PermanentJobException("publication job aggregate does not match the event");
        }
        if ("SUCCEEDED".equals(job.status()) || "BLOCKED".equals(job.status())) {
            return null;
        }
        UUID revisionId;
        try {
            revisionId = requiredUuid(job.payload(), "revisionId");
        } catch (RuntimeException exception) {
            throw new PermanentJobException("publication job revision payload is invalid");
        }
        if (command.revisionId() != null && !command.revisionId().equals(revisionId)) {
            throw new PermanentJobException("publication job revision does not match the event");
        }

        Instant now = clock.instant();
        if ("SCHEDULE".equals(command.action())) {
            if (job.scheduledAt() == null || now.isBefore(job.scheduledAt())) {
                throw new RetryableJobException("scheduled publication is not due");
            }
            return publishScheduled(job, revisionId, now) ? pending(job, revisionId) : null;
        }
        if ("PUBLISH".equals(command.action())) {
            return publishOrReconcile(job, revisionId, now) ? pending(job, revisionId) : null;
        }

        if (!"WITHDRAW".equals(command.action()) && !"ARCHIVE".equals(command.action())) {
            throw new PermanentJobException("unsupported publication job action: " + command.action());
        }
        if (command.surrogateKeys().isEmpty()) {
            throw new PermanentJobException("publication invalidation keys are missing");
        }
        EditorialArticleRepository.ArticleRecord article = requireArticle(command.articleId());
        if (revisionId.equals(article.revisionId())
                && (article.state() == PublicationState.WITHDRAWN || article.state() == PublicationState.ARCHIVED)
                && repository.hasPublicationSnapshot(command.articleId(), revisionId)) {
            reconcileCommittedSearch(() -> searchProjection.withdraw(command.articleId(), revisionId, now));
        }
        // Removal jobs and their outbox commands commit with the origin transition.
        // A newer revision or subsequent archive cannot cancel that durable purge.
        // Search reads independently require the currently published revision; never
        // withdraw a newer projection or demand a snapshot for never-published work.
        return new PendingInvalidation(job.jobId(), command.surrogateKeys());
    }

    private PendingInvalidation pending(EditorialArticleRepository.PublicationJobRecord job, UUID revisionId) {
        return new PendingInvalidation(job.jobId(), PublicationInvalidationKeys.forArticle(job.articleId(), revisionId));
    }

    private boolean publishScheduled(
            EditorialArticleRepository.PublicationJobRecord job,
            UUID revisionId,
            Instant now
    ) {
        EditorialArticleRepository.ArticleRecord article = requireArticle(job.articleId());
        if (reconcileCommittedPublication(article, revisionId, now)) {
            return true;
        }
        if (!revisionId.equals(article.revisionId())) {
            block(job, "REVISION_CHANGED", now);
            return false;
        }
        if (article.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_SCHEDULED_STATE", now);
            return false;
        }
        return publishCurrent(job, article, revisionId, now);
    }

    private boolean publishOrReconcile(
            EditorialArticleRepository.PublicationJobRecord job,
            UUID revisionId,
            Instant now
    ) {
        EditorialArticleRepository.ArticleRecord article = requireArticle(job.articleId());
        if (reconcileCommittedPublication(article, revisionId, now)) {
            return true;
        }
        if (!revisionId.equals(article.revisionId())) {
            block(job, "REVISION_CHANGED", now);
            return false;
        }
        if (article.state() != PublicationState.APPROVED && article.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_PUBLISH_STATE", now);
            return false;
        }
        if (article.state() == PublicationState.SCHEDULED
                && (article.scheduledFor() == null || now.isBefore(article.scheduledFor()))) {
            throw new RetryableJobException("scheduled publication is not due");
        }
        return publishCurrent(job, article, revisionId, now);
    }

    private boolean reconcileCommittedPublication(
            EditorialArticleRepository.ArticleRecord article, UUID revisionId, Instant now
    ) {
        if (!repository.hasPublicationSnapshot(article.articleId(), revisionId)) {
            return false;
        }
        if (revisionId.equals(article.revisionId()) && article.state() == PublicationState.PUBLISHED) {
            reconcileCommittedSearch(() -> searchProjection.project(article.articleId(), revisionId, now));
        }
        // The immutable snapshot proves an outstanding purge obligation for this
        // exact job/revision. A newer draft/publication or withdrawal cannot cancel
        // it, and this older delivery must never project or publish the newer state.
        return true;
    }

    private void reconcileCommittedSearch(Runnable reconciliation) {
        try {
            reconciliation.run();
        } catch (SearchProjectionException exception) {
            // The live source can change after the worker's read. Retry the already
            // committed job so the next delivery can skip obsolete projection work
            // and still purge; only fresh publication keeps permanent gate failures.
            throw new RetryableJobException("committed publication search reconciliation must retry", exception);
        }
    }

    private boolean publishCurrent(
            EditorialArticleRepository.PublicationJobRecord job,
            EditorialArticleRepository.ArticleRecord article,
            UUID revisionId,
            Instant now
    ) {
        List<PublicationReadinessService.MediaRequirement> requirements =
                repository.lockMediaRequirements(revisionId);
        PublicationWorkflow.PublicationSnapshot current = new PublicationWorkflow.PublicationSnapshot(
                article.articleId(),
                revisionId,
                article.state(),
                new Version(article.version()),
                contentReady(article),
                requirements,
                article.scheduledFor()
        );
        PublicationWorkflow.PublicationResult result = workflow.apply(
                current,
                PublicationWorkflow.PublicationCommand.of(
                        PublicationAction.PUBLISH,
                        RoleCode.PUBLISHER,
                        new Version(article.version()),
                        revisionId,
                        now
                )
        );
        appendRightsEvidence(article.articleId(), revisionId, requirements, now);
        if (result.status() == PublicationWorkflow.PublicationResult.Status.BLOCKED) {
            block(job, String.join(",", result.blockingCodes()), now);
            return false;
        }
        if (!repository.transition(
                article.articleId(),
                revisionId,
                article.version(),
                article.revisionVersion(),
                article.state(),
                PublicationState.PUBLISHED,
                PublicationState.PUBLISHED,
                now
        )) {
            throw new RetryableJobException("publication article changed during worker execution");
        }
        EditorialArticleRepository.ArticleRecord published = requireArticle(article.articleId());
        JsonNode publicSnapshot = snapshotFactory.create(
                published.articleId(),
                published.revisionId(),
                published.revisionNumber(),
                published.slug(),
                published.title(),
                published.dek(),
                published.content(),
                repository.contributors(published.revisionId()),
                repository.publicMedia(published.revisionId(), now),
                now,
                published.revisionUpdatedAt()
        );
        repository.appendPublicationSnapshot(
                published.articleId(),
                revisionId,
                repository.nextSnapshotVersion(published.articleId()),
                publicSnapshot,
                checksum(publicSnapshot),
                WORKER_ACTOR,
                requirements.stream()
                        .map(PublicationReadinessService.MediaRequirement::assetId)
                        .toList()
        );
        searchProjection.project(published.articleId(), revisionId, now);
        return true;
    }

    private void appendRightsEvidence(
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
                    RightsPolicy.PUBLIC_WEB_CHANNEL,
                    checkedAt
            );
            repository.appendRightsReference(
                    articleId,
                    revisionId,
                    requirement.assetId(),
                    RightsPolicy.PUBLIC_WEB_CHANNEL,
                    decision.allowed() ? "RIGHTS_ALLOWED" : decision.blockingCode(),
                    WORKER_ACTOR,
                    checkedAt,
                    decision.rightsRecordId(),
                    decision.rightsRecordVersion()
            );
        }
    }

    private void block(
            EditorialArticleRepository.PublicationJobRecord job,
            String reason,
            Instant now
    ) {
        repository.markPublicationJobBlocked(
                job.jobId(),
                "publication worker blocked the command: " + reason,
                now
        );
    }

    private EditorialArticleRepository.ArticleRecord requireArticle(UUID articleId) {
        return repository.find(articleId)
                .orElseThrow(() -> new PermanentJobException("publication article is missing"));
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

    private String checksum(JsonNode content) {
        try {
            return java.util.HexFormat.of().formatHex(
                    java.security.MessageDigest.getInstance("SHA-256")
                            .digest(objectMapper.writeValueAsString(content).getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception exception) {
            throw new IllegalStateException("unable to checksum publication snapshot", exception);
        }
    }

    private Command parseCommand(OutboxEvent event) {
        try {
            JsonNode payload = objectMapper.readTree(event.payloadJson());
            UUID payloadArticleId = requiredUuid(payload, "articleId");
            if (!event.aggregateId().equals(payloadArticleId)) {
                throw new IllegalArgumentException("publication payload aggregate does not match the event");
            }
            return new Command(
                    event.aggregateId(),
                    required(payload, "action"),
                    required(payload, "idempotencyKey"),
                    required(payload, "requestedBy"),
                    optionalUuid(payload, "revisionId"),
                    optionalStringList(payload, "surrogateKeys")
            );
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new IllegalArgumentException("publication payload is not valid JSON", exception);
        }
    }

    private static String required(JsonNode payload, String field) {
        if (payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("publication payload must be an object");
        }
        JsonNode value = payload.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.asString();
    }

    private static UUID requiredUuid(JsonNode payload, String field) {
        return UUID.fromString(required(payload, field));
    }

    private static UUID optionalUuid(JsonNode payload, String field) {
        if (payload == null || !payload.isObject() || payload.get(field) == null) {
            return null;
        }
        return requiredUuid(payload, field);
    }

    private static List<String> optionalStringList(JsonNode payload, String field) {
        if (payload == null || !payload.isObject() || payload.get(field) == null) {
            return List.of();
        }
        JsonNode values = payload.get(field);
        if (!values.isArray()) {
            throw new IllegalArgumentException(field + " must be an array");
        }
        List<String> result = new ArrayList<>();
        values.forEach(value -> {
            if (!value.isString() || value.asString().isBlank()) {
                throw new IllegalArgumentException(field + " must contain non-blank strings");
            }
            result.add(value.asString());
        });
        return List.copyOf(result);
    }

    private record PendingInvalidation(UUID jobId, List<String> surrogateKeys) {
    }

    private record Command(
            UUID articleId,
            String action,
            String idempotencyKey,
            String requestedBy,
            UUID revisionId,
            List<String> surrogateKeys
    ) {
    }

    private static final class RetryableJobException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private RetryableJobException(String message) {
            super(message);
        }

        private RetryableJobException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private static final class PermanentJobException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private PermanentJobException(String message) {
            super(message);
        }
    }
}
