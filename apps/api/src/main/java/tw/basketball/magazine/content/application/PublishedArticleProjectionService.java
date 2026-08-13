package tw.basketball.magazine.content.application;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

import tw.basketball.magazine.content.application.ContentDocumentExtractor.ExtractedContent;
import tw.basketball.magazine.content.domain.PublishedArticleRevision;

/** Builds the immutable, server-derived content projection for public Article reads. */
public final class PublishedArticleProjectionService {
    private final PublishedArticleRepository repository;
    private final ContentDocumentExtractor extractor;

    public PublishedArticleProjectionService(PublishedArticleRepository repository) {
        this(repository, new ContentDocumentExtractor());
    }

    PublishedArticleProjectionService(
            PublishedArticleRepository repository,
            ContentDocumentExtractor extractor
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.extractor = Objects.requireNonNull(extractor, "extractor");
    }

    public Optional<PublishedArticleProjection> findBySlug(String articleSlug, Instant now) {
        Objects.requireNonNull(articleSlug, "articleSlug");
        Objects.requireNonNull(now, "now");
        return repository.findBySlug(articleSlug, now).map(this::project);
    }

    private PublishedArticleProjection project(PublishedArticleSource source) {
        PublishedArticleRevision revision = source.revision();
        ExtractedContent extracted = extractor.extract(revision.content());
        return new PublishedArticleProjection(
                revision.articleId(),
                revision.revisionId(),
                revision.revisionNumber(),
                source.slug(),
                revision.title(),
                revision.dek(),
                revision.content(),
                extracted.plainText(),
                extracted.readingTimeMinutes(),
                revision.contributorCredits(),
                source.issueId(),
                source.issueSlug(),
                source.publishedAt(),
                source.updatedAt()
        );
    }
}
