package tw.basketball.magazine.outbox;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Immutable view of a durable outbox row. */
public record OutboxEvent(
        UUID id,
        String eventType,
        String aggregateType,
        UUID aggregateId,
        String idempotencyKey,
        String payloadJson,
        OutboxStatus status,
        Instant availableAt,
        int attemptCount,
        String leaseOwner,
        Instant leaseUntil,
        String lastError,
        Instant createdAt,
        Instant updatedAt,
        Instant processedAt,
        Instant deadLetteredAt
) {
    public OutboxEvent {
        id = Objects.requireNonNull(id, "id");
        eventType = Objects.requireNonNull(eventType, "eventType");
        aggregateType = Objects.requireNonNull(aggregateType, "aggregateType");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        idempotencyKey = Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        payloadJson = Objects.requireNonNull(payloadJson, "payloadJson");
        status = Objects.requireNonNull(status, "status");
        availableAt = Objects.requireNonNull(availableAt, "availableAt");
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        if (attemptCount < 0) {
            throw new IllegalArgumentException("attemptCount cannot be negative");
        }
    }
}
