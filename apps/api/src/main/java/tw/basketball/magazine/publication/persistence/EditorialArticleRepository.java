package tw.basketball.magazine.publication.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tw.basketball.magazine.content.domain.PublicArticleModels.Contributor;
import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.publication.domain.PublicationState;

/** Persistence boundary for the bounded T043 article workflow. */
public interface EditorialArticleRepository {
    ArticleRecord insertDraft(String title, String slug, String dek, JsonNode content);

    Optional<ArticleRecord> find(UUID articleId);

    List<ArticleRecord> list(int limit);

    /** Returns stable taxonomy keys assigned to one immutable article revision. */
    List<String> taxonomyKeys(UUID revisionId);

    /** Atomically replaces the active revision's validated taxonomy assignments. */
    void replaceTaxonomy(UUID revisionId, List<String> taxonomyKeys);

    boolean updateDraft(
            UUID articleId,
            UUID revisionId,
            long expectedArticleVersion,
            long expectedRevisionVersion,
            String title,
            String slug,
            String dek,
            JsonNode content
    );

    boolean createRevision(
            UUID articleId,
            long expectedArticleVersion,
            String title,
            String dek,
            JsonNode content
    );

    boolean transition(
            UUID articleId,
            UUID revisionId,
            long expectedArticleVersion,
            long expectedRevisionVersion,
            PublicationState currentState,
            PublicationState nextState,
            PublicationState nextRevisionState,
            Instant publishedAt
    );

    List<PublicationReadinessService.MediaRequirement> mediaRequirements(UUID revisionId);

    /**
     * Locks the media and rights rows before a worker makes its final reachability decision.
     * The returned requirements are read after the locks are acquired.
     */
    List<PublicationReadinessService.MediaRequirement> lockMediaRequirements(UUID revisionId);

    /** Returns the ordered, public-safe byline frozen into a publication snapshot. */
    List<Contributor> contributors(UUID revisionId);

    /**
     * Returns public-safe media metadata while publication rights rows are in the
     * same transaction. The snapshot factory selects only variants referenced by
     * the canonical content document.
     */
    List<PublicArticleMedia> publicMedia(UUID revisionId, Instant checkedAt);

    void appendReview(
            UUID articleId,
            UUID revisionId,
            String reviewerSubject,
            String reviewerRole,
            String decision,
            String reason
    );

    void appendRightsReference(
            UUID articleId,
            UUID revisionId,
            UUID assetId,
            String requiredChannel,
            String decisionCode,
            String checkedBy,
            Instant checkedAt,
            UUID rightsRecordId,
            Long rightsRecordVersion
    );

    void appendPublicationSnapshot(
            UUID articleId,
            UUID revisionId,
            long snapshotVersion,
            JsonNode content,
            String checksumSha256,
            String createdBy,
            List<UUID> assetIds
    );

    void appendPublicationJob(
            UUID articleId,
            UUID revisionId,
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

    boolean hasPublicationSnapshot(UUID articleId, UUID revisionId);

    Optional<IdempotencyRecord> findIdempotency(
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

    /** Serializes a retry scope for this transaction before reading its receipt. */
    void lockIdempotencyScope(String actorSubject, String operation, String idempotencyKey);

    long nextSnapshotVersion(UUID articleId);

    record ArticleRecord(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            JsonNode content,
            PublicationState state,
            PublicationState revisionState,
            long version,
            long revisionVersion,
            Instant scheduledFor,
            Instant revisionUpdatedAt
    ) {
    }

    record IdempotencyRecord(String requestHashSha256, String response) {
    }

    record PublicationJobRecord(
            UUID jobId,
            UUID articleId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String status,
            JsonNode payload
    ) {
        public PublicationJobRecord {
            Objects.requireNonNull(jobId, "jobId");
            Objects.requireNonNull(articleId, "articleId");
            Objects.requireNonNull(operation, "operation");
            Objects.requireNonNull(idempotencyKey, "idempotencyKey");
            Objects.requireNonNull(requestedBy, "requestedBy");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(payload, "payload");
        }
    }

}
