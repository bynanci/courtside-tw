package tw.basketball.magazine.fanpassport.recap;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

/** Elapsed calendar-day coverage of a canonical team/season participation interval. */
public final class SeasonCoverage {
    private SeasonCoverage() { }

    public static double fraction(LocalDate seasonStart, LocalDate seasonEnd,
            LocalDate participationStart, LocalDate participationEnd, LocalDate asOf) {
        Objects.requireNonNull(seasonStart, "seasonStart");
        Objects.requireNonNull(seasonEnd, "seasonEnd");
        Objects.requireNonNull(participationStart, "participationStart");
        Objects.requireNonNull(asOf, "asOf");
        if (!seasonEnd.isAfter(seasonStart) || !asOf.isAfter(seasonStart)
                || participationEnd != null && !participationEnd.isAfter(participationStart)) {
            throw new IllegalArgumentException("recap requires a nonempty elapsed calendar interval");
        }
        LocalDate elapsedEnd = asOf.isBefore(seasonEnd) ? asOf : seasonEnd;
        LocalDate coveredStart = participationStart.isAfter(seasonStart) ? participationStart : seasonStart;
        LocalDate coveredEnd = participationEnd != null && participationEnd.isBefore(elapsedEnd)
                ? participationEnd : elapsedEnd;
        long coveredDays = Math.max(0, ChronoUnit.DAYS.between(coveredStart, coveredEnd));
        return (double) coveredDays / ChronoUnit.DAYS.between(seasonStart, elapsedEnd);
    }
}
