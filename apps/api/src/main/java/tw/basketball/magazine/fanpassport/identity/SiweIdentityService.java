package tw.basketball.magazine.fanpassport.identity;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tw.basketball.magazine.fanpassport.application.FanPassportService;
import tw.basketball.magazine.fanpassport.domain.SiweMessage;
import tw.basketball.magazine.identity.application.AccountProblemException;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.shared.ApplicationClock;

/** OIDC-owned, explicit wallet link with domain binding and atomic single-use nonce consumption. */
public final class SiweIdentityService {

  private final JdbcOperations jdbc;
  private final TransactionTemplate transaction;
  private final FanPassportService passport;
  private final ApplicationClock clock;
  private final WalletSignatureVerifier verifier;
  private final String domain;
  private final String uri;
  private final String chain;
  private final SecureRandom random = new SecureRandom();
  private final ConcurrentHashMap<String, Challenge> responseCache = new ConcurrentHashMap<>();

  public SiweIdentityService(
    JdbcOperations jdbc,
    PlatformTransactionManager manager,
    FanPassportService passport,
    ApplicationClock clock,
    WalletSignatureVerifier verifier,
    String domain,
    String uri,
    String chain
  ) {
    this.jdbc = jdbc;
    transaction = new TransactionTemplate(manager);
    this.passport = passport;
    this.clock = clock;
    this.verifier = verifier;
    this.domain = domain;
    this.uri = uri;
    this.chain = chain;
  }

  public Challenge challenge(AuthenticatedReader reader, ChallengeRequest request, String key) {
    recent(reader);
    String address = SiweMessage.address(request.address());
    if (
      !domain.equals(request.domain()) ||
      !uri.equals(request.uri()) ||
      !chain.equals(request.chainId())
    ) {
      throw new IllegalArgumentException("SIWE origin or chain mismatch");
    }
    String keyDigest = FanPassportService.digestKey(key);
    String requestDigest = FanPassportService.digest(
      domain + "\u0000" + uri + "\u0000" + chain + "\u0000" + address
    );
    return transaction.execute((status) -> {
      UUID readerId = passport.readerId(reader);
      jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", readerId);
      responseCache
        .entrySet()
        .removeIf((entry) -> !clock.now().isBefore(entry.getValue().expiresAt()));
      jdbc.update("DELETE FROM siwe_challenge WHERE expires_at<=?", Timestamp.from(clock.now()));
      List<NonceRow> existing = jdbc.query(
        "SELECT * FROM siwe_challenge WHERE reader_id=? AND key_digest=?",
        (rs, n) ->
          new NonceRow(
            rs.getString("nonce_digest"),
            rs.getString("request_digest"),
            rs.getString("message_digest"),
            rs.getString("address"),
            rs.getObject("reader_id", UUID.class),
            rs.getTimestamp("issued_at").toInstant(),
            rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("consumed_at") != null
          ),
        readerId,
        keyDigest
      );
      if (!existing.isEmpty()) {
        NonceRow stored = existing.getFirst();
        Challenge cached = responseCache.get(stored.nonceDigest());
        if (!stored.requestDigest().equals(requestDigest) || stored.consumed() || cached == null) {
          throw AccountProblemException.conflict();
        }
        return cached;
      }
      if (responseCache.size() >= 1000) {
        throw AccountProblemException.forbidden(
          "challenge_capacity",
          "wallet challenge capacity exceeded"
        );
      }
      byte[] bytes = new byte[24];
      random.nextBytes(bytes);
      String nonce = HexFormat.of().formatHex(bytes);
      Instant now = clock.now();
      Instant expires = now.plusSeconds(300);
      String message = SiweMessage.create(domain, uri, chain, address, nonce, now, expires);
      String nonceDigest = FanPassportService.digest(nonce);
      jdbc.update(
        """
        INSERT INTO siwe_challenge(nonce_digest,reader_id,key_digest,request_digest,message_digest,
            address,chain_id,issued_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)
        """,
        nonceDigest,
        readerId,
        keyDigest,
        requestDigest,
        FanPassportService.digest(message),
        address,
        chain,
        Timestamp.from(now),
        Timestamp.from(expires)
      );
      Challenge challenge = new Challenge(nonce, message, expires, domain, chain);
      responseCache.put(nonceDigest, challenge);
      return challenge;
    });
  }

  public VerifyResult verify(AuthenticatedReader reader, VerifyRequest request, String key) {
    recent(reader);
    FanPassportService.digestKey(key);
    String nonceDigest = FanPassportService.digest(SiweMessage.nonce(request.message()));
    if (request.signature() == null || !request.signature().matches("0x[0-9a-fA-F]{130}")) {
      throw new IllegalArgumentException("invalid EOA signature");
    }
    return transaction.execute((status) -> {
      UUID readerId = passport.readerId(reader);
      jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", readerId);
      List<NonceRow> rows = jdbc.query(
        "SELECT * FROM siwe_challenge WHERE nonce_digest=? FOR UPDATE",
        (rs, n) ->
          new NonceRow(
            rs.getString("nonce_digest"),
            rs.getString("request_digest"),
            rs.getString("message_digest"),
            rs.getString("address"),
            rs.getObject("reader_id", UUID.class),
            rs.getTimestamp("issued_at").toInstant(),
            rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("consumed_at") != null
          ),
        nonceDigest
      );
      if (rows.isEmpty()) {
        throw AccountProblemException.conflict();
      }
      NonceRow nonce = rows.getFirst();
      if (
        nonce.consumed() ||
        !nonce.readerId().equals(readerId) ||
        !clock.now().isBefore(nonce.expiresAt()) ||
        clock.now().isBefore(nonce.issuedAt()) ||
        !nonce.messageDigest().equals(FanPassportService.digest(request.message()))
      ) {
        throw AccountProblemException.conflict();
      }
      if (!verifier.verify(request.message(), request.signature(), nonce.address())) {
        throw AccountProblemException.forbidden(
          "signature_invalid",
          "wallet signature verification failed"
        );
      }
      List<UUID> owners = jdbc.query(
        "SELECT reader_id FROM wallet_identity_link WHERE chain_namespace='eip155' AND address=?",
        (rs, n) -> rs.getObject(1, UUID.class),
        nonce.address()
      );
      if (!owners.isEmpty() && !owners.getFirst().equals(readerId)) {
        throw AccountProblemException.conflict();
      }
      jdbc.update(
        "UPDATE siwe_challenge SET consumed_at=? WHERE nonce_digest=? AND consumed_at IS NULL",
        Timestamp.from(clock.now()),
        nonceDigest
      );
      jdbc.update(
        "INSERT INTO wallet_identity_link(id,reader_id,chain_namespace,address,linked_at) VALUES(?,?,'eip155',?,?) ON CONFLICT(chain_namespace,address) DO NOTHING",
        UUID.randomUUID(),
        readerId,
        nonce.address(),
        Timestamp.from(clock.now())
      );
      // A concurrent link from another reader must fail, never report success for the wrong owner.
      UUID owner = jdbc.queryForObject(
        "SELECT reader_id FROM wallet_identity_link WHERE chain_namespace='eip155' AND address=?",
        UUID.class,
        nonce.address()
      );
      if (!readerId.equals(owner)) {
        throw AccountProblemException.conflict();
      }
      responseCache.remove(nonceDigest);
      return new VerifyResult(true, true, nonce.expiresAt());
    });
  }

  public void unlink(AuthenticatedReader reader, String namespace, String address, String key) {
    recent(reader);
    FanPassportService.digestKey(key);
    if (!"eip155".equals(namespace)) {
      throw new IllegalArgumentException("invalid chain namespace");
    }
    String normalized = SiweMessage.address(address);
    transaction.execute((status) -> {
      UUID id = passport.readerId(reader);
      jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", id);
      jdbc.update(
        "DELETE FROM wallet_identity_link WHERE reader_id=? AND chain_namespace=? AND address=?",
        id,
        namespace,
        normalized
      );
      jdbc.update("DELETE FROM siwe_challenge WHERE reader_id=? AND address=?", id, normalized);
      responseCache.entrySet().removeIf((entry) -> entry.getValue().message().contains(normalized));
      return null;
    });
  }

  private void recent(AuthenticatedReader reader) {
    if (!reader.wasRecentlyAuthenticated(clock.now(), Duration.ofMinutes(10))) {
      throw AccountProblemException.forbidden(
        "recent_authentication_required",
        "wallet linking requires recent OIDC authentication"
      );
    }
  }

  public record ChallengeRequest(String domain, String address, String chainId, String uri) { }

  public record VerifyRequest(String message, String signature) { }

  public record Challenge(
    String nonce,
    String message,
    Instant expiresAt,
    String domain,
    String chainId
  ) { }

  public record VerifyResult(boolean verified, boolean sessionLinked, Instant expiresAt) { }

  private record NonceRow(
    String nonceDigest,
    String requestDigest,
    String messageDigest,
    String address,
    UUID readerId,
    Instant issuedAt,
    Instant expiresAt,
    boolean consumed
  ) { }
}
