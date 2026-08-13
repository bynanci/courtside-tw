package tw.basketball.magazine.publication.persistence;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.domain.PublicArticleModels.Contributor;
import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.shared.UuidV7Generator;

/** PostgreSQL adapter with conditional article updates for the T043 proof. */
public final class JdbcEditorialArticleRepository implements EditorialArticleRepository {
    private static final String ARTICLE_COLUMNS = """
            SELECT a.id AS article_id,
                   a.slug,
                   a.state AS article_state,
                   a.version AS article_version,
                   r.id AS revision_id,
                   r.revision_number,
                   r.title,
                   r.dek,
                   r.content_document,
                   r.state AS revision_state,
                   r.version AS revision_version,
                   r.updated_at AS revision_updated_at,
                   job.scheduled_at AS scheduled_for
            FROM article a
            JOIN LATERAL (
                SELECT revision.id, revision.revision_number, revision.title,
                       revision.dek, revision.content_document, revision.state,
                       revision.version, revision.updated_at
                FROM article_revision revision
                WHERE revision.article_id = a.id
                ORDER BY revision.revision_number DESC
                LIMIT 1
            ) r ON TRUE
            LEFT JOIN LATERAL (
                SELECT scheduled_at
                FROM publication_job
                WHERE aggregate_type = 'ARTICLE'
                  AND aggregate_id = a.id
                  AND operation = 'SCHEDULE'
                ORDER BY requested_at DESC, id DESC
                LIMIT 1
            ) job ON TRUE
            """;
    private static final String MEDIA_REQUIREMENTS_SQL = """
            SELECT link.asset_id,
                   asset.processing_state,
                   rights.id AS rights_id,
                   rights.version AS rights_version,
                   rights.status AS rights_status,
                   rights.allowed_channels,
                   rights.valid_from,
                   rights.valid_until
            FROM article_revision_media link
            JOIN media_asset asset ON asset.id = link.asset_id
            LEFT JOIN rights_record rights ON rights.asset_id = link.asset_id
            WHERE link.article_revision_id = ?
            ORDER BY link.position, link.asset_id, rights.id
            """;
    private static final String PUBLIC_MEDIA_SQL = """
            SELECT asset.id AS asset_id,
                   variant.variant,
                   variant.public_storage_key,
                   variant.mime_type,
                   variant.width,
                   variant.height,
                   asset.alt_text,
                   rights.credit,
                   rights.rights_owner,
                   rights.license_name
            FROM article_revision_media link
            JOIN media_asset asset
              ON asset.id = link.asset_id
            JOIN media_variant variant
              ON variant.asset_id = asset.id
            JOIN LATERAL (
                SELECT eligible.credit, eligible.rights_owner, eligible.license_name
                FROM rights_record eligible
                WHERE eligible.asset_id = asset.id
                  AND eligible.status = 'VALID'
                  AND eligible.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                  AND eligible.valid_from <= ?
                  AND eligible.valid_until > ?
                ORDER BY eligible.version DESC, eligible.updated_at DESC, eligible.id DESC
                LIMIT 1
            ) rights ON TRUE
            WHERE link.article_revision_id = ?
              AND link.required_channel = 'PUBLIC_WEB'
              AND asset.processing_state = 'READY'
              AND (asset.id, variant.variant) IN (%s)
              AND NOT EXISTS (
                    SELECT 1
                    FROM rights_record revoked
                    WHERE revoked.asset_id = asset.id
                      AND revoked.status = 'REVOKED'
              )
              AND variant.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
              AND position('..' IN variant.public_storage_key) = 0
              AND position('//' IN variant.public_storage_key) = 0
              AND position('/./' IN variant.public_storage_key) = 0
              AND right(variant.public_storage_key, 1) <> '/'
            ORDER BY link.position, asset.id, variant.variant
            LIMIT 5001
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final UuidV7Generator idGenerator;

    public JdbcEditorialArticleRepository(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, new ObjectMapper(), UuidV7Generator.system());
    }

    public JdbcEditorialArticleRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            UuidV7Generator idGenerator
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.idGenerator = Objects.requireNonNull(idGenerator, "idGenerator");
    }

    @Override
    public ArticleRecord insertDraft(String title, String slug, String dek, JsonNode content) {
        UUID articleId = idGenerator.next();
        UUID revisionId = idGenerator.next();
        jdbcTemplate.update("""
                INSERT INTO article (id, slug, state, version)
                VALUES (?, ?, 'DRAFT', 1)
                """, articleId, slug);
        jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document,
                    state, version
                ) VALUES (?, ?, 1, ?, ?, ?::jsonb, 'DRAFT', 1)
                """, revisionId, articleId, title, dek, json(content));
        syncMediaReferences(revisionId, content);
        return find(articleId).orElseThrow(() -> new IllegalStateException(
                "inserted article was not readable"));
    }

    @Override
    public Optional<ArticleRecord> find(UUID articleId) {
        Objects.requireNonNull(articleId, "articleId");
        return jdbcTemplate.query(
                ARTICLE_COLUMNS + " WHERE a.id = ?",
                resultSet -> resultSet.next()
                        ? Optional.of(mapArticle(resultSet))
                        : Optional.empty(),
                articleId
        );
    }

    @Override
    public List<ArticleRecord> list(int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("limit must be between 1 and 100");
        }
        return jdbcTemplate.query(
                ARTICLE_COLUMNS + " WHERE a.state <> 'ARCHIVED'"
                        + " ORDER BY a.updated_at DESC, a.id DESC LIMIT ?",
                (resultSet, rowNumber) -> mapArticle(resultSet),
                limit
        );
    }

    @Override
    public boolean updateDraft(
            UUID articleId,
            UUID revisionId,
            long expectedArticleVersion,
            long expectedRevisionVersion,
            String title,
            String slug,
            String dek,
            JsonNode content
    ) {
        int articleRows = jdbcTemplate.update("""
                UPDATE article
                SET slug = ?, version = version + 1, updated_at = transaction_timestamp()
                WHERE id = ? AND state = 'DRAFT' AND version = ?
                """, slug, articleId, expectedArticleVersion);
        if (articleRows != 1) {
            return false;
        }
        int revisionRows = jdbcTemplate.update("""
                UPDATE article_revision
                SET title = ?, dek = ?, content_document = ?::jsonb,
                    version = version + 1, updated_at = transaction_timestamp()
                WHERE article_id = ? AND id = ? AND state = 'DRAFT' AND version = ?
                """, title, dek, json(content), articleId, revisionId, expectedRevisionVersion);
        if (revisionRows != 1) {
            throw new IllegalStateException("article and revision versions diverged");
        }
        syncMediaReferences(revisionId, content);
        return true;
    }

    @Override
    public boolean createRevision(
            UUID articleId,
            long expectedArticleVersion,
            String title,
            String dek,
            JsonNode content
    ) {
        int articleRows = jdbcTemplate.update("""
                UPDATE article
                SET state = 'DRAFT', version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND version = ?
                """, articleId, expectedArticleVersion);
        if (articleRows != 1) {
            return false;
        }
        UUID revisionId = idGenerator.next();
        int revisionRows = jdbcTemplate.update("""
                INSERT INTO article_revision (
                    id, article_id, revision_number, title, dek, content_document,
                    state, version
                )
                SELECT ?, ?, COALESCE(MAX(revision_number), 0) + 1,
                       ?, ?, ?::jsonb, 'DRAFT', 1
                FROM article_revision
                WHERE article_id = ?
                """, revisionId, articleId, title, dek, json(content), articleId);
        if (revisionRows != 1) {
            throw new IllegalStateException("article revision was not inserted");
        }
        syncMediaReferences(revisionId, content);
        return true;
    }

    private void syncMediaReferences(UUID revisionId, JsonNode content) {
        List<UUID> assetIds = ContentMediaReferences.extract(content);
        if (!assetIds.isEmpty()) {
            String placeholders = String.join(", ", java.util.Collections.nCopies(assetIds.size(), "?"));
            List<UUID> existingAssetIds = jdbcTemplate.query(
                    "SELECT id FROM media_asset WHERE id IN (" + placeholders + ")",
                    (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
                    assetIds.toArray()
            );
            if (existingAssetIds.size() != assetIds.size()) {
                throw EditorialProblemException.invalid(
                        "/content",
                        "MEDIA_REFERENCE_NOT_FOUND",
                        "content references a media asset that does not exist"
                );
            }
        }
        jdbcTemplate.query(
                "SELECT replace_public_article_revision_media(?, ?::jsonb)",
                resultSet -> null,
                revisionId,
                json(assetIds)
        );
    }

    @Override
    public boolean transition(
            UUID articleId,
            UUID revisionId,
            long expectedArticleVersion,
            long expectedRevisionVersion,
            PublicationState currentState,
            PublicationState nextState,
            PublicationState nextRevisionState,
            Instant publishedAt
    ) {
        UUID publishedRevisionId = nextState == PublicationState.PUBLISHED ? revisionId : null;
        int articleRows = jdbcTemplate.update("""
                UPDATE article
                SET state = ?,
                    version = version + 1,
                    published_revision_id = CASE WHEN ? = 'PUBLISHED'
                        THEN ? ELSE published_revision_id END,
                    published_at = CASE WHEN ? = 'PUBLISHED'
                        THEN ? ELSE published_at END,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND state = ? AND version = ?
                """,
                nextState.name(),
                nextState.name(),
                publishedRevisionId,
                nextState.name(),
                publishedAt == null ? null : Timestamp.from(publishedAt),
                articleId,
                currentState.name(),
                expectedArticleVersion
        );
        if (articleRows != 1) {
            return false;
        }
        if (nextRevisionState != null) {
            int revisionRows = jdbcTemplate.update("""
                    UPDATE article_revision
                    SET state = ?, version = version + 1, updated_at = transaction_timestamp()
                    WHERE article_id = ? AND id = ? AND version = ?
                    """, nextRevisionState.name(), articleId, revisionId, expectedRevisionVersion);
            if (revisionRows != 1) {
                throw new IllegalStateException("article and revision transition versions diverged");
            }
        }
        return true;
    }

    @Override
    public List<PublicationReadinessService.MediaRequirement> mediaRequirements(UUID revisionId) {
        Map<UUID, MediaRequirementAccumulator> requirements = jdbcTemplate.query(
                MEDIA_REQUIREMENTS_SQL,
                mediaRequirementExtractor(),
                revisionId
        );
        return requirements.values().stream()
                .map(MediaRequirementAccumulator::toRequirement)
                .toList();
    }

    @Override
    public List<PublicationReadinessService.MediaRequirement> lockMediaRequirements(UUID revisionId) {
        List<UUID> assetIds = jdbcTemplate.query(
                """
                SELECT asset.id
                FROM article_revision_media link
                JOIN media_asset asset ON asset.id = link.asset_id
                WHERE link.article_revision_id = ?
                ORDER BY link.position, asset.id
                FOR UPDATE OF asset
                """,
                (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
                revisionId
        );
        for (UUID assetId : assetIds) {
            jdbcTemplate.query(
                    "SELECT id FROM rights_record WHERE asset_id = ? ORDER BY id FOR UPDATE",
                    (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
                    assetId
            );
        }
        return mediaRequirements(revisionId);
    }

    @Override
    public List<Contributor> contributors(UUID revisionId) {
        Objects.requireNonNull(revisionId, "revisionId");
        return jdbcTemplate.query(
                """
                SELECT contributor.id AS contributor_id,
                       contributor.slug,
                       contributor.display_name,
                       article_contributor.role
                FROM article_contributor
                JOIN contributor
                  ON contributor.id = article_contributor.contributor_id
                WHERE article_contributor.article_revision_id = ?
                ORDER BY article_contributor.position, article_contributor.id
                """,
                (resultSet, rowNumber) -> new Contributor(
                        resultSet.getObject("contributor_id", UUID.class),
                        resultSet.getString("slug"),
                        resultSet.getString("display_name"),
                        resultSet.getString("role")
                ),
                revisionId
        );
    }

    @Override
    public List<PublicArticleMedia> publicMedia(UUID revisionId, Instant checkedAt) {
        Objects.requireNonNull(revisionId, "revisionId");
        Objects.requireNonNull(checkedAt, "checkedAt");
        JsonNode content = jdbcTemplate.queryForObject(
                "SELECT content_document FROM article_revision WHERE id = ?",
                (resultSet, rowNumber) -> parseJson(resultSet.getString("content_document")),
                revisionId
        );
        List<ContentMediaReferences.MediaReference> references =
                ContentMediaReferences.extractPublicVariants(content);
        if (references.size() > 5_000) {
            throw new IllegalArgumentException("publication media exceeds the bounded snapshot limit");
        }
        if (references.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(
                ", ",
                java.util.Collections.nCopies(references.size(), "(?, ?)")
        );
        List<Object> parameters = new ArrayList<>();
        parameters.add(Timestamp.from(checkedAt));
        parameters.add(Timestamp.from(checkedAt));
        parameters.add(revisionId);
        for (ContentMediaReferences.MediaReference reference : references) {
            parameters.add(reference.assetId());
            parameters.add(reference.variant());
        }
        List<PublicArticleMedia> media = jdbcTemplate.query(
                PUBLIC_MEDIA_SQL.replace("%s", placeholders),
                (resultSet, rowNumber) -> new PublicArticleMedia(
                        resultSet.getObject("asset_id", UUID.class),
                        resultSet.getString("variant"),
                        "/media/" + resultSet.getString("public_storage_key"),
                        resultSet.getString("mime_type"),
                        resultSet.getInt("width"),
                        resultSet.getInt("height"),
                        resultSet.getString("alt_text"),
                        resultSet.getString("credit"),
                        resultSet.getString("rights_owner"),
                        resultSet.getString("license_name")
                ),
                parameters.toArray()
        );
        if (media.size() > 5_000) {
            throw new IllegalArgumentException("publication media exceeds the bounded snapshot limit");
        }
        return List.copyOf(media);
    }

    @Override
    public void appendReview(
            UUID articleId,
            UUID revisionId,
            String reviewerSubject,
            String reviewerRole,
            String decision,
            String reason
    ) {
        jdbcTemplate.update("""
                INSERT INTO publication_review (
                    aggregate_type, aggregate_id, revision_id, reviewer_subject,
                    reviewer_role, decision, reason
                ) VALUES ('ARTICLE', ?, ?, ?, ?, ?, ?)
                """, articleId, revisionId, reviewerSubject, reviewerRole, decision, reason);
    }

    @Override
    public void appendRightsReference(
            UUID articleId,
            UUID revisionId,
            UUID assetId,
            String requiredChannel,
            String decisionCode,
            String checkedBy,
            Instant checkedAt,
            UUID rightsRecordId,
            Long rightsRecordVersion
    ) {
        jdbcTemplate.update("""
                INSERT INTO publication_rights_reference (
                    aggregate_type, aggregate_id, revision_id, asset_id,
                    required_channel, decision_code, checked_at, checked_by,
                    rights_record_id, rights_record_version
                ) VALUES ('ARTICLE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (
                    aggregate_type, aggregate_id, revision_id, asset_id, required_channel, checked_at
                ) DO NOTHING
                """,
                articleId,
                revisionId,
                assetId,
                requiredChannel,
                decisionCode,
                Timestamp.from(checkedAt),
                checkedBy,
                rightsRecordId,
                rightsRecordVersion
        );
    }

    @Override
    public void appendPublicationSnapshot(
            UUID articleId,
            UUID revisionId,
            long snapshotVersion,
            JsonNode content,
            String checksumSha256,
            String createdBy,
            List<UUID> assetIds
    ) {
        UUID snapshotId = idGenerator.next();
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot (
                    id, aggregate_type, aggregate_id, revision_id,
                    snapshot_version, content_document, checksum_sha256, created_by
                ) VALUES (?, 'ARTICLE', ?, ?, ?, ?::jsonb, ?, ?)
                """,
                snapshotId,
                articleId,
                revisionId,
                snapshotVersion,
                json(content),
                checksumSha256,
                createdBy
        );
        for (UUID assetId : assetIds) {
            jdbcTemplate.update("""
                    INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type)
                    VALUES (?, ?, 'CONTENT_MEDIA')
                    """, snapshotId, assetId);
        }
    }

    @Override
    public void appendPublicationJob(
            UUID articleId,
            UUID revisionId,
            String operation,
            String idempotencyKey,
            String requestedBy,
            Instant scheduledAt,
            String timezone
    ) {
        jdbcTemplate.update("""
                INSERT INTO publication_job (
                    aggregate_type, aggregate_id, operation, idempotency_key,
                    requested_by, scheduled_at, timezone, payload
                ) VALUES ('ARTICLE', ?, ?, ?, ?, ?, ?, ?::jsonb)
                """,
                articleId,
                operation,
                idempotencyKey,
                requestedBy,
                scheduledAt == null ? null : Timestamp.from(scheduledAt),
                timezone,
                json(Map.of("revisionId", revisionId.toString()))
        );
    }

    @Override
    public Optional<PublicationJobRecord> findPublicationJob(
            String requestedBy,
            String operation,
            String idempotencyKey
    ) {
        return jdbcTemplate.query(
                """
                SELECT id, aggregate_id, operation, idempotency_key, requested_by,
                       scheduled_at, status, payload
                FROM publication_job
                WHERE aggregate_type = 'ARTICLE'
                  AND requested_by = ?
                  AND operation = ?
                  AND idempotency_key = ?
                FOR UPDATE
                """,
                resultSet -> resultSet.next()
                        ? Optional.of(new PublicationJobRecord(
                                resultSet.getObject("id", UUID.class),
                                resultSet.getObject("aggregate_id", UUID.class),
                                resultSet.getString("operation"),
                                resultSet.getString("idempotency_key"),
                                resultSet.getString("requested_by"),
                                instant(resultSet.getTimestamp("scheduled_at")),
                                resultSet.getString("status"),
                                parseJson(resultSet.getString("payload"))
                        ))
                        : Optional.empty(),
                requestedBy,
                operation,
                idempotencyKey
        );
    }

    @Override
    public void markPublicationJobSucceeded(UUID jobId, Instant processedAt) {
        int updated = jdbcTemplate.update(
                """
                UPDATE publication_job
                SET status = 'SUCCEEDED', processed_at = ?, updated_at = transaction_timestamp(),
                    last_error = NULL
                WHERE id = ? AND status IN ('PENDING', 'FAILED')
                """,
                Timestamp.from(processedAt),
                jobId
        );
        if (updated != 1) {
            throw new IllegalStateException("publication job was changed before success acknowledgement");
        }
    }

    @Override
    public void markPublicationJobBlocked(UUID jobId, String reason, Instant processedAt) {
        int updated = jdbcTemplate.update(
                """
                UPDATE publication_job
                SET status = 'BLOCKED', processed_at = ?, updated_at = transaction_timestamp(),
                    last_error = LEFT(?, 4000)
                WHERE id = ? AND status IN ('PENDING', 'FAILED')
                """,
                Timestamp.from(processedAt),
                reason,
                jobId
        );
        if (updated != 1) {
            throw new IllegalStateException("publication job was changed before blocked acknowledgement");
        }
    }

    @Override
    public boolean hasPublicationSnapshot(UUID articleId, UUID revisionId) {
        Boolean exists = jdbcTemplate.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM publication_snapshot
                    WHERE aggregate_type = 'ARTICLE'
                      AND aggregate_id = ?
                      AND revision_id = ?
                )
                """,
                Boolean.class,
                articleId,
                revisionId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public Optional<IdempotencyRecord> findIdempotency(
            String actorSubject,
            String operation,
            String idempotencyKey
    ) {
        return jdbcTemplate.query(
                """
                SELECT request_hash_sha256, response
                FROM publication_idempotency
                WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?
                """,
                resultSet -> resultSet.next()
                        ? Optional.of(new IdempotencyRecord(
                                resultSet.getString("request_hash_sha256"),
                                resultSet.getString("response")
                        ))
                        : Optional.empty(),
                actorSubject,
                operation,
                idempotencyKey
        );
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

    @Override
    public long nextSnapshotVersion(UUID articleId) {
        Long next = jdbcTemplate.queryForObject(
                """
                SELECT COALESCE(MAX(snapshot_version), 0) + 1
                FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ?
                """,
                Long.class,
                articleId
        );
        return next == null ? 1L : next;
    }

    private ArticleRecord mapArticle(ResultSet resultSet) throws SQLException {
        return new ArticleRecord(
                resultSet.getObject("article_id", UUID.class),
                resultSet.getObject("revision_id", UUID.class),
                resultSet.getInt("revision_number"),
                resultSet.getString("slug"),
                resultSet.getString("title"),
                resultSet.getString("dek"),
                parseJson(resultSet.getString("content_document")),
                PublicationState.valueOf(resultSet.getString("article_state")),
                PublicationState.valueOf(resultSet.getString("revision_state")),
                resultSet.getLong("article_version"),
                resultSet.getLong("revision_version"),
                instant(resultSet.getTimestamp("scheduled_for")),
                instant(resultSet.getTimestamp("revision_updated_at"))
        );
    }

    private ResultSetExtractor<Map<UUID, MediaRequirementAccumulator>> mediaRequirementExtractor() {
        return resultSet -> {
            Map<UUID, MediaRequirementAccumulator> result = new LinkedHashMap<>();
            while (resultSet.next()) {
                UUID assetId = resultSet.getObject("asset_id", UUID.class);
                MediaRequirementAccumulator accumulator = result.get(assetId);
                if (accumulator == null) {
                    accumulator = new MediaRequirementAccumulator(
                            assetId,
                            MediaProcessingState.valueOf(resultSet.getString("processing_state")),
                            new ArrayList<>()
                    );
                    result.put(assetId, accumulator);
                }
                UUID rightsId = resultSet.getObject("rights_id", UUID.class);
                if (rightsId != null) {
                    accumulator.rightsRecords().add(new RightsPolicy.RightsRecord(
                            rightsId,
                            assetId,
                            resultSet.getLong("rights_version"),
                            RightsPolicy.Status.valueOf(resultSet.getString("rights_status")),
                            channels(resultSet.getArray("allowed_channels")),
                            instant(resultSet.getTimestamp("valid_from")),
                            instant(resultSet.getTimestamp("valid_until"))
                    ));
                }
            }
            return result;
        };
    }

    private JsonNode parseJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException("stored article content is not valid JSON", exception);
        }
    }

    private String json(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize article content", exception);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize publication job payload", exception);
        }
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static Set<String> channels(Array value) throws SQLException {
        if (value == null) {
            return Set.of();
        }
        try {
            Object raw = value.getArray();
            if (raw instanceof String[] strings) {
                return Set.copyOf(List.of(strings));
            }
            throw new IllegalArgumentException("rights channels must be text[]");
        } finally {
            value.free();
        }
    }

    private record MediaRequirementAccumulator(
            UUID assetId,
            MediaProcessingState processingState,
            List<RightsPolicy.RightsRecord> rightsRecords
    ) {
        private PublicationReadinessService.MediaRequirement toRequirement() {
            return new PublicationReadinessService.MediaRequirement(
                    assetId,
                    processingState,
                    rightsRecords
            );
        }
    }
}
