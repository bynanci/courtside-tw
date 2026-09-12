package tw.basketball.magazine.fanpassport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tw.basketball.magazine.fanpassport.application.FanPassportService;
import tw.basketball.magazine.fanpassport.persistence.JdbcPassportErasure;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;

/** Real PostgreSQL races and private identity erasure, not an in-memory approximation. */
final class FanPassportLifecycleIT extends PublicIssueApiIntegrationTestSupport {

  private static final Instant NOW = Instant.parse("2026-09-12T00:00:00Z");
  private static final AuthenticatedReader READER = new AuthenticatedReader(
    "https://oidc.example.test",
    "passport-reader",
    NOW
  );
  private FanPassportService service;
  private UUID issueId;

  @BeforeAll
  static void passportMigrations() throws Exception {
    for (String name : List.of("V014__reader_library.sql", "V023__fan_passport_identity.sql")) {
      try (
        InputStream input = FanPassportLifecycleIT.class.getResourceAsStream(
          "/db/migration/" + name
        );
        var connection = jdbcTemplate.getDataSource().getConnection();
        var statement = connection.createStatement()
      ) {
        statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
  }

  @BeforeEach
  void preparePassport() {
    service = new FanPassportService(
      jdbcTemplate,
      new DataSourceTransactionManager(jdbcTemplate.getDataSource()),
      PassportTestClock.fixed(NOW)
    );
    IssueFixture issue = createIssue(
      "passport-issue",
      105,
      NOW.minusSeconds(86400),
      "PUBLISHED",
      true
    );
    addArticle(issue, "Passport", 1, "passport-article", 1, "PUBLISHED");
    refreshSnapshot(issue.id());
    issueId = issue.id();
    UUID readerId = service.readerId(READER);
    jdbcTemplate.update(
      """
      INSERT INTO reading_progress (id,reader_id,article_id,revision_id,block_id,percent,updated_at)
      SELECT ?,?,a.id,a.published_revision_id,?,100,? FROM article a WHERE a.slug='passport-article'
      """,
      UUID.randomUUID(),
      readerId,
      UUID.randomUUID(),
      Timestamp.from(NOW)
    );
  }

  @Test
  void concurrentClaimsHaveOneEffectiveStampAndConflictingKeyFails() throws Exception {
    try (var executor = Executors.newFixedThreadPool(4)) {
      List<Callable<UUID>> calls = java.util.stream.IntStream.range(0, 12)
        .mapToObj(
          (index) ->
            (Callable<UUID>) () -> service.claim(READER, issueId, "2026", "claim-" + index).id()
        )
        .toList();
      var futures = executor.invokeAll(calls);
      UUID id = futures.getFirst().get();
      for (var future : futures) {
        assertEquals(id, future.get());
      }
      assertEquals(
        1,
        jdbcTemplate.queryForObject(
          "SELECT count(*) FROM fan_passport_stamp WHERE status='CLAIMED'",
          Integer.class
        )
      );
      assertThrows(RuntimeException.class, () -> service.claim(READER, issueId, "2025", "claim-0"));
    }
  }

  @Test
  void revokedStampDoesNotResurrectAndRightsWithdrawalOverridesPresentation() {
    var stamp = service.claim(READER, issueId, "2026", "claim");
    service.changeStatus(stamp.id(), "REVOKED", "OWNER_REVOCATION", 0);
    assertEquals("REVOKED", service.claim(READER, issueId, "2026", "retry").status());
    assertEquals("DISABLED", service.credential(READER, stamp.id(), true).status());
  }

  @Test
  void accountErasureRemovesIdentityWalletAndPrivateClaimLinks() {
    service.claim(READER, issueId, "2026", "erase");
    UUID readerId = service.readerId(READER);
    new org.springframework.transaction.support.TransactionTemplate(
      new DataSourceTransactionManager(jdbcTemplate.getDataSource())
    ).execute((status) -> {
      new JdbcPassportErasure(jdbcTemplate).erase(readerId, NOW);
      return null;
    });
    assertEquals(
      0,
      jdbcTemplate.queryForObject(
        "SELECT count(*) FROM fan_passport_entitlement WHERE reader_id IS NOT NULL",
        Integer.class
      )
    );
    assertEquals(
      0,
      jdbcTemplate.queryForObject("SELECT count(*) FROM fan_passport_command", Integer.class)
    );
    assertEquals(
      1,
      jdbcTemplate.queryForObject(
        "SELECT count(*) FROM fan_passport_history WHERE reason='ACCOUNT_ERASURE'",
        Integer.class
      )
    );
  }

  @Test
  void withdrawnArticleSuppressesStampEvenWhileIssueRemainsPublished() {
    var stamp = service.claim(READER, issueId, "2026", "rights-claim");
    jdbcTemplate.update("UPDATE article SET state='WITHDRAWN' WHERE slug='passport-article'");
    assertEquals("REVOKED", service.list(READER).items().getFirst().status());
    assertEquals("DISABLED", service.credential(READER, stamp.id(), true).status());
  }

  @Test
  void supersedeRequiresNewSnapshotAndReverifiedRevisionAcknowledgement() {
    var stamp = service.claim(READER, issueId, "2026", "original");
    assertThrows(RuntimeException.class, () ->
      service.changeStatus(stamp.id(), "SUPERSEDED", "REPLACEMENT", 0)
    );
    UUID revisionId = publishReplacementRevision("passport-article");
    refreshSnapshot(issueId);
    assertThrows(RuntimeException.class, () ->
      service.changeStatus(stamp.id(), "SUPERSEDED", "REPLACEMENT", 0)
    );
    jdbcTemplate.update("UPDATE reading_progress SET revision_id=?", revisionId);
    assertEquals(
      "SUPERSEDED",
      service.changeStatus(stamp.id(), "SUPERSEDED", "REPLACEMENT", 0).status()
    );
    assertEquals(
      1,
      jdbcTemplate.queryForObject(
        "SELECT count(*) FROM fan_passport_stamp WHERE status='CLAIMED'",
        Integer.class
      )
    );
    assertEquals("CLAIMED", service.claim(READER, issueId, "2026", "after-replacement").status());
    assertEquals(
      2,
      jdbcTemplate.queryForObject("SELECT count(*) FROM fan_passport_stamp", Integer.class)
    );
  }

  @Test
  void expiryCannotBeForcedEarlyAndExpiredClaimCannotBeReissued() {
    var stamp = service.claim(READER, issueId, "2026", "expiring");
    assertThrows(RuntimeException.class, () ->
      service.changeStatus(stamp.id(), "EXPIRED", "EXPIRATION", 0)
    );
    var future = new FanPassportService(
      jdbcTemplate,
      new DataSourceTransactionManager(jdbcTemplate.getDataSource()),
      PassportTestClock.fixed(Instant.parse("2028-01-01T00:00:00Z"))
    );
    assertEquals("EXPIRED", future.claim(READER, issueId, "2026", "expired-retry").status());
  }

  @Test
  void archivedMediaSuppressesAnOtherwiseReadyStamp() {
    service.claim(READER, issueId, "2026", "before-archive");
    jdbcTemplate.update("UPDATE media_asset SET archived_at=?", Timestamp.from(NOW));
    assertEquals("REVOKED", service.list(READER).items().getFirst().status());
  }

  @Test
  void blockedRightsRecordDominatesAnotherValidRecordBeforeFirstClaim() {
    jdbcTemplate.update(
      """
      INSERT INTO rights_record(id,asset_id,rights_owner,license_name,allowed_channels,territories,
          valid_from,valid_until,credit,withdrawal_terms,status)
      SELECT uuidv7(),asset_id,rights_owner,license_name,allowed_channels,territories,
          valid_from,valid_until,credit,withdrawal_terms,'BLOCKED' FROM rights_record WHERE status='VALID'
      """
    );
    assertThrows(IllegalArgumentException.class, () ->
      service.claim(READER, issueId, "2026", "blocked-rights")
    );
    assertEquals(
      0,
      jdbcTemplate.queryForObject("SELECT count(*) FROM fan_passport_stamp", Integer.class)
    );
  }
}
