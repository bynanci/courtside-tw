package tw.basketball.magazine.publication;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.publication.PublicArticleModels.Contributor;
import tw.basketball.magazine.publication.PublicArticleModels.IssueNavigation;
import tw.basketball.magazine.publication.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.publication.PublicIssueModels.ArticleSummary;

/** Stable representation-specific SHA-256 validator for Article GETs. */
final class PublicArticleEtag {
    private PublicArticleEtag() {
    }

    static String forProjection(ArticleProjection article) {
        StringBuilder input = new StringBuilder("public-article-v2\n");
        append(input, article.articleId());
        append(input, article.revisionId());
        append(input, article.revisionNumber());
        append(input, article.slug());
        append(input, article.title());
        append(input, article.dek());
        append(input, article.content());
        for (PublicArticleMedia media : article.media()) {
            append(input, media.assetId());
            append(input, media.variant());
            append(input, media.url());
            append(input, media.mimeType());
            append(input, media.width());
            append(input, media.height());
        }
        for (Contributor contributor : article.contributors()) {
            append(input, contributor.contributorId());
            append(input, contributor.slug());
            append(input, contributor.displayName());
            append(input, contributor.role());
        }
        appendNavigation(input, article.issueNavigation());
        return digest(input);
    }

    private static void appendNavigation(StringBuilder input, IssueNavigation navigation) {
        append(input, navigation.issueSlug());
        appendArticle(input, navigation.previous());
        appendArticle(input, navigation.next());
    }

    private static void appendArticle(StringBuilder input, ArticleSummary article) {
        if (article == null) {
            append(input, null);
            return;
        }
        append(input, article.articleId());
        append(input, article.slug());
        append(input, article.title());
        append(input, article.position());
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
