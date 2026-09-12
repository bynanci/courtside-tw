package tw.basketball.magazine.fanpassport.domain;

import java.time.Instant;
import java.util.Set;

/** Monotonic entitlement lifecycle; revoked history can never be reclaimed. */
public final class StampLifecycle {

  private static final Set<String> STATES = Set.of(
    "CLAIMABLE",
    "CLAIMED",
    "REVOKED",
    "SUPERSEDED",
    "EXPIRED"
  );

  private StampLifecycle() {}

  public static String transition(String from, String to) {
    if (!STATES.contains(from) || !STATES.contains(to)) {
      throw new IllegalArgumentException("unknown stamp state");
    }
    if (from.equals(to)) {
      return to;
    }
    boolean active = from.equals("CLAIMABLE") || from.equals("CLAIMED");
    if (!active || to.equals("CLAIMABLE")) {
      throw new IllegalArgumentException("terminal stamp state");
    }
    return to;
  }

  public static String effective(String status, Instant expiresAt, Instant now) {
    if (!STATES.contains(status)) {
      throw new IllegalArgumentException("unknown stamp state");
    }
    return (status.equals("CLAIMABLE") || status.equals("CLAIMED")) && !now.isBefore(expiresAt)
      ? "EXPIRED"
      : status;
  }
}
