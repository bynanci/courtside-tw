package tw.basketball.magazine.content.application;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.content.domain.ContentDocument;
import tw.basketball.magazine.content.domain.ContributorCredit;

/** Server-derived, published-only Article projection before media and issue navigation are added. */
public record PublishedArticleProjection(
        UUID articleId,
        UUID revisionId,
        int revisionNumber,
        String slug,
        String title,
        String dek,
        ContentDocument content,
        String plainText,
        int readingTimeMinutes,
        List<ContributorCredit> contributorCredits,
        UUID issueId,
        String issueSlug
) {
    public PublishedArticleProjection {
        articleId = Objects.requireNonNull(articleId, "articleId");
        revisionId = Objects.requireNonNull(revisionId, "revisionId");
        if (revisionNumber < 1) {
            throw new IllegalArgumentException("revisionNumber must be positive");
        }
        slug = Objects.requireNonNull(slug, "slug");
        title = Objects.requireNonNull(title, "title");
        dek = Objects.requireNonNull(dek, "dek");
        content = Objects.requireNonNull(content, "content");
        plainText = Objects.requireNonNull(plainText, "plainText");
        if (readingTimeMinutes < 1) {
            throw new IllegalArgumentException("readingTimeMinutes must be positive");
        }
        contributorCredits = List.copyOf(Objects.requireNonNull(
                contributorCredits,
                "contributorCredits"
        ));
        issueId = Objects.requireNonNull(issueId, "issueId");
        issueSlug = Objects.requireNonNull(issueSlug, "issueSlug");
    }

    @Override
    public List<ContributorCredit> contributorCredits() {
        return List.copyOf(contributorCredits);
    }
}
