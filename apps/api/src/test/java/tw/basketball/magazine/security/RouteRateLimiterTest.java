package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

final class RouteRateLimiterTest {
    @Test
    void successfulAuthenticationReleasesReservationsWithoutSpendingTheFailureBudget() {
        RouteRateLimiter limiter = new RouteRateLimiter(Clock.systemUTC(), 100);
        for (int request = 0; request < 120; request++) {
            var reservation = limiter.reserveAuthentication("peer");
            assertTrue(reservation.decision().allowed());
            reservation.complete(true);
            reservation.complete(false);
        }
        for (int failure = 0; failure < 10; failure++) {
            var reservation = limiter.reserveAuthentication("peer");
            assertTrue(reservation.decision().allowed());
            reservation.complete(false);
            reservation.complete(true);
        }
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
    }

    @Test
    void outstandingAuthenticationCannotEscapeTheConcurrencyBoundAtWindowExpiry() {
        MutableClock clock = new MutableClock();
        RouteRateLimiter limiter = new RouteRateLimiter(clock, 100);
        List<RouteRateLimiter.AuthenticationReservation> pending = new ArrayList<>();
        for (int request = 0; request < 10; request++) {
            var reservation = limiter.reserveAuthentication("peer");
            assertTrue(reservation.decision().allowed());
            pending.add(reservation);
        }
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
        clock.advanceMillis(120_000);
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
        assertEquals(1, limiter.trackedBuckets());
        pending.get(0).complete(true);
        assertTrue(limiter.reserveAuthentication("peer").decision().allowed());
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
        pending.get(0).complete(true);
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
        for (int request = 1; request < pending.size(); request++) {
            pending.get(request).complete(false);
        }
        assertFalse(limiter.reserveAuthentication("peer").decision().allowed());
    }

    @Test
    void enforcesEveryExistingBudgetWithoutSharingCategoriesOrActors() {
        RouteRateLimiter limiter = new RouteRateLimiter(Clock.systemUTC(), 100);
        for (RouteRateLimitPolicy.Bucket bucket : RouteRateLimitPolicy.Bucket.values()) {
            for (int request = 0; request < bucket.limit().maximumRequests(); request++) {
                assertTrue(limiter.acquire(bucket, "actor-a").allowed(), bucket.name());
            }
            assertFalse(limiter.acquire(bucket, "actor-a").allowed(), bucket.name());
            assertTrue(limiter.acquire(bucket, "actor-b").allowed(), bucket.name());
        }
    }

    @Test
    void recoversOnlyAfterTheWholeWindowAndRoundsRetryAfterUp() {
        MutableClock clock = new MutableClock();
        RouteRateLimiter limiter = new RouteRateLimiter(clock, 10);
        exhaust(limiter, "actor");
        clock.advanceMillis(1);
        assertEquals(60, limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").retryAfterSeconds());
        clock.advanceMillis(58_999);
        assertEquals(1, limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").retryAfterSeconds());
        clock.advanceMillis(999);
        assertFalse(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").allowed());
        clock.advanceMillis(1);
        assertTrue(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").allowed());
    }

    @Test
    void clockRollbackCannotResetAnExhaustedWindow() {
        MutableClock clock = new MutableClock();
        RouteRateLimiter limiter = new RouteRateLimiter(clock, 10);
        exhaust(limiter, "actor");
        clock.advanceMillis(-60_000);
        assertFalse(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").allowed());
        clock.advanceMillis(120_000);
        assertTrue(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").allowed());
    }

    @Test
    void boundsStateWithoutEvictingLiveCountersAndReclaimsExpiredActors() {
        MutableClock clock = new MutableClock();
        RouteRateLimiter limiter = new RouteRateLimiter(clock, 2);
        exhaust(limiter, "actor-a");
        assertTrue(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor-b").allowed());
        for (int actor = 0; actor < 500; actor++) {
            assertFalse(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "new-" + actor).allowed());
        }
        assertEquals(2, limiter.trackedBuckets());
        assertFalse(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor-a").allowed());
        clock.advanceMillis(60_000);
        assertTrue(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "new-actor").allowed());
        assertEquals(1, limiter.trackedBuckets());
    }

    @Test
    void concurrentRequestsCannotOverspendTheSameBudget() throws Exception {
        RouteRateLimiter limiter = new RouteRateLimiter(Clock.systemUTC(), 100);
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(16);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int request = 0; request < 80; request++) {
                results.add(executor.submit(() -> {
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("concurrency test start timed out");
                    }
                    return limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, "actor").allowed();
                }));
            }
            start.countDown();
            int accepted = 0;
            for (Future<Boolean> result : results) {
                if (result.get(10, TimeUnit.SECONDS)) {
                    accepted++;
                }
            }
            assertEquals(10, accepted);
        } finally {
            executor.shutdownNow();
        }
    }

    private static void exhaust(RouteRateLimiter limiter, String actor) {
        for (int request = 0; request < 10; request++) {
            assertTrue(limiter.acquire(RouteRateLimitPolicy.Bucket.AUTHENTICATION, actor).allowed());
        }
    }

    private static final class MutableClock extends Clock {
        private final AtomicLong millis = new AtomicLong(Instant.parse("2026-09-09T00:00:00Z").toEpochMilli());

        void advanceMillis(long amount) {
            millis.addAndGet(amount);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) {
                throw new IllegalArgumentException("test clock supports UTC only");
            }
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(millis.get());
        }
    }
}
