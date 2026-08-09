package tw.basketball.magazine.publication;

import java.util.regex.Pattern;

/** Parses only the small, bounded input surface accepted by anonymous Issue reads. */
final class PublicIssueRequest {
    static final int DEFAULT_LIMIT = 20;
    static final int MAXIMUM_LIMIT = 100;
    private static final Pattern ISSUE_SLUG = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");

    private PublicIssueRequest() {
    }

    static int limit(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT_LIMIT;
        }
        if (value.length() > 3) {
            throw invalidLimit();
        }
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 1 || parsed > MAXIMUM_LIMIT) {
                throw invalidLimit();
            }
            return parsed;
        } catch (NumberFormatException exception) {
            throw invalidLimit();
        }
    }

    static String articleSlug(String value) {
        if (value == null || value.length() > 128 || !ISSUE_SLUG.matcher(value).matches()) {
            throw new PublicIssueRequestException(
                    "/articleSlug",
                    "invalid_article_slug",
                    "articleSlug must be a bounded lowercase slug"
            );
        }
        return value;
    }

    static String issueSlug(String value) {
        if (value == null || value.length() > 128 || !ISSUE_SLUG.matcher(value).matches()) {
            throw new PublicIssueRequestException(
                    "/issueSlug",
                    "invalid_issue_slug",
                    "issueSlug must be a bounded lowercase slug"
            );
        }
        return value;
    }

    private static PublicIssueRequestException invalidLimit() {
        return new PublicIssueRequestException(
                "/limit",
                "invalid_limit",
                "limit must be an integer between 1 and 100"
        );
    }
}
