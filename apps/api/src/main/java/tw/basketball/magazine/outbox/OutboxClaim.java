package tw.basketball.magazine.outbox;

import java.time.Instant;
import java.util.Objects;

/** A row lease bound to one unique fencing token. */
public record OutboxClaim(
        OutboxEvent event,
        String leaseOwner,
        Instant leaseUntil
) {
    public OutboxClaim {
        event = Objects.requireNonNull(event, "event");
        leaseOwner = Objects.requireNonNull(leaseOwner, "leaseOwner");
        leaseUntil = Objects.requireNonNull(leaseUntil, "leaseUntil");
        if (event.status() != OutboxStatus.CLAIMED) {
            throw new IllegalArgumentException("an outbox claim must have CLAIMED status");
        }
    }
}
