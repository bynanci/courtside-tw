package tw.basketball.magazine.publication.worker;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxEventHandler;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.persistence.EditorialIssueRepository;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;

/** Publishes scheduled issues and retries durable publication cache invalidation. */
public final class IssuePublicationJobHandler implements OutboxEventHandler {
    public static final String EVENT_TYPE = "publication.issue.command";
    private static final String WORKER_ACTOR = "system:issue-publication-worker";

    private final EditorialIssueRepository repository;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final PublicationExternalInvalidator externalInvalidator;

    public IssuePublicationJobHandler(
            EditorialIssueRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this(repository, draft -> null, transactionTemplate, objectMapper, clock);
    }

    public IssuePublicationJobHandler(
            EditorialIssueRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this(repository, auditWriter, transactionTemplate, objectMapper, clock,
                PublicationExternalInvalidator.unavailable());
    }

    public IssuePublicationJobHandler(
            EditorialIssueRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock,
            PublicationExternalInvalidator externalInvalidator
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.externalInvalidator = Objects.requireNonNull(externalInvalidator, "externalInvalidator");
    }

    @Override
    public void handle(OutboxEvent event) throws OutboxHandlerException {
        if (!EVENT_TYPE.equals(event.eventType()) || !"ISSUE".equals(event.aggregateType())) {
            throw new OutboxHandlerException("issue publication handler received an unexpected event", false);
        }
        Command command;
        try {
            command = parseCommand(event);
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("issue publication payload is invalid", exception, false);
        }
        try {
            PendingInvalidation pending = transactionTemplate.execute(status -> process(command));
            if (pending == null) {
                return;
            }
            // The origin and immutable snapshot must be committed before an external cache can refill.
            externalInvalidator.invalidate(new PublicationExternalInvalidator.Request(
                    "issue-publication:" + pending.jobId(), PublicationInvalidationKeys.forIssue(pending.issueId())
            ));
            transactionTemplate.executeWithoutResult(status ->
                    repository.markPublicationJobSucceeded(pending.jobId(), clock.instant()));
        } catch (RetryableJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, true);
        } catch (PermanentJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, false);
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("issue publication job execution failed", exception, true);
        }
    }

    private PendingInvalidation process(Command command) {
        EditorialIssueRepository.PublicationJobRecord job = repository.findPublicationJob(
                command.requestedBy(), command.action(), command.idempotencyKey()
        ).orElseThrow(() -> new PermanentJobException("issue publication job is missing"));
        if (!command.issueId().equals(job.issueId())) {
            throw new PermanentJobException("issue publication job aggregate does not match the event");
        }
        if ("SUCCEEDED".equals(job.status()) || "BLOCKED".equals(job.status())) {
            return null;
        }
        Instant now = clock.instant();
        EditorialIssueRepository.IssueRecord issue = repository.findForUpdate(command.issueId())
                .orElseThrow(() -> new PermanentJobException("publication issue is missing"));
        if ("ARCHIVE".equals(command.action())) {
            if (issue.state() != PublicationState.ARCHIVED) {
                throw new PermanentJobException("issue archive job did not reach its expected state");
            }
            return new PendingInvalidation(job.jobId(), job.issueId());
        }
        if (!"SCHEDULE".equals(command.action()) && !"PUBLISH".equals(command.action())) {
            throw new PermanentJobException("unsupported issue publication action: " + command.action());
        }
        if (repository.hasPublicationSnapshot(issue.issueId())
                && (issue.state() == PublicationState.PUBLISHED
                || issue.state() == PublicationState.ARCHIVED
                || issue.state() == PublicationState.WITHDRAWN)) {
            // A delayed publish delivery may follow archive. Purge current state without replaying publication.
            return new PendingInvalidation(job.jobId(), job.issueId());
        }
        if ("PUBLISH".equals(command.action())) {
            throw new PermanentJobException("issue publish job has no committed publication snapshot");
        }
        if (job.scheduledAt() == null || now.isBefore(job.scheduledAt())) {
            throw new RetryableJobException("scheduled issue publication is not due");
        }
        if (issue.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_SCHEDULED_STATE", now);
            return null;
        }
        if (!repository.readyForPublication(issue.issueId(), now)) {
            block(job, "ISSUE_NOT_READY", now);
            return null;
        }
        if (!repository.transition(
                issue.issueId(), issue.version(), issue.state(), PublicationState.PUBLISHED, now
        )) {
            throw new RetryableJobException("publication issue changed during worker execution");
        }
        JsonNode snapshot = parseSnapshot(repository.publicationSnapshotDocument(issue.issueId()));
        long snapshotVersion = repository.nextSnapshotVersion(issue.issueId());
        repository.appendPublicationSnapshot(
                issue.issueId(),
                snapshotVersion,
                snapshot,
                checksum(snapshot),
                WORKER_ACTOR,
                issue.coverAssetId()
        );
        auditWriter.append(new AuditEventDraft(
                ActorContext.service(
                        WORKER_ACTOR,
                        RequestId.of("issue-publication-" + job.jobId())
                ),
                "ISSUE_PUBLISHED",
                "ISSUE",
                issue.issueId(),
                java.util.Map.of(
                        "source", "scheduled_worker",
                        "publicationJobId", job.jobId().toString(),
                        "snapshotVersion", snapshotVersion
                )
        ));
        return new PendingInvalidation(job.jobId(), job.issueId());
    }

    private void block(
            EditorialIssueRepository.PublicationJobRecord job,
            String reason,
            Instant now
    ) {
        repository.markPublicationJobBlocked(
                job.jobId(), "issue publication worker blocked the command: " + reason, now
        );
    }

    private JsonNode parseSnapshot(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (JacksonException exception) {
            throw new PermanentJobException("issue publication snapshot is invalid");
        }
    }

    private String checksum(JsonNode content) {
        try {
            return java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(content.toString().getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private Command parseCommand(OutboxEvent event) {
        try {
            JsonNode payload = objectMapper.readTree(event.payloadJson());
            UUID issueId = requiredUuid(payload, "issueId");
            if (!event.aggregateId().equals(issueId)) {
                throw new IllegalArgumentException("issue payload aggregate does not match the event");
            }
            return new Command(
                    issueId,
                    required(payload, "action"),
                    required(payload, "idempotencyKey"),
                    required(payload, "requestedBy")
            );
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new IllegalArgumentException("issue publication payload is not valid JSON", exception);
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

    private record PendingInvalidation(UUID jobId, UUID issueId) {
    }

    private record Command(UUID issueId, String action, String idempotencyKey, String requestedBy) {
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
