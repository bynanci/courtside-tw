package tw.basketball.magazine.media.storage;

/** Writes only generated, public derivative objects. */
@FunctionalInterface
public interface PublicVariantWriter {
    void write(String publicStorageKey, String mimeType, byte[] bytes) throws Exception;
}
