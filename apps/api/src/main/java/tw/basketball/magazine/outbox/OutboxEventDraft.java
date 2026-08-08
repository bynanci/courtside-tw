package tw.basketball.magazine.outbox;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Input boundary for durable outbox insertion. */
public record OutboxEventDraft(
        String eventType,
        String aggregateType,
        UUID aggregateId,
        String idempotencyKey,
        String payloadJson,
        Instant availableAt
) {
    private static final int MAX_PAYLOAD_LENGTH = 1_000_000;

    public OutboxEventDraft {
        eventType = bounded(eventType, "eventType", 160);
        aggregateType = bounded(aggregateType, "aggregateType", 128);
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        idempotencyKey = bounded(idempotencyKey, "idempotencyKey", 512);
        payloadJson = bounded(payloadJson, "payloadJson", MAX_PAYLOAD_LENGTH);
        if (!payloadJson.trim().startsWith("{") || !payloadJson.trim().endsWith("}")) {
            throw new IllegalArgumentException("payloadJson must be a JSON object");
        }
        availableAt = Objects.requireNonNull(availableAt, "availableAt");
    }

    private static String bounded(String value, String name, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()
                || value.length() > maxLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }
}
