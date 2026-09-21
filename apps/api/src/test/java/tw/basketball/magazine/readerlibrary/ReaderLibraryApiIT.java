package tw.basketball.magazine.readerlibrary;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.MagazineApplication;
import tw.basketball.magazine.identity.OidcRoleConverter;

/** Executable US5 HTTP contract against the real Spring application seam. */
@SpringBootTest(
        classes = {MagazineApplication.class, ReaderLibraryApiIT.DatabaseConfiguration.class},
        properties = "spring.profiles.active=api"
)
@WebAppConfiguration
final class ReaderLibraryApiIT {
    private static final String ISSUER = "https://reader.example.test";
    private static final String SUBJECT = "reader-library-contract";
    private static final String JSON = "application/json";
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            "postgres:18.4-alpine"
    )
            .withDatabaseName("courtside_reader_library")
            .withUsername("courtside")
            .withPassword("courtside-test");

    static {
        POSTGRES.start();
        DataSource dataSource = dataSource();
        applyMigration(dataSource, "/db/migration/V001__foundation.sql", true);
        applyMigration(dataSource, "/db/migration/V002__publication_content_core.sql", true);
        applyMigration(dataSource, "/db/migration/V014__reader_library.sql", true);
        applyMigration(dataSource, "/db/migration/V004__editorial_publication_workflow.sql", true);
        applyMigration(dataSource, "/db/migration/V023__fan_passport_identity.sql", true);
    }

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private MockMvc mockMvc;

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("""
                TRUNCATE TABLE account_erasure_job, audit_event,
                    article_revision, article, reader_profile
                RESTART IDENTITY CASCADE
                """);
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    @Test
    void bookmarkIsIdempotentCrossDeviceAndSafeWhenArticleIsWithdrawn() throws Exception {
        ArticleFixture article = publishedArticle("reader-bookmark");

        putBookmark(article.articleId());
        putBookmark(article.articleId());

        mockMvc.perform(get("/api/v1/me/bookmarks").principal(reader(SUBJECT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].articleId").value(article.articleId().toString()))
                .andExpect(jsonPath("$.items[0].available").value(true));

        jdbcTemplate.update(
                "UPDATE article SET state = 'WITHDRAWN' WHERE id = ?",
                article.articleId()
        );

        mockMvc.perform(get("/api/v1/me/bookmarks").principal(reader(SUBJECT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].available").value(false))
                .andExpect(jsonPath("$.items[0].unavailableReason").value("WITHDRAWN"))
                .andExpect(jsonPath("$.items[0].body").doesNotExist())
                .andExpect(jsonPath("$.items[0].content").doesNotExist());

        mockMvc.perform(delete("/api/v1/me/bookmarks/{articleId}", article.articleId())
                        .principal(reader(SUBJECT))
                        .header("Idempotency-Key", "bookmark-delete-1"))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/v1/me/bookmarks/{articleId}", article.articleId())
                        .principal(reader(SUBJECT))
                        .header("Idempotency-Key", "bookmark-delete-2"))
                .andExpect(status().isNoContent());
    }

    @Test
    void acknowledgedCompletionSurvivesRereadingButNeverCarriesIntoAnotherRevision() throws Exception {
        ArticleFixture first = publishedArticle("reader-completion");
        putProgress(first, 100, "complete-first-version");
        mockMvc.perform(put("/api/v1/me/progress/{articleId}", first.articleId())
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "reread-first-version")
                        .content(progressBody(first.revisionId(), first.blockId(), 25)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.percent").value(100));

        UUID revision = UUID.randomUUID();
        UUID finalBlock = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) SELECT ?, article_id, 2, title, dek,
                    content_document || jsonb_build_object('blocks',
                        (content_document->'blocks') || ?::jsonb), 'PUBLISHED'
                  FROM article_revision WHERE id=?
                """, revision, """
                [{"id":"%s","type":"paragraph","version":1,
                  "payload":{"content":[{"kind":"text","text":"New final paragraph"}]}}]
                """.formatted(finalBlock), first.revisionId());
        jdbcTemplate.update("UPDATE article SET published_revision_id=? WHERE id=?",
                revision, first.articleId());
        ArticleFixture second = new ArticleFixture(first.articleId(), revision, finalBlock);
        putProgress(second, 20, "read-new-version");
        putProgress(second, 100, "complete-new-version");
        mockMvc.perform(put("/api/v1/me/progress/{articleId}", first.articleId())
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "reread-new-version-cursor")
                        .content(progressBody(revision, first.blockId(), 10)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.percent").value(100))
                .andExpect(jsonPath("$.blockId").value(first.blockId().toString()));
        mockMvc.perform(put("/api/v1/me/progress/{articleId}", first.articleId())
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "stale-completion-denied")
                        .content(progressBody(first.revisionId(), first.blockId(), 100)))
                .andExpect(status().isConflict());
    }

    @Test
    void progressIsRevisionAwareAndMergeRequiresExplicitApply() throws Exception {
        ArticleFixture article = publishedArticle("reader-progress");
        putProgress(article, 20, "progress-upsert-1");

        mockMvc.perform(put("/api/v1/me/progress/{articleId}", article.articleId())
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "progress-stale")
                        .content(progressBody(UUID.randomUUID(), article.blockId(), 80)))
                .andExpect(status().isConflict());

        jdbcTemplate.update(
                "UPDATE reading_progress SET updated_at = ?",
                java.sql.Timestamp.from(Instant.parse("2026-08-01T00:00:00Z"))
        );
        String local = mergeBody(
                "preview",
                article,
                70,
                Instant.parse("2026-08-02T00:00:00Z")
        );

        mockMvc.perform(post("/api/v1/me/progress:merge")
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "merge-preview")
                        .content(local))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("preview"))
                .andExpect(jsonPath("$.accepted[0].percent").value(70));
        assertEquals(20.0, storedPercent(article.articleId()));

        mockMvc.perform(post("/api/v1/me/progress:merge")
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "merge-apply")
                        .content(local.replace("\"preview\"", "\"apply\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("apply"))
                .andExpect(jsonPath("$.accepted[0].percent").value(70));
        assertEquals(70.0, storedPercent(article.articleId()));
    }

    @Test
    void mergePreviewPreservesTheNewerValidCandidateAcrossGeneratedCases() throws Exception {
        ArticleFixture article = publishedArticle("reader-merge-property");
        putProgress(article, 1, "property-seed");

        for (int index = 1; index <= 24; index++) {
            double serverPercent = index;
            double localPercent = 100 - index;
            Instant serverUpdatedAt = Instant.parse("2026-08-01T00:00:00Z").plusSeconds(index);
            Instant localUpdatedAt = serverUpdatedAt.plusSeconds(index % 2 == 0 ? 1 : -1);
            jdbcTemplate.update(
                    """
                    UPDATE reading_progress
                    SET percent = ?, updated_at = ?
                    WHERE article_id = ?
                    """,
                    serverPercent,
                    java.sql.Timestamp.from(serverUpdatedAt),
                    article.articleId()
            );

            MvcResult result = mockMvc.perform(post("/api/v1/me/progress:merge")
                            .principal(reader(SUBJECT))
                            .contentType(JSON)
                            .header("Idempotency-Key", "property-preview-" + index)
                            .content(mergeBody(
                                    "preview",
                                    article,
                                    localPercent,
                                    localUpdatedAt
                            )))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
            double expected = localUpdatedAt.isAfter(serverUpdatedAt)
                    ? localPercent
                    : serverPercent;
            assertEquals(expected, response.get("accepted").get(0).get("percent").asDouble());
            assertEquals(serverPercent, storedPercent(article.articleId()));
        }
    }

    @Test
    void verifiedAccountDeletionRemovesIdentifiableLibraryData() throws Exception {
        ArticleFixture article = publishedArticle("reader-erasure");
        putBookmark(article.articleId());
        putProgress(article, 45, "erasure-progress");
        jdbcTemplate.update("""
                INSERT INTO wallet_identity_link(id,reader_id,chain_namespace,address,linked_at)
                SELECT ?,id,'eip155','0x0000000000000000000000000000000000000001',transaction_timestamp()
                FROM reader_profile WHERE issuer=? AND subject=?
                """, UUID.randomUUID(), ISSUER, SUBJECT);


        mockMvc.perform(get("/api/v1/me/export").principal(reader(SUBJECT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value(SUBJECT))
                .andExpect(jsonPath("$.bookmarks", hasSize(1)))
                .andExpect(jsonPath("$.progress", hasSize(1)))
                .andExpect(jsonPath("$.accessToken").doesNotExist());

        MvcResult deletion = mockMvc.perform(delete("/api/v1/me")
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "account-erasure-1")
                        .content("{\"confirm\":true}"))
                .andExpect(status().isAccepted())
                .andExpect(content().contentTypeCompatibleWith(JSON))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andReturn();
        String requestId = objectMapper.readTree(
                deletion.getResponse().getContentAsString()
        ).get("requestId").stringValue();

        mockMvc.perform(delete("/api/v1/me")
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", "account-erasure-1")
                        .content("{\"confirm\":true}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.requestId").value(requestId))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertEquals(0, count("bookmark"));
        assertEquals(0, count("reading_progress"));
        assertEquals(0, count("wallet_identity_link"));
        assertEquals(0, count("siwe_challenge"));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM reader_profile WHERE issuer = ? AND subject = ?",
                Integer.class,
                ISSUER,
                SUBJECT
        ));
        assertFalse(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM audit_event WHERE actor_subject = ?)",
                Boolean.class,
                SUBJECT
        ));
        assertFalse(jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('courtside_app', 'account_erasure_job', 'UPDATE')",
                Boolean.class
        ));
    }

    @Test
    void plaintextPasswordClaimsNeverEnterPersistedReaderDataOrTheAccountExport() throws Exception {
        String canary = "test-only-plaintext-password-canary-DEV045";
        Instant now = Instant.now();
        Jwt jwt = Jwt.withTokenValue(canary)
                .header("alg", "RS256")
                .issuer(ISSUER)
                .subject(SUBJECT)
                .issuedAt(now.minusSeconds(10))
                .expiresAt(now.plusSeconds(300))
                .claim("auth_time", now.minusSeconds(10).getEpochSecond())
                .claim("roles", List.of("READER"))
                .claim("password", canary)
                .claim("credentials", Map.of("plaintextPassword", canary))
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(
                jwt, new OidcRoleConverter().convert(jwt)
        );
        ArticleFixture article = publishedArticle("reader-password-canary");

        mockMvc.perform(put("/api/v1/me/bookmarks/{articleId}", article.articleId())
                        .principal(authentication)
                        .header("Idempotency-Key", "password-canary-bookmark"))
                .andExpect(status().isNoContent());
        mockMvc.perform(put("/api/v1/me/progress/{articleId}", article.articleId())
                        .principal(authentication)
                        .contentType(JSON)
                        .header("Idempotency-Key", "password-canary-progress")
                        .content(progressBody(article.revisionId(), article.blockId(), 37)))
                .andExpect(status().isOk());

        assertEquals(1, count("reader_profile"));
        assertEquals(1, count("bookmark"));
        assertEquals(1, count("reading_progress"));
        assertEquals(Set.of("id", "issuer", "subject", "created_at", "updated_at", "version"),
                Set.copyOf(jdbcTemplate.queryForList("""
                        SELECT column_name FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'reader_profile'
                        """, String.class)));
        BadSqlGrammarException rejectedPasswordColumn = assertThrows(
                BadSqlGrammarException.class,
                () -> jdbcTemplate.update(
                        "UPDATE reader_profile SET password = ? WHERE issuer = ? AND subject = ?",
                        canary, ISSUER, SUBJECT
                )
        );
        assertEquals("42703", rejectedPasswordColumn.getSQLException().getSQLState());
        assertNoStoredPasswordCanary(canary);

        MvcResult export = mockMvc.perform(get("/api/v1/me/export").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issuer").value(ISSUER))
                .andExpect(jsonPath("$.subject").value(SUBJECT))
                .andExpect(jsonPath("$.bookmarks", hasSize(1)))
                .andExpect(jsonPath("$.progress", hasSize(1)))
                .andReturn();
        String exportBody = export.getResponse().getContentAsString();
        JsonNode exported = objectMapper.readTree(exportBody);
        assertEquals(Set.of("issuer", "subject", "bookmarks", "progress", "generatedAt"),
                fieldNames(exported));
        assertEquals(Set.of("articleId", "createdAt"), fieldNames(exported.path("bookmarks").path(0)));
        assertEquals(Set.of("articleId", "revisionId", "blockId", "percent", "updatedAt"),
                fieldNames(exported.path("progress").path(0)));
        assertFalse(exportBody.contains(canary));

        mockMvc.perform(delete("/api/v1/me")
                        .principal(authentication)
                        .contentType(JSON)
                        .header("Idempotency-Key", "password-canary-erasure")
                        .content("{\"confirm\":true}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        assertEquals(1, count("account_erasure_job"));
        assertEquals(1, count("audit_event"));
        assertNoStoredPasswordCanary(canary);
    }

    @Test
    void accountDeletionRejectsAStaleAuthenticationWithoutMutatingReaderData() throws Exception {
        ArticleFixture article = publishedArticle("reader-stale-auth");
        putBookmark(article.articleId());

        mockMvc.perform(delete("/api/v1/me")
                        .principal(reader(
                                SUBJECT,
                                Instant.now().minus(Duration.ofMinutes(11))
                        ))
                        .contentType(JSON)
                        .header("Idempotency-Key", "account-erasure-stale-auth")
                        .content("{\"confirm\":true}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errors[0].code").value(
                        "recent_authentication_required"
                ));

        assertEquals(1, count("bookmark"));
        assertEquals(0, count("account_erasure_job"));
    }

    private void putBookmark(UUID articleId) throws Exception {
        mockMvc.perform(put("/api/v1/me/bookmarks/{articleId}", articleId)
                        .principal(reader(SUBJECT))
                        .header("Idempotency-Key", "bookmark-put-" + articleId))
                .andExpect(status().isNoContent());
    }

    private void putProgress(ArticleFixture article, double percent, String key) throws Exception {
        mockMvc.perform(put("/api/v1/me/progress/{articleId}", article.articleId())
                        .principal(reader(SUBJECT))
                        .contentType(JSON)
                        .header("Idempotency-Key", key)
                        .content(progressBody(article.revisionId(), article.blockId(), percent)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.percent").value(percent));
    }

    private ArticleFixture publishedArticle(String slug) {
        UUID articleId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, published_at)
                VALUES (?, ?, 'PUBLISHED', ?)
                """, articleId, slug, java.sql.Timestamp.from(Instant.parse("2026-08-01T00:00:00Z")));
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document, state
                ) VALUES (?, ?, 1, ?, '', ?::jsonb, 'PUBLISHED')
                """,
                revisionId,
                articleId,
                "Article " + slug,
                """
                {"schemaVersion":1,"documentId":"00000000-0000-4000-8000-000000000001",
                 "blocks":[{"id":"%s","type":"paragraph","version":1,
                 "payload":{"content":[{"kind":"text","text":"Reader fixture"}]}}]}
                """.formatted(blockId)
        );
        jdbcTemplate.update(
                "UPDATE article SET published_revision_id = ? WHERE id = ?",
                revisionId,
                articleId
        );
        return new ArticleFixture(articleId, revisionId, blockId);
    }

    private double storedPercent(UUID articleId) {
        return jdbcTemplate.queryForObject(
                "SELECT percent FROM reading_progress WHERE article_id = ?",
                Double.class,
                articleId
        );
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }

    private void assertNoStoredPasswordCanary(String canary) {
        for (String table : List.of(
                "reader_profile", "role_assignment", "bookmark", "reading_progress", "account_erasure_job", "audit_event"
        )) {
            List<String> storedRows = jdbcTemplate.queryForList(
                    "SELECT to_jsonb(stored)::text FROM " + table + " stored", String.class
            );
            for (String row : storedRows) {
                assertFalse(row.contains(canary), "Unapproved credential data persisted in " + table);
            }
        }
    }

    private static Set<String> fieldNames(JsonNode node) {
        return node.properties().stream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet());
    }

    private static String progressBody(UUID revisionId, UUID blockId, double percent) {
        return """
                {"revisionId":"%s","blockId":"%s","percent":%s}
                """.formatted(revisionId, blockId, percent);
    }

    private static String mergeBody(
            String mode,
            ArticleFixture article,
            double percent,
            Instant updatedAt
    ) {
        return """
                {"mode":"%s","items":[{"articleId":"%s","revisionId":"%s",
                "blockId":"%s","percent":%s,"updatedAt":"%s"}]}
                """.formatted(
                mode,
                article.articleId(),
                article.revisionId(),
                article.blockId(),
                percent,
                updatedAt
        );
    }

    private static JwtAuthenticationToken reader(String subject) {
        Instant now = Instant.now();
        return reader(subject, now.minusSeconds(10));
    }

    private static JwtAuthenticationToken reader(String subject, Instant authenticatedAt) {
        Instant now = Instant.now();
        Jwt jwt = Jwt.withTokenValue("reader-library-test-token")
                .header("alg", "none")
                .issuer(ISSUER)
                .subject(subject)
                .issuedAt(now.minusSeconds(10))
                .expiresAt(now.plusSeconds(300))
                .claim("auth_time", authenticatedAt.getEpochSecond())
                .claim("roles", List.of("READER"))
                .build();
        return new JwtAuthenticationToken(
                jwt,
                List.of(new SimpleGrantedAuthority("ROLE_READER"))
        );
    }

    private static DataSource dataSource() {
        return new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(),
                POSTGRES.getPassword()
        );
    }

    private static void applyMigration(DataSource dataSource, String resource, boolean required) {
        try (InputStream input = ReaderLibraryApiIT.class.getResourceAsStream(resource)) {
            if (input == null) {
                if (required) {
                    throw new IllegalStateException("Missing migration " + resource);
                }
                return;
            }
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            try (Connection connection = dataSource.getConnection();
                    Statement statement = connection.createStatement()) {
                statement.execute(sql);
            }
        } catch (Exception exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DatabaseConfiguration {
        @Bean
        DataSource readerLibraryDataSource() {
            return dataSource();
        }
    }

    private record ArticleFixture(UUID articleId, UUID revisionId, UUID blockId) {
    }
}
