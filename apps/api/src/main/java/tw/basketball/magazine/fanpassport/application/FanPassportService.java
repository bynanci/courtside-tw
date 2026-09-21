package tw.basketball.magazine.fanpassport.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tw.basketball.magazine.fanpassport.domain.StampLifecycle;
import tw.basketball.magazine.fanpassport.persistence.JdbcPassportEligibility;
import tw.basketball.magazine.fanpassport.ports.CredentialAdapter;
import tw.basketball.magazine.identity.application.AccountProblemException;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.shared.ApplicationClock;

/** Off-chain-only reader entitlements. No adapter is invoked by the public reading path. */
public final class FanPassportService {

  private static final String SELECT_STAMP = """
  SELECT s.*, e.reader_id, e.issue_id, e.season FROM fan_passport_stamp s
  JOIN fan_passport_entitlement e ON e.id=s.entitlement_id
  """;
  private final JdbcOperations jdbc;
  private final TransactionTemplate transaction;
  private final ApplicationClock clock;
  private final JdbcPassportEligibility eligibility;

  public FanPassportService(
    JdbcOperations jdbc,
    PlatformTransactionManager manager,
    ApplicationClock clock
  ) {
    this.jdbc = jdbc;
    transaction = new TransactionTemplate(manager);
    this.clock = clock;
    eligibility = new JdbcPassportEligibility(jdbc);
  }

  public UUID readerId(AuthenticatedReader reader) {
    jdbc.update(
      "INSERT INTO reader_profile(id,issuer,subject) VALUES(?,?,?) ON CONFLICT(issuer,subject) DO NOTHING",
      UUID.randomUUID(),
      reader.issuer(),
      reader.subject()
    );
    return jdbc.queryForObject(
      "SELECT id FROM reader_profile WHERE issuer=? AND subject=?",
      UUID.class,
      reader.issuer(),
      reader.subject()
    );
  }

  public PassportView list(AuthenticatedReader reader) {
    return transaction.execute((status) -> {
      UUID readerId = lockedReader(reader);
      List<StampRow> rows = jdbc.query(
        SELECT_STAMP + " WHERE e.reader_id=? ORDER BY s.issued_at DESC, s.id LIMIT 500",
        FanPassportService::row,
        readerId
      );
      List<StampView> items = rows.stream().map(this::refresh).map(StampRow::view).toList();
      List<WalletView> wallets = jdbc.query(
        "SELECT chain_namespace,address,linked_at FROM wallet_identity_link WHERE reader_id=? ORDER BY linked_at",
        (rs, n) -> new WalletView(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant()),
        readerId
      );
      return new PassportView(items, wallets);
    });
  }

  public StampView claim(AuthenticatedReader reader, UUID issueId, String season, String key) {
    if (issueId == null || season == null || !season.matches("[0-9]{4}")) {
      throw new IllegalArgumentException("invalid claim");
    }
    String keyDigest = digestKey(key);
    String requestDigest = digest("CLAIM\u0000" + issueId + "\u0000" + season);
    return transaction.execute((status) -> {
      UUID readerId = lockedReader(reader);
      List<Command> commands = jdbc.query(
        "SELECT request_digest,stamp_id FROM fan_passport_command WHERE reader_id=? AND key_digest=?",
        (rs, n) -> new Command(rs.getString(1), rs.getObject(2, UUID.class)),
        readerId,
        keyDigest
      );
      if (!commands.isEmpty()) {
        Command command = commands.getFirst();
        if (!command.requestDigest().equals(requestDigest)) {
          throw AccountProblemException.conflict();
        }
        return refresh(find(command.stampId())).view();
      }
      List<UUID> entitlements = jdbc.query(
        "SELECT id FROM fan_passport_entitlement WHERE reader_id=? AND issue_id=? AND season=? AND condition_code='ISSUE_PROGRESS_ACK_V1'",
        (rs, n) -> rs.getObject(1, UUID.class),
        readerId,
        issueId,
        season
      );
      StampRow stamp;
      if (entitlements.isEmpty()) {
        UUID snapshot = eligibility.verify(readerId, issueId, season, clock.now());
        UUID entitlement = UUID.randomUUID();
        jdbc.update(
          "INSERT INTO fan_passport_entitlement(id,reader_id,issue_id,season,condition_code) VALUES(?,?,?,?,'ISSUE_PROGRESS_ACK_V1')",
          entitlement,
          readerId,
          issueId,
          season
        );
        UUID stampId = UUID.randomUUID();
        Instant expiry = LocalDate.of(Integer.parseInt(season) + 2, 1, 1)
          .atStartOfDay(ZoneOffset.UTC)
          .toInstant();
        if (!expiry.isAfter(clock.now())) {
          throw new IllegalArgumentException("season has expired");
        }
        jdbc.update(
          "INSERT INTO fan_passport_stamp(id,entitlement_id,snapshot_id,status,issued_at,expires_at) VALUES(?,?,?,'CLAIMABLE',?,?)",
          stampId,
          entitlement,
          snapshot,
          Timestamp.from(clock.now()),
          Timestamp.from(expiry)
        );
        history(stampId, "CLAIMABLE", "ELIGIBILITY_ACKNOWLEDGED", "READER");
        jdbc.update("UPDATE fan_passport_stamp SET status='CLAIMED' WHERE id=?", stampId);
        history(stampId, "CLAIMED", "ELIGIBILITY_ACKNOWLEDGED", "READER");
        stamp = find(stampId);
      } else {
        stamp = refresh(
          jdbc
            .query(
              SELECT_STAMP +
                " WHERE e.id=? ORDER BY (s.superseded_by IS NULL) DESC, s.issued_at DESC, s.id DESC LIMIT 1",
              FanPassportService::row,
              entitlements.getFirst()
            )
            .getFirst()
        );
      }
      jdbc.update(
        "INSERT INTO fan_passport_command(reader_id,key_digest,request_digest,stamp_id) VALUES(?,?,?,?)",
        readerId,
        keyDigest,
        requestDigest,
        stamp.id()
      );
      return stamp.view();
    });
  }

  public StampView changeStatus(UUID stampId, String next, String reason, long expectedVersion) {
    if (
      !List.of("REVOKED", "SUPERSEDED", "EXPIRED").contains(next) ||
      !List.of("OWNER_REVOCATION", "RIGHTS_WITHDRAWAL", "REPLACEMENT", "EXPIRATION").contains(
        reason
      )
    ) {
      throw new IllegalArgumentException("invalid lifecycle command");
    }
    return transaction.execute((status) -> {
      StampRow current = find(stampId);
      // Always lock reader first, then stamp; same order as claims, wallet links and erasure.
      if (current.readerId() == null) {
        throw AccountProblemException.conflict();
      }
      jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", current.readerId());
      current = find(stampId);
      if (current.version() != expectedVersion) {
        throw AccountProblemException.conflict();
      }
      StampLifecycle.transition(current.status(), next);
      if (next.equals("EXPIRED") && clock.now().isBefore(current.expiresAt())) {
        throw new IllegalArgumentException("stamp has not expired");
      }
      UUID replacement = null;
      UUID snapshot = null;
      if (next.equals("SUPERSEDED")) {
        snapshot = eligibility.verify(
          current.readerId(),
          current.issueId(),
          current.season(),
          clock.now()
        );
        if (snapshot.equals(current.snapshotId())) {
          throw new IllegalArgumentException("replacement requires a new immutable snapshot");
        }
        replacement = UUID.randomUUID();
      }
      jdbc.update(
        "UPDATE fan_passport_stamp SET status=?,superseded_by=?,version=version+1 WHERE id=?",
        next,
        replacement,
        stampId
      );
      history(stampId, next, reason, "PUBLISHER");
      if (replacement != null) {
        jdbc.update(
          "INSERT INTO fan_passport_stamp(id,entitlement_id,snapshot_id,status,issued_at,expires_at) VALUES(?,?,?,'CLAIMED',?,?)",
          replacement,
          current.entitlementId(),
          snapshot,
          Timestamp.from(clock.now()),
          Timestamp.from(current.expiresAt())
        );
        history(replacement, "CLAIMED", "REPLACEMENT", "PUBLISHER");
      }
      return find(stampId).view();
    });
  }

  public CredentialAdapter.DeliveryResult credential(
    AuthenticatedReader reader,
    UUID stampId,
    boolean consent
  ) {
    if (!consent) {
      throw new IllegalArgumentException("explicit delivery consent is required");
    }
    return transaction.execute((status) -> {
      UUID readerId = lockedReader(reader);
      StampRow stamp = find(stampId);
      if (!readerId.equals(stamp.readerId())) {
        throw AccountProblemException.forbidden(
          "stamp_owner_required",
          "stamp belongs to another account"
        );
      }
      stamp = refresh(stamp);
      // No operational record, provider, signer or gas budget is configured. Never enqueue a write.
      return new DisabledCredentialAdapter().deliver(
        new CredentialAdapter.MinimalCredential(stamp.id(), stamp.season(), "READER_STAMP"),
        new CredentialAdapter.DeliveryPolicy(
          false,
          consent,
          "CLAIMED".equals(stamp.status()),
          eligibility.rightsAvailable(stamp.snapshotId(), stamp.issueId(), clock.now()),
          false,
          0,
          0
        )
      );
    });
  }

  private UUID lockedReader(AuthenticatedReader reader) {
    UUID id = readerId(reader);
    jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", id);
    return id;
  }

  private StampRow find(UUID id) {
    List<StampRow> rows = jdbc.query(SELECT_STAMP + " WHERE s.id=?", FanPassportService::row, id);
    if (rows.isEmpty()) {
      throw new IllegalArgumentException("stamp is unavailable");
    }
    return rows.getFirst();
  }

  private StampRow refresh(StampRow row) {
    String status = StampLifecycle.effective(row.status(), row.expiresAt(), clock.now());
    if (
      List.of("CLAIMABLE", "CLAIMED").contains(status) &&
      !eligibility.rightsAvailable(row.snapshotId(), row.issueId(), clock.now())
    ) {
      status = "REVOKED";
    }
    if (!status.equals(row.status())) {
      jdbc.update(
        "UPDATE fan_passport_stamp SET status=?,version=version+1 WHERE id=?",
        status,
        row.id()
      );
      history(
        row.id(),
        status,
        status.equals("EXPIRED") ? "EXPIRATION" : "RIGHTS_WITHDRAWAL",
        "SYSTEM"
      );
      return find(row.id());
    }
    return row;
  }

  private void history(UUID id, String status, String reason, String actor) {
    jdbc.update(
      "INSERT INTO fan_passport_history(id,stamp_id,status,reason,actor_type,effective_at) VALUES(?,?,?,?,?,?)",
      UUID.randomUUID(),
      id,
      status,
      reason,
      actor,
      Timestamp.from(clock.now())
    );
  }

  public static String digestKey(String key) {
    if (
      key == null ||
      key.isBlank() ||
      key.length() > 200 ||
      key.codePoints().anyMatch(Character::isISOControl)
    ) {
      throw new IllegalArgumentException("bounded idempotency key is required");
    }
    return digest(key);
  }

  public static String digest(String value) {
    try {
      return HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
      );
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 unavailable", exception);
    }
  }

  private static StampRow row(ResultSet rs, int number) throws SQLException {
    return new StampRow(
      rs.getObject("id", UUID.class),
      rs.getObject("entitlement_id", UUID.class),
      rs.getObject("reader_id", UUID.class),
      rs.getObject("issue_id", UUID.class),
      rs.getObject("snapshot_id", UUID.class),
      rs.getString("season"),
      rs.getString("status"),
      rs.getTimestamp("issued_at").toInstant(),
      rs.getTimestamp("expires_at").toInstant(),
      rs.getLong("version")
    );
  }

  private record Command(String requestDigest, UUID stampId) { }

  private record StampRow(
    UUID id,
    UUID entitlementId,
    UUID readerId,
    UUID issueId,
    UUID snapshotId,
    String season,
    String status,
    Instant issuedAt,
    Instant expiresAt,
    long version
  ) {
    StampView view() {
      return new StampView(id, season, "READER_STAMP", status, issuedAt, expiresAt, version);
    }
  }

  public record StampView(
    UUID id,
    String season,
    String credentialType,
    String status,
    Instant issuedAt,
    Instant expiresAt,
    long version
  ) { }

  public record WalletView(String chainNamespace, String address, Instant linkedAt) { }

  public record PassportView(List<StampView> items, List<WalletView> wallets) {
    public PassportView {
      items = List.copyOf(items);
      wallets = List.copyOf(wallets);
    }
  }
}
