package tw.basketball.magazine.publication.domain;

/** A deterministic command rejection that an HTTP adapter can map to a stable problem code. */
public final class PublicationWorkflowException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String code;

    public PublicationWorkflowException(String code, String message) {
        super(message);
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code must not be blank");
        }
        this.code = code;
    }

    public String code() {
        return code;
    }
}
