package tw.basketball.magazine.content.domain;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Immutable Article revision selected by the public publication pointer. */
public record PublishedArticleRevision(
        UUID revisionId,
        UUID articleId,
        int revisionNumber,
        String title,
        String dek,
        ContentDocument content,
        List<ContributorCredit> contributorCredits
) {
    public PublishedArticleRevision {
        revisionId = Objects.requireNonNull(revisionId, "revisionId");
        articleId = Objects.requireNonNull(articleId, "articleId");
        if (revisionNumber < 1) {
            throw new IllegalArgumentException("revisionNumber must be positive");
        }
        title = bounded(title, "title", 250, false);
        dek = bounded(dek, "dek", 1000, true);
        content = Objects.requireNonNull(content, "content");
        contributorCredits = List.copyOf(Objects.requireNonNull(
                contributorCredits,
                "contributorCredits"
        ));
    }

    @Override
    public List<ContributorCredit> contributorCredits() {
        return List.copyOf(contributorCredits);
    }

    private static String bounded(
            String value,
            String name,
            int maximumLength,
            boolean allowEmpty
    ) {
        value = Objects.requireNonNull(value, name);
        if ((!allowEmpty && value.isBlank()) || value.length() > maximumLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }
}
