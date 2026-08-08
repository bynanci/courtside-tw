package tw.basketball.magazine.shared;

public enum ProblemCode {
    INVALID_REQUEST(
            400,
            "https://courtside.tw/problems/invalid_request",
            "Invalid request",
            "The request is invalid."
    ),
    AUTHENTICATION_REQUIRED(
            401,
            "https://courtside.tw/problems/authentication_required",
            "Authentication required",
            "Authentication is required."
    ),
    FORBIDDEN(
            403,
            "https://courtside.tw/problems/forbidden",
            "Forbidden",
            "The actor is not allowed to perform this operation."
    ),
    RESOURCE_NOT_FOUND(
            404,
            "https://courtside.tw/problems/resource_not_found",
            "Not found",
            "The requested resource was not found."
    ),
    VERSION_CONFLICT(
            409,
            "https://courtside.tw/problems/version_conflict",
            "Conflict",
            "The resource version is stale or the state conflicts."
    ),
    RIGHTS_OR_CONTENT_GATE(
            422,
            "https://courtside.tw/problems/rights_or_content_gate",
            "Unprocessable content",
            "The content or rights gate blocks this operation."
    ),
    RATE_LIMITED(
            429,
            "https://courtside.tw/problems/rate_limited",
            "Too many requests",
            "The request rate is limited."
    );

    private final int status;
    private final String type;
    private final String title;
    private final String defaultDetail;

    ProblemCode(int status, String type, String title, String defaultDetail) {
        this.status = status;
        this.type = type;
        this.title = title;
        this.defaultDetail = defaultDetail;
    }

    public int status() {
        return status;
    }

    public String type() {
        return type;
    }

    public String title() {
        return title;
    }

    public String defaultDetail() {
        return defaultDetail;
    }
}
