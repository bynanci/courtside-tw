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
            if (expired.pendingAuthentication == 0) {
                windows.remove(expired.key);
            } else {
                // In-flight decoders retain their admission slots across a window
                // boundary; expiry must not admit unlimited stalled authentication.
                expired.accepted = expired.pendingAuthentication;
                expired.expiresAt = Math.addExact(now, expired.key.bucket.limit().window().toMillis());
                expiry.add(expired);
            }
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

    public synchronized AuthenticationReservation reserveAuthentication(String identity) {
        Decision decision = acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION_FAILURE, identity);
        Window window = decision.allowed()
                ? windows.get(new Key(RouteRateLimitPolicy.Bucket.AUTHENTICATION_FAILURE, identity)) : null;
        if (window != null) {
            window.pendingAuthentication++;
        }
        return new AuthenticationReservation(decision, window);
    }

    synchronized int trackedBuckets() {
        return windows.size();
    }

    private static Decision denied(long expiresAt, long now) {
        return new Decision(false, Math.max(1, (expiresAt - now + 999) / 1000));
    }

    public record Decision(boolean allowed, long retryAfterSeconds) {
    }

    /** Single-use admission held until a verified JWT or a failed authentication is observed. */
    public final class AuthenticationReservation {
        private final Decision decision;
        private final Window window;
        private boolean completed;

        private AuthenticationReservation(Decision decision, Window window) {
            this.decision = decision;
            this.window = window;
        }

        public Decision decision() {
            return decision;
        }

        public void complete(boolean authenticated) {
            synchronized (RouteRateLimiter.this) {
                if (completed || window == null) {
                    return;
                }
                completed = true;
                window.pendingAuthentication--;
                if (authenticated) {
                    window.accepted--;
                }
            }
        }
    }

    private record Key(RouteRateLimitPolicy.Bucket bucket, String identity) {
    }

    private static final class Window {
        private final Key key;
        private long expiresAt;
        private int accepted;
        private int pendingAuthentication;

        private Window(Key key, long expiresAt) {
            this.key = key;
            this.expiresAt = expiresAt;
        }

        private long expiresAt() {
            return expiresAt;
        }
    }
}
