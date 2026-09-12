package tw.basketball.magazine.basketball.persistence;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import javax.sql.DataSource;
import tw.basketball.magazine.basketball.ports.BasketballFactStore;

/** Serializes small catalog edits, validates the hydrated aggregate, then commits exactly one immutable fact. */
public final class JdbcBasketballFactStore implements BasketballFactStore {
    private final DataSource dataSource;

    public JdbcBasketballFactStore(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    @Override
    public List<Fact> history() {
        try (Connection connection = dataSource.getConnection()) {
            return readHistory(connection);
        } catch (SQLException exception) {
            throw failure(exception);
        }
    }

    @Override
    public <T> T transact(Function<Session, T> work) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement lock = connection.prepareStatement(
                        "SELECT singleton FROM basketball_catalog_lock WHERE singleton = TRUE FOR UPDATE");
                     ResultSet row = lock.executeQuery()) {
                    if (!row.next()) {
                        throw new IllegalStateException("basketball catalog migration not initialized");
                    }
                }
                T value = work.apply(new JdbcSession(connection));
                connection.commit();
                return value;
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw failure(exception);
        }
    }

    private static final class JdbcSession implements Session {
        private final Connection connection;

        private JdbcSession(Connection connection) {
            this.connection = connection;
        }

        @Override
        public List<Fact> history() {
            try {
                return readHistory(connection);
            } catch (SQLException exception) {
                throw failure(exception);
            }
        }

        @Override
        public void append(Fact fact) {
            try {
                if (fact.identityKind() != null) {
                    try (PreparedStatement identity = connection.prepareStatement(
                            "INSERT INTO basketball_identity (id, entity_kind) VALUES (?, ?) ON CONFLICT (id) DO NOTHING")) {
                        identity.setObject(1, fact.id());
                        identity.setString(2, fact.identityKind());
                        identity.executeUpdate();
                    }
                    try (PreparedStatement check = connection.prepareStatement(
                            "SELECT entity_kind FROM basketball_identity WHERE id = ?")) {
                        check.setObject(1, fact.id());
                        try (ResultSet row = check.executeQuery()) {
                            if (!row.next() || !fact.identityKind().equals(row.getString(1))) {
                                throw new IllegalStateException("stable identity cannot change entity kind");
                            }
                        }
                    }
                }
                java.sql.Array evidence = connection.createArrayOf("uuid", fact.evidenceIds().toArray());
                try {
                    try (PreparedStatement insert = connection.prepareStatement(
                            "INSERT INTO basketball_fact (id, owner_id, fact_kind, identity_kind, valid_from, valid_to, payload, evidence_ids) "
                                    + "VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?) ON CONFLICT (id) DO NOTHING")) {
                        bindFact(insert, fact, evidence);
                        insert.executeUpdate();
                    }
                    try (PreparedStatement check = connection.prepareStatement(
                            "SELECT id FROM basketball_fact WHERE id = ? AND owner_id = ? AND fact_kind = ? "
                                    + "AND identity_kind IS NOT DISTINCT FROM ? AND valid_from IS NOT DISTINCT FROM ? "
                                    + "AND valid_to IS NOT DISTINCT FROM ? AND payload = ?::jsonb AND evidence_ids = ?")) {
                        bindFact(check, fact, evidence);
                        try (ResultSet row = check.executeQuery()) {
                            if (!row.next()) {
                                throw new IllegalStateException("immutable basketball fact cannot be overwritten");
                            }
                        }
                    }
                } finally {
                    evidence.free();
                }
            } catch (SQLException exception) {
                throw failure(exception);
            }
        }
    }

    private static void bindFact(PreparedStatement statement, Fact fact, java.sql.Array evidence) throws SQLException {
        statement.setObject(1, fact.id());
        statement.setObject(2, fact.ownerId());
        statement.setString(3, fact.kind());
        statement.setString(4, fact.identityKind());
        statement.setDate(5, fact.validFrom() == null ? null : Date.valueOf(fact.validFrom()));
        statement.setDate(6, fact.validTo() == null ? null : Date.valueOf(fact.validTo()));
        statement.setString(7, fact.payload());
        statement.setArray(8, evidence);
    }

    private static List<Fact> readHistory(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT * FROM basketball_fact ORDER BY sequence");
             ResultSet row = statement.executeQuery()) {
            List<Fact> result = new ArrayList<>();
            while (row.next()) {
                java.sql.Array evidence = row.getArray("evidence_ids");
                try {
                    Date start = row.getDate("valid_from");
                    Date end = row.getDate("valid_to");
                    result.add(new Fact(row.getObject("id", UUID.class), row.getObject("owner_id", UUID.class),
                            row.getString("fact_kind"), row.getString("identity_kind"), start == null ? null : start.toLocalDate(),
                            end == null ? null : end.toLocalDate(), row.getString("payload"),
                            Arrays.stream((Object[]) evidence.getArray()).map(value -> UUID.fromString(value.toString())).toList()));
                } finally {
                    evidence.free();
                }
            }
            return List.copyOf(result);
        }
    }

    private static IllegalStateException failure(SQLException exception) {
        return new IllegalStateException("basketball persistence failed", exception);
    }
}
