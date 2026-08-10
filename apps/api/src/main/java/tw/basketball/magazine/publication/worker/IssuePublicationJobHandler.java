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
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxEventHandler;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.persistence.EditorialIssueRepository;

/** Executes scheduled issue publication against an immutable issue snapshot. */
public final class IssuePublicationJobHandler implements OutboxEventHandler {
    public static final String EVENT_TYPE = "publication.issue.command";
    private static final String WORKER_ACTOR = "system:issue-publication-worker";

    private final EditorialIssueRepository repository;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public IssuePublicationJobHandler(
            EditorialIssueRepository repository,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
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
            transactionTemplate.executeWithoutResult(status -> process(command));
        } catch (RetryableJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, true);
        } catch (PermanentJobException exception) {
            throw new OutboxHandlerException(exception.getMessage(), exception, false);
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("issue publication job execution failed", exception, true);
        }
    }

    private void process(Command command) {
        EditorialIssueRepository.PublicationJobRecord job = repository.findPublicationJob(
                command.requestedBy(), command.action(), command.idempotencyKey()
        ).orElseThrow(() -> new PermanentJobException("issue publication job is missing"));
        if (!command.issueId().equals(job.issueId())) {
            throw new PermanentJobException("issue publication job aggregate does not match the event");
        }
        if ("SUCCEEDED".equals(job.status()) || "BLOCKED".equals(job.status())) {
            return;
        }
        if (!"SCHEDULE".equals(command.action())) {
            throw new PermanentJobException("unsupported issue publication action: " + command.action());
        }

        Instant now = clock.instant();
        if (job.scheduledAt() == null || now.isBefore(job.scheduledAt())) {
            throw new RetryableJobException("scheduled issue publication is not due");
        }
        EditorialIssueRepository.IssueRecord issue = repository.find(command.issueId())
                .orElseThrow(() -> new PermanentJobException("publication issue is missing"));
        if (issue.state() == PublicationState.PUBLISHED && repository.hasPublicationSnapshot(issue.issueId())) {
            repository.markPublicationJobSucceeded(job.jobId(), now);
            return;
        }
        if (issue.state() != PublicationState.SCHEDULED) {
            block(job, "INVALID_SCHEDULED_STATE", now);
            return;
        }
        if (!repository.readyForPublication(issue.issueId(), now)) {
            block(job, "ISSUE_NOT_READY", now);
            return;
        }
        if (!repository.transition(
                issue.issueId(), issue.version(), issue.state(), PublicationState.PUBLISHED, now
        )) {
            throw new RetryableJobException("publication issue changed during worker execution");
        }
        JsonNode snapshot = parseSnapshot(repository.publicationSnapshotDocument(issue.issueId()));
        repository.appendPublicationSnapshot(
                issue.issueId(),
                repository.nextSnapshotVersion(issue.issueId()),
                snapshot,
                checksum(snapshot),
                WORKER_ACTOR,
                issue.coverAssetId()
        );
        repository.markPublicationJobSucceeded(job.jobId(), now);
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
