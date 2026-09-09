package tw.basketball.magazine.media.application;

import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.media.processing.MediaCompletionRequest;
import tw.basketball.magazine.media.processing.MediaCompletionValidator;
import tw.basketball.magazine.media.processing.MediaMetadataSanitizer;
import tw.basketball.magazine.media.storage.PrivateMediaPreviewReader;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;

/** Authenticated private preview verifies original bytes and rechecks revocation before responding. */
public final class PrivateMediaPreviewService {
    private final JdbcTemplate jdbcTemplate;
    private final PrivateMediaPreviewReader reader;

    public PrivateMediaPreviewService(JdbcTemplate jdbcTemplate, PrivateMediaPreviewReader reader) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.reader = Objects.requireNonNull(reader, "reader");
    }

    private static void requireEditorialRole(ActorContext actor) {
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.EDITOR) && !actor.hasRole(RoleCode.PUBLISHER)) {
            throw EditorialProblemException.forbidden("/roles", "private media preview requires an editorial role");
        }
    }

    public MediaPage list(ActorContext actor, int limit, UUID cursor) {
        requireEditorialRole(actor);
        if (limit < 1 || limit > 100) {
            throw EditorialProblemException.invalid("/limit", "LIMIT_INVALID", "limit must be between 1 and 100");
        }
        List<MediaSummary> rows = jdbcTemplate.query("""
                SELECT id, mime_type, processing_state, alt_text, width, height, version
                FROM media_asset WHERE (?::uuid IS NULL OR id < ?::uuid)
                ORDER BY id DESC LIMIT ?
                """, (row, index) -> new MediaSummary(row.getObject("id", UUID.class),
                row.getString("mime_type"), row.getString("processing_state"), row.getString("alt_text"),
                row.getObject("width", Integer.class), row.getObject("height", Integer.class), row.getLong("version")),
                cursor, cursor, limit + 1);
        boolean hasNext = rows.size() > limit;
        List<MediaSummary> items = List.copyOf(rows.subList(0, Math.min(limit, rows.size())));
        return new MediaPage(items, hasNext ? items.getLast().assetId() : null);
    }

    public Preview read(ActorContext actor, UUID assetId) {
        requireEditorialRole(actor);
        Media row = find(assetId);
        requireReady(row);
        if (row.byteSize() < 1 || row.byteSize() > StorageUploadPolicy.MAXIMUM_ORIGINAL_BYTES
                || !row.key().startsWith("media/originals/" + assetId + "/")) {
            throw unavailable();
        }
        byte[] sanitized;
        try {
            byte[] bytes = reader.read(row.key(), Math.toIntExact(row.byteSize()));
            var validated = new MediaCompletionValidator(StorageUploadPolicy.standard()).validate(
                    new MediaCompletionRequest(assetId, row.mimeType(), row.byteSize(), row.checksum(), bytes));
            sanitized = new MediaMetadataSanitizer().sanitize(validated).bytes();
        } catch (IOException | RuntimeException exception) {
            // Neither provider messages, private object keys nor returned error bytes
            // are included in the client problem or propagated exception chain.
            throw unavailable();
        }
        Media current = find(assetId);
        requireReady(current);
        if (current.version() != row.version()) {
            throw new EditorialProblemException(ProblemCode.RIGHTS_OR_CONTENT_GATE, List.of(
                    new FieldError("/assetId", "MEDIA_CHANGED", "media changed while preview was being prepared")));
        }
        return new Preview(row.mimeType(), sanitized);
    }

    private Media find(UUID assetId) {
        List<Media> rows = jdbcTemplate.query("""
                SELECT private_storage_key, checksum_sha256, mime_type, byte_size, processing_state, version
                FROM media_asset WHERE id = ?
                """, (row, index) -> new Media(row.getString(1), row.getString(2), row.getString(3),
                row.getLong(4), row.getString(5), row.getLong(6)), assetId);
        if (rows.isEmpty()) {
            throw EditorialProblemException.notFound("/assetId", "media asset was not found");
        }
        return rows.getFirst();
    }

    private static void requireReady(Media media) {
        if (!"READY".equals(media.state())) {
            throw new EditorialProblemException(ProblemCode.RIGHTS_OR_CONTENT_GATE, List.of(
                    new FieldError("/assetId", "MEDIA_NOT_READY", "private preview requires ready, non-revoked media")));
        }
    }

    private static EditorialProblemException unavailable() {
        return new EditorialProblemException(ProblemCode.MEDIA_PREVIEW_UNAVAILABLE, List.of());
    }

    private record Media(String key, String checksum, String mimeType, long byteSize, String state, long version) {
    }

    public record MediaSummary(UUID assetId, String mimeType, String processingState, String altText,
                               Integer width, Integer height, long version) {
    }

    public record MediaPage(List<MediaSummary> items, UUID nextCursor) {
        public MediaPage {
            items = List.copyOf(items);
        }
    }

    public record Preview(String mimeType, byte[] bytes) {
        public Preview {
            Objects.requireNonNull(mimeType, "mimeType");
            bytes = Objects.requireNonNull(bytes, "bytes").clone();
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }
}
