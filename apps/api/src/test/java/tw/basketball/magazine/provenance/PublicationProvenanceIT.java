package tw.basketball.magazine.provenance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.provenance.application.ProvenanceService;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;

final class PublicationProvenanceIT extends PublicIssueApiIntegrationTestSupport {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-09-12T00:00:00Z");

    @BeforeAll
    static void applyProvenanceMigration() throws Exception {
        jdbcTemplate.execute(Files.readString(Path.of(System.getProperty("courtside.repoRoot"),
                "apps/api/src/main/resources/db/migration/V022__publication_provenance.sql")));
    }

    @Test
    void canonicalManifestMatchesTheSameTypeScriptFixture() throws Exception {
        Map<String, Object> fixture = JSON.readValue(Files.readString(Path.of(System.getProperty("courtside.repoRoot"),
                "contracts/fixtures/provenance/manifest-v1.json")), new TypeReference<>() { });
        Map<String, Object> manifest = JSON.convertValue(fixture.get("manifest"), new TypeReference<>() { });
        ManifestCanonicalizer.Receipt receipt = new ManifestCanonicalizer().receipt(manifest);
        assertEquals(fixture.get("canonical"), receipt.canonical());
        assertEquals(fixture.get("digest"), receipt.digest());
        assertEquals(fixture.get("cid"), receipt.cid());
        Map<String, Object> privateData = new HashMap<>(manifest);
        privateData.put("email", "reader@example.invalid");
        assertThrows(IllegalArgumentException.class, () -> new ManifestCanonicalizer().receipt(privateData));
    }

    @Test
    void duplicateWorkerPersistsOneImmutableManifestAndOneVerifiedTransition() {
        IssueFixture issue = createIssue("provenance-one", 1, NOW.minusSeconds(60), "PUBLISHED", true);
        UUID snapshot = latest(issue.id());
        ProvenanceService service = service();
        service.project(snapshot);
        service.project(snapshot);
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_provenance WHERE snapshot_id = ?", Integer.class, snapshot));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT count(*) FROM publication_provenance_history WHERE snapshot_id = ?", Integer.class, snapshot));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM outbox_event WHERE idempotency_key = ?", Integer.class, "provenance:" + snapshot + ":v1"));
        Map<String, Object> response = service.publicIssue(issue.slug()).orElseThrow();
        assertEquals("VERIFIED", response.get("status"));
        assertTrue(response.containsKey("manifest"));
        assertThrows(RuntimeException.class, () -> jdbcTemplate.update("UPDATE publication_provenance SET digest = ? WHERE snapshot_id = ?", "sha256:" + "e".repeat(64), snapshot));
        assertThrows(RuntimeException.class, () -> jdbcTemplate.update("DELETE FROM publication_provenance_history WHERE snapshot_id = ?", snapshot));
    }

    @Test
    void withdrawalAndRightsExpiryOverrideStoredVerifiedReceiptWithoutWaitingForWorker() {
        IssueFixture issue = createIssue("provenance-rights", 2, NOW.minusSeconds(60), "PUBLISHED", true);
        service().project(latest(issue.id()));
        jdbcTemplate.update("UPDATE rights_record SET status = 'REVOKED'");
        Map<String, Object> response = service().publicIssue(issue.slug()).orElseThrow();
        assertEquals("WITHDRAWN", response.get("status"));
        assertFalse(response.containsKey("manifest"));
        jdbcTemplate.update("UPDATE publication_issue SET state = 'WITHDRAWN' WHERE id = ?", issue.id());
        assertEquals("WITHDRAWN", jdbcTemplate.queryForObject("SELECT status FROM publication_provenance WHERE snapshot_id = ?", String.class, latest(issue.id())));
        assertThrows(RuntimeException.class, () -> jdbcTemplate.update("UPDATE publication_provenance SET status = 'VERIFIED' WHERE snapshot_id = ?", latest(issue.id())));
    }

    @Test
    void newSnapshotSupersedesOldReceiptAndPrivatePublicationCannotSurface() {
        IssueFixture issue = createIssue("provenance-version", 3, NOW.minusSeconds(60), "PUBLISHED", true);
        UUID old = latest(issue.id());
        service().project(old);
        refreshSnapshot(issue.id());
        service().project(latest(issue.id()));
        assertEquals("SUPERSEDED", jdbcTemplate.queryForObject("SELECT status FROM publication_provenance WHERE snapshot_id = ?", String.class, old));
        createIssue("provenance-private", 4, NOW.minusSeconds(60), "DRAFT", true);
        assertTrue(service().publicIssue("provenance-private").isEmpty());
    }

    private UUID latest(UUID issueId) {
        return jdbcTemplate.queryForObject("SELECT id FROM publication_snapshot WHERE aggregate_id = ? ORDER BY snapshot_version DESC LIMIT 1", UUID.class, issueId);
    }

    private ProvenanceService service() {
        return new ProvenanceService(jdbcTemplate,
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())), JSON, Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
