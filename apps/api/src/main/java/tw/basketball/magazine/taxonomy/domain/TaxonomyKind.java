package tw.basketball.magazine.taxonomy.domain;

import java.util.Locale;

/** Stable taxonomy kinds stored independently from display names. */
public enum TaxonomyKind {
    LEAGUE,
    SEASON,
    TEAM,
    PLAYER,
    PERSON,
    VENUE,
    TOPIC;

    public static TaxonomyKind parse(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("taxonomy kind is required");
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("unsupported taxonomy kind", exception);
        }
    }
}
