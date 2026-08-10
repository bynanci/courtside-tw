package tw.basketball.magazine.media.storage;

import java.util.Objects;

/** Reads a private original only inside the worker boundary. */
@FunctionalInterface
public interface PrivateObjectReader {
    byte[] read(String privateStorageKey);

    static byte[] requireBytes(byte[] bytes) {
        return Objects.requireNonNull(bytes, "private object reader returned null").clone();
    }
}
