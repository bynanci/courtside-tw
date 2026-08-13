package tw.basketball.magazine.content.application;

import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.content.domain.PublishedArticleRevision;

/** Persistence-neutral source data for a published Article projection. */
public record PublishedArticleSource(
        String slug,
        UUID issueId,
        String issueSlug,
        PublishedArticleRevision revision
) {
    public PublishedArticleSource {
        slug = required(slug, "slug", 128);
        issueId = Objects.requireNonNull(issueId, "issueId");
        issueSlug = required(issueSlug, "issueSlug", 128);
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
