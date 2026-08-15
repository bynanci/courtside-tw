package tw.basketball.magazine.readerlibrary.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.readerlibrary.domain.ProgressMergePolicy.Candidate;

/** Deterministic property-style coverage for the pure US5 merge policy. */
final class ProgressMergePolicyTest {
    private static final UUID ARTICLE_ID = UUID.fromString(
            "0190f7b0-7c4b-7e3a-8f12-123456789abd"
    );
    private static final UUID REVISION_ID = UUID.fromString(
            "0190f7b0-7c4b-7e3a-8f12-123456789ab1"
    );
    private static final UUID BLOCK_ID = UUID.fromString(
            "00000000-0000-4000-8000-000000000002"
    );

    @Test
    void preservesTheNewerValidCandidateAcrossGeneratedCases() {
        Instant baseline = Instant.parse("2026-08-01T00:00:00Z");
        for (int index = 1; index <= 1_000; index++) {
            double serverPercent = index % 101;
            Candidate server = candidate(serverPercent, baseline.plusSeconds(index));
            Candidate local = candidate(100 - serverPercent, baseline.plusSeconds(
                    index + (index % 2 == 0 ? 1 : -1)
            ));

            Candidate selected = ProgressMergePolicy.newerValid(server, local, true);

            Candidate expected = local.updatedAt().isAfter(server.updatedAt()) ? local : server;
            assertSame(expected, selected);
        }
    }

    @Test
    void rejectsAnInvalidLocalCandidateAndTreatsEqualTimestampsAsServerWinning() {
        Instant timestamp = Instant.parse("2026-08-01T00:00:00Z");
        Candidate server = candidate(35, timestamp);
        Candidate local = candidate(72, timestamp);

        assertSame(server, ProgressMergePolicy.newerValid(server, local, false));
        assertSame(server, ProgressMergePolicy.newerValid(server, local, true));
        assertEquals(local, ProgressMergePolicy.newerValid(null, local, true));
    }

    private static Candidate candidate(double percent, Instant updatedAt) {
        return new Candidate(ARTICLE_ID, REVISION_ID, BLOCK_ID, percent, updatedAt);
    }
}
