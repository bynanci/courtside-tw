package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class OutboxRetryDeadLetterIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void schedulesBoundedRetriesAndDeadLettersAtTheAttemptLimit() {
        Instant initialTime = Instant.parse("2026-08-08T11:00:00Z");
        UUID eventId = repository.enqueue(draft("retry-dead-letter", initialTime));
        OutboxRetryPolicy retryPolicy = new OutboxRetryPolicy(
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(2)
        );

        OutboxClaim firstClaim = repository.claim(
                "worker-retry",
                1,
                Duration.ofSeconds(30),
                initialTime,
                retryPolicy.maxAttempts()
        ).getFirst();
        repository.fail(
                firstClaim,
                new IllegalStateException(
                        "Authorization=Bearer top-secret\n{\"token\":\"json-secret\"}"
                ),
                initialTime.plusSeconds(1),
                retryPolicy
        );

        OutboxEvent firstFailure = repository.findById(eventId).orElseThrow();
        assertEquals(OutboxStatus.FAILED, firstFailure.status());
        assertEquals(initialTime.plusSeconds(2), firstFailure.availableAt());
        assertTrue(firstFailure.lastError().contains("Authorization=[REDACTED]"));
        assertFalse(firstFailure.lastError().contains("top-secret"));
        assertFalse(firstFailure.lastError().contains("json-secret"));
        assertFalse(firstFailure.lastError().contains("\n"));

        Instant secondClaimTime = firstFailure.availableAt();
        OutboxClaim secondClaim = repository.claim(
                "worker-retry",
                1,
                Duration.ofSeconds(30),
                secondClaimTime,
                retryPolicy.maxAttempts()
        ).getFirst();
        repository.fail(
                secondClaim,
                new IllegalStateException("transient failure"),
                secondClaimTime,
                retryPolicy
        );

        OutboxEvent secondFailure = repository.findById(eventId).orElseThrow();
        assertEquals(OutboxStatus.FAILED, secondFailure.status());
        assertEquals(secondClaimTime.plusSeconds(2), secondFailure.availableAt());

        Instant thirdClaimTime = secondFailure.availableAt();
        OutboxClaim thirdClaim = repository.claim(
                "worker-retry",
                1,
                Duration.ofSeconds(30),
                thirdClaimTime,
                retryPolicy.maxAttempts()
        ).getFirst();
        repository.fail(
                thirdClaim,
                new IllegalStateException("permanent failure"),
                thirdClaimTime,
                retryPolicy
        );

        OutboxEvent deadLetter = repository.findById(eventId).orElseThrow();
        assertEquals(OutboxStatus.DEAD_LETTER, deadLetter.status());
        assertEquals(3, deadLetter.attemptCount());
        assertEquals(thirdClaimTime, deadLetter.deadLetteredAt());
        assertTrue(repository.claim(
                "worker-retry",
                1,
                Duration.ofDays(1),
                thirdClaimTime.plus(Duration.ofDays(1)),
                retryPolicy.maxAttempts()
        ).isEmpty());
    }
}
