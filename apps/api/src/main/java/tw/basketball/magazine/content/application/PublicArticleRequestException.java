package tw.basketball.magazine.content.application;

/** Safe, client-correctable public Article input error. */
public final class PublicArticleRequestException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String path;
    private final String code;

    PublicArticleRequestException(String path, String code, String message) {
        super(message);
        this.path = path;
        this.code = code;
    }

    public String path() {
        return path;
    }

    public String code() {
        return code;
    }
}
