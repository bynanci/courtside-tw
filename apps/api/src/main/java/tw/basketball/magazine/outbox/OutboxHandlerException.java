package tw.basketball.magazine.outbox;

/**
 * Checked failure raised by an outbox handler when delivery cannot complete.
 */
public final class OutboxHandlerException extends Exception {
    private static final long serialVersionUID = 1L;

    public OutboxHandlerException(String message) {
        super(message);
    }

    public OutboxHandlerException(String message, Throwable cause) {
        super(message, cause);
    }
}
