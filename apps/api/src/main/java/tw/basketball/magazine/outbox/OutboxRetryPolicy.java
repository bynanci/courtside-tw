package tw.basketball.magazine.outbox;

import java.time.Duration;
import java.util.Objects;

/** Exponential retry policy with an explicit attempt ceiling. */
public record OutboxRetryPolicy(
        int maxAttempts,
        Duration initialDelay,
        Duration maxDelay
) {
    public OutboxRetryPolicy {
        if (maxAttempts < 1 || maxAttempts > 100) {
            throw new IllegalArgumentException("maxAttempts must be between 1 and 100");
        }
        initialDelay = requirePositive("initialDelay", initialDelay);
        maxDelay = requirePositive("maxDelay", maxDelay);
        if (maxDelay.compareTo(initialDelay) < 0) {
            throw new IllegalArgumentException("maxDelay cannot be shorter than initialDelay");
        }
    }

    public Duration delayForAttempt(int attemptCount) {
        if (attemptCount < 1) {
            throw new IllegalArgumentException("attemptCount must be positive");
        }
        long multiplier = 1;
        for (int index = 1; index < attemptCount; index++) {
            if (multiplier > Long.MAX_VALUE / 2) {
                return maxDelay;
            }
            multiplier *= 2;
        }
        Duration candidate;
        try {
            candidate = initialDelay.multipliedBy(multiplier);
        } catch (ArithmeticException exception) {
            return maxDelay;
        }
        return candidate.compareTo(maxDelay) > 0 ? maxDelay : candidate;
    }

    private static Duration requirePositive(String name, Duration value) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
        return value;
    }
}
