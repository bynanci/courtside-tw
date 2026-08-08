package tw.basketball.magazine.shared;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * Application time boundary. Production code should depend on this value
 * instead of reading the system clock directly so tests can be deterministic.
 */
public final class ApplicationClock {
    private final Clock clock;

    public ApplicationClock(Clock clock) {
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public static ApplicationClock systemUtc() {
        return new ApplicationClock(Clock.systemUTC());
    }

    public Instant now() {
        return clock.instant();
    }

    public LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    public ZoneId zone() {
        return clock.getZone();
    }
}
