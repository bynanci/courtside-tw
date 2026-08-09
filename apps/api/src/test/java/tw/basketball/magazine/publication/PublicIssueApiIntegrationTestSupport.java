package tw.basketball.magazine.publication;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.postgresql.PostgreSQLContainer;

abstract class PublicIssueApiIntegrationTestSupport {
    private static final String POSTGRES_IMAGE = "postgres:18.4-alpine";
    private static final String FOUNDATION_MIGRATION = "/db/migration/V001__foundation.sql";
    private static final String PUBLICATION_MIGRATION = "/db/migration/V002__publication_content_core.sql";
    private static final String CHECKSUM = "a".repeat(64);

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(POSTGRES_IMAGE)
                    .withDatabaseName("courtside")
                    .withUsername("courtside")
                    .withPassword("courtside-test");

    protected static JdbcTemplate jdbcTemplate;
    protected MockMvc mockMvc;

    @BeforeAll
    static void startPostgresAndApplyMigrations() throws Exception {
        POSTGRES.start();
        DataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(),
                POSTGRES.getPassword()
        );
        applyMigration(dataSource, FOUNDATION_MIGRATION);
        applyMigration(dataSource, PUBLICATION_MIGRATION);
        jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @BeforeEach
    void createControllerAndCleanPublicationData() {
        jdbcTemplate.update("""
                TRUNCATE TABLE issue_article, issue_section, article_revision, article,
                    publication_issue, media_variant, rights_record, media_asset
                RESTART IDENTITY CASCADE
                """);
        mockMvc = MockMvcBuilders.standaloneSetup(
                new PublicIssueController(new PublicIssueService(new JdbcPublicIssueRepository(jdbcTemplate))),
                new PublicArticleController(new PublicArticleService(new JdbcPublicArticleRepository(jdbcTemplate)))
        ).build();
    }

    protected IssueFixture createIssue(
            String slug,
            int issueNumber,
            Instant publishedAt,
            String state,
            boolean validPublicWebRights
    ) {
        UUID issueId = UUID.randomUUID();
        UUID coverAssetId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        UUID rightsId = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/webp', 1024, 1200, 1600, ?, 'READY')
                """,
                coverAssetId,
                "private/" + slug + ".webp",
                CHECKSUM,
                "《" + slug + "》封面"
        );
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'cover', ?, ?, 'image/webp', 512, 1200, 1600)
                """,
                variantId,
                coverAssetId,
                "issues/" + slug + "/cover.webp",
                CHECKSUM
        );
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Courtside TW', 'Editorial license', ?::text[],
                    ARRAY['GLOBAL']::text[], ?, ?, 'Courtside TW', 'withdraw on notice', 'VALID')
                """,
                rightsId,
                coverAssetId,
                validPublicWebRights ? "{PUBLIC_WEB}" : "{READER_LIBRARY}",
                Timestamp.from(publishedAt.minusSeconds(86_400)),
                Timestamp.from(publishedAt.plusSeconds(31_536_000))
        );
        jdbcTemplate.update("""
                INSERT INTO publication_issue (
                    id, issue_number, slug, title, summary, cover_asset_id, state, published_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                issueId,
                issueNumber,
                slug,
                "Issue " + issueNumber,
                "Summary for " + slug,
                coverAssetId,
                state,
                Timestamp.from(publishedAt)
        );

        return new IssueFixture(issueId, slug);
    }

    protected void addArticle(
            IssueFixture issue,
            String sectionTitle,
            int sectionPosition,
            String articleSlug,
            int articlePosition,
            String state
    ) {
        UUID sectionId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        Instant publishedAt = Instant.parse("2026-08-01T00:00:00Z");

        jdbcTemplate.update("""
                INSERT INTO issue_section (id, issue_id, title, position)
                VALUES (?, ?, ?, ?)
                """, sectionId, issue.id(), sectionTitle, sectionPosition);
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, published_at)
                VALUES (?, ?, ?, ?)
                """, articleId, articleSlug, state, Timestamp.from(publishedAt));
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 1, ?, ?, ?::jsonb, ?)
                """,
                revisionId,
                articleId,
                "Article " + articleSlug,
                "Dek for " + articleSlug,
                """
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"Fixture article %s"}]}}
                ]}
                """.formatted(articleSlug),
                state
        );
        jdbcTemplate.update(
                "UPDATE article SET published_revision_id = ? WHERE id = ?",
                revisionId,
                articleId
        );
        jdbcTemplate.update("""
                INSERT INTO issue_article (issue_id, section_id, article_id, position)
                VALUES (?, ?, ?, ?)
                """, issue.id(), sectionId, articleId, articlePosition);
    }

    private static void applyMigration(DataSource dataSource, String migrationResource)
            throws IOException, SQLException {
        try (InputStream input = Objects.requireNonNull(
                PublicIssueApiIntegrationTestSupport.class.getResourceAsStream(migrationResource),
                "missing migration " + migrationResource
        ); Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException | SQLException exception) {
            fail("Unable to apply migration " + migrationResource + ": " + exception.getMessage());
        }
    }

    protected record IssueFixture(UUID id, String slug) {
    }
}
