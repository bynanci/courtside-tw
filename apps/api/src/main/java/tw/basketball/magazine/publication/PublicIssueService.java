package tw.basketball.magazine.publication;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

import tw.basketball.magazine.publication.PublicIssueModels.IssueDetail;
import tw.basketball.magazine.publication.PublicIssueModels.Page;

/** Application boundary for public Issue reads, with one shared UTC clock per request. */
public final class PublicIssueService {
    private final PublicIssueRepository repository;
    private final Clock clock;

    public PublicIssueService(PublicIssueRepository repository) {
        this(repository, Clock.systemUTC());
    }

    PublicIssueService(PublicIssueRepository repository, Clock clock) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Page list(String cursorValue, String limitValue) {
        int limit = PublicIssueRequest.limit(limitValue);
        PublicIssueCursor cursor = cursorValue == null ? null : PublicIssueCursor.parse(cursorValue);
        Instant now = clock.instant();
        return repository.list(cursor, limit, now);
    }

    public Optional<IssueDetail> findBySlug(String issueSlug) {
        Instant now = clock.instant();
        return repository.findBySlug(PublicIssueRequest.issueSlug(issueSlug), now);
    }
}
