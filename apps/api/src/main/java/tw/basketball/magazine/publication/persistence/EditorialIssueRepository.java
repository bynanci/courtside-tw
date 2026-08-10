package tw.basketball.magazine.publication.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import tw.basketball.magazine.publication.domain.PublicationState;
import tools.jackson.databind.JsonNode;

/** Persistence boundary for issue draft CRUD and explicit optimistic locks. */
public interface EditorialIssueRepository {
    IssueRecord insertDraft(String title, String slug, String summary, UUID coverAssetId);

    Optional<IssueRecord> find(UUID issueId);

    Optional<IssueRecord> findForUpdate(UUID issueId);

    default IssuePage list(String cursor, int limit) {
        if (cursor != null) {
            throw new IllegalArgumentException("cursor pagination is not supported by this adapter");
        }
        return new IssuePage(list(limit), null, limit);
    }

    default List<IssueRecord> list(int limit) {
        return list(null, limit).items();
    }

    List<SectionRecord> listSections(UUID issueId);

    void shiftSectionsForInsert(UUID issueId, int position, int offset);

    SectionRecord insertSection(UUID issueId, String title, int position);

    boolean updateSectionTitle(UUID issueId, UUID sectionId, String title);

    int countArticles(UUID issueId, UUID sectionId);

    boolean deleteSection(UUID issueId, UUID sectionId);

    void applySectionPositions(UUID issueId, List<SectionPosition> positions, int offset);

    boolean bumpIssueVersion(UUID issueId, long expectedVersion);

    boolean updateDraft(
            UUID issueId,
            long expectedVersion,
            String title,
            String slug,
            String summary,
            UUID coverAssetId
    );

    boolean transition(
            UUID issueId,
            long expectedVersion,
            PublicationState currentState,
            PublicationState nextState,
            Instant publishedAt
    );

    boolean readyForPublication(UUID issueId, Instant checkedAt);

    void appendReview(
            UUID issueId,
            String reviewerSubject,
            String reviewerRole,
            String decision,
            String reason
    );

    String publicationSnapshotDocument(UUID issueId);

    long nextSnapshotVersion(UUID issueId);

    void appendPublicationSnapshot(
            UUID issueId,
            long snapshotVersion,
            JsonNode content,
            String checksumSha256,
            String createdBy,
            UUID coverAssetId
    );

    boolean hasPublicationSnapshot(UUID issueId);

    void insertPublicationJob(
            UUID issueId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String timezone
    );

    Optional<PublicationJobRecord> findPublicationJob(
            String requestedBy,
            String operation,
            String idempotencyKey
    );

    void markPublicationJobSucceeded(UUID jobId, Instant processedAt);

    void markPublicationJobBlocked(UUID jobId, String reason, Instant processedAt);

    Optional<EditorialArticleRepository.IdempotencyRecord> findIdempotency(
            String actorSubject,
            String operation,
            String idempotencyKey
    );

    void insertIdempotency(
            String actorSubject,
            String operation,
            String idempotencyKey,
            String requestHashSha256,
            String response
    );

    void lockIdempotencyScope(String actorSubject, String operation, String idempotencyKey);

    record IssueRecord(
            UUID issueId,
            int issueNumber,
            String slug,
            String title,
            String summary,
            UUID coverAssetId,
            PublicationState state,
            long version,
            Instant updatedAt
    ) {
        public IssueRecord(
                UUID issueId,
                int issueNumber,
                String slug,
                String title,
                String summary,
                UUID coverAssetId,
                PublicationState state,
                long version
        ) {
            this(issueId, issueNumber, slug, title, summary, coverAssetId, state, version, Instant.EPOCH);
        }
    }

    record IssuePage(List<IssueRecord> items, String nextCursor, int limit) {
        public IssuePage {
            items = List.copyOf(items);
        }
    }

    record SectionRecord(
            UUID sectionId,
            String title,
            int position,
            int articleCount,
            long version
    ) {
    }

    record SectionPosition(UUID sectionId, int position) {
    }

    record PublicationJobRecord(
            UUID jobId,
            UUID issueId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String status,
            JsonNode payload
    ) {
    }
}
