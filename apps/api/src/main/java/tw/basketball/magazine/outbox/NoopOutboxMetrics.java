package tw.basketball.magazine.outbox;

import java.time.Duration;

/** No-op adapter used by direct library/test construction without Micrometer. */
public enum NoopOutboxMetrics implements OutboxMetrics {
    INSTANCE;

    @Override
    public void recordRun(OutboxRunResult result, Duration duration) {
        // Intentionally empty.
    }

    @Override
    public void recordRunFailure(Duration duration) {
        // Intentionally empty.
    }

    @Override
    public void recordHandlerSuccess(String eventType, Duration duration) {
        // Intentionally empty.
    }

    @Override
    public void recordHandlerFailure(
            String eventType,
            boolean deadLettered,
            Duration duration
    ) {
        // Intentionally empty.
    }

    @Override
    public void recordSchedulerSkipped() {
        // Intentionally empty.
    }

    @Override
    public void recordSchedulerFailure() {
        // Intentionally empty.
    }
}
