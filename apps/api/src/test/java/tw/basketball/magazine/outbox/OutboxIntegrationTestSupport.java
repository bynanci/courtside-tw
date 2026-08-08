package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

abstract class OutboxIntegrationTestSupport {
    private static final String POSTGRES_IMAGE = "postgres:18.4-alpine";
    private static final String MIGRATION_RESOURCE = "/db/migration/V001__foundation.sql";
    private static final UUID AGGREGATE_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000001");

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(POSTGRES_IMAGE)
                    .withDatabaseName("courtside")
                    .withUsername("courtside")
                    .withPassword("courtside-test");

    protected static JdbcTemplate jdbcTemplate;
    protected static OutboxRepository repository;

    @BeforeAll
    static void startPostgresAndApplyFoundation() throws Exception {
        POSTGRES.start();
        DataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(),
                POSTGRES.getPassword()
        );
        applyMigration(dataSource);
        jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @BeforeEach
    void createRepositoryAndCleanOutbox() {
        jdbcTemplate.update("TRUNCATE TABLE outbox_event, outbox_test_side_effect");
        repository = new OutboxRepository(jdbcTemplate);
    }

    protected static OutboxEventDraft draft(String idempotencyKey, Instant availableAt) {
        return draft("publication.issue.published", idempotencyKey, availableAt);
    }

    protected static OutboxEventDraft draft(
            String eventType,
            String idempotencyKey,
            Instant availableAt
    ) {
        return new OutboxEventDraft(
                eventType,
                "publication_issue",
                AGGREGATE_ID,
                idempotencyKey,
                "{\"issueId\":\"00000000-0000-4000-8000-000000000001\"}",
                availableAt
        );
    }

    protected static OutboxProperties properties(
            String workerId,
            int maxAttempts,
            DurationValues durationValues
    ) {
        return new OutboxProperties(
                true,
                workerId,
                10,
                durationValues.leaseDuration(),
                maxAttempts,
                durationValues.retryInitialDelay(),
                durationValues.retryMaxDelay(),
                java.time.Duration.ofSeconds(5),
                java.time.Duration.ZERO
        );
    }

    protected record DurationValues(
            java.time.Duration leaseDuration,
            java.time.Duration retryInitialDelay,
            java.time.Duration retryMaxDelay
    ) {
    }

    private static void applyMigration(DataSource dataSource) throws IOException, SQLException {
        try (InputStream input = Objects.requireNonNull(
                OutboxIntegrationTestSupport.class.getResourceAsStream(MIGRATION_RESOURCE),
                "missing foundation migration"
        ); Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            String migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            statement.execute(migration);
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS outbox_test_side_effect (
                        idempotency_key text PRIMARY KEY,
                        applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
                    )
                    """);
        } catch (IOException | SQLException exception) {
            fail("Unable to apply V001 foundation migration: " + exception.getMessage());
        }
    }
}
