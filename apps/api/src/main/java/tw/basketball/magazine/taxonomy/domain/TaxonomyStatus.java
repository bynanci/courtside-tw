package tw.basketball.magazine.taxonomy.domain;

import java.util.Locale;

/** Lifecycle state for a managed taxonomy term. */
public enum TaxonomyStatus {
    ACTIVE,
    RETIRED;

    public static TaxonomyStatus parse(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("taxonomy status is required");
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("unsupported taxonomy status", exception);
        }
    }
}
