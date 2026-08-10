package tw.basketball.magazine.media.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/** PostgreSQL insert-only media command receipts. */
public final class JdbcMediaUploadIdempotencyRepository
        implements MediaUploadIdempotencyRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcMediaUploadIdempotencyRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public void lockScope(String actorSubject, String operation, String idempotencyKey) {
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> null,
                idempotencyLockKey(actorSubject, operation, idempotencyKey)
        );
    }

    private static String idempotencyLockKey(
            String actorSubject,
            String operation,
            String idempotencyKey
    ) {
        return actorSubject.length() + ":" + actorSubject
                + operation.length() + ":" + operation
                + idempotencyKey.length() + ":" + idempotencyKey;
    }

    @Override
    public Optional<Receipt> find(String actorSubject, String operation, String idempotencyKey) {
        List<Receipt> receipts = jdbcTemplate.query("""
                SELECT request_hash_sha256, asset_id, response
                FROM media_upload_idempotency
                WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?
                """, JdbcMediaUploadIdempotencyRepository::mapReceipt,
                actorSubject, operation, idempotencyKey);
        return receipts.stream().findFirst();
    }

    @Override
    public void insert(
            String actorSubject,
            String operation,
            String idempotencyKey,
            String requestHashSha256,
            UUID assetId,
            String responseJson
    ) {
        jdbcTemplate.update("""
                INSERT INTO media_upload_idempotency (
                    actor_subject, operation, idempotency_key,
                    request_hash_sha256, asset_id, response
                ) VALUES (?, ?, ?, ?, ?, ?::jsonb)
                """, actorSubject, operation, idempotencyKey,
                requestHashSha256, assetId, responseJson);
    }

    private static Receipt mapReceipt(ResultSet resultSet, int rowNumber) throws SQLException {
        return new Receipt(
                resultSet.getString("request_hash_sha256"),
                UUID.fromString(resultSet.getString("asset_id")),
                resultSet.getString("response")
        );
    }
}
