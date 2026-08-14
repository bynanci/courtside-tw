package tw.basketball.magazine.search.application;

import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Opaque keyset cursor for deterministic weighted search ordering. */
record SearchCursor(double score, Instant publishedAt, UUID articleId) {
    private static final int MAXIMUM_CURSOR_LENGTH = 256;

    SearchCursor {
        if (!Double.isFinite(score) || score < 0 || publishedAt == null || articleId == null) {
            throw invalidCursor();
        }
    }

    static SearchCursor parse(String value) {
        if (value == null || value.isBlank() || value.length() > MAXIMUM_CURSOR_LENGTH) {
            throw invalidCursor();
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] fields = decoded.split("\\|", -1);
            if (fields.length != 3 || decoded.length() > MAXIMUM_CURSOR_LENGTH) {
                throw invalidCursor();
            }
            return new SearchCursor(
                    Double.valueOf(fields[0]),
                    Instant.parse(fields[1]),
                    UUID.fromString(fields[2])
            );
        } catch (IllegalArgumentException | DateTimeException exception) {
            throw invalidCursor();
        }
    }

    String encode() {
        String value = Double.toHexString(score) + "|" + publishedAt + "|" + articleId;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static SearchRequestException invalidCursor() {
        return new SearchRequestException(
                "/cursor",
                "invalid_cursor",
                "cursor must be a bounded opaque value"
        );
    }
}
