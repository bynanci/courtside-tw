package tw.basketball.magazine.outbox;

public record OutboxRunResult(
        int claimed,
        int completed,
        int retryScheduled,
        int deadLettered
) {
    public OutboxRunResult {
        if (claimed < 0 || completed < 0 || retryScheduled < 0 || deadLettered < 0) {
            throw new IllegalArgumentException("worker result counters cannot be negative");
        }
    }
}
