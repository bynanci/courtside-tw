package tw.basketball.magazine.publication;

import java.time.Instant;
import java.util.Optional;

import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;

interface PublicArticleRepository {
    Optional<ArticleProjection> findBySlug(String articleSlug, String requestedRevision, Instant now);
}
