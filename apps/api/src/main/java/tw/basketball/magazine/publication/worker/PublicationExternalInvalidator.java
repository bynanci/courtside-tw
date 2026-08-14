package tw.basketball.magazine.publication.worker;

import java.util.List;
import java.util.Objects;

/**
 * Provider-neutral boundary for durable cache, search and sitemap invalidation.
 *
 * <p>The publication origin is closed before this boundary is invoked. A
 * provider failure is allowed to escape so the existing outbox retry path can
 * retry the same idempotency key without marking the publication job complete.</p>
 */
@FunctionalInterface
public interface PublicationExternalInvalidator {
    void invalidate(Request request);

    record Request(String idempotencyKey, List<String> surrogateKeys) {
        public Request {
            Objects.requireNonNull(idempotencyKey, "idempotencyKey");
            if (idempotencyKey.isBlank()) {
                throw new IllegalArgumentException("idempotencyKey must not be blank");
            }
            Objects.requireNonNull(surrogateKeys, "surrogateKeys");
            surrogateKeys = List.copyOf(surrogateKeys);
            if (surrogateKeys.isEmpty() || surrogateKeys.stream().anyMatch(String::isBlank)) {
                throw new IllegalArgumentException("surrogateKeys must contain non-blank values");
            }
        }
    }

    /**
     * Default production behavior is fail-closed until a real provider adapter
     * is configured. It must never falsely acknowledge an external purge.
     */
    static PublicationExternalInvalidator unavailable() {
        return request -> {
            throw new IllegalStateException(
                    "publication external invalidator is not configured"
            );
        };
    }
}
