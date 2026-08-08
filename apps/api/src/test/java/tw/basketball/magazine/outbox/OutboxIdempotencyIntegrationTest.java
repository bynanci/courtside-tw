package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

final class OutboxIdempotencyIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void retriesAfterAHandlerCrashWithoutRepeatingTheIdempotentEffect() {
        Instant initialTime = Instant.parse("2026-08-08T12:00:00Z");
        UUID eventId = repository.enqueue(draft("idempotent-delivery", initialTime));
        MutableClock clock = new MutableClock(initialTime);
        Set<String> appliedIdempotencyKeys = new HashSet<>();
        AtomicInteger effectiveSideEffects = new AtomicInteger();
        AtomicBoolean failFirstAttempt = new AtomicBoolean(true);

        OutboxEventHandler handler = event -> {
            if (appliedIdempotencyKeys.add(event.idempotencyKey())) {
                effectiveSideEffects.incrementAndGet();
            }
            if (failFirstAttempt.getAndSet(false)) {
                throw new IllegalStateException("simulated crash after side effect");
            }
        };
        OutboxProperties properties = properties(
                "worker-idempotency",
                3,
                new DurationValues(
                        Duration.ofSeconds(30),
                        Duration.ofSeconds(1),
                        Duration.ofSeconds(4)
                )
        );
        OutboxWorker worker = new OutboxWorker(repository, properties, clock, handler);

        OutboxRunResult firstRun = worker.runOnce();
        assertEquals(1, firstRun.claimed());
        assertEquals(0, firstRun.completed());
        assertEquals(1, firstRun.retryScheduled());
        assertEquals(1, effectiveSideEffects.get());

        OutboxEvent failedEvent = repository.findById(eventId).orElseThrow();
        clock.set(failedEvent.availableAt());

        OutboxRunResult secondRun = worker.runOnce();
        assertEquals(1, secondRun.claimed());
        assertEquals(1, secondRun.completed());
        assertEquals(0, secondRun.retryScheduled());
        assertEquals(1, effectiveSideEffects.get());
        assertEquals(
                OutboxStatus.COMPLETED,
                repository.findById(eventId).orElseThrow().status()
        );
    }

    private static final class MutableClock extends Clock {
        private Instant currentInstant;

        private MutableClock(Instant initialInstant) {
            currentInstant = initialInstant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(currentInstant);
        }

        @Override
        public Instant instant() {
            return currentInstant;
        }

        private void set(Instant instant) {
            currentInstant = instant;
        }
    }
}
