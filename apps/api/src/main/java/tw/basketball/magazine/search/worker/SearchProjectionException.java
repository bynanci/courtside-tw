package tw.basketball.magazine.search.worker;

/** Attributable projection failure with outbox retry semantics. */
public final class SearchProjectionException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final boolean retryable;

    SearchProjectionException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    SearchProjectionException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    public boolean retryable() {
        return retryable;
    }
}
