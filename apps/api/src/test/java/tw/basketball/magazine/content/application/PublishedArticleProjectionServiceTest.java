package tw.basketball.magazine.content.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.content.domain.ContentDocument;
import tw.basketball.magazine.content.domain.ContributorCredit;
import tw.basketball.magazine.content.domain.PublishedArticleRevision;

final class PublishedArticleProjectionServiceTest {
    @Test
    void projectsDerivedTextAndCreditsFromTheSelectedPublishedRevision() {
        UUID revisionId = UUID.fromString("00000000-0000-4000-8000-000000000021");
        UUID articleId = UUID.fromString("00000000-0000-4000-8000-000000000022");
        ContributorCredit credit = new ContributorCredit(
                UUID.fromString("00000000-0000-4000-8000-000000000023"),
                "projection-author",
                "Projection author",
                ContributorCredit.Role.AUTHOR
        );
        PublishedArticleSource source = new PublishedArticleSource(
                "projection-article",
                UUID.fromString("00000000-0000-4000-8000-000000000024"),
                "projection-issue",
                Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-02T00:00:00Z"),
                new PublishedArticleRevision(
                        revisionId,
                        articleId,
                        3,
                        "Published projection",
                        "Server-derived",
                        ContentDocument.fromJson("""
                                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                                  {"id":"00000000-0000-4000-8000-000000000025","type":"paragraph","version":1,
                                   "payload":{"content":[{"kind":"text","text":"Projection body"}]}}
                                ]}
                                """),
                        List.of(credit)
                )
        );
        PublishedArticleRepository repository = (slug, now) -> Optional.of(source);

        Optional<PublishedArticleProjection> result = new PublishedArticleProjectionService(repository)
                .findBySlug("projection-article", Instant.parse("2026-08-13T00:00:00Z"));

        assertTrue(result.isPresent());
        assertEquals(revisionId, result.orElseThrow().revisionId());
        assertEquals("Projection body", result.orElseThrow().plainText());
        assertEquals(1, result.orElseThrow().readingTimeMinutes());
        assertEquals(List.of(credit), result.orElseThrow().contributorCredits());
        assertEquals(Instant.parse("2026-08-01T00:00:00Z"), result.orElseThrow().publishedAt());
        assertEquals(Instant.parse("2026-08-02T00:00:00Z"), result.orElseThrow().updatedAt());
    }
}
