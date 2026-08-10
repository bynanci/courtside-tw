package tw.basketball.magazine.publication.worker;

import java.util.List;
import java.util.UUID;

/** Stable cache, search and sitemap keys carried by publication outbox events. */
public final class PublicationInvalidationKeys {
    private PublicationInvalidationKeys() {
    }

    public static List<String> forArticle(UUID articleId, UUID revisionId) {
        return List.of(
                "article:" + articleId,
                "article:" + articleId + ":revision:" + revisionId,
                "search:article:" + articleId,
                "sitemap:articles"
        );
    }
}
