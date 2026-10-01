package tw.basketball.magazine.evidence;

import java.time.Instant;

/** Dependency-free executable proof; the JUnit wrapper also runs this in normal CI. */
public final class EvidenceCoreProof {
    private EvidenceCoreProof() {
    }

    public static void main(String[] args) {
        Instant stale = Instant.parse("2026-01-02T00:00:00Z");
        Instant expires = Instant.parse("2026-01-03T00:00:00Z");
        if (!"expired".equals(EvidenceFreshness.at(expires, stale, expires, false))) {
            throw new AssertionError("expired source must not remain fresh at its expiry boundary");
        }
        if (!"stale".equals(EvidenceFreshness.at(stale, stale, expires, false))) {
            throw new AssertionError("stale source must carry as-of context at its stale boundary");
        }
        if (!"disputed".equals(EvidenceFreshness.at(stale, stale, expires, true))) {
            throw new AssertionError("unresolved contradiction takes precedence over freshness");
        }
        System.out.println("PASS exact stale/expiry boundaries and contradiction precedence");
    }
}
