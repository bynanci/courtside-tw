package tw.basketball.magazine.publication.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import tw.basketball.magazine.publication.domain.PublicationState;

/** Persistence boundary for issue draft CRUD and explicit optimistic locks. */
public interface EditorialIssueRepository {
    IssueRecord insertDraft(String title, String slug, String summary, UUID coverAssetId);

    Optional<IssueRecord> find(UUID issueId);

    Optional<IssueRecord> findForUpdate(UUID issueId);

    List<IssueRecord> list(int limit);

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

    void insertPublicationJob(
            UUID issueId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String timezone
    );

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
            long version
    ) {
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
}
