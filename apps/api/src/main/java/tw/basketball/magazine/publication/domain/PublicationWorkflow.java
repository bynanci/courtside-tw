package tw.basketball.magazine.publication.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/**
 * Pure editorial state machine. Persistence, HTTP, and job dispatch belong to
 * later US3 slices; this class owns the transition and safety invariants.
 */
public final class PublicationWorkflow {
    private final PublicationReadinessService readinessService;

    public PublicationWorkflow(PublicationReadinessService readinessService) {
        this.readinessService = Objects.requireNonNull(readinessService, "readinessService");
    }

    public PublicationResult apply(PublicationSnapshot current, PublicationCommand command) {
        Objects.requireNonNull(current, "current");
        Objects.requireNonNull(command, "command");
        if (!current.version().equals(command.expectedVersion())) {
            throw new VersionConflictException(command.expectedVersion(), current.version());
        }
        if (!current.revisionId().equals(command.expectedRevisionId())) {
            throw new PublicationWorkflowException(
                    "REVISION_CONFLICT",
                    "command revision does not match the frozen publication revision"
            );
        }
        requireRole(command);

        return switch (command.action()) {
            case SUBMIT -> submit(current, command);
            case REQUEST_CHANGES -> requestChanges(current, command);
            case APPROVE -> approve(current, command);
            case SCHEDULE -> schedule(current, command);
            case PUBLISH -> publish(current, command);
            case WITHDRAW -> withdraw(current, command);
            case ARCHIVE -> archive(current);
        };
    }

    private PublicationResult submit(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.DRAFT);
        return advanceIfReady(
                current,
                PublicationState.IN_REVIEW,
                null,
                PublicationResult.Status.ACCEPTED,
                command.requestedAt()
        );
    }

    private PublicationResult requestChanges(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.IN_REVIEW);
        requireReason(
                command.reason(),
                "REVIEW_REASON_REQUIRED",
                "REVIEW_REASON_INVALID",
                2000
        );
        return advance(
                current,
                PublicationState.DRAFT,
                null,
                PublicationResult.Status.CHANGES_REQUESTED
        );
    }

    private PublicationResult approve(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.IN_REVIEW);
        return advanceIfReady(
                current,
                PublicationState.APPROVED,
                null,
                PublicationResult.Status.APPROVED,
                command.requestedAt()
        );
    }

    private PublicationResult schedule(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.APPROVED);
        Instant publishAt = command.publishAt();
        if (publishAt == null || !publishAt.isAfter(command.requestedAt())) {
            throw new PublicationWorkflowException(
                    "SCHEDULE_TIME_INVALID",
                    "scheduled publication must be in the future"
            );
        }
        return advanceIfReady(
                current,
                PublicationState.SCHEDULED,
                publishAt,
                PublicationResult.Status.SCHEDULED,
                command.requestedAt()
        );
    }

    private PublicationResult publish(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.APPROVED, PublicationState.SCHEDULED);
        if (current.state() == PublicationState.SCHEDULED
                && (current.scheduledFor() == null || current.scheduledFor().isAfter(command.requestedAt()))) {
            throw new PublicationWorkflowException(
                    "SCHEDULE_NOT_DUE",
                    "scheduled publication is not due"
            );
        }
        return advanceIfReady(
                current,
                PublicationState.PUBLISHED,
                null,
                PublicationResult.Status.PUBLISHED,
                command.requestedAt()
        );
    }

    private PublicationResult withdraw(PublicationSnapshot current, PublicationCommand command) {
        requireState(current, PublicationState.APPROVED, PublicationState.SCHEDULED, PublicationState.PUBLISHED);
        requireReason(
                command.reason(),
                "WITHDRAW_REASON_REQUIRED",
                "WITHDRAW_REASON_INVALID",
                500
        );
        return advance(current, PublicationState.WITHDRAWN, null, PublicationResult.Status.WITHDRAWN);
    }

    private PublicationResult archive(PublicationSnapshot current) {
        requireState(current, PublicationState.PUBLISHED, PublicationState.WITHDRAWN);
        return advance(current, PublicationState.ARCHIVED, null, PublicationResult.Status.ARCHIVED);
    }

    private PublicationResult advanceIfReady(
            PublicationSnapshot current,
            PublicationState nextState,
            Instant scheduledFor,
            PublicationResult.Status status,
            Instant checkedAt
    ) {
        PublicationReadinessService.ReadinessReport report = readinessService.evaluate(
                current.contentReady(),
                current.mediaRequirements(),
                checkedAt
        );
        if (!report.ready()) {
            return PublicationResult.blocked(current, report.blockers());
        }
        return advance(current, nextState, scheduledFor, status);
    }

    private PublicationResult advance(
            PublicationSnapshot current,
            PublicationState nextState,
            Instant scheduledFor,
            PublicationResult.Status status
    ) {
        PublicationSnapshot next = new PublicationSnapshot(
                current.id(),
                current.revisionId(),
                nextState,
                current.version().next(),
                current.contentReady(),
                current.mediaRequirements(),
                scheduledFor
        );
        return new PublicationResult(next, status, List.of());
    }

    private static void requireRole(PublicationCommand command) {
        RoleCode requiredRole = switch (command.action()) {
            case SUBMIT -> RoleCode.EDITOR;
            case REQUEST_CHANGES, APPROVE, SCHEDULE, PUBLISH, WITHDRAW, ARCHIVE -> RoleCode.PUBLISHER;
        };
        if (command.actorRole() != requiredRole) {
            throw new PublicationWorkflowException(
                    "ROLE_REQUIRED",
                    "operation requires role " + requiredRole.name()
            );
        }
    }

    private static void requireState(PublicationSnapshot current, PublicationState... allowedStates) {
        for (PublicationState allowedState : allowedStates) {
            if (current.state() == allowedState) {
                return;
            }
        }
        throw new PublicationWorkflowException(
                "INVALID_TRANSITION",
                "action is not allowed from state " + current.state().name()
        );
    }

    private static void requireReason(
            String reason,
            String missingCode,
            String invalidCode,
            int maxLength
    ) {
        if (reason == null || reason.isBlank()) {
            throw new PublicationWorkflowException(missingCode, "a bounded reason is required");
        }
        if (reason.length() > maxLength) {
            throw new PublicationWorkflowException(invalidCode, "reason exceeds the bounded limit");
        }
    }

    public record PublicationCommand(
            PublicationAction action,
            RoleCode actorRole,
            Version expectedVersion,
            UUID expectedRevisionId,
            Instant requestedAt,
            Instant publishAt,
            String reason
    ) {
        public PublicationCommand {
            Objects.requireNonNull(action, "action");
            Objects.requireNonNull(actorRole, "actorRole");
            Objects.requireNonNull(expectedVersion, "expectedVersion");
            Objects.requireNonNull(expectedRevisionId, "expectedRevisionId");
            Objects.requireNonNull(requestedAt, "requestedAt");
        }

        public static PublicationCommand of(
                PublicationAction action,
                RoleCode actorRole,
                Version expectedVersion,
                UUID expectedRevisionId,
                Instant requestedAt
        ) {
            return new PublicationCommand(
                    action,
                    actorRole,
                    expectedVersion,
                    expectedRevisionId,
                    requestedAt,
                    null,
                    null
            );
        }

        public static PublicationCommand withReason(
                PublicationAction action,
                RoleCode actorRole,
                Version expectedVersion,
                UUID expectedRevisionId,
                Instant requestedAt,
                String reason
        ) {
            return new PublicationCommand(
                    action,
                    actorRole,
                    expectedVersion,
                    expectedRevisionId,
                    requestedAt,
                    null,
                    reason
            );
        }

        public static PublicationCommand scheduled(
                RoleCode actorRole,
                Version expectedVersion,
                UUID expectedRevisionId,
                Instant requestedAt,
                Instant publishAt
        ) {
            return new PublicationCommand(
                    PublicationAction.SCHEDULE,
                    actorRole,
                    expectedVersion,
                    expectedRevisionId,
                    requestedAt,
                    publishAt,
                    null
            );
        }
    }

    public record PublicationSnapshot(
            UUID id,
            UUID revisionId,
            PublicationState state,
            Version version,
            boolean contentReady,
            Collection<PublicationReadinessService.MediaRequirement> mediaRequirements,
            Instant scheduledFor
    ) {
        public PublicationSnapshot {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(revisionId, "revisionId");
            Objects.requireNonNull(state, "state");
            Objects.requireNonNull(version, "version");
            Objects.requireNonNull(mediaRequirements, "mediaRequirements");
            mediaRequirements = List.copyOf(mediaRequirements);
        }

        public PublicationSnapshot(
                UUID id,
                UUID revisionId,
                PublicationState state,
                Version version,
                boolean contentReady,
                Collection<PublicationReadinessService.MediaRequirement> mediaRequirements
        ) {
            this(id, revisionId, state, version, contentReady, mediaRequirements, null);
        }
    }

    public record PublicationResult(
            PublicationSnapshot snapshot,
            Status status,
            List<PublicationReadinessService.ReadinessBlock> blockers
    ) {
        public PublicationResult {
            Objects.requireNonNull(snapshot, "snapshot");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(blockers, "blockers");
            blockers = List.copyOf(blockers);
            if (status == Status.BLOCKED && blockers.isEmpty()) {
                throw new IllegalArgumentException("blocked workflow results require blocking reasons");
            }
            if (status != Status.BLOCKED && !blockers.isEmpty()) {
                throw new IllegalArgumentException("successful workflow results cannot contain blocking reasons");
            }
        }

        public List<String> blockingCodes() {
            LinkedHashSet<String> codes = new LinkedHashSet<>();
            blockers.stream()
                    .map(PublicationReadinessService.ReadinessBlock::code)
                    .forEach(codes::add);
            return List.copyOf(codes);
        }

        public static PublicationResult blocked(
                PublicationSnapshot current,
                List<PublicationReadinessService.ReadinessBlock> blockers
        ) {
            return new PublicationResult(current, Status.BLOCKED, blockers);
        }

        public enum Status {
            ACCEPTED,
            CHANGES_REQUESTED,
            APPROVED,
            SCHEDULED,
            PUBLISHED,
            WITHDRAWN,
            ARCHIVED,
            BLOCKED
        }
    }
}
