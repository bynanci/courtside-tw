package tw.basketball.magazine.publication;

import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Opaque, bounded keyset cursor for the public Issue list. */
record PublicIssueCursor(Instant publishedAt, UUID issueId) {
    private static final int MAXIMUM_CURSOR_LENGTH = 256;

    PublicIssueCursor {
        if (publishedAt == null || issueId == null) {
            throw new IllegalArgumentException("cursor values are required");
        }
    }

    static PublicIssueCursor parse(String value) {
        if (value == null || value.isBlank() || value.length() > MAXIMUM_CURSOR_LENGTH) {
            throw invalidCursor();
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] fields = decoded.split("\\|", -1);
            if (fields.length != 2 || decoded.length() > MAXIMUM_CURSOR_LENGTH) {
                throw invalidCursor();
            }
            return new PublicIssueCursor(Instant.parse(fields[0]), UUID.fromString(fields[1]));
        } catch (IllegalArgumentException | DateTimeException exception) {
            throw invalidCursor();
        }
    }

    String encode() {
        String value = publishedAt + "|" + issueId;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static PublicIssueRequestException invalidCursor() {
        return new PublicIssueRequestException(
                "/cursor",
                "invalid_cursor",
                "cursor must be a bounded opaque value"
        );
    }
}
