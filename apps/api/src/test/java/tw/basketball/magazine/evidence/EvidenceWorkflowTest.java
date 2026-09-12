package tw.basketball.magazine.evidence;

import org.junit.jupiter.api.Test;

final class EvidenceWorkflowTest {
    @Test
    void freshnessConflictReviewAndAdapterInvariants() {
        EvidenceCoreProof.main(new String[0]);
        EvidenceWorkflowProof.main(new String[0]);
    }
}
