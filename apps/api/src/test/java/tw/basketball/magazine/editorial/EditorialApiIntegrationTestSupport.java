package tw.basketball.magazine.editorial;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.RoleCode;

/** Shared isolated PostgreSQL and MockMvc fixture for the T043 HTTP proof. */
public abstract class EditorialApiIntegrationTestSupport {
    private static final String POSTGRES_IMAGE = "postgres:18.4-alpine";
    private static final String CHECKSUM = "a".repeat(64);
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(POSTGRES_IMAGE)
            .withDatabaseName("courtside")
            .withUsername("courtside")
            .withPassword("courtside-test");
    protected static final ObjectMapper JSON = new ObjectMapper();
    protected static JdbcTemplate jdbcTemplate;
    protected static ApplicationClock applicationClock;
    protected MockMvc mockMvc;

    @BeforeAll
    static void startPostgresAndApplyMigrations() throws Exception {
        POSTGRES.start();
        DataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(),
                POSTGRES.getPassword()
        );
        applyMigration(dataSource, "/db/migration/V001__foundation.sql");
        applyMigration(dataSource, "/db/migration/V002__publication_content_core.sql");
        applyMigration(dataSource, "/db/migration/V003__article_contributors.sql");
        applyMigration(dataSource, "/db/migration/V004__editorial_publication_workflow.sql");
        applyMigration(dataSource, "/db/migration/V005__editorial_publication_gate_hardening.sql");
        applyMigration(dataSource, "/db/migration/V006__editorial_api_commands.sql");
        applyMigration(dataSource, "/db/migration/V007__editorial_media_uploads.sql");
        applyMigration(dataSource, "/db/migration/V008__editorial_crud_commands.sql");
        applyMigration(dataSource, "/db/migration/V009__publisher_media_commands.sql");
        applyMigration(dataSource, "/db/migration/V010__editorial_section_commands.sql");
        applyMigration(dataSource, "/db/migration/V011__editorial_media_reference_sync.sql");
        jdbcTemplate = new JdbcTemplate(dataSource);
        applicationClock = new ApplicationClock(
                Clock.fixed(Instant.parse("2026-08-10T00:00:00Z"), ZoneOffset.UTC)
        );
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @BeforeEach
    void createControllerAndCleanEditorialData() {
        jdbcTemplate.update("""
                TRUNCATE TABLE publication_impact_link, publication_idempotency,
                    publication_job, publication_snapshot, publication_rights_reference,
                    publication_review, article_revision_media, article_revision, article,
                    issue_article, issue_section, publication_issue, rights_record,
                    media_upload_idempotency, media_variant, media_asset, audit_event,
                    outbox_event
                RESTART IDENTITY CASCADE
                """);
        TransactionTemplate transactionTemplate = new TransactionTemplate(
                new DataSourceTransactionManager(jdbcTemplate.getDataSource())
        );
        EditorialWorkflowService service = new EditorialWorkflowService(
                new JdbcEditorialArticleRepository(jdbcTemplate),
                new JdbcAuditWriter(jdbcTemplate, JSON),
                transactionTemplate,
                JSON,
                applicationClock
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new EditorialArticleController(service))
                .setControllerAdvice(new EditorialApiExceptionHandler())
                .build();
    }

    protected Authentication actor(String subject, RoleCode role) {
        return new UsernamePasswordAuthenticationToken(
                subject,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    protected void linkMedia(
            UUID revisionId,
            String processingState,
            String rightsStatus,
            Set<String> allowedChannels
    ) {
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'fixture alt', ?)
                """, assetId, "private/t043/" + assetId, CHECKSUM, processingState);
        jdbcTemplate.update("""
                INSERT INTO article_revision_media (
                    article_revision_id, asset_id, required_channel, position
                ) VALUES (?, ?, 'PUBLIC_WEB', 1)
                """, revisionId, assetId);
        if (rightsStatus != null) {
            jdbcTemplate.update("""
                    INSERT INTO rights_record (
                        id, asset_id, rights_owner, license_name, allowed_channels,
                        territories, valid_from, valid_until, credit, withdrawal_terms,
                        status, version
                    ) VALUES (?, ?, 'Fixture owner', 'Fixture license', ?::text[],
                        ARRAY['GLOBAL']::text[], ?, ?, 'Fixture credit',
                        'withdraw on notice', ?, 3)
                    """,
                    UUID.randomUUID(),
                    assetId,
                    "{" + String.join(",", allowedChannels) + "}",
                    Timestamp.from(Instant.parse("2026-08-09T00:00:00Z")),
                    Timestamp.from(Instant.parse("2026-08-12T00:00:00Z")),
                    rightsStatus
            );
        }
    }

    protected record CreatedArticle(UUID articleId, UUID revisionId, long version) {
    }

    protected CreatedArticle readCreatedArticle(String responseBody) throws IOException {
        JsonNode body = JSON.readTree(responseBody);
        return new CreatedArticle(
                UUID.fromString(body.path("articleId").asString()),
                UUID.fromString(body.path("revisionId").asString()),
                body.path("version").asLong()
        );
    }

    private static void applyMigration(DataSource dataSource, String migrationResource)
            throws IOException, SQLException {
        try (InputStream input = EditorialApiIntegrationTestSupport.class
                .getResourceAsStream(migrationResource);
                Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement()) {
            if (input == null) {
                fail("missing migration " + migrationResource);
            }
            statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException | SQLException exception) {
            fail("Unable to apply migration " + migrationResource + ": " + exception.getMessage());
        }
    }
}
