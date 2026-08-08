package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Set;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

final class OutboxMetricsTest {
    @Test
    void recordsBoundedOperationalSignalsWithoutPayloadLabels() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerOutboxMetrics metrics = new MicrometerOutboxMetrics(
                registry,
                Set.of("publication.issue.published")
        );

        metrics.recordRun(
                new OutboxRunResult(3, 1, 1, 1),
                Duration.ofSeconds(2)
        );
        metrics.recordHandlerSuccess(
                "publication.issue.published",
                Duration.ofMillis(12)
        );
        metrics.recordHandlerFailure(
                "publication.issue.published",
                true,
                Duration.ofMillis(8)
        );
        metrics.recordHandlerFailure(
                "unregistered.event.one",
                true,
                Duration.ofMillis(8)
        );
        metrics.recordHandlerFailure(
                "unregistered.event.two",
                true,
                Duration.ofMillis(8)
        );
        metrics.recordSchedulerSkipped();
        metrics.recordSchedulerFailure();

        assertEquals(
                3.0,
                registry.get("courtside.outbox.events")
                        .tag("outcome", "claimed")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.outbox.events")
                        .tag("outcome", "completed")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.outbox.handler.events")
                        .tag("event_type", "publication.issue.published")
                        .tag("outcome", "dead_lettered")
                        .counter()
                        .count()
        );
        assertEquals(
                2.0,
                registry.get("courtside.outbox.handler.events")
                        .tag("event_type", "unknown")
                        .tag("outcome", "dead_lettered")
                        .counter()
                        .count()
        );
        assertEquals(
                0,
                registry.find("courtside.outbox.handler.events")
                        .tag("event_type", "unregistered.event.one")
                        .meters()
                        .size()
        );
        assertEquals(
                1.0,
                registry.get("courtside.outbox.scheduler.events")
                        .tag("outcome", "skipped")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.outbox.scheduler.events")
                        .tag("outcome", "failed")
                        .counter()
                        .count()
        );
        assertTrue(
                registry.get("courtside.outbox.last.run.epoch.seconds")
                        .gauge()
                        .value() > 0
        );
        assertEquals(0, registry.find("payload").meters().size());
        assertEquals(0, registry.find("idempotency").meters().size());
    }
}
