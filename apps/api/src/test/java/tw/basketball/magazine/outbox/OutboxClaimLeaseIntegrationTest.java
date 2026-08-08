package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class OutboxClaimLeaseIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void claimsOnlyAvailableRowsAndFencesExpiredOwners() {
        Instant initialTime = Instant.parse("2026-08-08T10:00:00Z");
        UUID eventId = repository.enqueue(draft("claim-fence", initialTime));

        OutboxClaim firstClaim = singleClaim(
                repository.claim("worker-a", 1, Duration.ofSeconds(30), initialTime, 3)
        );

        assertEquals(eventId, firstClaim.event().id());
        assertEquals(1, firstClaim.event().attemptCount());
        assertTrue(firstClaim.leaseOwner().startsWith("worker-a:"));
        assertTrue(repository.claim(
                "worker-b",
                1,
                Duration.ofSeconds(30),
                initialTime,
                3
        ).isEmpty());

        Instant afterLease = initialTime.plusSeconds(31);
        assertThrows(
                OutboxClaimLostException.class,
                () -> repository.complete(firstClaim, afterLease)
        );

        OutboxClaim recoveredClaim = singleClaim(
                repository.claim("worker-b", 1, Duration.ofSeconds(30), afterLease, 3)
        );
        assertNotEquals(firstClaim.leaseOwner(), recoveredClaim.leaseOwner());
        assertEquals(2, recoveredClaim.event().attemptCount());

        assertThrows(
                OutboxClaimLostException.class,
                () -> repository.complete(firstClaim, afterLease.plusSeconds(1))
        );

        repository.complete(recoveredClaim, afterLease.plusSeconds(1));
        assertEquals(
                OutboxStatus.COMPLETED,
                repository.findById(eventId).orElseThrow().status()
        );
    }

    private static OutboxClaim singleClaim(List<OutboxClaim> claims) {
        assertEquals(1, claims.size());
        return claims.getFirst();
    }
}
