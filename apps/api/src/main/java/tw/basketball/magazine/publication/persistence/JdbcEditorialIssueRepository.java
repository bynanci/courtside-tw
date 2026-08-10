package tw.basketball.magazine.publication.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.publication.domain.PublicationState;

/** PostgreSQL adapter for issue drafts and insert-only command receipts. */
public final class JdbcEditorialIssueRepository implements EditorialIssueRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcEditorialIssueRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public IssueRecord insertDraft(String title, String slug, String summary, UUID coverAssetId) {
        UUID issueId = jdbcTemplate.queryForObject("""
                INSERT INTO publication_issue (
                    id, issue_number, slug, title, summary, cover_asset_id, state, version
                )
                SELECT uuidv7(), COALESCE(MAX(issue_number), 0) + 1, ?, ?, ?, ?, 'DRAFT', 1
                FROM publication_issue
                RETURNING id
                """, (resultSet, rowNumber) -> uuid(resultSet, "id"),
                slug, title, summary, coverAssetId);
        return find(Objects.requireNonNull(issueId, "issue id")).orElseThrow(() ->
                new IllegalStateException("inserted issue was not readable"));
    }

    @Override
    public Optional<IssueRecord> find(UUID issueId) {
        return jdbcTemplate.query("""
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version
                FROM publication_issue
                WHERE id = ?
                """, resultSet -> resultSet.next()
                ? Optional.of(mapIssue(resultSet))
                : Optional.empty(), issueId);
    }

    @Override
    public Optional<IssueRecord> findForUpdate(UUID issueId) {
        return jdbcTemplate.query("""
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version
                FROM publication_issue
                WHERE id = ?
                FOR UPDATE
                """, resultSet -> resultSet.next()
                ? Optional.of(mapIssue(resultSet))
                : Optional.empty(), issueId);
    }

    @Override
    public List<IssueRecord> list(int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        return jdbcTemplate.query("""
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version
                FROM publication_issue
                WHERE state <> 'ARCHIVED'
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> mapIssue(resultSet), limit);
    }

    @Override
    public List<SectionRecord> listSections(UUID issueId) {
        return jdbcTemplate.query("""
                SELECT section.id, section.title, section.position, section.version,
                       COUNT(issue_article.id) AS article_count
                FROM issue_section section
                LEFT JOIN issue_article
                  ON issue_article.issue_id = section.issue_id
                 AND issue_article.section_id = section.id
                WHERE section.issue_id = ?
                GROUP BY section.id, section.title, section.position, section.version
                ORDER BY section.position ASC, section.id ASC
                """, (resultSet, rowNumber) -> new SectionRecord(
                uuid(resultSet, "id"),
                resultSet.getString("title"),
                resultSet.getInt("position"),
                resultSet.getInt("article_count"),
                resultSet.getLong("version")
        ), issueId);
    }

    @Override
    public void shiftSectionsForInsert(UUID issueId, int position, int offset) {
        jdbcTemplate.update("""
                UPDATE issue_section
                SET position = position + ?,
                    version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE issue_id = ? AND position >= ?
                """, offset, issueId, position);
        jdbcTemplate.update("""
                UPDATE issue_section
                SET position = position - ? + 1,
                    updated_at = transaction_timestamp()
                WHERE issue_id = ? AND position >= ?
                """, offset, issueId, position + offset);
    }

    @Override
    public SectionRecord insertSection(UUID issueId, String title, int position) {
        UUID sectionId = jdbcTemplate.queryForObject("""
                INSERT INTO issue_section (issue_id, title, position)
                VALUES (?, ?, ?)
                RETURNING id
                """, (resultSet, rowNumber) -> uuid(resultSet, "id"), issueId, title, position);
        return listSections(issueId).stream()
                .filter(section -> section.sectionId().equals(sectionId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("inserted section was not readable"));
    }

    @Override
    public boolean updateSectionTitle(UUID issueId, UUID sectionId, String title) {
        return jdbcTemplate.update("""
                UPDATE issue_section
                SET title = ?, version = version + 1, updated_at = transaction_timestamp()
                WHERE issue_id = ? AND id = ?
                """, title, issueId, sectionId) == 1;
    }

    @Override
    public int countArticles(UUID issueId, UUID sectionId) {
        Long count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM issue_article
                WHERE issue_id = ? AND section_id = ?
                """, Long.class, issueId, sectionId);
        return count == null ? 0 : Math.toIntExact(count);
    }

    @Override
    public boolean deleteSection(UUID issueId, UUID sectionId) {
        return jdbcTemplate.update("""
                DELETE FROM issue_section
                WHERE issue_id = ? AND id = ?
                """, issueId, sectionId) == 1;
    }

    @Override
    public void applySectionPositions(
            UUID issueId,
            List<SectionPosition> positions,
            int offset
    ) {
        jdbcTemplate.update("""
                UPDATE issue_section
                SET position = position + ?,
                    version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE issue_id = ?
                """, offset, issueId);
        jdbcTemplate.batchUpdate("""
                UPDATE issue_section
                SET position = ?, updated_at = transaction_timestamp()
                WHERE issue_id = ? AND id = ?
                """, positions.stream().map(position -> new Object[] {
                position.position(), issueId, position.sectionId()
        }).toList());
    }

    @Override
    public boolean bumpIssueVersion(UUID issueId, long expectedVersion) {
        return jdbcTemplate.update("""
                UPDATE publication_issue
                SET version = version + 1, updated_at = transaction_timestamp()
                WHERE id = ? AND state = 'DRAFT' AND version = ?
                """, issueId, expectedVersion) == 1;
    }

    @Override
    public boolean updateDraft(
            UUID issueId,
            long expectedVersion,
            String title,
            String slug,
            String summary,
            UUID coverAssetId
    ) {
        return jdbcTemplate.update("""
                UPDATE publication_issue
                SET title = ?, slug = ?, summary = ?, cover_asset_id = ?,
                    version = version + 1, updated_at = transaction_timestamp()
                WHERE id = ? AND state = 'DRAFT' AND version = ?
                """, title, slug, summary, coverAssetId, issueId, expectedVersion) == 1;
    }

    @Override
    public Optional<EditorialArticleRepository.IdempotencyRecord> findIdempotency(
            String actorSubject,
            String operation,
            String idempotencyKey
    ) {
        List<EditorialArticleRepository.IdempotencyRecord> records = jdbcTemplate.query("""
                SELECT request_hash_sha256, response
                FROM publication_idempotency
                WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?
                """, (resultSet, rowNumber) -> new EditorialArticleRepository.IdempotencyRecord(
                resultSet.getString("request_hash_sha256"),
                resultSet.getString("response")
        ), actorSubject, operation, idempotencyKey);
        return records.stream().findFirst();
    }

    @Override
    public void insertIdempotency(
            String actorSubject,
            String operation,
            String idempotencyKey,
            String requestHashSha256,
            String response
    ) {
        jdbcTemplate.update("""
                INSERT INTO publication_idempotency (
                    actor_subject, operation, idempotency_key,
                    request_hash_sha256, response
                ) VALUES (?, ?, ?, ?, ?::jsonb)
                """, actorSubject, operation, idempotencyKey, requestHashSha256, response);
    }

    @Override
    public void lockIdempotencyScope(String actorSubject, String operation, String idempotencyKey) {
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> null,
                actorSubject + "\u0000" + operation + "\u0000" + idempotencyKey
        );
    }

    private static IssueRecord mapIssue(ResultSet resultSet) throws SQLException {
        return new IssueRecord(
                uuid(resultSet, "id"),
                resultSet.getInt("issue_number"),
                resultSet.getString("slug"),
                resultSet.getString("title"),
                resultSet.getString("summary"),
                uuid(resultSet, "cover_asset_id"),
                PublicationState.valueOf(resultSet.getString("state")),
                resultSet.getLong("version")
        );
    }

    private static UUID uuid(ResultSet resultSet, String column) throws SQLException {
        return UUID.fromString(resultSet.getString(column));
    }
}
