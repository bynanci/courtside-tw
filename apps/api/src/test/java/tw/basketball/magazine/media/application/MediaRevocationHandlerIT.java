package tw.basketball.magazine.media.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.Statement;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxStatus;
import tw.basketball.magazine.publication.application.OfflineManifestService;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.publication.worker.PublicationExternalInvalidator;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** Real PostgreSQL propagation; the controlled purge boundary is not provider timing evidence. */
final class MediaRevocationHandlerIT extends EditorialApiIntegrationTestSupport {
    @Test
    void revokeFindsFrozenPackagesPreservesSnapshotsAndReplaysOneDurableOperation() {
        Fixture fixture = seed(false);
        OfflineManifestService manifests = new OfflineManifestService(jdbcTemplate);
        long before = manifests.withdrawalManifest().version();
        List<String> snapshots = snapshotBytes();
        var first = revoke(fixture.assetId());
        assertTrue(first.body().contains(fixture.issueId().toString()));
        assertTrue(first.body().contains("affectedOfflinePackages"));
        assertEquals("WITHDRAWN", articleState(fixture.articleId()));
        assertEquals("WITHDRAWN", jdbcTemplate.queryForObject(
                "SELECT state FROM article_revision WHERE id = ?", String.class, fixture.revisionId()));
        assertEquals(snapshots, snapshotBytes());
        var withdrawn = manifests.withdrawalManifest();
        assertTrue(withdrawn.version() > before);
        assertTrue(withdrawn.withdrawals().containsAll(List.of(
                fixture.assetId(), fixture.articleId(), fixture.issueId())));
        for (int attempt = 0; attempt < 10; attempt++) {
            assertEquals(first, revoke(fixture.assetId()));
        }
        assertEquals(withdrawn.version(), manifests.withdrawalManifest().version());
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbcTemplate.update("DELETE FROM media_revocation_impact WHERE asset_id = ?", fixture.assetId()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM outbox_event WHERE event_type = 'media.rights.revoked'",
                Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event WHERE action = 'MEDIA_REVOKED'", Integer.class));
        assertEquals("owner requested removal", jdbcTemplate.queryForObject(
                "SELECT metadata->>'reason' FROM audit_event WHERE action = 'ARTICLE_WITHDRAWN'",
                String.class));
    }

    @Test
    void coverOnlyRevocationDiscoversHistoricalIssueAndEmitsAssetWithdrawal() {
        Fixture fixture = seed(true);
        revoke(fixture.assetId());
        assertEquals("PUBLISHED", articleState(fixture.articleId()));
        assertEquals(List.of(fixture.issueId()), jdbcTemplate.query(
                "SELECT aggregate_id FROM media_revocation_impact WHERE aggregate_type = 'ISSUE'",
                (row, index) -> row.getObject(1, UUID.class)));
        assertTrue(new OfflineManifestService(jdbcTemplate).withdrawalManifest().withdrawals()
                .contains(fixture.assetId()));
    }

    @Test
    void searchRemovalCommitsBeforePurgeAndFailureRemainsRetryableWithStableKeys() throws Exception {
        Fixture fixture = seed(false);
        revoke(fixture.assetId());
        OutboxEvent event = event(fixture.assetId());
        List<PublicationExternalInvalidator.Request> attempts = new ArrayList<>();
        MediaRevocationHandler handler = handler(request -> {
            attempts.add(request);
            // A separate connection must see the committed origin and search state at purge time.
            try (Connection connection = jdbcTemplate.getDataSource().getConnection();
                    Statement statement = connection.createStatement();
                    var rows = statement.executeQuery("SELECT active FROM search_document WHERE article_id = '"
                            + fixture.articleId() + "'")) {
                assertTrue(rows.next());
                assertFalse(rows.getBoolean(1));
            } catch (java.sql.SQLException exception) {
                throw new IllegalStateException(exception);
            }
            if (attempts.size() == 1) {
                throw new IllegalStateException("controlled provider outage");
            }
        });
        assertTrue(assertThrows(OutboxHandlerException.class, () -> handler.handle(event)).retryable());
        assertEquals("WITHDRAWN", articleState(fixture.articleId()));
        long version = searchVersion(fixture.revisionId());
        for (int attempt = 0; attempt < 10; attempt++) {
            handler.handle(event);
        }
        assertEquals(version, searchVersion(fixture.revisionId()));
        assertEquals(11, attempts.size());
        assertTrue(attempts.stream().allMatch(attempts.getFirst()::equals));
        assertTrue(attempts.getFirst().surrogateKeys().containsAll(List.of(
                "media:" + fixture.assetId(), "article:" + fixture.articleId(),
                "issue:" + fixture.issueId(), "search:article:" + fixture.articleId(),
                "sitemap:articles", "sitemap:issues", "offline:withdrawals")));
    }

    @Test
    void lateRevocationDeliveryDoesNotDeactivateAnUnrelatedReplacementRevision() throws Exception {
        Fixture fixture = seed(false);
        revoke(fixture.assetId());
        UUID replacement = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO article_revision (id, article_id, revision_number, title, dek,
                    content_document, state, version)
                SELECT ?, article_id, 2, title, dek, content_document, 'PUBLISHED', 0
                FROM article_revision WHERE id = ?
                """, replacement, fixture.revisionId());
        jdbcTemplate.update("UPDATE article SET state = 'PUBLISHED', published_revision_id = ? WHERE id = ?",
                replacement, fixture.articleId());
        seedSearch(fixture.articleId(), replacement, fixture.issueId(), "replacement-" + replacement);
        handler(request -> { }).handle(event(fixture.assetId()));
        assertEquals(Boolean.TRUE, jdbcTemplate.queryForObject(
                "SELECT active FROM search_document WHERE revision_id = ?", Boolean.class, replacement));
        assertEquals(Boolean.FALSE, jdbcTemplate.queryForObject(
                "SELECT active FROM search_document WHERE revision_id = ?", Boolean.class, fixture.revisionId()));
    }

    @Test
    void failedOutboxInsertionRollsBackOriginImpactCursorAndAudit() {
        Fixture fixture = seed(false);
        long version = new OfflineManifestService(jdbcTemplate).withdrawalManifest().version();
        jdbcTemplate.execute("""
                CREATE FUNCTION reject_revocation_test_event() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.event_type = 'media.rights.revoked' THEN RAISE EXCEPTION 'controlled insert failure'; END IF;
                    RETURN NEW;
                END; $$;
                CREATE TRIGGER reject_revocation_test_event BEFORE INSERT ON outbox_event
                FOR EACH ROW EXECUTE FUNCTION reject_revocation_test_event();
                """);
        try {
            assertThrows(RuntimeException.class, () -> revoke(fixture.assetId()));
            assertEquals("READY", jdbcTemplate.queryForObject(
                    "SELECT processing_state FROM media_asset WHERE id = ?", String.class, fixture.assetId()));
            assertEquals("PUBLISHED", articleState(fixture.articleId()));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM media_revocation_impact", Integer.class));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event", Integer.class));
            assertEquals(version, new OfflineManifestService(jdbcTemplate).withdrawalManifest().version());
        } finally {
            jdbcTemplate.execute("DROP TRIGGER reject_revocation_test_event ON outbox_event");
            jdbcTemplate.execute("DROP FUNCTION reject_revocation_test_event()");
        }
    }

    @Test
    void issueReadinessLocksCoverAndRightsUntilSnapshotTransactionEnds() {
        Fixture fixture = seed(true);
        jdbcTemplate.update("""
                INSERT INTO media_variant (asset_id, variant, public_storage_key, mime_type,
                    width, height, byte_size, checksum_sha256)
                VALUES (?, 'cover', 'published/revocation-cover.webp', 'image/webp', 10, 10, 100, ?)
                """, fixture.assetId(), "e".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO rights_record (asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status)
                VALUES (?, 'Owner', 'License', ARRAY['PUBLIC_WEB'], ARRAY['GLOBAL'],
                    transaction_timestamp() - INTERVAL '1 day', transaction_timestamp() + INTERVAL '1 day',
                    'Owner', 'Withdraw on request', 'VALID')
                """, fixture.assetId());
        JdbcEditorialIssueRepository repository = new JdbcEditorialIssueRepository(jdbcTemplate, JSON);
        transactions().executeWithoutResult(status -> {
            assertTrue(repository.readyForPublication(fixture.issueId(), Instant.now()));
            assertLocked("UPDATE media_asset SET processing_state = 'REVOKED' WHERE id = '" + fixture.assetId() + "'");
            assertLocked("UPDATE rights_record SET status = 'REVOKED' WHERE asset_id = '" + fixture.assetId() + "'");
        });
        jdbcTemplate.update("UPDATE rights_record SET status = 'REVOKED' WHERE asset_id = ?", fixture.assetId());
        assertFalse(transactions().execute(status -> repository.readyForPublication(fixture.issueId(), Instant.now())));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void busyPublicationRollsBackEveryEffectAndTheSameKeyRetriesAfterCommit(boolean coverOnly) throws Exception {
        Fixture fixture = seed(coverOnly);
        long version = new OfflineManifestService(jdbcTemplate).withdrawalManifest().version();
        try (Connection connection = jdbcTemplate.getDataSource().getConnection();
                Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            String lockSql = coverOnly
                    ? "SELECT id FROM publication_issue WHERE id = '" + fixture.issueId() + "' FOR UPDATE"
                    : "SELECT id FROM article WHERE id = '" + fixture.articleId() + "' FOR SHARE";
            statement.executeQuery(lockSql).close();
            EditorialProblemException conflict = assertThrows(EditorialProblemException.class,
                    () -> revoke(fixture.assetId()));
            assertEquals(ProblemCode.VERSION_CONFLICT, conflict.problemCode());
            assertTrue(conflict.errors().stream().anyMatch(error -> "MEDIA_REVOCATION_BUSY".equals(error.code())));
            assertEquals("READY", jdbcTemplate.queryForObject(
                    "SELECT processing_state FROM media_asset WHERE id = ?", String.class, fixture.assetId()));
            assertEquals("PUBLISHED", articleState(fixture.articleId()));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM media_revocation_impact", Integer.class));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_idempotency", Integer.class));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event", Integer.class));
            assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM outbox_event", Integer.class));
            assertEquals(version, new OfflineManifestService(jdbcTemplate).withdrawalManifest().version());
            // The publisher commits a second frozen issue version while holding its
            // article share lock. A subsequent retry must discover that snapshot.
            UUID secondIssue = UUID.randomUUID();
            statement.executeUpdate("INSERT INTO publication_issue (id, issue_number, slug, title, summary, cover_asset_id, state, published_at) "
                    + "SELECT '" + secondIssue + "', 100, 'late-" + secondIssue
                    + "', title, summary, cover_asset_id, 'PUBLISHED', published_at FROM publication_issue WHERE id = '"
                    + fixture.issueId() + "'");
            statement.executeUpdate("INSERT INTO publication_snapshot (aggregate_type, aggregate_id, snapshot_version, content_document, checksum_sha256, created_by) "
                    + "SELECT 'ISSUE', '" + secondIssue + "', 1, content_document, checksum_sha256, created_by "
                    + "FROM publication_snapshot WHERE aggregate_type = 'ISSUE' AND aggregate_id = '" + fixture.issueId() + "'");
            connection.commit();
            assertTrue(revoke(fixture.assetId()).body().contains(secondIssue.toString()));
        }
    }

    private void assertLocked(String update) {
        try (Connection connection = jdbcTemplate.getDataSource().getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute("SET lock_timeout = '100ms'");
            SQLException failure = assertThrows(SQLException.class, () -> statement.executeUpdate(update));
            assertEquals("55P03", failure.getSQLState());
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private EditorialWorkflowService.OperationResult revoke(UUID assetId) {
        return new PublisherMediaService(jdbcTemplate, new JdbcAuditWriter(jdbcTemplate, JSON), transactions(), JSON)
                .revoke(ActorContext.user("rights-publisher", Set.of(RoleCode.PUBLISHER),
                                new RequestId("revocation-propagation-test")), assetId, new Version(0),
                        "revoke-" + assetId, "{\"reason\":\"owner requested removal\"}");
    }

    private MediaRevocationHandler handler(PublicationExternalInvalidator invalidator) {
        return new MediaRevocationHandler(jdbcTemplate, transactions(), JSON, invalidator);
    }

    private TransactionTemplate transactions() {
        return new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource()));
    }

    private OutboxEvent event(UUID assetId) {
        return jdbcTemplate.queryForObject("""
                SELECT * FROM outbox_event WHERE aggregate_id = ? AND event_type = 'media.rights.revoked'
                """, (row, index) -> new OutboxEvent(row.getObject("id", UUID.class),
                row.getString("event_type"), row.getString("aggregate_type"), assetId,
                row.getString("idempotency_key"), row.getString("payload"), OutboxStatus.PENDING,
                row.getTimestamp("available_at").toInstant(), 0, null, null, null,
                row.getTimestamp("created_at").toInstant(), row.getTimestamp("updated_at").toInstant(), null, null), assetId);
    }

    private String articleState(UUID id) {
        return jdbcTemplate.queryForObject("SELECT state FROM article WHERE id = ?", String.class, id);
    }

    private long searchVersion(UUID revisionId) {
        return jdbcTemplate.queryForObject("SELECT version FROM search_document WHERE revision_id = ?", Long.class, revisionId);
    }

    private List<String> snapshotBytes() {
        return jdbcTemplate.query("SELECT content_document::text || checksum_sha256 FROM publication_snapshot ORDER BY id",
                (row, index) -> row.getString(1));
    }

    private Fixture seed(boolean coverOnly) {
        UUID asset = UUID.randomUUID();
        UUID coverAsset = coverOnly ? asset : UUID.randomUUID();
        UUID article = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID issue = UUID.randomUUID();
        UUID articleSnapshot = UUID.randomUUID();
        UUID issueSnapshot = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type,
                    byte_size, width, height, alt_text, processing_state)
                VALUES (?, ?, ?, 'image/webp', 100, 10, 10, 'licensed fixture', 'READY')
                """, asset, "private/revocation/" + asset, "a".repeat(64));
        if (!coverOnly) {
            jdbcTemplate.update("""
                    INSERT INTO media_asset (id, private_storage_key, checksum_sha256, mime_type,
                        byte_size, width, height, alt_text, processing_state)
                    VALUES (?, ?, ?, 'image/webp', 100, 10, 10, 'unaffected cover', 'READY')
                    """, coverAsset, "private/revocation/" + coverAsset, "f".repeat(64));
        }
        jdbcTemplate.update("""
                INSERT INTO publication_issue (id, issue_number, slug, title, summary, cover_asset_id, state, published_at)
                VALUES (?, ?, ?, 'Frozen issue', 'Fixture', ?, 'PUBLISHED', transaction_timestamp())
                """, issue, 99, "rev-" + issue, coverAsset);
        jdbcTemplate.update("INSERT INTO article (id, slug, state) VALUES (?, ?, 'DRAFT')", article, "rev-" + article);
        jdbcTemplate.update("""
                INSERT INTO article_revision (id, article_id, revision_number, title, dek, content_document, state)
                VALUES (?, ?, 1, 'Frozen article', 'Fixture', '{"schemaVersion":1,"blocks":[]}', 'PUBLISHED')
                """, revision, article);
        jdbcTemplate.update("""
                UPDATE article SET state = 'PUBLISHED', published_revision_id = ?, published_at = transaction_timestamp()
                WHERE id = ?
                """, revision, article);
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot (id, aggregate_type, aggregate_id, revision_id,
                    snapshot_version, content_document, checksum_sha256, created_by)
                VALUES (?, 'ARTICLE', ?, ?, 1, '{"title":"Frozen article","plainText":"fixture"}', ?, 'fixture')
                """, articleSnapshot, article, revision, "b".repeat(64));
        String document = "{\"coverAssetId\":\"" + coverAsset + "\",\"sections\":[{\"articles\":[{\"articleId\":\""
                + article + "\",\"revisionId\":\"" + revision + "\"}]}]}";
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot (id, aggregate_type, aggregate_id, snapshot_version,
                    content_document, checksum_sha256, created_by)
                VALUES (?, 'ISSUE', ?, 1, ?::jsonb, ?, 'fixture')
                """, issueSnapshot, issue, document, "c".repeat(64));
        jdbcTemplate.update("INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type) VALUES (?, ?, 'COVER_MEDIA')",
                issueSnapshot, coverAsset);
        if (!coverOnly) {
            jdbcTemplate.update("""
                    INSERT INTO article_revision_media (article_revision_id, asset_id, required_channel, position)
                    VALUES (?, ?, 'PUBLIC_WEB', 1)
                    """, revision, asset);
            jdbcTemplate.update("INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type) VALUES (?, ?, 'CONTENT_MEDIA')",
                    articleSnapshot, asset);
        }
        seedSearch(article, revision, issue, "rev-" + article);
        return new Fixture(asset, article, revision, issue);
    }

    private void seedSearch(UUID article, UUID revision, UUID issue, String slug) {
        jdbcTemplate.update("""
                INSERT INTO search_document (article_id, revision_id, issue_id, slug, title, dek, body_text,
                    normalized_text, source_checksum_sha256, published_at, active, indexed_at)
                VALUES (?, ?, ?, ?, 'Fixture', '', 'Fixture', 'fixture', ?, transaction_timestamp(), true, transaction_timestamp())
                """, article, revision, issue, slug, "d".repeat(64));
    }

    private record Fixture(UUID assetId, UUID articleId, UUID revisionId, UUID issueId) {
    }
}
