package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

final class OutboxClaimRaceIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void concurrentWorkersCannotClaimTheSameRow() throws Exception {
        Instant now = Instant.parse("2026-08-08T13:00:00Z");
        UUID eventId = repository.enqueue(draft("claim-race", now));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);

        try {
            Future<List<OutboxClaim>> first = executor.submit(
                    () -> claimAfterBarrier(barrier, "worker-race-a", now)
            );
            Future<List<OutboxClaim>> second = executor.submit(
                    () -> claimAfterBarrier(barrier, "worker-race-b", now)
            );

            List<OutboxClaim> firstClaims = first.get(10, TimeUnit.SECONDS);
            List<OutboxClaim> secondClaims = second.get(10, TimeUnit.SECONDS);
            assertEquals(1, firstClaims.size() + secondClaims.size());

            OutboxClaim claim = firstClaims.isEmpty()
                    ? secondClaims.getFirst()
                    : firstClaims.getFirst();
            assertEquals(eventId, claim.event().id());
        } finally {
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    private static List<OutboxClaim> claimAfterBarrier(
            CyclicBarrier barrier,
            String workerId,
            Instant now
    ) throws Exception {
        barrier.await(10, TimeUnit.SECONDS);
        return repository.claim(
                workerId,
                1,
                Duration.ofSeconds(30),
                now,
                3
        );
    }
}
