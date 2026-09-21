package tw.basketball.magazine.basketball.domain;

import java.util.List;
import java.util.UUID;

/** Dependency-free executable proof; the JUnit wrapper also runs this in normal CI. */
public final class BasketballCoreProof {
    private BasketballCoreProof() {
    }

    public static void main(String[] args) {
        TemporalHistory<String> history = new TemporalHistory<>();
        UUID id = UUID.fromString("00000000-0000-4000-8000-000000000001");
        history.append(id, "synthetic former team");
        history.append(UUID.fromString("00000000-0000-4000-8000-000000000002"), "synthetic new team");
        if (!history.values().equals(List.of("synthetic former team", "synthetic new team"))) {
            throw new AssertionError("career append must preserve both historical relationships");
        }
        history.append(id, "synthetic former team");
        if (history.values().size() != 2) {
            throw new AssertionError("same immutable record retry must be idempotent");
        }
        try {
            history.append(id, "silently replaced value");
            throw new AssertionError("reusing an identity must not overwrite history");
        } catch (IllegalStateException expected) {
            // An immutable identity cannot be reassigned to another value.
        }
        System.out.println("PASS append-only history, retry idempotency, overwrite rejection");
    }
}
