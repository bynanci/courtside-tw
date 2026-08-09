package tw.basketball.magazine.publication;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Immutable public projections. No draft or editorial workflow state is represented here. */
public final class PublicIssueModels {
    private PublicIssueModels() {
    }

    public record Page(List<IssueSummary> items, PageMeta page) {
        public Page {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
            page = Objects.requireNonNull(page, "page");
        }
    }

    public record PageMeta(String nextCursor, int limit) {
        public PageMeta {
            if (nextCursor != null && (nextCursor.isBlank() || nextCursor.length() > 256)) {
                throw new IllegalArgumentException("nextCursor must be null or a bounded opaque value");
            }
            if (limit < 1 || limit > 100) {
                throw new IllegalArgumentException("limit must be between 1 and 100");
            }
        }
    }

    public record IssueSummary(
            UUID issueId,
            String slug,
            int issueNumber,
            String title,
            String summary,
            IssueCover cover,
            Instant publishedAt,
            int articleCount
    ) {
        public IssueSummary {
            issueId = Objects.requireNonNull(issueId, "issueId");
            slug = bounded(slug, "slug", 128);
            if (issueNumber < 1) {
                throw new IllegalArgumentException("issueNumber must be positive");
            }
            title = bounded(title, "title", 250);
            summary = bounded(summary, "summary", 1000);
            cover = Objects.requireNonNull(cover, "cover");
            publishedAt = Objects.requireNonNull(publishedAt, "publishedAt");
            if (articleCount < 0) {
                throw new IllegalArgumentException("articleCount cannot be negative");
            }
        }
    }

    public record IssueDetail(
            UUID issueId,
            String slug,
            int issueNumber,
            String title,
            String summary,
            IssueCover cover,
            Instant publishedAt,
            List<IssueSection> sections
    ) {
        public IssueDetail {
            issueId = Objects.requireNonNull(issueId, "issueId");
            slug = bounded(slug, "slug", 128);
            if (issueNumber < 1) {
                throw new IllegalArgumentException("issueNumber must be positive");
            }
            title = bounded(title, "title", 250);
            summary = bounded(summary, "summary", 1000);
            cover = Objects.requireNonNull(cover, "cover");
            publishedAt = Objects.requireNonNull(publishedAt, "publishedAt");
            sections = List.copyOf(Objects.requireNonNull(sections, "sections"));
        }
    }

    public record IssueCover(String url, String alt, int width, int height) {
        public IssueCover {
            url = bounded(url, "url", 512);
            if (!url.startsWith("/media/")) {
                throw new IllegalArgumentException("cover URL must use the local media origin");
            }
            alt = bounded(alt, "alt", 1000);
            if (width < 1 || height < 1) {
                throw new IllegalArgumentException("cover dimensions must be positive");
            }
        }
    }

    public record IssueSection(String title, int position, List<ArticleSummary> articles) {
        public IssueSection {
            title = bounded(title, "title", 250);
            if (position < 1) {
                throw new IllegalArgumentException("section position must be positive");
            }
            articles = List.copyOf(Objects.requireNonNull(articles, "articles"));
        }
    }

    public record ArticleSummary(UUID articleId, String slug, String title, int position) {
        public ArticleSummary {
            articleId = Objects.requireNonNull(articleId, "articleId");
            slug = bounded(slug, "slug", 128);
            title = bounded(title, "title", 250);
            if (position < 1) {
                throw new IllegalArgumentException("article position must be positive");
            }
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
}
