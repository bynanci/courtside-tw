package tw.basketball.magazine.media.processing;

/** Expected encoder failure that keeps the asset in FAILED rather than READY. */
public final class MediaVariantProcessingException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public MediaVariantProcessingException(String message, Throwable cause) {
        super(message, cause);
    }

    public MediaVariantProcessingException(String message) {
        super(message);
    }
}
