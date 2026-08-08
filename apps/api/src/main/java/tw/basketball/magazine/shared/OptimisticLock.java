package tw.basketball.magazine.shared;

import java.util.Objects;

/** Central optimistic-lock transition; callers must not implement last-write-wins. */
public final class OptimisticLock {
    private OptimisticLock() {
    }

    public static Version advance(Version current, Version expected) {
        Objects.requireNonNull(current, "current");
        Objects.requireNonNull(expected, "expected");
        if (!current.equals(expected)) {
            throw new VersionConflictException(expected, current);
        }
        return current.next();
    }
}
