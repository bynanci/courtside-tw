package tw.basketball.magazine.outbox;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/** Micrometer adapter with fixed outcome labels and bounded event-type labels. */
public final class MicrometerOutboxMetrics implements OutboxMetrics {
    private static final String EVENTS = "courtside.outbox.events";
    private static final String HANDLER_EVENTS = "courtside.outbox.handler.events";
    private static final String RUN_DURATION = "courtside.outbox.run.duration";
    private static final String HANDLER_DURATION = "courtside.outbox.handler.duration";
    private static final String SCHEDULER_EVENTS = "courtside.outbox.scheduler.events";
    private static final String LAST_RUN = "courtside.outbox.last.run.epoch.seconds";
    private static final int MAX_METRIC_EVENT_TYPE_LENGTH = 64;
    private static final int MAX_METRIC_EVENT_TYPES = 100;

    private final MeterRegistry registry;
    private final Set<String> allowedEventTypes;
    private final AtomicLong lastRunEpochSeconds = new AtomicLong();

    public MicrometerOutboxMetrics(MeterRegistry registry) {
        this(registry, Set.of());
    }

    public MicrometerOutboxMetrics(
            MeterRegistry registry,
            Set<String> allowedEventTypes
    ) {
        this.registry = Objects.requireNonNull(registry, "registry");
        this.allowedEventTypes = boundedEventTypes(allowedEventTypes);
        registry.gauge(LAST_RUN, lastRunEpochSeconds);
    }

    @Override
    public void recordRun(OutboxRunResult result, Duration duration) {
        Objects.requireNonNull(result, "result");
        recordDuration(RUN_DURATION, duration);
        increment(EVENTS, "outcome", "claimed", result.claimed());
        increment(EVENTS, "outcome", "completed", result.completed());
        increment(EVENTS, "outcome", "retry_scheduled", result.retryScheduled());
        increment(EVENTS, "outcome", "dead_lettered", result.deadLettered());
        lastRunEpochSeconds.set(Instant.now().getEpochSecond());
    }

    @Override
    public void recordRunFailure(Duration duration) {
        recordDuration(RUN_DURATION, duration);
        increment(EVENTS, "outcome", "failed", 1);
    }

    @Override
    public void recordHandlerSuccess(String eventType, Duration duration) {
        recordHandlerEvent(eventType, "completed");
        recordDuration(HANDLER_DURATION, duration, "event_type", metricEventType(eventType));
    }

    @Override
    public void recordHandlerFailure(
            String eventType,
            boolean deadLettered,
            Duration duration
    ) {
        String outcome = deadLettered ? "dead_lettered" : "retry_scheduled";
        recordHandlerEvent(eventType, outcome);
        recordDuration(HANDLER_DURATION, duration, "event_type", metricEventType(eventType));
    }

    @Override
    public void recordSchedulerSkipped() {
        increment(SCHEDULER_EVENTS, "outcome", "skipped", 1);
    }

    @Override
    public void recordSchedulerFailure() {
        increment(SCHEDULER_EVENTS, "outcome", "failed", 1);
    }

    private void recordHandlerEvent(String eventType, String outcome) {
        increment(
                HANDLER_EVENTS,
                "event_type",
                metricEventType(eventType),
                "outcome",
                outcome,
                1
        );
    }

    private void increment(String name, String firstKey, String firstValue, double amount) {
        if (amount <= 0) {
            return;
        }
        Counter.builder(name)
                .tag(firstKey, firstValue)
                .register(registry)
                .increment(amount);
    }

    private void increment(
            String name,
            String firstKey,
            String firstValue,
            String secondKey,
            String secondValue,
            double amount
    ) {
        if (amount <= 0) {
            return;
        }
        Counter.builder(name)
                .tag(firstKey, firstValue)
                .tag(secondKey, secondValue)
                .register(registry)
                .increment(amount);
    }

    private void recordDuration(String name, Duration duration, String... tags) {
        Objects.requireNonNull(duration, "duration");
        if (duration.isNegative()) {
            throw new IllegalArgumentException("duration cannot be negative");
        }
        Timer.Builder builder = Timer.builder(name);
        for (int index = 0; index < tags.length; index += 2) {
            builder.tag(tags[index], tags[index + 1]);
        }
        builder.register(registry).record(duration);
    }

    private String metricEventType(String eventType) {
        if (eventType == null
                || !allowedEventTypes.contains(eventType)
                || !OutboxHandlerRegistration.isSafeEventType(eventType)
                || eventType.length() > MAX_METRIC_EVENT_TYPE_LENGTH
                || eventType.codePoints().anyMatch(Character::isISOControl)) {
            return "unknown";
        }
        return eventType;
    }

    private static Set<String> boundedEventTypes(Set<String> eventTypes) {
        Objects.requireNonNull(eventTypes, "allowedEventTypes");
        if (eventTypes.size() > MAX_METRIC_EVENT_TYPES) {
            throw new IllegalArgumentException(
                    "allowed event types exceed the bounded metric limit"
            );
        }
        return Set.copyOf(eventTypes);
    }
}
