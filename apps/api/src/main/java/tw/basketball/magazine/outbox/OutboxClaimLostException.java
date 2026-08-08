package tw.basketball.magazine.outbox;

import java.util.UUID;

public final class OutboxClaimLostException extends IllegalStateException {
    public OutboxClaimLostException(UUID eventId) {
        super("Outbox claim is no longer owned: " + eventId);
    }
}
