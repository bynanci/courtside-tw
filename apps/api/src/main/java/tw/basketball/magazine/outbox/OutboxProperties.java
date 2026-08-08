package tw.basketball.magazine.outbox;

import java.time.Duration;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Bounded, provider-neutral outbox worker configuration. */
@ConfigurationProperties(prefix = "courtside.outbox")
public record OutboxProperties(
        boolean enabled,
        String workerId,
        int batchSize,
        Duration leaseDuration,
        int maxAttempts,
        Duration retryInitialDelay,
        Duration retryMaxDelay,
        Duration pollInterval,
        Duration initialDelay
) {
    private static final Duration MINIMUM_SCHEDULING_INTERVAL = Duration.ofMillis(1);
    private static final Duration MAXIMUM_POLL_INTERVAL = Duration.ofHours(1);
    private static final Duration MAXIMUM_INITIAL_DELAY = Duration.ofHours(1);

    public OutboxProperties {
        workerId = workerId == null ? "courtside-worker" : workerId;
        batchSize = batchSize == 0 ? 10 : batchSize;
        leaseDuration = leaseDuration == null ? Duration.ofSeconds(30) : leaseDuration;
        maxAttempts = maxAttempts == 0 ? 5 : maxAttempts;
        retryInitialDelay = retryInitialDelay == null
                ? Duration.ofSeconds(5)
                : retryInitialDelay;
        retryMaxDelay = retryMaxDelay == null
                ? Duration.ofMinutes(5)
                : retryMaxDelay;
        pollInterval = pollInterval == null ? Duration.ofSeconds(5) : pollInterval;
        initialDelay = initialDelay == null ? Duration.ZERO : initialDelay;

        workerId = boundedWorkerId(workerId);
        if (batchSize < 1 || batchSize > 100) {
            throw new IllegalArgumentException("batchSize must be between 1 and 100");
        }
        if (leaseDuration.isNegative() || leaseDuration.isZero()
                || leaseDuration.compareTo(Duration.ofDays(1)) > 0) {
            throw new IllegalArgumentException("leaseDuration must be between 1ms and 1 day");
        }
        Objects.requireNonNull(retryInitialDelay, "retryInitialDelay");
        Objects.requireNonNull(retryMaxDelay, "retryMaxDelay");
        if (pollInterval.compareTo(MINIMUM_SCHEDULING_INTERVAL) < 0
                || pollInterval.compareTo(MAXIMUM_POLL_INTERVAL) > 0) {
            throw new IllegalArgumentException("pollInterval must be between 1ms and 1 hour");
        }
        if ((!initialDelay.isZero()
                    && initialDelay.compareTo(MINIMUM_SCHEDULING_INTERVAL) < 0)
                || initialDelay.isNegative()
                || initialDelay.compareTo(MAXIMUM_INITIAL_DELAY) > 0) {
            throw new IllegalArgumentException("initialDelay must be between 0 and 1 hour");
        }
        new OutboxRetryPolicy(maxAttempts, retryInitialDelay, retryMaxDelay);
    }

    public OutboxRetryPolicy retryPolicy() {
        return new OutboxRetryPolicy(maxAttempts, retryInitialDelay, retryMaxDelay);
    }

    private static String boundedWorkerId(String value) {
        if (value.isBlank()
                || value.length() > 64
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("workerId must be bounded and free of control characters");
        }
        return value;
    }
}
