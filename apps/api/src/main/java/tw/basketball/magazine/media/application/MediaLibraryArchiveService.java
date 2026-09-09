package tw.basketball.magazine.media.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/** FR-011 library archive never changes rights, processing or publication reachability. */
public final class MediaLibraryArchiveService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;

    public MediaLibraryArchiveService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter,
                                     TransactionTemplate transactionTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
    }

    public ArchiveResult archive(ActorContext actor, UUID assetId, Version expectedVersion) {
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.EDITOR) && !actor.hasRole(RoleCode.PUBLISHER)) {
            throw EditorialProblemException.forbidden("/roles", "media archive requires an editorial role");
        }
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        return Objects.requireNonNull(transactionTemplate.execute(status -> {
            List<ArchiveResult> rows = jdbcTemplate.query("""
                    SELECT id, version, archived_at FROM media_asset WHERE id = ? FOR UPDATE
                    """, (row, index) -> {
                        Timestamp archivedAt = row.getTimestamp("archived_at");
                        return new ArchiveResult(row.getObject("id", UUID.class), row.getLong("version"),
                                archivedAt == null ? null : archivedAt.toInstant());
                    }, assetId);
            if (rows.isEmpty()) {
                throw EditorialProblemException.notFound("/assetId", "media asset was not found");
            }
            ArchiveResult current = rows.getFirst();
            if (current.version() != expectedVersion.value()) {
                throw new VersionConflictException(expectedVersion, new Version(current.version()));
            }
            if (current.archivedAt() != null) {
                return current;
            }
            ArchiveResult archived = jdbcTemplate.queryForObject("""
                    UPDATE media_asset SET archived_at = transaction_timestamp(),
                        version = version + 1, updated_at = transaction_timestamp()
                    WHERE id = ? AND version = ?
                    RETURNING id, version, archived_at
                    """, (row, index) -> new ArchiveResult(row.getObject("id", UUID.class),
                            row.getLong("version"), row.getTimestamp("archived_at").toInstant()),
                    assetId, expectedVersion.value());
            auditWriter.append(new AuditEventDraft(actor, "MEDIA_LIBRARY_ARCHIVED", "MEDIA_ASSET", assetId,
                    Map.of("version", Objects.requireNonNull(archived, "archived media").version())));
            return archived;
        }), "archive transaction returned no result");
    }

    public record ArchiveResult(UUID assetId, long version, Instant archivedAt) {
    }
}
