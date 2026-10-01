package tw.basketball.magazine.fanpassport.recap;

import java.time.LocalDate;

public final class SeasonCoverageProof {
    private SeasonCoverageProof() { }

    public static void main(String[] args) {
        verify();
        System.out.println("SeasonCoverageProof PASS");
    }

    static void verify() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = start.plusDays(100);
        check(1.0, SeasonCoverage.fraction(start, end, start, null, start.plusDays(50)));
        check(0.5, SeasonCoverage.fraction(start, end, start.plusDays(25), null, start.plusDays(50)));
        check(0.2, SeasonCoverage.fraction(start, end, start.minusDays(10), start.plusDays(20), end.plusDays(30)));
        check(0.0, SeasonCoverage.fraction(start, end, end.plusDays(1), null, end));
        reject(() -> SeasonCoverage.fraction(start, end, start, null, start));
        reject(() -> SeasonCoverage.fraction(start, start, start, null, end));
        reject(() -> SeasonCoverage.fraction(start, end, start.plusDays(2), start, end));
    }

    private static void check(double expected, double actual) {
        if (Math.abs(expected - actual) > 1e-12) {
            throw new AssertionError("Expected " + expected + " but received " + actual);
        }
    }

    private static void reject(Runnable operation) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("invalid calendar interval accepted");
    }
}
