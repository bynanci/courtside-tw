package tw.basketball.magazine.publication.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.outbox.OutboxEventDraft;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.domain.PublicationState;

/** PostgreSQL adapter for issue drafts and insert-only command receipts. */
public final class JdbcEditorialIssueRepository implements EditorialIssueRepository {
    private static final String ISSUE_PUBLICATION_EVENT = "publication.issue.command";
    private static final int MAXIMUM_CURSOR_LENGTH = 256;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final OutboxRepository outboxRepository;

    public JdbcEditorialIssueRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper());
    }

    public JdbcEditorialIssueRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.outboxRepository = new OutboxRepository(jdbcTemplate);
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
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version, updated_at
                FROM publication_issue
                WHERE id = ?
                """, resultSet -> resultSet.next()
                ? Optional.of(mapIssue(resultSet))
                : Optional.empty(), issueId);
    }

    @Override
    public Optional<IssueRecord> findForUpdate(UUID issueId) {
        return jdbcTemplate.query("""
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version, updated_at
                FROM publication_issue
                WHERE id = ?
                FOR UPDATE
                """, resultSet -> resultSet.next()
                ? Optional.of(mapIssue(resultSet))
                : Optional.empty(), issueId);
    }

    @Override
    public IssuePage list(String cursorValue, int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        Cursor cursor = cursorValue == null ? null : parseCursor(cursorValue);
        String cursorPredicate = cursor == null ? "" : "AND (updated_at, id) < (?, ?)";
        List<Object> parameters = new ArrayList<>();
        if (cursor != null) {
            parameters.add(Timestamp.from(cursor.updatedAt()));
            parameters.add(cursor.issueId());
        }
        parameters.add(limit + 1);
        List<IssueRecord> rows = jdbcTemplate.query("""
                SELECT id, issue_number, slug, title, summary, cover_asset_id, state, version, updated_at
                FROM publication_issue
                WHERE state <> 'ARCHIVED'
                """ + cursorPredicate + """
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> mapIssue(resultSet), parameters.toArray());
        boolean hasNext = rows.size() > limit;
        List<IssueRecord> items = hasNext ? List.copyOf(rows.subList(0, limit)) : List.copyOf(rows);
        String nextCursor = hasNext
                ? encodeCursor(items.getLast().updatedAt(), items.getLast().issueId())
                : null;
        return new IssuePage(items, nextCursor, limit);
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
    public boolean transition(
            UUID issueId,
            long expectedVersion,
            PublicationState currentState,
            PublicationState nextState,
            Instant publishedAt
    ) {
        return jdbcTemplate.update("""
                UPDATE publication_issue
                SET state = ?,
                    version = version + 1,
                    published_at = CASE WHEN ? = 'PUBLISHED' THEN ? ELSE published_at END,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND state = ? AND version = ?
                """,
                nextState.name(),
                nextState.name(),
                publishedAt == null ? null : Timestamp.from(publishedAt),
                issueId,
                currentState.name(),
                expectedVersion
        ) == 1;
    }

    @Override
    public boolean readyForPublication(UUID issueId, Instant checkedAt) {
        Boolean ready = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM publication_issue issue
                    JOIN media_asset asset ON asset.id = issue.cover_asset_id
                    JOIN media_variant variant
                      ON variant.asset_id = asset.id AND variant.variant = 'cover'
                    WHERE issue.id = ?
                      AND asset.processing_state = 'READY'
                      AND btrim(asset.alt_text) <> ''
                      AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
                      AND position('..' IN variant.public_storage_key) = 0
                      AND position('//' IN variant.public_storage_key) = 0
                      AND position('/./' IN variant.public_storage_key) = 0
                      AND right(variant.public_storage_key, 1) <> '/'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM issue_article entry
                          LEFT JOIN article entry_article
                            ON entry_article.id = entry.article_id
                          LEFT JOIN article_revision entry_revision
                            ON entry_revision.id = entry_article.published_revision_id
                           AND entry_revision.article_id = entry_article.id
                          WHERE entry.issue_id = issue.id
                            AND (
                                entry_article.id IS NULL
                                OR entry_article.state <> 'PUBLISHED'
                                OR entry_article.published_at IS NULL
                                OR entry_article.published_at > ?
                                OR entry_revision.id IS NULL
                                OR entry_revision.state <> 'PUBLISHED'
                            )
                      )
                      AND EXISTS (
                          SELECT 1
                          FROM rights_record rights
                          WHERE rights.asset_id = issue.cover_asset_id
                            AND rights.status = 'VALID'
                            AND rights.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                            AND rights.valid_from <= ?
                            AND rights.valid_until > ?
                      )
                )
                """, Boolean.class,
                issueId,
                Timestamp.from(checkedAt),
                Timestamp.from(checkedAt),
                Timestamp.from(checkedAt));
        return Boolean.TRUE.equals(ready);
    }

    @Override
    public void appendReview(
            UUID issueId,
            String reviewerSubject,
            String reviewerRole,
            String decision,
            String reason
    ) {
        jdbcTemplate.update("""
                INSERT INTO publication_review (
                    aggregate_type, aggregate_id, revision_id, reviewer_subject,
                    reviewer_role, decision, reason
                ) VALUES ('ISSUE', ?, NULL, ?, ?, ?, ?)
                """, issueId, reviewerSubject, reviewerRole, decision, reason);
    }

    @Override
    public String publicationSnapshotDocument(UUID issueId) {
        IssueRecord issue = find(issueId).orElseThrow(() ->
                new IllegalStateException("issue snapshot target is missing"));
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("schemaVersion", 1);
        document.put("issueId", issue.issueId().toString());
        document.put("issueNumber", issue.issueNumber());
        document.put("slug", issue.slug());
        document.put("title", issue.title());
        document.put("summary", issue.summary());
        document.put("coverAssetId", issue.coverAssetId().toString());
        List<Map<String, Object>> sections = new ArrayList<>();
        List<Map<String, Object>> sectionRows = jdbcTemplate.query("""
                SELECT id, title, position
                FROM issue_section
                WHERE issue_id = ?
                ORDER BY position, id
                """, (resultSet, rowNumber) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("sectionId", uuid(resultSet, "id").toString());
            row.put("title", resultSet.getString("title"));
            row.put("position", resultSet.getInt("position"));
            return row;
        }, issueId);
        for (Map<String, Object> section : sectionRows) {
            UUID sectionId = UUID.fromString((String) section.get("sectionId"));
            List<Map<String, Object>> articles = jdbcTemplate.query("""
                    SELECT article.id, article.slug, revision.title, issue_article.position
                    FROM issue_article
                    JOIN article ON article.id = issue_article.article_id
                    JOIN article_revision revision
                      ON revision.id = article.published_revision_id
                     AND revision.article_id = article.id
                    WHERE issue_article.issue_id = ?
                      AND issue_article.section_id = ?
                      AND article.state = 'PUBLISHED'
                      AND article.published_at <= transaction_timestamp()
                      AND revision.state = 'PUBLISHED'
                    ORDER BY issue_article.position, issue_article.id
                    """, (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("articleId", uuid(resultSet, "id").toString());
                row.put("slug", resultSet.getString("slug"));
                row.put("title", resultSet.getString("title"));
                row.put("position", resultSet.getInt("position"));
                return row;
            }, issueId, sectionId);
            if (!articles.isEmpty()) {
                section.put("articles", articles);
                sections.add(section);
            }
        }
        document.put("sections", sections);
        try {
            return objectMapper.writeValueAsString(document);
        } catch (JacksonException exception) {
            throw new IllegalStateException("unable to serialize issue publication snapshot", exception);
        }
    }

    @Override
    public long nextSnapshotVersion(UUID issueId) {
        Long version = jdbcTemplate.queryForObject("""
                SELECT COALESCE(MAX(snapshot_version), 0) + 1
                FROM publication_snapshot
                WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?
                """, Long.class, issueId);
        return Objects.requireNonNull(version, "snapshot version");
    }

    @Override
    public void appendPublicationSnapshot(
            UUID issueId,
            long snapshotVersion,
            JsonNode content,
            String checksumSha256,
            String createdBy,
            UUID coverAssetId
    ) {
        UUID snapshotId = jdbcTemplate.queryForObject("""
                INSERT INTO publication_snapshot (
                    aggregate_type, aggregate_id, revision_id, snapshot_version,
                    content_document, checksum_sha256, created_by
                ) VALUES ('ISSUE', ?, NULL, ?, ?::jsonb, ?, ?)
                RETURNING id
                """, (resultSet, rowNumber) -> uuid(resultSet, "id"),
                issueId, snapshotVersion, content.toString(), checksumSha256, createdBy);
        jdbcTemplate.update("""
                INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type)
                VALUES (?, ?, 'COVER_MEDIA')
                ON CONFLICT (snapshot_id, asset_id, impact_type) DO NOTHING
                """, snapshotId, coverAssetId);
    }

    @Override
    public boolean hasPublicationSnapshot(UUID issueId) {
        Boolean present = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM publication_snapshot
                    WHERE aggregate_type = 'ISSUE' AND aggregate_id = ?
                )
                """, Boolean.class, issueId);
        return Boolean.TRUE.equals(present);
    }

    @Override
    public void insertPublicationJob(
            UUID issueId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String timezone
    ) {
        String payload = json(Map.of(
                "issueId", issueId.toString(),
                "action", operation,
                "idempotencyKey", idempotencyKey,
                "requestedBy", requestedBy
        ));
        jdbcTemplate.update("""
                INSERT INTO publication_job (
                    aggregate_type, aggregate_id, operation, idempotency_key,
                    requested_by, scheduled_at, timezone, payload
                ) VALUES ('ISSUE', ?, ?, ?, ?, ?, ?, ?::jsonb)
                """,
                issueId,
                operation,
                idempotencyKey,
                requestedBy,
                scheduledAt == null ? null : Timestamp.from(scheduledAt),
                timezone,
                payload
        );
        String eventKey = "publication.issue.command:" + sha256(
                issueId + "|" + operation + "|" + requestedBy + "|" + idempotencyKey
        );
        outboxRepository.enqueue(new OutboxEventDraft(
                ISSUE_PUBLICATION_EVENT,
                "ISSUE",
                issueId,
                eventKey,
                payload,
                scheduledAt == null ? Instant.now() : scheduledAt
        ));
    }

    @Override
    public Optional<PublicationJobRecord> findPublicationJob(
            String requestedBy,
            String operation,
            String idempotencyKey
    ) {
        return jdbcTemplate.query("""
                SELECT id, aggregate_id, operation, idempotency_key, requested_by,
                       scheduled_at, status, payload
                FROM publication_job
                WHERE aggregate_type = 'ISSUE'
                  AND requested_by = ? AND operation = ? AND idempotency_key = ?
                """, resultSet -> resultSet.next()
                ? Optional.of(mapPublicationJob(resultSet))
                : Optional.empty(), requestedBy, operation, idempotencyKey);
    }

    @Override
    public void markPublicationJobSucceeded(UUID jobId, Instant processedAt) {
        jdbcTemplate.update("""
                UPDATE publication_job
                SET status = 'SUCCEEDED', processed_at = ?, updated_at = transaction_timestamp()
                WHERE id = ? AND status NOT IN ('SUCCEEDED', 'BLOCKED')
                """, Timestamp.from(processedAt), jobId);
    }

    @Override
    public void markPublicationJobBlocked(UUID jobId, String reason, Instant processedAt) {
        jdbcTemplate.update("""
                UPDATE publication_job
                SET status = 'BLOCKED', last_error = LEFT(?, 4000),
                    processed_at = ?, updated_at = transaction_timestamp()
                WHERE id = ? AND status NOT IN ('SUCCEEDED', 'BLOCKED')
                """, reason, Timestamp.from(processedAt), jobId);
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
                idempotencyLockKey(actorSubject, operation, idempotencyKey)
        );
    }

    private static String idempotencyLockKey(
            String actorSubject,
            String operation,
            String idempotencyKey
    ) {
        return actorSubject.length() + ":" + actorSubject
                + operation.length() + ":" + operation
                + idempotencyKey.length() + ":" + idempotencyKey;
    }

    private static IssueRecord mapIssue(ResultSet resultSet) throws SQLException {
        Timestamp updatedAt = resultSet.getTimestamp("updated_at");
        return new IssueRecord(
                uuid(resultSet, "id"),
                resultSet.getInt("issue_number"),
                resultSet.getString("slug"),
                resultSet.getString("title"),
                resultSet.getString("summary"),
                uuid(resultSet, "cover_asset_id"),
                PublicationState.valueOf(resultSet.getString("state")),
                resultSet.getLong("version"),
                updatedAt == null ? null : updatedAt.toInstant()
        );
    }

    private static Cursor parseCursor(String value) {
        if (value.isBlank() || value.length() > MAXIMUM_CURSOR_LENGTH) {
            throw new IllegalArgumentException("cursor must be a bounded opaque value");
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] fields = decoded.split("\\|", -1);
            if (fields.length != 2 || decoded.length() > MAXIMUM_CURSOR_LENGTH) {
                throw new IllegalArgumentException("cursor must be a bounded opaque value");
            }
            return new Cursor(Instant.parse(fields[0]), UUID.fromString(fields[1]));
        } catch (IllegalArgumentException | DateTimeException exception) {
            throw new IllegalArgumentException("cursor must be a bounded opaque value", exception);
        }
    }

    private static String encodeCursor(Instant updatedAt, UUID issueId) {
        String value = updatedAt + "|" + issueId;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private record Cursor(Instant updatedAt, UUID issueId) {
    }

    private PublicationJobRecord mapPublicationJob(ResultSet resultSet) throws SQLException {
        try {
            Timestamp scheduledAt = resultSet.getTimestamp("scheduled_at");
            return new PublicationJobRecord(
                    uuid(resultSet, "id"),
                    uuid(resultSet, "aggregate_id"),
                    resultSet.getString("operation"),
                    resultSet.getString("idempotency_key"),
                    resultSet.getString("requested_by"),
                    scheduledAt == null ? null : scheduledAt.toInstant(),
                    resultSet.getString("status"),
                    objectMapper.readTree(resultSet.getString("payload"))
            );
        } catch (JacksonException exception) {
            throw new SQLException("publication job payload is invalid", exception);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("unable to serialize publication job payload", exception);
        }
    }

    private static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private static UUID uuid(ResultSet resultSet, String column) throws SQLException {
        return UUID.fromString(resultSet.getString(column));
    }
}
