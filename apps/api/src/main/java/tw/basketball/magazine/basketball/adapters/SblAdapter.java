package tw.basketball.magazine.basketball.adapters;

import java.util.List;
import tw.basketball.magazine.basketball.ports.BasketballSourceAdapter;
import tw.basketball.magazine.evidence.Evidence;

/** Offline normalization port for SBL; performs no provider calls or canonical writes. */
public final class SblAdapter implements BasketballSourceAdapter {
    @Override
    public String provider() {
        return "SBL";
    }

    @Override
    public List<NormalizedClaim> normalize(Evidence.SourceSnapshot snapshot, List<SourceClaim> input) {
        return FixtureNormalization.normalize(provider(), snapshot, input);
    }
}
