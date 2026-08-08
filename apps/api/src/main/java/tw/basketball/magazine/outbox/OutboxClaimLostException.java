package tw.basketball.magazine.outbox;

import java.util.UUID;

public final class OutboxClaimLostException extends IllegalStateException {
    private static final long serialVersionUID = 1L;

    public OutboxClaimLostException(UUID eventId) {
        super("Outbox claim is no longer owned: " + eventId);
    }
}
