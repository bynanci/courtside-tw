package tw.basketball.magazine.media.processing;

/** Expected validation failure that must leave an asset out of READY. */
public final class MediaValidationException extends RuntimeException {
    private final MediaFailureReason reason;

    public MediaValidationException(MediaFailureReason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public MediaFailureReason reason() {
        return reason;
    }
}
