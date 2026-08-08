package tw.basketball.magazine.shared;

import java.util.Objects;

/** Raised when an If-Match version is stale. */
public final class VersionConflictException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final Version expected;
    private final Version current;

    public VersionConflictException(Version expected, Version current) {
        super("optimistic lock version conflict");
        this.expected = Objects.requireNonNull(expected, "expected");
        this.current = Objects.requireNonNull(current, "current");
    }

    public Version expected() {
        return expected;
    }

    public Version current() {
        return current;
    }
}
