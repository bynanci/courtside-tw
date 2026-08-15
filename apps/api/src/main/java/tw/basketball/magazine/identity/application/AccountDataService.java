package tw.basketball.magazine.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.RequestId;

/** Verified, idempotent personal-data export and account-erasure orchestration. */
public final class AccountDataService {
    private static final Duration MAXIMUM_REAUTHENTICATION_AGE = Duration.ofMinutes(10);
    private static final String ERASED_ISSUER = "urn:courtside:erased";

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final AuditWriter auditWriter;
    private final ApplicationClock clock;

    public AccountDataService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            AuditWriter auditWriter,
            ApplicationClock clock
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.transactionTemplate = new TransactionTemplate(
                Objects.requireNonNull(transactionManager, "transactionManager")
        );
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public AccountExport export(AuthenticatedReader reader) {
        Objects.requireNonNull(reader, "reader");
        UUID readerId = findReader(reader);
        if (readerId == null) {
            return new AccountExport(
                    reader.issuer(),
                    reader.subject(),
                    List.of(),
                    List.of(),
                    clock.now()
            );
        }
        List<Map<String, Object>> bookmarks = jdbcTemplate.query("""
                SELECT article_id, created_at
                FROM bookmark
                WHERE reader_id = ?
                ORDER BY created_at, id
                """, (resultSet, rowNumber) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("articleId", resultSet.getObject("article_id", UUID.class));
            item.put("createdAt", resultSet.getTimestamp("created_at").toInstant());
            return Map.copyOf(item);
        }, readerId);
        List<Map<String, Object>> progress = jdbcTemplate.query("""
                SELECT article_id, revision_id, block_id, percent, updated_at
                FROM reading_progress
                WHERE reader_id = ?
                ORDER BY updated_at, id
                """, (resultSet, rowNumber) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("articleId", resultSet.getObject("article_id", UUID.class));
            item.put("revisionId", resultSet.getObject("revision_id", UUID.class));
            item.put("blockId", resultSet.getObject("block_id", UUID.class));
            item.put("percent", resultSet.getDouble("percent"));
            item.put("updatedAt", resultSet.getTimestamp("updated_at").toInstant());
            return Map.copyOf(item);
        }, readerId);
        return new AccountExport(
                reader.issuer(),
                reader.subject(),
                bookmarks,
                progress,
                clock.now()
        );
    }

    public DeletionWorkflow delete(
            AuthenticatedReader reader,
            boolean confirmed,
            String idempotencyKey,
            RequestId requestId
    ) {
        Objects.requireNonNull(reader, "reader");
        Objects.requireNonNull(requestId, "requestId");
        String key = idempotencyKey(idempotencyKey);
        if (!confirmed) {
            throw AccountProblemException.invalid(
                    "/confirm",
                    "deletion_confirmation_required",
                    "confirm must be true"
            );
        }
        Instant now = clock.now();
        if (!reader.wasRecentlyAuthenticated(now, MAXIMUM_REAUTHENTICATION_AGE)) {
            throw AccountProblemException.forbidden(
                    "recent_authentication_required",
                    "account deletion requires recent identity verification"
            );
        }
        String identityDigest = identityDigest(reader);
        DeletionWorkflow existing = findWorkflow(key, identityDigest);
        if (existing != null) {
            return existing;
        }
        return transactionTemplate.execute(status -> {
            DeletionWorkflow replay = findWorkflow(key, identityDigest);
            if (replay != null) {
                return replay;
            }
            UUID requestUuid = UUID.randomUUID();
            UUID readerId = findReader(reader);
            if (readerId != null) {
                jdbcTemplate.update("DELETE FROM bookmark WHERE reader_id = ?", readerId);
                jdbcTemplate.update("DELETE FROM reading_progress WHERE reader_id = ?", readerId);
                jdbcTemplate.update("""
                        UPDATE role_assignment
                        SET revoked_at = COALESCE(revoked_at, ?)
                        WHERE reader_id = ?
                        """, Timestamp.from(now), readerId);
                jdbcTemplate.update("""
                        UPDATE reader_profile
                        SET issuer = ?, subject = ?, updated_at = ?, version = version + 1
                        WHERE id = ?
                        """,
                        ERASED_ISSUER,
                        "erased:" + requestUuid,
                        Timestamp.from(now),
                        readerId
                );
            }
            jdbcTemplate.update("""
                    INSERT INTO account_erasure_job (
                        id, identity_digest, idempotency_key, status,
                        requested_at, completed_at
                    ) VALUES (?, ?, ?, 'COMPLETED', ?, ?)
                    """,
                    requestUuid,
                    identityDigest,
                    key,
                    Timestamp.from(now),
                    Timestamp.from(now)
            );
            auditWriter.append(new AuditEventDraft(
                    ActorContext.system(requestId),
                    "ACCOUNT_ERASURE_COMPLETED",
                    "ACCOUNT_ERASURE",
                    requestUuid,
                    Map.of("status", "COMPLETED")
            ));
            return new DeletionWorkflow(requestUuid, "COMPLETED");
        });
    }

    private DeletionWorkflow findWorkflow(String key, String identityDigest) {
        List<WorkflowRow> rows = jdbcTemplate.query("""
                SELECT id, identity_digest, status
                FROM account_erasure_job
                WHERE idempotency_key = ?
                """, (resultSet, rowNumber) -> new WorkflowRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("identity_digest"),
                resultSet.getString("status")
        ), key);
        if (rows.isEmpty()) {
            return null;
        }
        WorkflowRow row = rows.getFirst();
        if (!MessageDigest.isEqual(
                row.identityDigest().getBytes(StandardCharsets.US_ASCII),
                identityDigest.getBytes(StandardCharsets.US_ASCII)
        )) {
            throw AccountProblemException.conflict();
        }
        return new DeletionWorkflow(row.id(), row.status());
    }

    private UUID findReader(AuthenticatedReader reader) {
        List<UUID> rows = jdbcTemplate.query(
                "SELECT id FROM reader_profile WHERE issuer = ? AND subject = ?",
                (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
                reader.issuer(),
                reader.subject()
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private static String identityDigest(AuthenticatedReader reader) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] value = (reader.issuer() + "\u0000" + reader.subject()).getBytes(
                    StandardCharsets.UTF_8
            );
            return HexFormat.of().formatHex(digest.digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String idempotencyKey(String value) {
        if (value == null
                || value.isBlank()
                || value.length() > 200
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw AccountProblemException.invalid(
                    "/headers/Idempotency-Key",
                    "idempotency_key_invalid",
                    "Idempotency-Key is required and must be bounded"
            );
        }
        return value;
    }

    public record AccountExport(
            String issuer,
            String subject,
            List<Map<String, Object>> bookmarks,
            List<Map<String, Object>> progress,
            Instant generatedAt
    ) {
        public AccountExport {
            bookmarks = List.copyOf(bookmarks);
            progress = List.copyOf(progress);
            generatedAt = Objects.requireNonNull(generatedAt, "generatedAt");
        }
    }

    public record DeletionWorkflow(UUID requestId, String status) {
    }

    private record WorkflowRow(UUID id, String identityDigest, String status) {
    }
}
