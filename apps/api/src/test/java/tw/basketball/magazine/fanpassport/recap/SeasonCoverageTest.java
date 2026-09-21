package tw.basketball.magazine.fanpassport.recap;

import org.junit.jupiter.api.Test;

final class SeasonCoverageTest {
    @Test
    void derivesOnlyElapsedCanonicalCoverage() {
        SeasonCoverageProof.verify();
    }
}
