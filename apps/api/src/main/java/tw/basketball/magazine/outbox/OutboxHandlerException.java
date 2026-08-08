package tw.basketball.magazine.outbox;

/**
 * Checked failure raised by an outbox handler when delivery cannot complete.
 */
public class OutboxHandlerException extends Exception {
    private static final long serialVersionUID = 1L;
    private final boolean retryable;

    public OutboxHandlerException(String message) {
        this(message, null, true);
    }

    public OutboxHandlerException(String message, Throwable cause) {
        this(message, cause, true);
    }

    public OutboxHandlerException(String message, boolean retryable) {
        this(message, null, retryable);
    }

    public OutboxHandlerException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    public boolean retryable() {
        return retryable;
    }
}
