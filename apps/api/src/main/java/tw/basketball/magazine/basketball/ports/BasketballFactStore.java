package tw.basketball.magazine.basketball.ports;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/** Durable append-only catalog ledger. Validation and append execute under the same transaction lock. */
public interface BasketballFactStore {
    List<Fact> history();
    <T> T transact(Function<Session, T> work);

    interface Session {
        List<Fact> history();
        void append(Fact fact);
    }

    record Fact(UUID id, UUID ownerId, String kind, String identityKind, LocalDate validFrom,
                LocalDate validTo, String payload, List<UUID> evidenceIds) {
        public Fact {
            java.util.Objects.requireNonNull(id, "id");
            java.util.Objects.requireNonNull(ownerId, "ownerId");
            java.util.Objects.requireNonNull(kind, "kind");
            java.util.Objects.requireNonNull(payload, "payload");
            evidenceIds = List.copyOf(evidenceIds);
            if (evidenceIds.isEmpty()) {
                throw new IllegalArgumentException("fact must carry evidence");
            }
            if (identityKind != null && !id.equals(ownerId)) {
                throw new IllegalArgumentException("new identity fact must own itself");
            }
            if (validFrom == null && (!"COMPETITION".equals(kind) || validTo != null)) {
                throw new IllegalArgumentException("temporal facts require an explicit start date");
            }
        }
    }
}
