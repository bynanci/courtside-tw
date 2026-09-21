package tw.basketball.magazine.basketball.adapters;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import tw.basketball.magazine.basketball.ports.BasketballSourceAdapter;
import tw.basketball.magazine.evidence.Evidence;

/** Shared deterministic normalizer. Provider-specific extraction remains outside this offline boundary. */
final class FixtureNormalization {
    private FixtureNormalization() {
    }

    static List<BasketballSourceAdapter.NormalizedClaim> normalize(String provider, Evidence.SourceSnapshot snapshot,
                                                                  List<BasketballSourceAdapter.SourceClaim> input) {
        return List.copyOf(input).stream().map(claim -> {
            String identity = provider + ":" + snapshot.id() + ":" + claim.externalKey() + ":"
                    + claim.stableEntityId() + ":" + claim.field() + ":" + Evidence.digest(claim.value());
            UUID id = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8));
            return new BasketballSourceAdapter.NormalizedClaim(id, claim.stableEntityId() + "." + claim.field(),
                    claim.value(), claim.status(), snapshot.id(), claim.evidenceIds());
        }).toList();
    }
}
