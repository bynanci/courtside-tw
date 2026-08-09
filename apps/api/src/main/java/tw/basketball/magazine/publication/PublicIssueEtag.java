package tw.basketball.magazine.publication;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;
import tw.basketball.magazine.publication.PublicIssueModels.IssueDetail;
import tw.basketball.magazine.publication.PublicIssueModels.IssueSection;
import tw.basketball.magazine.publication.PublicIssueModels.IssueSummary;
import tw.basketball.magazine.publication.PublicIssueModels.Page;

/** Stable, representation-specific SHA-256 validators for conditional public GETs. */
final class PublicIssueEtag {
    private PublicIssueEtag() {
    }

    static String forPage(Page page) {
        StringBuilder input = new StringBuilder("public-issues-page-v1\n");
        append(input, page.page().limit());
        append(input, page.page().nextCursor());
        for (IssueSummary issue : page.items()) {
            appendIssue(input, issue);
            append(input, issue.articleCount());
        }
        return digest(input);
    }

    static String forDetail(IssueDetail issue) {
        StringBuilder input = new StringBuilder("public-issue-detail-v1\n");
        appendIssue(input, issue);
        for (IssueSection section : issue.sections()) {
            append(input, section.title());
            append(input, section.position());
            for (ArticleSummary article : section.articles()) {
                append(input, article.articleId());
                append(input, article.slug());
                append(input, article.title());
                append(input, article.position());
            }
        }
        return digest(input);
    }

    private static void appendIssue(StringBuilder input, IssueSummary issue) {
        append(input, issue.issueId());
        append(input, issue.slug());
        append(input, issue.issueNumber());
        append(input, issue.title());
        append(input, issue.summary());
        append(input, issue.cover().url());
        append(input, issue.cover().alt());
        append(input, issue.cover().width());
        append(input, issue.cover().height());
        append(input, issue.publishedAt());
    }

    private static void appendIssue(StringBuilder input, IssueDetail issue) {
        append(input, issue.issueId());
        append(input, issue.slug());
        append(input, issue.issueNumber());
        append(input, issue.title());
        append(input, issue.summary());
        append(input, issue.cover().url());
        append(input, issue.cover().alt());
        append(input, issue.cover().width());
        append(input, issue.cover().height());
        append(input, issue.publishedAt());
    }

    private static void append(StringBuilder input, Object value) {
        String stringValue = value == null ? "<null>" : value.toString();
        input.append(stringValue.length()).append(':').append(stringValue).append('\n');
    }

    private static String digest(StringBuilder input) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(input.toString().getBytes(StandardCharsets.UTF_8));
            return '"' + java.util.HexFormat.of().formatHex(bytes) + '"';
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
