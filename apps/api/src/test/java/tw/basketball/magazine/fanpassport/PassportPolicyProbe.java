package tw.basketball.magazine.fanpassport;

import java.time.Instant;
import tw.basketball.magazine.fanpassport.domain.CredentialPolicy;
import tw.basketball.magazine.fanpassport.domain.SiweMessage;
import tw.basketball.magazine.fanpassport.domain.StampLifecycle;

/** Dependency-free executable probe; JUnit invokes the same behavioral checks. */
public final class PassportPolicyProbe {

  private PassportPolicyProbe() { }

  public static void main(String[] args) {
    Instant now = Instant.parse("2026-09-12T00:00:00Z");
    check(StampLifecycle.transition("CLAIMABLE", "CLAIMED").equals("CLAIMED"));
    check(StampLifecycle.transition("CLAIMED", "REVOKED").equals("REVOKED"));
    rejected(() -> StampLifecycle.transition("REVOKED", "CLAIMED"));
    rejected(() -> StampLifecycle.transition("SUPERSEDED", "CLAIMED"));
    check(StampLifecycle.effective("CLAIMED", now, now).equals("EXPIRED"));
    check(!CredentialPolicy.mayDeliver(false, true, true, true, 0, 0));
    check(!CredentialPolicy.mayDeliver(true, false, true, true, 0, 0));
    check(!CredentialPolicy.mayDeliver(true, true, false, true, 0, 0));
    check(!CredentialPolicy.mayDeliver(true, true, true, false, 0, 0));
    check(!CredentialPolicy.mayDeliver(true, true, true, true, 0, 1));
    check(CredentialPolicy.mayDeliver(true, true, true, true, 1, 1));
    String message = SiweMessage.create(
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1",
      "0x0000000000000000000000000000000000000001",
      "ab12".repeat(8),
      now,
      now.plusSeconds(300)
    );
    check(SiweMessage.nonce(message).equals("ab12".repeat(8)));
    check(message.contains("Version: 1\nChain ID: 1"));
    rejected(() ->
      SiweMessage.create(
        "evil.test",
        "https://courtside.tw",
        "eip155:1",
        "0x0000000000000000000000000000000000000001",
        "ab12".repeat(8),
        now,
        now.plusSeconds(300)
      )
    );
    rejected(() -> SiweMessage.nonce(message + "\nNonce: duplicate"));
    rejected(() ->
      SiweMessage.create(
        "courtside.tw",
        "https://courtside.tw",
        "eip155:0",
        "0x0000000000000000000000000000000000000001",
        "ab12".repeat(8),
        now,
        now.plusSeconds(300)
      )
    );
    System.out.println("Passport policy: 16 behavioral assertions passed");
  }

  private static void check(boolean value) {
    if (!value) {
      throw new AssertionError("passport policy violation");
    }
  }

  private static void rejected(Runnable action) {
    try {
      action.run();
    } catch (IllegalArgumentException expected) {
      return;
    }
    throw new AssertionError("invalid transition or challenge accepted");
  }
}
