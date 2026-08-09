package tw.basketball.magazine.audit;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Objects;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

import tools.jackson.databind.ObjectMapper;

abstract class AuditIntegrationTestSupport {
    private static final String POSTGRES_IMAGE = "postgres:18.4-alpine";
    private static final String MIGRATION_RESOURCE = "/db/migration/V001__foundation.sql";

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(POSTGRES_IMAGE)
                    .withDatabaseName("courtside")
                    .withUsername("courtside")
                    .withPassword("courtside-test");

    protected static JdbcTemplate jdbcTemplate;
    protected static AuditWriter auditWriter;

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
    void createWriterAndCleanAuditEvents() {
        jdbcTemplate.update("TRUNCATE TABLE audit_event");
        auditWriter = new JdbcAuditWriter(jdbcTemplate, new ObjectMapper());
    }

    private static void applyMigration(DataSource dataSource) throws IOException, SQLException {
        try (InputStream input = Objects.requireNonNull(
                AuditIntegrationTestSupport.class.getResourceAsStream(MIGRATION_RESOURCE),
                "missing foundation migration"
        ); Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            String migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            statement.execute(migration);
        } catch (IOException | SQLException exception) {
            fail("Unable to apply V001 foundation migration: " + exception.getMessage());
        }
    }
}
