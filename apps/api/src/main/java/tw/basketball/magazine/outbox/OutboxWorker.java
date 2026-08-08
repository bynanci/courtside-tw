package tw.basketball.magazine.outbox;

import java.time.Clock;
import java.time.Duration;
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
    private final OutboxMetrics metrics;

    public OutboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            Clock clock,
            OutboxEventHandler handler
    ) {
        this(repository, properties, clock, handler, NoopOutboxMetrics.INSTANCE);
    }

    public OutboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            Clock clock,
            OutboxHandlerRegistry handler,
            OutboxMetrics metrics
    ) {
        this(repository, properties, clock, (OutboxEventHandler) handler, metrics);
    }

    public OutboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            Clock clock,
            OutboxEventHandler handler,
            OutboxMetrics metrics
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.handler = Objects.requireNonNull(handler, "handler");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    public OutboxRunResult runOnce() {
        Instant startedAt = clock.instant();
        OutboxRunResult result = null;
        try {
            result = runOnceStartedAt(startedAt);
            return result;
        } finally {
            if (result == null) {
                metrics.recordRunFailure(elapsedSince(startedAt));
            } else {
                metrics.recordRun(result, elapsedSince(startedAt));
            }
        }
    }

    private OutboxRunResult runOnceStartedAt(Instant startedAt) {
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
            Instant handlerStartedAt = clock.instant();
            try {
                handler.handle(claim.event());
            } catch (Exception failure) {
                boolean isDeadLetter = handleFailure(claim, failure);
                metrics.recordHandlerFailure(
                        claim.event().eventType(),
                        isDeadLetter,
                        elapsedSince(handlerStartedAt)
                );
                if (isDeadLetter) {
                    deadLettered++;
                } else {
                    retryScheduled++;
                }
                continue;
            }

            repository.complete(claim, clock.instant());
            metrics.recordHandlerSuccess(
                    claim.event().eventType(),
                    elapsedSince(handlerStartedAt)
            );
            completed++;
        }
        OutboxRunResult result = new OutboxRunResult(
                claims.size(),
                completed,
                retryScheduled,
                deadLettered
        );
        return result;
    }

    private boolean handleFailure(OutboxClaim claim, Exception failure) {
        if (failure instanceof OutboxHandlerException handlerFailure
                && !handlerFailure.retryable()) {
            repository.deadLetter(claim, failure, clock.instant());
            return true;
        }

        repository.fail(
                claim,
                failure,
                clock.instant(),
                properties.retryPolicy()
        );
        return claim.event().attemptCount() >= properties.maxAttempts();
    }

    private Duration elapsedSince(Instant startedAt) {
        Duration elapsed = Duration.between(startedAt, clock.instant());
        return elapsed.isNegative() ? Duration.ZERO : elapsed;
    }
}
