package tw.basketball.magazine.outbox;

import java.time.Duration;

/** Best-effort operational signals for the outbox worker boundary. */
public interface OutboxMetrics {
    void recordRun(OutboxRunResult result, Duration duration);

    void recordRunFailure(Duration duration);

    void recordHandlerSuccess(String eventType, Duration duration);

    void recordHandlerFailure(String eventType, boolean deadLettered, Duration duration);

    void recordSchedulerSkipped();

    void recordSchedulerFailure();
}
