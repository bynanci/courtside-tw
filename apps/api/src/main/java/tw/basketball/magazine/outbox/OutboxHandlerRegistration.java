package tw.basketball.magazine.outbox;

import java.util.Objects;

/** Explicit, bounded mapping from one durable event type to one handler. */
public record OutboxHandlerRegistration(
        String eventType,
        OutboxEventHandler handler
) {
    private static final int MAX_EVENT_TYPE_LENGTH = 160;

    public OutboxHandlerRegistration {
        eventType = requireEventType(eventType);
        handler = Objects.requireNonNull(handler, "handler");
    }

    static String displayEventType(String value) {
        if (!isSafeEventType(value) || value.length() > MAX_EVENT_TYPE_LENGTH) {
            return "unknown";
        }
        return value;
    }

    static boolean isSafeEventType(String value) {
        return value != null
                && !value.isBlank()
                && value.codePoints().allMatch(
                        codePoint -> Character.isLetterOrDigit(codePoint)
                                || codePoint == '.'
                                || codePoint == '_'
                                || codePoint == '-'
                );
    }

    private static String requireEventType(String value) {
        Objects.requireNonNull(value, "eventType");
        if (!isSafeEventType(value)
                || value.length() > MAX_EVENT_TYPE_LENGTH
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    "eventType must be bounded and free of control characters"
            );
        }
        return value;
    }
}
