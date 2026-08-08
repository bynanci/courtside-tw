package tw.basketball.magazine.outbox;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * At-least-once worker loop. The handler owns the idempotency boundary for its
 * side effect; the repository owns durable state transitions and fencing.
 */
public final class OutboxWorker {
    private final OutboxRepository repository;
    private final OutboxProperties properties;
    private final Clock clock;
    private final OutboxEventHandler handler;

    public OutboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            Clock clock,
            OutboxEventHandler handler
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.handler = Objects.requireNonNull(handler, "handler");
    }

    public OutboxRunResult runOnce() {
        Instant claimTime = clock.instant();
        List<OutboxClaim> claims = repository.claim(
                properties.workerId(),
                properties.batchSize(),
                properties.leaseDuration(),
                claimTime,
                properties.maxAttempts()
        );
        int completed = 0;
        int retryScheduled = 0;
        int deadLettered = 0;
        for (OutboxClaim claim : claims) {
            try {
                handler.handle(claim.event());
                repository.complete(claim, clock.instant());
                completed++;
            } catch (Exception failure) {
                repository.fail(claim, failure, clock.instant(), properties.retryPolicy());
                if (claim.event().attemptCount() >= properties.maxAttempts()) {
                    deadLettered++;
                } else {
                    retryScheduled++;
                }
            }
        }
        return new OutboxRunResult(
                claims.size(),
                completed,
                retryScheduled,
                deadLettered
        );
    }
}
