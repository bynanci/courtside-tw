package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

final class OutboxIdempotencyIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void retriesAfterAHandlerCrashWithoutRepeatingTheDurableEffect() {
        Instant initialTime = Instant.parse("2026-08-08T12:00:00Z");
        UUID eventId = repository.enqueue(draft("idempotent-delivery", initialTime));
        MutableClock clock = new MutableClock(initialTime);
        AtomicInteger effectiveSideEffects = new AtomicInteger();
        AtomicBoolean failFirstAttempt = new AtomicBoolean(true);

        OutboxEventHandler handler = event -> {
            int inserted = jdbcTemplate.update("""
                    INSERT INTO outbox_test_side_effect (idempotency_key)
                    VALUES (?)
                    ON CONFLICT (idempotency_key) DO NOTHING
                    """, event.idempotencyKey());
            if (inserted == 1) {
                effectiveSideEffects.incrementAndGet();
            }
            if (failFirstAttempt.getAndSet(false)) {
                throw new IllegalStateException("simulated crash after durable side effect");
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
        assertEquals(
                1,
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM outbox_test_side_effect WHERE idempotency_key = ?",
                        Integer.class,
                        "idempotent-delivery"
                )
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
