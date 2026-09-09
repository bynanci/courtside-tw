package tw.basketball.magazine.security;

import java.time.Clock;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.PriorityQueue;

/**
 * Atomic, process-local fixed windows with bounded memory and expiry reclamation.
 * Active counters are never evicted to admit an unbounded identity flood. This
 * is an API-instance boundary, not a distributed or provider quota guarantee.
 */
public final class RouteRateLimiter {
    private final Clock clock;
    private final int maximumBuckets;
    private final Map<Key, Window> windows = new HashMap<>();
    private final PriorityQueue<Window> expiry = new PriorityQueue<>(Comparator.comparingLong(Window::expiresAt));
    private long latestObservedMillis = Long.MIN_VALUE;

    public RouteRateLimiter(Clock clock, int maximumBuckets) {
        this.clock = Objects.requireNonNull(clock, "clock");
        if (maximumBuckets < 1 || maximumBuckets > 100_000) {
            throw new IllegalArgumentException("maximumBuckets must be between 1 and 100000");
        }
        this.maximumBuckets = maximumBuckets;
    }

    public synchronized Decision acquire(RouteRateLimitPolicy.Bucket bucket, String identity) {
        Objects.requireNonNull(bucket, "bucket");
        if (identity == null || identity.isBlank() || identity.length() > 256) {
            throw new IllegalArgumentException("identity must be bounded and nonblank");
        }
        long now = Math.max(clock.millis(), latestObservedMillis);
        latestObservedMillis = now;
        while (!expiry.isEmpty() && expiry.element().expiresAt <= now) {
            Window expired = expiry.remove();
            windows.remove(expired.key);
        }

        Key key = new Key(bucket, identity);
        Window window = windows.get(key);
        if (window == null) {
            if (windows.size() >= maximumBuckets) {
                return denied(expiry.element().expiresAt, now);
            }
            window = new Window(key, Math.addExact(now, bucket.limit().window().toMillis()));
            windows.put(key, window);
            expiry.add(window);
        }
        if (window.accepted >= bucket.limit().maximumRequests()) {
            return denied(window.expiresAt, now);
        }
        window.accepted++;
        return new Decision(true, 0);
    }

    synchronized int trackedBuckets() {
        return windows.size();
    }

    private static Decision denied(long expiresAt, long now) {
        return new Decision(false, Math.max(1, (expiresAt - now + 999) / 1000));
    }

    public record Decision(boolean allowed, long retryAfterSeconds) {
    }

    private record Key(RouteRateLimitPolicy.Bucket bucket, String identity) {
    }

    private static final class Window {
        private final Key key;
        private final long expiresAt;
        private int accepted;

        private Window(Key key, long expiresAt) {
            this.key = key;
            this.expiresAt = expiresAt;
        }

        private long expiresAt() {
            return expiresAt;
        }
    }
}
