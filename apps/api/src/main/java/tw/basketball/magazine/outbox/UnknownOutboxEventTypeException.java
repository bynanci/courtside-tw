package tw.basketball.magazine.outbox;

/** Permanent failure for an event type with no explicit registered handler. */
public final class UnknownOutboxEventTypeException extends OutboxHandlerException {
    private static final long serialVersionUID = 1L;

    public UnknownOutboxEventTypeException(String eventType) {
        super(
                "no handler registered for outbox event type: "
                        + OutboxHandlerRegistration.displayEventType(eventType),
                false
        );
    }
}
