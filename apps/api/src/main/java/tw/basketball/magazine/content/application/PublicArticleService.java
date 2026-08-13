package tw.basketball.magazine.content.application;

import java.time.Clock;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

import tw.basketball.magazine.content.domain.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.content.persistence.PublicArticleRepository;

/** Application boundary for published-only Article reads. */
public final class PublicArticleService {
    private static final Pattern ARTICLE_SLUG = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");

    private final PublicArticleRepository repository;
    private final Clock clock;

    public PublicArticleService(PublicArticleRepository repository) {
        this(repository, Clock.systemUTC());
    }

    public PublicArticleService(PublicArticleRepository repository, Clock clock) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Optional<ArticleProjection> findBySlug(String articleSlug, String requestedRevision) {
        return repository.findBySlug(validSlug(articleSlug), requestedRevision, clock.instant());
    }

    private static String validSlug(String value) {
        if (value == null || value.length() > 128 || !ARTICLE_SLUG.matcher(value).matches()) {
            throw new PublicArticleRequestException(
                    "/articleSlug",
                    "invalid_article_slug",
                    "articleSlug must be a bounded lowercase slug"
            );
        }
        return value;
    }
}
