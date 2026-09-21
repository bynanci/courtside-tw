package tw.basketball.magazine.basketball.adapters;

import java.util.List;
import tw.basketball.magazine.basketball.ports.BasketballSourceAdapter;
import tw.basketball.magazine.evidence.Evidence;

/** Offline normalization port for OVERSEAS; performs no provider calls or canonical writes. */
public final class OverseasAdapter implements BasketballSourceAdapter {
    @Override
    public String provider() {
        return "OVERSEAS";
    }

    @Override
    public List<NormalizedClaim> normalize(Evidence.SourceSnapshot snapshot, List<SourceClaim> input) {
        return FixtureNormalization.normalize(provider(), snapshot, input);
    }
}
