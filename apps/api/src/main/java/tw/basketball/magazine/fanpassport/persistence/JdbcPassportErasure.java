package tw.basketball.magazine.fanpassport.persistence;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcOperations;
import tw.basketball.magazine.identity.application.AccountLifecycleParticipant;

/** Runs inside account erasure: removes identity links, preserves only unidentifiable lifecycle history. */
public final class JdbcPassportErasure implements AccountLifecycleParticipant {

  private final JdbcOperations jdbc;

  public JdbcPassportErasure(JdbcOperations jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public void erase(UUID readerId, Instant now) {
    jdbc.queryForList("SELECT id FROM reader_profile WHERE id=? FOR UPDATE", readerId);
    jdbc.update(
      """
      INSERT INTO fan_passport_history(id, stamp_id, status, reason, actor_type, effective_at)
      SELECT uuidv7(), s.id, 'REVOKED', 'ACCOUNT_ERASURE', 'SYSTEM', ?
      FROM fan_passport_stamp s JOIN fan_passport_entitlement e ON e.id=s.entitlement_id
      WHERE e.reader_id=? AND s.status IN ('CLAIMABLE','CLAIMED')
      """,
      Timestamp.from(now),
      readerId
    );
    jdbc.update(
      """
      UPDATE fan_passport_stamp SET status=CASE WHEN status IN ('CLAIMABLE','CLAIMED')
          THEN 'REVOKED' ELSE status END, snapshot_id=NULL, version=version+1
      WHERE entitlement_id IN (SELECT id FROM fan_passport_entitlement WHERE reader_id=?)
      """,
      readerId
    );
    jdbc.update("DELETE FROM fan_passport_command WHERE reader_id=?", readerId);
    jdbc.update("DELETE FROM wallet_identity_link WHERE reader_id=?", readerId);
    jdbc.update("DELETE FROM siwe_challenge WHERE reader_id=?", readerId);
    jdbc.update(
      "UPDATE fan_passport_entitlement SET reader_id=NULL, issue_id=NULL, erased_at=? WHERE reader_id=?",
      Timestamp.from(now),
      readerId
    );
  }
}
