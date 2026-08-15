package tw.basketball.magazine.readerlibrary.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Pure deterministic policy used by preview and apply paths. */
public final class ProgressMergePolicy {
    private ProgressMergePolicy() {
    }

    public static Candidate newerValid(
            Candidate server,
            Candidate local,
            boolean localIsValid
    ) {
        if (!localIsValid) {
            return server;
        }
        if (server == null || local.updatedAt().isAfter(server.updatedAt())) {
            return local;
        }
        return server;
    }

    /** Revision-aware value compared only after the application validates its anchor. */
    public record Candidate(
            UUID articleId,
            UUID revisionId,
            UUID blockId,
            double percent,
            Instant updatedAt
    ) {
        public Candidate {
            articleId = Objects.requireNonNull(articleId, "articleId");
            revisionId = Objects.requireNonNull(revisionId, "revisionId");
            blockId = Objects.requireNonNull(blockId, "blockId");
            if (!Double.isFinite(percent) || percent < 0 || percent > 100) {
                throw new IllegalArgumentException("percent must be between 0 and 100");
            }
            updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        }
    }
}
