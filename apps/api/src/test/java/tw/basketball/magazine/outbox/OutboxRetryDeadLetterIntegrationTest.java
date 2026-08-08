package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class OutboxRetryDeadLetterIntegrationTest extends OutboxIntegrationTestSupport {
    @Test
    void unknownEventTypeIsDeadLetteredWithoutRetry() {
        Instant initialTime = Instant.parse("2026-08-08T10:30:00Z");
        UUID eventId = repository.enqueue(
                draft("publication.issue.unknown", "unknown-event", initialTime)
        );
        OutboxHandlerRegistry registry = new OutboxHandlerRegistry(List.of(
                new OutboxHandlerRegistration("publication.issue.published", event -> { })
        ));
        OutboxWorker worker = new OutboxWorker(
                repository,
                properties(
                        "worker-unknown-event",
                        5,
                        new DurationValues(
                                Duration.ofSeconds(30),
                                Duration.ofSeconds(1),
                                Duration.ofSeconds(4)
                        )
                ),
                Clock.fixed(initialTime, ZoneOffset.UTC),
                registry,
                NoopOutboxMetrics.INSTANCE
        );

        OutboxRunResult result = worker.runOnce();

        assertEquals(1, result.claimed());
        assertEquals(0, result.completed());
        assertEquals(0, result.retryScheduled());
        assertEquals(1, result.deadLettered());
        OutboxEvent deadLetter = repository.findById(eventId).orElseThrow();
        assertEquals(OutboxStatus.DEAD_LETTER, deadLetter.status());
        assertEquals(initialTime, deadLetter.deadLetteredAt());
    }

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
        assertFalse(
                OutboxErrorSanitizer.sanitize(
                        new IllegalStateException("request failed with Bearer top-secret")
                ).contains("top-secret")
        );

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
