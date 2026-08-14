package tw.basketball.magazine.search.worker;

import java.time.Instant;
import java.util.UUID;

/** Testable projection seam used by the publication outbox transaction. */
public interface SearchProjection {
    void project(UUID articleId, UUID revisionId, Instant indexedAt);

    void withdraw(UUID articleId, UUID revisionId, Instant indexedAt);

    static SearchProjection noop() {
        return new SearchProjection() {
            @Override
            public void project(UUID articleId, UUID revisionId, Instant indexedAt) {
                // Tests that do not install V012 can keep exercising publication behavior.
            }

            @Override
            public void withdraw(UUID articleId, UUID revisionId, Instant indexedAt) {
                // Tests that do not install V012 can keep exercising publication behavior.
            }
        };
    }
}
