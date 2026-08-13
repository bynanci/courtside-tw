package tw.basketball.magazine.content.persistence;

import java.time.Instant;
import java.util.Optional;

import tw.basketball.magazine.content.domain.PublicArticleModels.ArticleProjection;

/** Persistence boundary for the immutable public Article projection. */
public interface PublicArticleRepository {
    Optional<ArticleProjection> findBySlug(String articleSlug, String requestedRevision, Instant now);
}
