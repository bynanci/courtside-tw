package tw.basketball.magazine.publication;

import java.util.List;
import java.util.Objects;
import java.util.Set;
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
            String plainText,
            int readingTimeMinutes,
            List<PublicArticleMedia> media,
            List<Contributor> contributors,
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
            content = Objects.requireNonNull(content, "content").deepCopy();
            plainText = Objects.requireNonNull(plainText, "plainText");
            if (plainText.length() > 500_000
                    || plainText.codePoints().anyMatch(PublicArticleModels::isUnsafePlainTextControl)) {
                throw new IllegalArgumentException("plainText must be bounded plain text");
            }
            if (readingTimeMinutes < 1) {
                throw new IllegalArgumentException("readingTimeMinutes must be positive");
            }
            media = List.copyOf(Objects.requireNonNull(media, "media"));
            contributors = List.copyOf(Objects.requireNonNull(contributors, "contributors"));
            issueNavigation = Objects.requireNonNull(issueNavigation, "issueNavigation");
        }

        @Override
        public JsonNode content() {
            return content.deepCopy();
        }
    }

    public record PublicArticleMedia(
            UUID assetId,
            String variant,
            String url,
            String mimeType,
            int width,
            int height
    ) {
        public PublicArticleMedia {
            assetId = Objects.requireNonNull(assetId, "assetId");
            variant = bounded(variant, "variant", 32);
            url = bounded(url, "url", 512);
            if (!url.startsWith("/media/")
                    || url.contains("..")
                    || url.contains("//")
                    || url.contains("/./")
                    || url.endsWith("/")) {
                throw new IllegalArgumentException("url must be a safe public media path");
            }
            mimeType = bounded(mimeType, "mimeType", 64);
            if (!Set.of("image/avif", "image/jpeg", "image/png", "image/webp").contains(mimeType)) {
                throw new IllegalArgumentException("mimeType is not an allowed public image type");
            }
            if (width < 1 || height < 1) {
                throw new IllegalArgumentException("media dimensions must be positive");
            }
        }
    }

    public record Contributor(
            UUID contributorId,
            String slug,
            String displayName,
            String role
    ) {
        public Contributor {
            contributorId = Objects.requireNonNull(contributorId, "contributorId");
            slug = bounded(slug, "slug", 128);
            displayName = bounded(displayName, "displayName", 200);
            role = bounded(role, "role", 32);
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

    private static boolean isUnsafePlainTextControl(int codePoint) {
        return Character.isISOControl(codePoint) && codePoint != '\n' && codePoint != '\t';
    }
}
