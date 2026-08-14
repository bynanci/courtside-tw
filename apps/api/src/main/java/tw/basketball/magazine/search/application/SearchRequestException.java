package tw.basketball.magazine.search.application;

/** Bounded public search input failure. */
public final class SearchRequestException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    private final String path;
    private final String code;

    public SearchRequestException(String path, String code, String message) {
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
