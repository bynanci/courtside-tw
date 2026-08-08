package tw.basketball.magazine.outbox;

@FunctionalInterface
public interface OutboxEventHandler {
    /**
     * Handles an event at least once. Implementations must make the durable
     * side effect idempotent by {@link OutboxEvent#idempotencyKey()}.
     */
    void handle(OutboxEvent event) throws Exception;
}
