package tw.basketball.magazine.publication;

import java.time.Clock;
import java.util.Objects;
import java.util.Optional;

import tw.basketball.magazine.publication.PublicArticleModels.ArticleProjection;

/** Application boundary for published-only Article reads. */
public final class PublicArticleService {
    private final PublicArticleRepository repository;
    private final Clock clock;

    public PublicArticleService(PublicArticleRepository repository) {
        this(repository, Clock.systemUTC());
    }

    PublicArticleService(PublicArticleRepository repository, Clock clock) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Optional<ArticleProjection> findBySlug(String articleSlug, String requestedRevision) {
        String slug = PublicIssueRequest.articleSlug(articleSlug);
        return repository.findBySlug(slug, requestedRevision, clock.instant());
    }
}
