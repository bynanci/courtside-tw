package tw.basketball.magazine.shared;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.random.RandomGenerator;

/**
 * Generates RFC 9562 UUID version 7 identifiers without exposing an
 * auto-incrementing database key to API callers.
 */
public final class UuidV7Generator {
    private static final long TIMESTAMP_MASK = 0x0000FFFFFFFFFFFFL;
    private static final long RANDOM_B_MASK = 0x3FFFFFFFFFFFFFFFL;
    private static final long VERSION_MASK = 0x0000000000007000L;

    private final Clock clock;
    private final RandomGenerator entropy;

    public UuidV7Generator(Clock clock, RandomGenerator entropy) {
        this.clock = Objects.requireNonNull(clock, "clock");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
    }

    public static UuidV7Generator system() {
        return new UuidV7Generator(Clock.systemUTC(), new SecureRandom());
    }

    public UUID next() {
        long epochMillis = clock.millis();
        if (epochMillis < 0 || epochMillis > TIMESTAMP_MASK) {
            throw new IllegalStateException("clock value cannot be represented by UUIDv7");
        }

        long mostSignificantBits = (epochMillis << 16) & 0xFFFFFFFFFFFF0000L;
        mostSignificantBits |= VERSION_MASK;
        mostSignificantBits |= entropy.nextInt(1 << 12);

        long leastSignificantBits = Long.MIN_VALUE | (entropy.nextLong() & RANDOM_B_MASK);
        return new UUID(mostSignificantBits, leastSignificantBits);
    }

    public static boolean isUuidV7(UUID id) {
        return id != null && id.version() == 7 && id.variant() == 2;
    }

    public static Instant timestampOf(UUID id) {
        if (!isUuidV7(id)) {
            throw new IllegalArgumentException("UUID must be RFC 9562 version 7");
        }
        long epochMillis = (id.getMostSignificantBits() >>> 16) & TIMESTAMP_MASK;
        return Instant.ofEpochMilli(epochMillis);
    }
}
