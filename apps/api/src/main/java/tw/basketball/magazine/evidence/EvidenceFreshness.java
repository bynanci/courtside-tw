package tw.basketball.magazine.evidence;

import java.time.Instant;
import java.util.Objects;

/** Source condition never upgrades the separate claim-status field. */
public final class EvidenceFreshness {
    private EvidenceFreshness() {
    }

    public static String at(Instant checkedAt, Instant staleAt, Instant expiresAt, boolean disputed) {
        Objects.requireNonNull(checkedAt, "checkedAt");
        Objects.requireNonNull(staleAt, "staleAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if (expiresAt.isBefore(staleAt)) {
            throw new IllegalArgumentException("expiry must not precede stale boundary");
        }
        if (disputed) {
            return "disputed";
        }
        if (!checkedAt.isBefore(expiresAt)) {
            return "expired";
        }
        if (!checkedAt.isBefore(staleAt)) {
            return "stale";
        }
        return "fresh";
    }
}
