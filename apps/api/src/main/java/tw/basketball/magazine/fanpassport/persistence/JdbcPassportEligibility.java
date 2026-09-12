package tw.basketball.magazine.fanpassport.persistence;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Server condition: revision-bound progress acknowledgements, never proof of human reading. */
public final class JdbcPassportEligibility {

  private final JdbcTemplate jdbc;

  public JdbcPassportEligibility(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public UUID verify(UUID readerId, UUID issueId, String season, Instant now) {
    List<Snapshot> snapshots = jdbc.query(
      """
      SELECT s.id, i.published_at FROM publication_issue i
      JOIN publication_snapshot s ON s.aggregate_type='ISSUE' AND s.aggregate_id=i.id
      WHERE i.id=? AND i.state='PUBLISHED' AND i.published_at<=?
      ORDER BY s.snapshot_version DESC LIMIT 1
      """,
      (rs, n) ->
        new Snapshot(rs.getObject("id", UUID.class), rs.getTimestamp("published_at").toInstant()),
      issueId,
      Timestamp.from(now)
    );
    if (snapshots.isEmpty()) {
      throw new IllegalArgumentException("issue is unavailable");
    }
    Snapshot snapshot = snapshots.get(0);
    if (
      !Integer.toString(snapshot.publishedAt().atZone(ZoneOffset.UTC).getYear()).equals(season) ||
      !rightsAvailable(snapshot.id(), issueId, now)
    ) {
      throw new IllegalArgumentException("season or current rights do not satisfy eligibility");
    }
    // Only the frozen issue inventory is eligible. Legacy snapshots lacking revision IDs fail closed.
    List<Boolean> conditions = jdbc.query(
      """
      SELECT a.id IS NOT NULL AND a.state='PUBLISHED' AND r.state='PUBLISHED'
          AND p.percent=100 AND p.revision_id=r.id AS eligible
      FROM publication_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.content_document->'sections') section
      CROSS JOIN LATERAL jsonb_array_elements(section->'articles') item
      LEFT JOIN article a ON a.id=(item->>'articleId')::uuid
      LEFT JOIN article_revision r ON r.article_id=a.id AND r.id=(item->>'revisionId')::uuid
          AND a.published_revision_id=r.id
      LEFT JOIN reading_progress p ON p.reader_id=? AND p.article_id=a.id
      WHERE s.id=?
      """,
      (rs, n) -> rs.getBoolean("eligible"),
      readerId,
      snapshot.id()
    );
    if (
      conditions.isEmpty() ||
      conditions.size() > 500 ||
      conditions.stream().anyMatch((value) -> !value)
    ) {
      throw new IllegalArgumentException("frozen issue progress condition is incomplete");
    }
    return snapshot.id();
  }

  public boolean rightsAvailable(UUID snapshotId, UUID issueId, Instant now) {
    if (snapshotId == null || issueId == null) {
      return false;
    }
    Boolean available = jdbc.queryForObject(
      """
      WITH frozen_articles AS (
          SELECT (item->>'articleId')::uuid AS article_id, (item->>'revisionId')::uuid AS revision_id
          FROM publication_snapshot s
          CROSS JOIN LATERAL jsonb_array_elements(s.content_document->'sections') section
          CROSS JOIN LATERAL jsonb_array_elements(section->'articles') item
          WHERE s.id=?
      )
      SELECT EXISTS (SELECT 1 FROM publication_issue WHERE id=? AND state='PUBLISHED')
      AND NOT EXISTS (
          SELECT 1 FROM frozen_articles f LEFT JOIN article a ON a.id=f.article_id
          LEFT JOIN article_revision r ON r.id=f.revision_id AND r.article_id=f.article_id
          WHERE a.id IS NULL OR a.state<>'PUBLISHED' OR r.id IS NULL OR r.state<>'PUBLISHED'
      )
      AND NOT EXISTS (
          SELECT 1 FROM (
              SELECT asset_id FROM publication_impact_link WHERE snapshot_id=?
              UNION SELECT cover_asset_id FROM publication_issue WHERE id=?
              UNION SELECT l.asset_id FROM publication_impact_link l
                  JOIN publication_snapshot s ON s.id=l.snapshot_id AND s.aggregate_type='ARTICLE'
                  JOIN frozen_articles f ON f.article_id=s.aggregate_id AND f.revision_id=s.revision_id
          ) assets JOIN media_asset m ON m.id=assets.asset_id
          WHERE m.processing_state<>'READY' OR m.archived_at IS NOT NULL
              OR EXISTS (SELECT 1 FROM rights_record r WHERE r.asset_id=m.id AND r.status IN ('REVOKED','BLOCKED'))
              OR NOT EXISTS (SELECT 1 FROM rights_record r WHERE r.asset_id=m.id
                  AND r.status='VALID' AND 'PUBLIC_WEB'=ANY(r.allowed_channels)
                  AND r.valid_from<=? AND r.valid_until>?)
      )
      """,
      Boolean.class,
      snapshotId,
      issueId,
      snapshotId,
      issueId,
      Timestamp.from(now),
      Timestamp.from(now)
    );
    return Boolean.TRUE.equals(available);
  }

  private record Snapshot(UUID id, Instant publishedAt) { }
}
