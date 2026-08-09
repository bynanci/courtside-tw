package tw.basketball.magazine.publication;

/** A safe, client-correctable public-read input error. */
final class PublicIssueRequestException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String path;
    private final String code;

    PublicIssueRequestException(String path, String code, String message) {
        super(message);
        this.path = path;
        this.code = code;
    }

    String path() {
        return path;
    }

    String code() {
        return code;
    }
}
