package tw.basketball.magazine.media.storage;

import java.io.IOException;

/** API-only capability for bounded private originals; no storage URL or signing material is returned. */
@FunctionalInterface
public interface PrivateMediaPreviewReader {
    byte[] read(String privateStorageKey, int maximumBytes) throws IOException;

    static PrivateMediaPreviewReader unavailable() {
        return (key, maximumBytes) -> {
            throw new IOException("private media preview is not configured");
        };
    }
}
