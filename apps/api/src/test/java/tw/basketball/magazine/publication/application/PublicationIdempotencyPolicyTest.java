package tw.basketball.magazine.publication.application;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.publication.domain.PublicationAction;

final class PublicationIdempotencyPolicyTest {
    private static final String HASH = "a".repeat(64);
    private static final PublicationIdempotencyPolicy.Request REQUEST =
            new PublicationIdempotencyPolicy.Request(
                    "publisher-1",
                    PublicationAction.PUBLISH,
                    "publish-key-1",
                    HASH
            );

    private final PublicationIdempotencyPolicy policy = new PublicationIdempotencyPolicy();

    @Test
    void sameScopedRetryReplaysTheStoredResultWithoutReexecution() {
        PublicationIdempotencyPolicy.StoredResult stored =
                new PublicationIdempotencyPolicy.StoredResult(REQUEST, "{\"status\":\"PUBLISHED\"}");

        PublicationIdempotencyPolicy.Resolution resolution = policy.resolve(REQUEST, stored);

        assertEquals(PublicationIdempotencyPolicy.Outcome.REPLAY, resolution.outcome());
        assertEquals(stored.response(), resolution.response());
    }

    @Test
    void sameScopedKeyWithDifferentPayloadConflicts() {
        PublicationIdempotencyPolicy.Request changed =
                new PublicationIdempotencyPolicy.Request(
                        REQUEST.actorSubject(),
                        REQUEST.operation(),
                        REQUEST.idempotencyKey(),
                        "b".repeat(64)
                );
        PublicationIdempotencyPolicy.Resolution resolution = policy.resolve(
                changed,
                new PublicationIdempotencyPolicy.StoredResult(REQUEST, "{\"status\":\"PUBLISHED\"}")
        );

        assertEquals(PublicationIdempotencyPolicy.Outcome.CONFLICT, resolution.outcome());
    }

    @Test
    void differentScopeDoesNotReuseAnotherActorOrOperationResult() {
        PublicationIdempotencyPolicy.Request otherActor =
                new PublicationIdempotencyPolicy.Request(
                        "publisher-2",
                        REQUEST.operation(),
                        REQUEST.idempotencyKey(),
                        HASH
                );

        assertEquals(
                PublicationIdempotencyPolicy.Outcome.NEW,
                policy.resolve(otherActor, null).outcome()
        );
    }
}
