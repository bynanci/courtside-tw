package tw.basketball.magazine.security;

import java.time.Duration;
import java.util.Objects;

/** Stable route categories prevent query strings and resource IDs from creating fresh budgets. */
public final class RouteRateLimitPolicy {
    private RouteRateLimitPolicy() {
    }

    public static Limit forPath(String path) {
        Bucket bucket = bucketForPath(path);
        return bucket == null ? Bucket.BACKOFFICE.limit() : bucket.limit();
    }

    public static Bucket bucketForPath(String path) {
        Objects.requireNonNull(path, "path");
        String normalized = path.split("\\?", 2)[0];
        if (!within(normalized, "/api/v1")) {
            return null;
        }
        if (within(normalized, "/api/v1/auth")) {
            return Bucket.AUTHENTICATION;
        }
        if (within(normalized, "/api/v1/editor/media/uploads")) {
            return Bucket.MEDIA_UPLOAD;
        }
        if (within(normalized, "/api/v1/public/search")) {
            return Bucket.SEARCH;
        }
        return within(normalized, "/api/v1/public") ? Bucket.PUBLIC_READ : Bucket.BACKOFFICE;
    }

    private static boolean within(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    public enum Bucket {
        PUBLIC_READ(120), SEARCH(60), AUTHENTICATION(10), MEDIA_UPLOAD(20), BACKOFFICE(30);

        private final Limit limit;

        Bucket(int maximumRequests) {
            limit = new Limit(maximumRequests, Duration.ofMinutes(1));
        }

        public Limit limit() {
            return limit;
        }
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
