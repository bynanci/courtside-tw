package tw.basketball.magazine.evidence;

import java.net.URI;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

/** PostgreSQL append-only evidence repository; no HTTP/provider dependency or automatic runtime activation. */
public final class JdbcEvidenceStore implements EvidenceStore {
    private final DataSource dataSource;

    public JdbcEvidenceStore(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    @Override
    public void appendSource(Evidence.Source value) {
        update("INSERT INTO basketball_source (id, source_type, name, source_url, public_reference_allowed) "
                + "VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", statement -> {
                    statement.setObject(1, value.id());
                    statement.setString(2, value.type().name());
                    statement.setString(3, value.name());
                    statement.setString(4, value.sourceUrl().toString());
                    statement.setBoolean(5, value.publicReferenceAllowed());
                });
        immutable(value, source(value.id()).orElseThrow());
    }

    @Override
    public void appendSnapshot(Evidence.SourceSnapshot value) {
        update("INSERT INTO basketball_source_snapshot "
                + "(id, source_id, source_url, retrieved_at, published_at, content, sha256, rights_reference) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", statement -> {
                    statement.setObject(1, value.id());
                    statement.setObject(2, value.sourceId());
                    statement.setString(3, value.sourceUrl().toString());
                    timestamp(statement, 4, value.retrievedAt());
                    timestamp(statement, 5, value.publishedAt());
                    statement.setString(6, value.content());
                    statement.setString(7, value.sha256());
                    statement.setString(8, value.rightsReference());
                });
        immutable(value, snapshot(value.id()).orElseThrow());
    }

    @Override
    public void appendReference(Evidence.EvidenceRef value) {
        EvidenceValidation.validate(value, this);
        update("INSERT INTO basketball_evidence_ref (id, source_id, source_type, source_url, retrieved_at, "
                + "published_at, effective_at, confidence, status, freshness, snapshot_id, stale_at, expires_at, note) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", statement -> {
                    statement.setObject(1, value.id());
                    statement.setObject(2, value.sourceId());
                    statement.setString(3, value.sourceType().name());
                    statement.setString(4, value.sourceUrl().toString());
                    timestamp(statement, 5, value.retrievedAt());
                    timestamp(statement, 6, value.publishedAt());
                    timestamp(statement, 7, value.effectiveAt());
                    statement.setDouble(8, value.confidence());
                    statement.setString(9, value.status().name());
                    statement.setString(10, value.freshness());
                    statement.setObject(11, value.snapshotId());
                    timestamp(statement, 12, value.staleAt());
                    timestamp(statement, 13, value.expiresAt());
                    statement.setString(14, value.note());
                });
        immutable(value, reference(value.id()).orElseThrow());
    }

    @Override
    public Optional<Evidence.Source> source(UUID id) {
        return one("SELECT * FROM basketball_source WHERE id = ?", id, row -> new Evidence.Source(
                row.getObject("id", UUID.class), Evidence.SourceType.valueOf(row.getString("source_type")),
                row.getString("name"), URI.create(row.getString("source_url")), row.getBoolean("public_reference_allowed")));
    }

    @Override
    public Optional<Evidence.SourceSnapshot> snapshot(UUID id) {
        return one("SELECT * FROM basketball_source_snapshot WHERE id = ?", id, row -> new Evidence.SourceSnapshot(
                row.getObject("id", UUID.class), row.getObject("source_id", UUID.class), URI.create(row.getString("source_url")),
                instant(row, "retrieved_at"), instant(row, "published_at"), row.getString("content"),
                row.getString("sha256"), row.getString("rights_reference")));
    }

    @Override
    public Optional<Evidence.EvidenceRef> reference(UUID id) {
        return one("SELECT * FROM basketball_evidence_ref WHERE id = ?", id, row -> new Evidence.EvidenceRef(
                row.getObject("id", UUID.class), row.getObject("source_id", UUID.class),
                Evidence.SourceType.valueOf(row.getString("source_type")), URI.create(row.getString("source_url")),
                instant(row, "retrieved_at"), instant(row, "published_at"), instant(row, "effective_at"),
                row.getDouble("confidence"), Evidence.Status.valueOf(row.getString("status")), row.getString("freshness"),
                row.getObject("snapshot_id", UUID.class), instant(row, "stale_at"), instant(row, "expires_at"), row.getString("note")));
    }

    @Override
    public List<ReviewEvent> events(String claimKey) {
        try (Connection connection = dataSource.getConnection()) {
            return events(connection, claimKey);
        } catch (SQLException exception) {
            throw storageFailure(exception);
        }
    }

    @Override
    public void appendEvent(ReviewEvent event, int expectedRevision) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement create = connection.prepareStatement(
                        "INSERT INTO basketball_claim_revision (claim_key, revision) VALUES (?, 0) ON CONFLICT DO NOTHING")) {
                    create.setString(1, event.claimKey());
                    create.executeUpdate();
                }
                int revision;
                try (PreparedStatement lock = connection.prepareStatement(
                        "SELECT revision FROM basketball_claim_revision WHERE claim_key = ? FOR UPDATE")) {
                    lock.setString(1, event.claimKey());
                    try (ResultSet row = lock.executeQuery()) {
                        if (!row.next()) {
                            throw new IllegalStateException("missing claim lock");
                        }
                        revision = row.getInt(1);
                    }
                }
                Optional<ReviewEvent> existing = events(connection, event.claimKey()).stream()
                        .filter(row -> row.id().equals(event.id())).findFirst();
                if (existing.isPresent()) {
                    immutable(event, existing.get());
                    connection.commit();
                    return;
                }
                if (revision != expectedRevision || event.revision() != expectedRevision + 1) {
                    throw new IllegalStateException("review revision conflict; reread before deciding");
                }
                try (PreparedStatement insert = connection.prepareStatement(
                        "INSERT INTO basketball_claim_event (id, claim_key, revision, event_kind, claim_value, "
                                + "evidence_ids, status, reviewer_id, rationale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                    insert.setObject(1, event.id());
                    insert.setString(2, event.claimKey());
                    insert.setInt(3, event.revision());
                    insert.setString(4, event.kind().name());
                    insert.setString(5, event.value());
                    java.sql.Array array = connection.createArrayOf("uuid", event.evidenceIds().toArray());
                    try {
                        insert.setArray(6, array);
                        insert.setString(7, event.status().name());
                        insert.setString(8, event.reviewerId());
                        insert.setString(9, event.rationale());
                        timestamp(insert, 10, event.createdAt());
                        insert.executeUpdate();
                    } finally {
                        array.free();
                    }
                }
                try (PreparedStatement link = connection.prepareStatement(
                        "INSERT INTO basketball_claim_event_evidence (event_id, evidence_id) VALUES (?, ?)")) {
                    for (UUID id : event.evidenceIds()) {
                        link.setObject(1, event.id());
                        link.setObject(2, id);
                        link.executeUpdate();
                    }
                }
                try (PreparedStatement advance = connection.prepareStatement(
                        "UPDATE basketball_claim_revision SET revision = ? WHERE claim_key = ?")) {
                    advance.setInt(1, event.revision());
                    advance.setString(2, event.claimKey());
                    advance.executeUpdate();
                }
                connection.commit();
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw storageFailure(exception);
        }
    }

    private static List<ReviewEvent> events(Connection connection, String key) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM basketball_claim_event WHERE claim_key = ? ORDER BY revision")) {
            statement.setString(1, key);
            try (ResultSet row = statement.executeQuery()) {
                List<ReviewEvent> result = new ArrayList<>();
                while (row.next()) {
                    java.sql.Array array = row.getArray("evidence_ids");
                    List<UUID> evidenceIds;
                    try {
                        evidenceIds = Arrays.stream((Object[]) array.getArray()).map(value -> UUID.fromString(value.toString())).toList();
                    } finally {
                        array.free();
                    }
                    result.add(new ReviewEvent(row.getObject("id", UUID.class), key, row.getInt("revision"),
                            EventKind.valueOf(row.getString("event_kind")), row.getString("claim_value"), evidenceIds,
                            Evidence.Status.valueOf(row.getString("status")), row.getString("reviewer_id"),
                            row.getString("rationale"), instant(row, "created_at")));
                }
                return List.copyOf(result);
            }
        }
    }

    private void update(String sql, Binder binder) {
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw storageFailure(exception);
        }
    }

    private <T> Optional<T> one(String sql, UUID id, Mapper<T> mapper) {
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setObject(1, id);
            try (ResultSet row = statement.executeQuery()) {
                return row.next() ? Optional.of(mapper.map(row)) : Optional.empty();
            }
        } catch (SQLException exception) {
            throw storageFailure(exception);
        }
    }

    private static void timestamp(PreparedStatement statement, int index, Instant value) throws SQLException {
        statement.setTimestamp(index, value == null ? null : Timestamp.from(value));
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static void immutable(Object expected, Object actual) {
        if (!expected.equals(actual)) {
            throw new IllegalStateException("immutable identity cannot be overwritten");
        }
    }

    private static IllegalStateException storageFailure(SQLException cause) {
        return new IllegalStateException("evidence persistence failed", cause);
    }

    @FunctionalInterface
    private interface Binder {
        void bind(PreparedStatement statement) throws SQLException;
    }

    @FunctionalInterface
    private interface Mapper<T> {
        T map(ResultSet row) throws SQLException;
    }
}
