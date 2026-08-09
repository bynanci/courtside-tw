package tw.basketball.magazine.security;

import java.time.Duration;
import java.util.Map;
import java.util.Objects;

/** Route-specific rate-limit buckets; enforcement remains an adapter concern. */
public final class RouteRateLimitPolicy {
    private static final Limit PUBLIC_READ = new Limit(120, Duration.ofMinutes(1));
    private static final Limit SEARCH = new Limit(60, Duration.ofMinutes(1));
    private static final Limit AUTHENTICATION = new Limit(10, Duration.ofMinutes(1));
    private static final Limit MEDIA_UPLOAD = new Limit(20, Duration.ofMinutes(1));
    private static final Limit DEFAULT = new Limit(30, Duration.ofMinutes(1));
    private static final Map<String, Limit> EXACT_LIMITS = Map.of(
            "/api/v1/public/search", SEARCH,
            "/api/v1/auth/siwe/challenge", AUTHENTICATION,
            "/api/v1/auth/siwe/verify", AUTHENTICATION,
            "/api/v1/editor/media/uploads", MEDIA_UPLOAD
    );

    private RouteRateLimitPolicy() {
    }

    public static Limit forPath(String path) {
        Objects.requireNonNull(path, "path");
        String normalized = path.split("\\?", 2)[0];
        Limit exact = EXACT_LIMITS.get(normalized);
        if (exact != null) {
            return exact;
        }
        return normalized.startsWith("/api/v1/public/") ? PUBLIC_READ : DEFAULT;
    }

    public record Limit(int maximumRequests, Duration window) {
        public Limit {
            if (maximumRequests < 1 || maximumRequests > 1000) {
                throw new IllegalArgumentException("maximumRequests is outside the bounded policy");
            }
            if (window.isZero() || window.isNegative() || window.compareTo(Duration.ofHours(1)) > 0) {
                throw new IllegalArgumentException("window is outside the bounded policy");
            }
        }
    }
}
