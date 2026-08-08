package tw.basketball.magazine.outbox;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/**
 * PostgreSQL repository for the transactional outbox state machine.
 *
 * <p>Claiming is one SQL statement: expired leases are fenced, candidates are
 * locked with {@code SKIP LOCKED}, and the new lease token is written before
 * rows are returned. Completion and failure always require the exact token and
 * an unexpired lease.</p>
 */
public final class OutboxRepository {
    private static final String EVENT_COLUMNS = """
            id,
            event_type,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload,
            status,
            available_at,
            attempt_count,
            lease_owner,
            lease_until,
            last_error,
            created_at,
            updated_at,
            processed_at,
            dead_lettered_at
            """;

    private static final String INSERT_SQL = """
            INSERT INTO outbox_event (
                event_type,
                aggregate_type,
                aggregate_id,
                idempotency_key,
                payload,
                status,
                available_at,
                attempt_count,
                lease_owner,
                lease_until,
                last_error,
                created_at,
                updated_at,
                processed_at,
                dead_lettered_at
            )
            VALUES (
                ?, ?, ?, ?, ?::jsonb, 'PENDING', ?, 0, NULL, NULL, NULL,
                transaction_timestamp(), transaction_timestamp(), NULL, NULL
            )
            RETURNING id
            """;

    private static final String CLAIM_SQL = """
            WITH expired_candidates AS (
                SELECT event.id
                FROM outbox_event event
                WHERE event.status = 'CLAIMED'
                  AND event.lease_until <= ?
                  AND event.attempt_count >= ?
                ORDER BY event.lease_until, event.id
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            ),
            expired AS (
                UPDATE outbox_event event
                SET status = 'DEAD_LETTER',
                    lease_owner = NULL,
                    lease_until = NULL,
                    last_error = LEFT(
                        COALESCE(last_error, 'lease expired after max attempts'),
                        4000
                    ),
                    dead_lettered_at = COALESCE(dead_lettered_at, ?),
                    updated_at = ?
                FROM expired_candidates
                WHERE event.id = expired_candidates.id
                RETURNING event.id
            ),
            candidates AS (
                SELECT event.id
                FROM outbox_event event
                WHERE (
                    (event.status IN ('PENDING', 'FAILED')
                        AND event.available_at <= ?)
                    OR (event.status = 'CLAIMED'
                        AND event.lease_until <= ?)
                )
                  AND event.attempt_count < ?
                  AND NOT EXISTS (
                      SELECT 1
                      FROM expired
                      WHERE expired.id = event.id
                  )
                ORDER BY event.available_at, event.created_at, event.id
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            ),
            claimed AS (
                UPDATE outbox_event event
                SET status = 'CLAIMED',
                    lease_owner = ?,
                    lease_until = ?,
                    attempt_count = event.attempt_count + 1,
                    updated_at = ?
                FROM candidates
                WHERE event.id = candidates.id
                RETURNING
                    event.id,
                    event.event_type,
                    event.aggregate_type,
                    event.aggregate_id,
                    event.idempotency_key,
                    event.payload,
                    event.status,
                    event.available_at,
                    event.attempt_count,
                    event.lease_owner,
                    event.lease_until,
                    event.last_error,
                    event.created_at,
                    event.updated_at,
                    event.processed_at,
                    event.dead_lettered_at
            )
            SELECT
                id,
                event_type,
                aggregate_type,
                aggregate_id,
                idempotency_key,
                payload,
                status,
                available_at,
                attempt_count,
                lease_owner,
                lease_until,
                last_error,
                created_at,
                updated_at,
                processed_at,
                dead_lettered_at
            FROM claimed
            ORDER BY available_at, created_at, id
            """;

    private static final String FIND_BY_ID_SQL = "SELECT "
            + EVENT_COLUMNS
            + " FROM outbox_event WHERE id = ?";

    private static final String COMPLETE_SQL = """
            UPDATE outbox_event
            SET status = 'COMPLETED',
                lease_owner = NULL,
                lease_until = NULL,
                last_error = NULL,
                processed_at = ?,
                updated_at = ?
            WHERE id = ?
              AND status = 'CLAIMED'
              AND lease_owner = ?
              AND lease_until > ?
            """;

    private static final String FAIL_SQL = """
            UPDATE outbox_event
            SET status = ?,
                available_at = ?,
                lease_owner = NULL,
                lease_until = NULL,
                last_error = ?,
                updated_at = ?,
                dead_lettered_at = ?
            WHERE id = ?
              AND status = 'CLAIMED'
              AND lease_owner = ?
              AND lease_until > ?
            """;

    private static final RowMapper<OutboxClaim> CLAIM_ROW_MAPPER =
            OutboxRepository::mapClaim;

    private final JdbcTemplate jdbcTemplate;

    public OutboxRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /**
     * Inserts an event. When called inside a caller-managed transaction, the
     * insert participates in that same transaction as the domain mutation.
     */
    public UUID enqueue(OutboxEventDraft draft) {
        Objects.requireNonNull(draft, "draft");
        UUID id = jdbcTemplate.queryForObject(
                INSERT_SQL,
                (resultSet, rowNumber) -> uuid(resultSet, "id"),
                draft.eventType(),
                draft.aggregateType(),
                draft.aggregateId(),
                draft.idempotencyKey(),
                draft.payloadJson(),
                timestamp(draft.availableAt())
        );
        return Objects.requireNonNull(id, "database returned no outbox id");
    }

    /**
     * Claims at most {@code batchSize} events and returns a unique fencing
     * token for each row. The token is intentionally different on every
     * claim, even for the same worker process.
     */
    public List<OutboxClaim> claim(
            String workerId,
            int batchSize,
            Duration leaseDuration,
            Instant now,
            int maxAttempts
    ) {
        validateWorkerId(workerId);
        if (batchSize < 1 || batchSize > 100) {
            throw new IllegalArgumentException("batchSize must be between 1 and 100");
        }
        if (leaseDuration.isNegative() || leaseDuration.isZero()) {
            throw new IllegalArgumentException("leaseDuration must be positive");
        }
        if (maxAttempts < 1 || maxAttempts > 100) {
            throw new IllegalArgumentException("maxAttempts must be between 1 and 100");
        }
        Objects.requireNonNull(now, "now");
        String leaseOwner = workerId + ":" + UUID.randomUUID();
        Instant leaseUntil = now.plus(leaseDuration);
        return jdbcTemplate.query(
                CLAIM_SQL,
                CLAIM_ROW_MAPPER,
                timestamp(now),
                maxAttempts,
                batchSize,
                timestamp(now),
                timestamp(now),
                timestamp(now),
                timestamp(now),
                maxAttempts,
                batchSize,
                leaseOwner,
                timestamp(leaseUntil),
                timestamp(now)
        );
    }

    public Optional<OutboxEvent> findById(UUID eventId) {
        Objects.requireNonNull(eventId, "eventId");
        List<OutboxEvent> events = jdbcTemplate.query(
                FIND_BY_ID_SQL,
                OutboxRepository::mapEvent,
                eventId
        );
        return events.stream().findFirst();
    }

    /**
     * Completes only the current lease holder while its lease is still valid.
     */
    public void complete(OutboxClaim claim, Instant now) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(now, "now");
        int updated = jdbcTemplate.update(
                COMPLETE_SQL,
                timestamp(now),
                timestamp(now),
                claim.event().id(),
                claim.leaseOwner(),
                timestamp(now)
        );
        if (updated != 1) {
            throw new OutboxClaimLostException(claim.event().id());
        }
    }

    /**
     * Stores a sanitized error and either schedules the next bounded attempt or
     * transitions the event to DEAD_LETTER at the configured ceiling.
     */
    public void fail(
            OutboxClaim claim,
            Throwable failure,
            Instant now,
            OutboxRetryPolicy retryPolicy
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(failure, "failure");
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(retryPolicy, "retryPolicy");

        boolean deadLetter = claim.event().attemptCount() >= retryPolicy.maxAttempts();
        Instant availableAt = deadLetter
                ? now
                : now.plus(retryPolicy.delayForAttempt(claim.event().attemptCount()));
        int updated = jdbcTemplate.update(
                FAIL_SQL,
                deadLetter ? OutboxStatus.DEAD_LETTER.name() : OutboxStatus.FAILED.name(),
                timestamp(availableAt),
                OutboxErrorSanitizer.sanitize(failure),
                timestamp(now),
                deadLetter ? timestamp(now) : null,
                claim.event().id(),
                claim.leaseOwner(),
                timestamp(now)
        );
        if (updated != 1) {
            throw new OutboxClaimLostException(claim.event().id());
        }
    }

    /** Permanently dead-letters a non-retryable handler failure immediately. */
    public void deadLetter(OutboxClaim claim, Throwable failure, Instant now) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(failure, "failure");
        Objects.requireNonNull(now, "now");
        int updated = jdbcTemplate.update(
                FAIL_SQL,
                OutboxStatus.DEAD_LETTER.name(),
                timestamp(now),
                OutboxErrorSanitizer.sanitize(failure),
                timestamp(now),
                timestamp(now),
                claim.event().id(),
                claim.leaseOwner(),
                timestamp(now)
        );
        if (updated != 1) {
            throw new OutboxClaimLostException(claim.event().id());
        }
    }

    private static OutboxClaim mapClaim(ResultSet resultSet, int rowNumber) throws SQLException {
        OutboxEvent event = mapEvent(resultSet, rowNumber);
        return new OutboxClaim(
                event,
                Objects.requireNonNull(event.leaseOwner(), "claimed row has no lease owner"),
                Objects.requireNonNull(event.leaseUntil(), "claimed row has no lease expiry")
        );
    }

    private static OutboxEvent mapEvent(ResultSet resultSet, int rowNumber) throws SQLException {
        return new OutboxEvent(
                uuid(resultSet, "id"),
                resultSet.getString("event_type"),
                resultSet.getString("aggregate_type"),
                uuid(resultSet, "aggregate_id"),
                resultSet.getString("idempotency_key"),
                resultSet.getString("payload"),
                OutboxStatus.valueOf(resultSet.getString("status")),
                instant(resultSet, "available_at"),
                resultSet.getInt("attempt_count"),
                resultSet.getString("lease_owner"),
                nullableInstant(resultSet, "lease_until"),
                resultSet.getString("last_error"),
                instant(resultSet, "created_at"),
                instant(resultSet, "updated_at"),
                nullableInstant(resultSet, "processed_at"),
                nullableInstant(resultSet, "dead_lettered_at")
        );
    }

    private static UUID uuid(ResultSet resultSet, String column) throws SQLException {
        return UUID.fromString(resultSet.getString(column));
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        return timestamp(resultSet, column).toInstant();
    }

    private static Instant nullableInstant(ResultSet resultSet, String column) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static Timestamp timestamp(Instant instant) {
        return Timestamp.from(Objects.requireNonNull(instant, "instant"));
    }

    private static Timestamp timestamp(ResultSet resultSet, String column) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        if (value == null) {
            throw new SQLException("required timestamp is null: " + column);
        }
        return value;
    }

    private static void validateWorkerId(String workerId) {
        Objects.requireNonNull(workerId, "workerId");
        if (workerId.isBlank()
                || workerId.length() > 64
                || workerId.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("workerId must be bounded and free of control characters");
        }
    }
}
