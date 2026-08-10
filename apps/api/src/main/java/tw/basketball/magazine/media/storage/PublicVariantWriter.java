package tw.basketball.magazine.media.storage;

/** Writes and removes generated, public derivative objects. */
@FunctionalInterface
public interface PublicVariantWriter {
    void write(String publicStorageKey, String mimeType, byte[] bytes);

    /**
     * Removes a derivative after an optimistic-lock race, so revoked media
     * cannot leave an orphaned public object behind.
     */
    default void delete(String publicStorageKey) {
        throw new UnsupportedOperationException("public variant deletion is not configured");
    }
}
