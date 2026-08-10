package tw.basketball.magazine.publication.worker;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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

    public PublicationJobHandler(
            EditorialArticleRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.workflow = new PublicationWorkflow(new PublicationReadinessService());
        this.contentDocumentValidator = new ContentDocumentValidator();
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
            transactionTemplate.executeWithoutResult(status -> process(command));
        } catch (RetryableJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, true);
        } catch (PermanentJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, false);
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("publication job execution failed", exception, true);
        }
    }

    private void process(Command command) {
        EditorialArticleRepository.PublicationJobRecord job = repository.findPublicationJob(
                command.requestedBy(),
                command.action(),
                command.idempotencyKey()
        ).orElseThrow(() -> new PermanentJobException("publication job is missing"));
        if (!command.articleId().equals(job.articleId())) {
            throw new PermanentJobException("publication job aggregate does not match the event");
        }
        if ("SUCCEEDED".equals(job.status()) || "BLOCKED".equals(job.status())) {
            return;
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
            publishScheduled(job, revisionId, now);
            return;
        }
        if ("PUBLISH".equals(command.action())) {
            publishOrReconcile(job, revisionId, now);
            return;
        }

        PublicationState expectedState = switch (command.action()) {
            case "WITHDRAW" -> PublicationState.WITHDRAWN;
            case "ARCHIVE" -> PublicationState.ARCHIVED;
            default -> null;
        };
        if (expectedState == null) {
            throw new PermanentJobException("unsupported publication job action: " + command.action());
        }
        EditorialArticleRepository.ArticleRecord article = requireArticle(command.articleId());
        if (!revisionId.equals(article.revisionId()) || article.state() != expectedState) {
            throw new PermanentJobException("publication job did not reach its expected state");
        }
        repository.markPublicationJobSucceeded(job.jobId(), now);
    }

    private void publishScheduled(
            EditorialArticleRepository.PublicationJobRecord job,
            UUID revisionId,
            Instant now
    ) {
        EditorialArticleRepository.ArticleRecord article = requireArticle(job.articleId());
        if (!revisionId.equals(article.revisionId())) {
            block(job, "REVISION_CHANGED", now);
            return;
        }
        if (article.state() == PublicationState.PUBLISHED
                && repository.hasPublicationSnapshot(article.articleId(), revisionId)) {
            repository.markPublicationJobSucceeded(job.jobId(), now);
            return;
        }
        if (article.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_SCHEDULED_STATE", now);
            return;
        }
        publishCurrent(job, article, revisionId, now);
    }

    private void publishOrReconcile(
            EditorialArticleRepository.PublicationJobRecord job,
            UUID revisionId,
            Instant now
    ) {
        EditorialArticleRepository.ArticleRecord article = requireArticle(job.articleId());
        if (!revisionId.equals(article.revisionId())) {
            block(job, "REVISION_CHANGED", now);
            return;
        }
        if (article.state() == PublicationState.PUBLISHED
                && repository.hasPublicationSnapshot(article.articleId(), revisionId)) {
            repository.markPublicationJobSucceeded(job.jobId(), now);
            return;
        }
        if (article.state() != PublicationState.APPROVED && article.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_PUBLISH_STATE", now);
            return;
        }
        if (article.state() == PublicationState.SCHEDULED
                && (article.scheduledFor() == null || now.isBefore(article.scheduledFor()))) {
            throw new RetryableJobException("scheduled publication is not due");
        }
        publishCurrent(job, article, revisionId, now);
    }

    private void publishCurrent(
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
            return;
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
        repository.appendPublicationSnapshot(
                article.articleId(),
                revisionId,
                repository.nextSnapshotVersion(article.articleId()),
                article.content(),
                checksum(article.content()),
                WORKER_ACTOR,
                requirements.stream()
                        .map(PublicationReadinessService.MediaRequirement::assetId)
                        .toList()
        );
        repository.markPublicationJobSucceeded(job.jobId(), now);
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
        return !article.title().isBlank()
                && article.content() != null
                && article.content().isObject()
                && contentDocumentValidator.validate(article.content().toString()).valid();
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
                    optionalUuid(payload, "revisionId")
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

    private record Command(
            UUID articleId,
            String action,
            String idempotencyKey,
            String requestedBy,
            UUID revisionId
    ) {
    }

    private static final class RetryableJobException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private RetryableJobException(String message) {
            super(message);
        }
    }

    private static final class PermanentJobException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private PermanentJobException(String message) {
            super(message);
        }
    }
}
