package tw.basketball.magazine.media.persistence;

import java.util.Objects;
import java.util.Optional;

/** Insert-only receipts for media intent and completion retries. */
public interface MediaUploadIdempotencyRepository {
    /** Serializes one actor/operation/key scope inside the caller transaction. */
    void lockScope(String actorSubject, String operation, String idempotencyKey);

    Optional<Receipt> find(String actorSubject, String operation, String idempotencyKey);

    void insert(
            String actorSubject,
            String operation,
            String idempotencyKey,
            String requestHashSha256,
            java.util.UUID assetId,
            String responseJson
    );

    record Receipt(String requestHashSha256, java.util.UUID assetId, String responseJson) {
        public Receipt {
            Objects.requireNonNull(requestHashSha256, "requestHashSha256");
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(responseJson, "responseJson");
        }
    }
}
