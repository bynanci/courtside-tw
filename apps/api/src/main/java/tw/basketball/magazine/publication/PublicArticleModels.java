package tw.basketball.magazine.publication;

import java.util.Objects;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;

/** Immutable, anonymous-read Article projection models. */
public final class PublicArticleModels {
    private PublicArticleModels() {
    }

    public record ArticleProjection(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            JsonNode content,
            IssueNavigation issueNavigation
    ) {
        public ArticleProjection {
            articleId = Objects.requireNonNull(articleId, "articleId");
            revisionId = Objects.requireNonNull(revisionId, "revisionId");
            if (revisionNumber < 1) {
                throw new IllegalArgumentException("revisionNumber must be positive");
            }
            slug = bounded(slug, "slug", 128);
            title = bounded(title, "title", 250);
            dek = boundedNullable(dek, "dek", 1000);
            content = Objects.requireNonNull(content, "content");
            issueNavigation = Objects.requireNonNull(issueNavigation, "issueNavigation");
        }
    }

    public record IssueNavigation(
            String issueSlug,
            ArticleSummary previous,
            ArticleSummary next
    ) {
        public IssueNavigation {
            issueSlug = bounded(issueSlug, "issueSlug", 128);
        }
    }

    private static String bounded(String value, String name, int maximumLength) {
        value = Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximumLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }

    private static String boundedNullable(String value, String name, int maximumLength) {
        if (value == null) {
            return null;
        }
        return bounded(value, name, maximumLength);
    }
}
