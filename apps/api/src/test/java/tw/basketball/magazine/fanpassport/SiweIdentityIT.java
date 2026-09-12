package tw.basketball.magazine.fanpassport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tw.basketball.magazine.fanpassport.application.FanPassportService;
import tw.basketball.magazine.fanpassport.identity.SiweIdentityService;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;

final class SiweIdentityIT extends PublicIssueApiIntegrationTestSupport {

  private static final Instant NOW = Instant.parse("2026-09-12T00:00:00Z");
  private static final String ADDRESS = "0x0000000000000000000000000000000000000001";

  @BeforeAll
  static void migrations() throws Exception {
    for (String name : List.of("V014__reader_library.sql", "V023__fan_passport_identity.sql")) {
      try (
        InputStream input = SiweIdentityIT.class.getResourceAsStream("/db/migration/" + name);
        var connection = jdbcTemplate.getDataSource().getConnection();
        var statement = connection.createStatement()
      ) {
        statement.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
  }

  @Test
  void nonceIsBoundToAccountExactMessageAndSingleUseThenUnlinkDeletesPrivateLink() {
    var manager = new DataSourceTransactionManager(jdbcTemplate.getDataSource());
    var passport = new FanPassportService(jdbcTemplate, manager, PassportTestClock.fixed(NOW));
    // Signature cryptography has a separate real EOA test; this injects a valid cryptographic result.
    var service = new SiweIdentityService(
      jdbcTemplate,
      manager,
      passport,
      PassportTestClock.fixed(NOW),
      (message, signature, address) -> true,
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1"
    );
    var reader = new AuthenticatedReader("https://issuer.example.test", "reader-1", NOW);
    var other = new AuthenticatedReader("https://issuer.example.test", "reader-2", NOW);
    var input = new SiweIdentityService.ChallengeRequest(
      "courtside.tw",
      ADDRESS,
      "eip155:1",
      "https://courtside.tw"
    );
    var challenge = service.challenge(reader, input, "challenge-1");
    assertEquals(challenge, service.challenge(reader, input, "challenge-1"));
    var proof = new SiweIdentityService.VerifyRequest(challenge.message(), "0x" + "11".repeat(65));
    assertThrows(RuntimeException.class, () -> service.verify(other, proof, "verify-other"));
    assertThrows(RuntimeException.class, () ->
      service.verify(
        reader,
        new SiweIdentityService.VerifyRequest(
          challenge.message().replace("Chain ID: 1", "Chain ID: 2"),
          proof.signature()
        ),
        "wrong-chain"
      )
    );
    assertEquals(true, service.verify(reader, proof, "verify-1").sessionLinked());
    assertThrows(RuntimeException.class, () -> service.verify(reader, proof, "replay"));
    service.unlink(reader, "eip155", ADDRESS, "unlink");
    assertEquals(
      0,
      jdbcTemplate.queryForObject("SELECT count(*) FROM wallet_identity_link", Integer.class)
    );
  }

  @Test
  void expiredAuthenticationOrWrongOriginCannotObtainChallenge() {
    var manager = new DataSourceTransactionManager(jdbcTemplate.getDataSource());
    var service = new SiweIdentityService(
      jdbcTemplate,
      manager,
      new FanPassportService(jdbcTemplate, manager, PassportTestClock.fixed(NOW)),
      PassportTestClock.fixed(NOW),
      (message, signature, address) -> false,
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1"
    );
    var old = new AuthenticatedReader("https://issuer.example.test", "old", NOW.minusSeconds(601));
    assertThrows(RuntimeException.class, () ->
      service.challenge(
        old,
        new SiweIdentityService.ChallengeRequest(
          "courtside.tw",
          ADDRESS,
          "eip155:1",
          "https://courtside.tw"
        ),
        "old"
      )
    );
    var reader = new AuthenticatedReader("https://issuer.example.test", "new", NOW);
    assertThrows(RuntimeException.class, () ->
      service.challenge(
        reader,
        new SiweIdentityService.ChallengeRequest(
          "evil.test",
          ADDRESS,
          "eip155:1",
          "https://evil.test"
        ),
        "phishing"
      )
    );
  }

  @Test
  void concurrentVerificationConsumesTheNonceExactlyOnce() throws Exception {
    var manager = new DataSourceTransactionManager(jdbcTemplate.getDataSource());
    var passport = new FanPassportService(jdbcTemplate, manager, PassportTestClock.fixed(NOW));
    var service = new SiweIdentityService(
      jdbcTemplate,
      manager,
      passport,
      PassportTestClock.fixed(NOW),
      (message, signature, address) -> true,
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1"
    );
    var reader = new AuthenticatedReader("https://issuer.example.test", "reader-concurrent", NOW);
    var challenge = service.challenge(
      reader,
      new SiweIdentityService.ChallengeRequest(
        "courtside.tw",
        ADDRESS,
        "eip155:1",
        "https://courtside.tw"
      ),
      "concurrent"
    );
    var proof = new SiweIdentityService.VerifyRequest(challenge.message(), "0x" + "11".repeat(65));
    var ready = new java.util.concurrent.CountDownLatch(2);
    var start = new java.util.concurrent.CountDownLatch(1);
    try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      java.util.concurrent.Callable<Boolean> verify = () -> {
        ready.countDown();
        start.await();
        try {
          return service.verify(reader, proof, "same-proof").sessionLinked();
        } catch (tw.basketball.magazine.identity.application.AccountProblemException replay) {
          return false;
        }
      };
      var first = executor.submit(verify);
      var second = executor.submit(verify);
      boolean workersReady = ready.await(10, java.util.concurrent.TimeUnit.SECONDS);
      start.countDown();
      org.junit.jupiter.api.Assertions.assertTrue(workersReady);
      assertEquals(
        1,
        (first.get(15, java.util.concurrent.TimeUnit.SECONDS) ? 1 : 0) +
          (second.get(15, java.util.concurrent.TimeUnit.SECONDS) ? 1 : 0)
      );
    }
    service.unlink(reader, "eip155", ADDRESS, "cleanup");
  }

  @Test
  void nonceExpiryAndUnlinkInvalidateOutstandingProofWithoutRemovingOidcIdentity() {
    var now = new java.util.concurrent.atomic.AtomicReference<>(NOW);
    var manager = new DataSourceTransactionManager(jdbcTemplate.getDataSource());
    var passport = new FanPassportService(jdbcTemplate, manager, PassportTestClock.following(now));
    var service = new SiweIdentityService(
      jdbcTemplate,
      manager,
      passport,
      PassportTestClock.following(now),
      (message, signature, address) -> true,
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1"
    );
    var reader = new AuthenticatedReader("https://issuer.example.test", "reader-expiration", NOW);
    var input = new SiweIdentityService.ChallengeRequest(
      "courtside.tw",
      ADDRESS,
      "eip155:1",
      "https://courtside.tw"
    );
    var expiring = service.challenge(reader, input, "ttl");
    now.set(NOW.plusSeconds(301));
    assertThrows(tw.basketball.magazine.identity.application.AccountProblemException.class, () ->
      service.verify(
        reader,
        new SiweIdentityService.VerifyRequest(expiring.message(), "0x" + "11".repeat(65)),
        "expired"
      )
    );
    var pending = service.challenge(reader, input, "pending");
    service.unlink(reader, "eip155", ADDRESS, "unlink-pending");
    assertThrows(tw.basketball.magazine.identity.application.AccountProblemException.class, () ->
      service.verify(
        reader,
        new SiweIdentityService.VerifyRequest(pending.message(), "0x" + "11".repeat(65)),
        "after-unlink"
      )
    );
    assertEquals(
      1,
      jdbcTemplate.queryForObject(
        "SELECT count(*) FROM reader_profile WHERE issuer=? AND subject=?",
        Integer.class,
        reader.issuer(),
        reader.subject()
      )
    );
    var beforeErasure = service.challenge(reader, input, "before-erasure");
    new org.springframework.transaction.support.TransactionTemplate(manager).execute((status) -> {
      new tw.basketball.magazine.fanpassport.persistence.JdbcPassportErasure(jdbcTemplate).erase(
        passport.readerId(reader),
        now.get()
      );
      return null;
    });
    assertThrows(tw.basketball.magazine.identity.application.AccountProblemException.class, () ->
      service.verify(
        reader,
        new SiweIdentityService.VerifyRequest(beforeErasure.message(), "0x" + "11".repeat(65)),
        "after-erasure"
      )
    );
  }
}
