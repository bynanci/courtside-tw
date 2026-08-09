package tw.basketball.magazine.publication;

import java.time.Instant;
import java.util.Optional;

import tw.basketball.magazine.publication.PublicIssueModels.IssueDetail;
import tw.basketball.magazine.publication.PublicIssueModels.Page;

interface PublicIssueRepository {
    Page list(PublicIssueCursor cursor, int limit, Instant now);

    Optional<IssueDetail> findBySlug(String issueSlug, Instant now);
}
