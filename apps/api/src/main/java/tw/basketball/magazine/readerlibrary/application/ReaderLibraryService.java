package tw.basketball.magazine.readerlibrary.application;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.readerlibrary.domain.ProgressMergePolicy;
import tw.basketball.magazine.readerlibrary.domain.ProgressMergePolicy.Candidate;
import tw.basketball.magazine.shared.ApplicationClock;

/** Transactional bookmark and revision-aware reading-progress boundary. */
public final class ReaderLibraryService {
    private static final int MAXIMUM_PAGE_SIZE = 100;
    private static final int MAXIMUM_MERGE_ITEMS = 100;
    private static final long MAXIMUM_FUTURE_SKEW_SECONDS = 300;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final ApplicationClock clock;

    public ReaderLibraryService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            ApplicationClock clock
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.transactionTemplate = new TransactionTemplate(
                Objects.requireNonNull(transactionManager, "transactionManager")
        );
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public BookmarkPage bookmarks(AuthenticatedReader reader, int limit) {
        UUID readerId = findReader(reader);
        int boundedLimit = pageSize(limit);
        if (readerId == null) {
            return new BookmarkPage(List.of(), new PageMeta(null, boundedLimit));
        }
        List<BookmarkItem> items = jdbcTemplate.query("""
                SELECT bookmark.article_id, bookmark.created_at, article.state,
                       article.slug, revision.title
                FROM bookmark
                JOIN article ON article.id = bookmark.article_id
                LEFT JOIN article_revision revision
                  ON revision.id = article.published_revision_id
                WHERE bookmark.reader_id = ?
                ORDER BY bookmark.created_at DESC, bookmark.id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> bookmark(resultSet), readerId, boundedLimit);
        return new BookmarkPage(items, new PageMeta(null, boundedLimit));
    }

    public void putBookmark(AuthenticatedReader reader, UUID articleId) {
        Objects.requireNonNull(articleId, "articleId");
        transactionTemplate.executeWithoutResult(status -> {
            requirePublishedArticle(articleId);
            UUID readerId = getOrCreateReader(reader);
            jdbcTemplate.update("""
                    INSERT INTO bookmark (reader_id, article_id)
                    VALUES (?, ?)
                    ON CONFLICT (reader_id, article_id) DO NOTHING
                    """, readerId, articleId);
        });
    }

    public void deleteBookmark(AuthenticatedReader reader, UUID articleId) {
        Objects.requireNonNull(articleId, "articleId");
        UUID readerId = findReader(reader);
        if (readerId != null) {
            jdbcTemplate.update(
                    "DELETE FROM bookmark WHERE reader_id = ? AND article_id = ?",
                    readerId,
                    articleId
            );
        }
    }

    public ProgressPage progress(AuthenticatedReader reader, int limit) {
        UUID readerId = findReader(reader);
        int boundedLimit = pageSize(limit);
        if (readerId == null) {
            return new ProgressPage(List.of(), new PageMeta(null, boundedLimit));
        }
        List<ReadingProgress> items = jdbcTemplate.query("""
                SELECT progress.article_id, progress.revision_id, progress.block_id,
                       progress.percent, progress.updated_at
                FROM reading_progress progress
                JOIN article
                  ON article.id = progress.article_id
                 AND article.state = 'PUBLISHED'
                 AND article.published_revision_id = progress.revision_id
                JOIN article_revision revision ON revision.id = progress.revision_id
                WHERE progress.reader_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(revision.content_document -> 'blocks') block
                      WHERE block ->> 'id' = progress.block_id::text
                  )
                ORDER BY progress.updated_at DESC, progress.id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> progress(resultSet), readerId, boundedLimit);
        return new ProgressPage(items, new PageMeta(null, boundedLimit));
    }

    public ReadingProgress putProgress(
            AuthenticatedReader reader,
            UUID articleId,
            ProgressUpsert input
    ) {
        Objects.requireNonNull(articleId, "articleId");
        validate(input);
        return transactionTemplate.execute(status -> {
            requireCurrentAnchor(articleId, input.revisionId(), input.blockId());
            UUID readerId = getOrCreateReader(reader);
            Candidate candidate = new Candidate(
                    articleId,
                    input.revisionId(),
                    input.blockId(),
                    input.percent(),
                    clock.now()
            );
            return upsert(readerId, candidate, false);
        });
    }

    public ProgressMergeResult merge(
            AuthenticatedReader reader,
            ProgressMergeRequest request
    ) {
        validate(request);
        boolean apply = "apply".equals(request.mode());
        return transactionTemplate.execute(status -> {
            UUID readerId = findReader(reader);
            if (apply && readerId == null) {
                readerId = getOrCreateReader(reader);
            }
            List<ReadingProgress> accepted = new ArrayList<>();
            for (ReadingProgress item : request.items()) {
                Candidate local = candidate(item);
                boolean localIsValid = isCurrentAnchor(
                        local.articleId(),
                        local.revisionId(),
                        local.blockId()
                ) && !local.updatedAt().isAfter(clock.now().plusSeconds(
                        MAXIMUM_FUTURE_SKEW_SECONDS
                ));
                Candidate server = readerId == null
                        ? null
                        : findCurrentCandidate(readerId, item.articleId());
                Candidate selected = ProgressMergePolicy.newerValid(
                        server,
                        local,
                        localIsValid
                );
                if (selected == null) {
                    throw ReaderLibraryProblemException.conflict(
                            "/items",
                            "progress_anchor_invalid",
                            "progress does not reference the current published revision"
                    );
                }
                ReadingProgress result;
                if (apply && selected == local) {
                    result = upsert(readerId, selected, true);
                } else {
                    result = progress(selected);
                }
                accepted.add(result);
            }
            return new ProgressMergeResult(request.mode(), accepted, List.of());
        });
    }

    private ReadingProgress upsert(UUID readerId, Candidate candidate, boolean onlyIfNewer) {
        String updateCondition = onlyIfNewer
                ? " WHERE EXCLUDED.updated_at > reading_progress.updated_at\n"
                : "";
        List<ReadingProgress> updated = jdbcTemplate.query("""
                INSERT INTO reading_progress (
                    reader_id, article_id, revision_id, block_id, percent, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (reader_id, article_id)
                DO UPDATE SET
                    revision_id = EXCLUDED.revision_id,
                    block_id = EXCLUDED.block_id,
                    percent = EXCLUDED.percent,
                    updated_at = EXCLUDED.updated_at,
                    version = reading_progress.version + 1
                """ + updateCondition + """
                RETURNING article_id, revision_id, block_id, percent, updated_at
                """,
                (resultSet, rowNumber) -> progress(resultSet),
                readerId,
                candidate.articleId(),
                candidate.revisionId(),
                candidate.blockId(),
                candidate.percent(),
                Timestamp.from(candidate.updatedAt())
        );
        if (!updated.isEmpty()) {
            return updated.getFirst();
        }
        Candidate current = findCurrentCandidate(readerId, candidate.articleId());
        if (current == null) {
            throw new IllegalStateException("progress upsert returned no current row");
        }
        return progress(current);
    }

    private Candidate findCurrentCandidate(UUID readerId, UUID articleId) {
        List<Candidate> rows = jdbcTemplate.query("""
                SELECT progress.article_id, progress.revision_id, progress.block_id,
                       progress.percent, progress.updated_at
                FROM reading_progress progress
                JOIN article
                  ON article.id = progress.article_id
                 AND article.state = 'PUBLISHED'
                 AND article.published_revision_id = progress.revision_id
                JOIN article_revision revision ON revision.id = progress.revision_id
                WHERE progress.reader_id = ? AND progress.article_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(revision.content_document -> 'blocks') block
                      WHERE block ->> 'id' = progress.block_id::text
                  )
                """, (resultSet, rowNumber) -> candidate(resultSet), readerId, articleId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void requirePublishedArticle(UUID articleId) {
        List<String> states = jdbcTemplate.query(
                "SELECT state FROM article WHERE id = ?",
                (resultSet, rowNumber) -> resultSet.getString("state"),
                articleId
        );
        if (states.isEmpty()) {
            throw ReaderLibraryProblemException.notFound();
        }
        if (!"PUBLISHED".equals(states.getFirst())) {
            throw ReaderLibraryProblemException.unavailable();
        }
    }

    private void requireCurrentAnchor(UUID articleId, UUID revisionId, UUID blockId) {
        List<ArticleAnchor> anchors = articleAnchors(articleId, revisionId, blockId);
        if (anchors.isEmpty()) {
            throw ReaderLibraryProblemException.notFound();
        }
        ArticleAnchor anchor = anchors.getFirst();
        if (!"PUBLISHED".equals(anchor.state())) {
            throw ReaderLibraryProblemException.unavailable();
        }
        if (!anchor.currentRevision()) {
            throw ReaderLibraryProblemException.conflict(
                    "/revisionId",
                    "stale_revision",
                    "progress must reference the current published revision"
            );
        }
        if (!anchor.blockExists()) {
            throw ReaderLibraryProblemException.conflict(
                    "/blockId",
                    "stale_block",
                    "progress block does not exist in the current revision"
            );
        }
    }

    private boolean isCurrentAnchor(UUID articleId, UUID revisionId, UUID blockId) {
        List<ArticleAnchor> anchors = articleAnchors(articleId, revisionId, blockId);
        if (anchors.isEmpty()) {
            return false;
        }
        ArticleAnchor anchor = anchors.getFirst();
        return "PUBLISHED".equals(anchor.state())
                && anchor.currentRevision()
                && anchor.blockExists();
    }

    private List<ArticleAnchor> articleAnchors(UUID articleId, UUID revisionId, UUID blockId) {
        return jdbcTemplate.query("""
                SELECT article.state,
                       article.published_revision_id = ? AS current_revision,
                       EXISTS (
                           SELECT 1
                           FROM article_revision revision,
                                jsonb_array_elements(revision.content_document -> 'blocks') block
                           WHERE revision.id = ?
                             AND revision.article_id = article.id
                             AND block ->> 'id' = ?
                       ) AS block_exists
                FROM article
                WHERE article.id = ?
                """,
                (resultSet, rowNumber) -> new ArticleAnchor(
                        resultSet.getString("state"),
                        resultSet.getBoolean("current_revision"),
                        resultSet.getBoolean("block_exists")
                ),
                revisionId,
                revisionId,
                blockId.toString(),
                articleId
        );
    }

    private UUID getOrCreateReader(AuthenticatedReader reader) {
        Objects.requireNonNull(reader, "reader");
        UUID id = jdbcTemplate.queryForObject("""
                INSERT INTO reader_profile (issuer, subject)
                VALUES (?, ?)
                ON CONFLICT (issuer, subject)
                DO UPDATE SET updated_at = transaction_timestamp()
                RETURNING id
                """,
                UUID.class,
                reader.issuer(),
                reader.subject()
        );
        return Objects.requireNonNull(id, "database returned no reader id");
    }

    private UUID findReader(AuthenticatedReader reader) {
        Objects.requireNonNull(reader, "reader");
        List<UUID> rows = jdbcTemplate.query(
                "SELECT id FROM reader_profile WHERE issuer = ? AND subject = ?",
                (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
                reader.issuer(),
                reader.subject()
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private static BookmarkItem bookmark(ResultSet resultSet) throws SQLException {
        boolean available = "PUBLISHED".equals(resultSet.getString("state"))
                && resultSet.getString("title") != null;
        return new BookmarkItem(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getTimestamp("created_at").toInstant(),
                available,
                available ? null : resultSet.getString("state"),
                available ? resultSet.getString("slug") : null,
                available ? resultSet.getString("title") : null
        );
    }

    private static Candidate candidate(ResultSet resultSet) throws SQLException {
        return new Candidate(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getObject("revision_id", UUID.class),
                resultSet.getObject("block_id", UUID.class),
                resultSet.getDouble("percent"),
                resultSet.getTimestamp("updated_at").toInstant()
        );
    }

    private static Candidate candidate(ReadingProgress progress) {
        validate(progress);
        return new Candidate(
                progress.articleId(),
                progress.revisionId(),
                progress.blockId(),
                progress.percent(),
                progress.updatedAt()
        );
    }

    private static ReadingProgress progress(ResultSet resultSet) throws SQLException {
        return progress(candidate(resultSet));
    }

    private static ReadingProgress progress(Candidate candidate) {
        return new ReadingProgress(
                candidate.articleId(),
                candidate.revisionId(),
                candidate.blockId(),
                candidate.percent(),
                candidate.updatedAt()
        );
    }

    private static int pageSize(int value) {
        if (value < 1 || value > MAXIMUM_PAGE_SIZE) {
            throw ReaderLibraryProblemException.invalid(
                    "/limit",
                    "limit_out_of_range",
                    "limit must be between 1 and 100"
            );
        }
        return value;
    }

    private static void validate(ProgressUpsert input) {
        if (input == null) {
            throw ReaderLibraryProblemException.invalid(
                    "/",
                    "progress_required",
                    "progress input is required"
            );
        }
        requirePercent(input.percent(), "/percent");
        Objects.requireNonNull(input.revisionId(), "revisionId");
        Objects.requireNonNull(input.blockId(), "blockId");
    }

    private static void validate(ReadingProgress progress) {
        Objects.requireNonNull(progress, "progress");
        Objects.requireNonNull(progress.articleId(), "articleId");
        Objects.requireNonNull(progress.revisionId(), "revisionId");
        Objects.requireNonNull(progress.blockId(), "blockId");
        Objects.requireNonNull(progress.updatedAt(), "updatedAt");
        requirePercent(progress.percent(), "/items/percent");
    }

    private static void validate(ProgressMergeRequest request) {
        if (request == null) {
            throw ReaderLibraryProblemException.invalid(
                    "/",
                    "merge_required",
                    "merge request is required"
            );
        }
        if (!"preview".equals(request.mode()) && !"apply".equals(request.mode())) {
            throw ReaderLibraryProblemException.invalid(
                    "/mode",
                    "merge_mode_invalid",
                    "mode must be preview or apply"
            );
        }
        if (request.items().size() > MAXIMUM_MERGE_ITEMS) {
            throw ReaderLibraryProblemException.invalid(
                    "/items",
                    "merge_items_exceeded",
                    "at most 100 progress records may be merged"
            );
        }
        Set<UUID> articleIds = new HashSet<>();
        for (ReadingProgress item : request.items()) {
            validate(item);
            if (!articleIds.add(item.articleId())) {
                throw ReaderLibraryProblemException.invalid(
                        "/items",
                        "merge_article_duplicate",
                        "each article may appear once in a merge"
                );
            }
        }
    }

    private static void requirePercent(double percent, String path) {
        if (!Double.isFinite(percent) || percent < 0 || percent > 100) {
            throw ReaderLibraryProblemException.invalid(
                    path,
                    "progress_percent_invalid",
                    "percent must be between 0 and 100"
            );
        }
    }

    public record BookmarkPage(List<BookmarkItem> items, PageMeta page) {
        public BookmarkPage {
            items = List.copyOf(items);
            page = Objects.requireNonNull(page, "page");
        }
    }

    public record ProgressPage(List<ReadingProgress> items, PageMeta page) {
        public ProgressPage {
            items = List.copyOf(items);
            page = Objects.requireNonNull(page, "page");
        }
    }

    public record PageMeta(String nextCursor, int limit) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BookmarkItem(
            UUID articleId,
            Instant createdAt,
            boolean available,
            String unavailableReason,
            String slug,
            String title
    ) {
    }

    public record ReadingProgress(
            UUID articleId,
            UUID revisionId,
            UUID blockId,
            double percent,
            Instant updatedAt
    ) {
    }

    public record ProgressUpsert(UUID revisionId, UUID blockId, double percent) {
    }

    public record ProgressMergeRequest(String mode, List<ReadingProgress> items) {
        public ProgressMergeRequest {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record ProgressMergeResult(
            String mode,
            List<ReadingProgress> accepted,
            List<Object> conflicts
    ) {
        public ProgressMergeResult {
            accepted = List.copyOf(accepted);
            conflicts = List.copyOf(conflicts);
        }
    }

    private record ArticleAnchor(String state, boolean currentRevision, boolean blockExists) {
    }
}
