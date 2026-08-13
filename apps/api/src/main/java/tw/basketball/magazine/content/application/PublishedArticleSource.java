package tw.basketball.magazine.content.application;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.content.domain.PublishedArticleRevision;

/** Persistence-neutral source data for a published Article projection. */
public record PublishedArticleSource(
        String slug,
        UUID issueId,
        String issueSlug,
        Instant publishedAt,
        Instant updatedAt,
        PublishedArticleRevision revision
) {
    public PublishedArticleSource {
        slug = required(slug, "slug", 128);
        issueId = Objects.requireNonNull(issueId, "issueId");
        issueSlug = required(issueSlug, "issueSlug", 128);
        publishedAt = Objects.requireNonNull(publishedAt, "publishedAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        if (updatedAt.isBefore(publishedAt)) {
            throw new IllegalArgumentException("updatedAt cannot precede publishedAt");
        }
        revision = Objects.requireNonNull(revision, "revision");
    }

    private static String required(String value, String name, int maximumLength) {
        value = Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximumLength) {
            throw new IllegalArgumentException(name + " must be bounded");
        }
        return value;
    }
}
