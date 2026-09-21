package tw.basketball.magazine.basketball.domain;

import org.junit.jupiter.api.Test;

final class BasketballDomainTest {
    @Test
    void appendOnlyHistoryAndTemporalDomainInvariants() {
        BasketballCoreProof.main(new String[0]);
        BasketballDomainProof.main(new String[0]);
    }
}
