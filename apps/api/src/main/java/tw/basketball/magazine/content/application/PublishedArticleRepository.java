package tw.basketball.magazine.content.application;

import java.time.Instant;
import java.util.Optional;

/** Read port for one published Article revision selected by its public pointer. */
public interface PublishedArticleRepository {
    Optional<PublishedArticleSource> findBySlug(String articleSlug, Instant now);
}
