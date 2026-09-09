package tw.basketball.magazine.media.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/** Publisher-only rights revocation with a durable impact report. */
public final class PublisherMediaService {
    private static final String OPERATION = "REVOKE_MEDIA";

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    public PublisherMediaService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    public EditorialWorkflowService.OperationResult revoke(
            ActorContext actor,
            UUID assetId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requirePublisher(actor);
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        String reason = reason(object(body));
        String requestHash = sha256(OPERATION + "|" + assetId + "|"
                + expectedVersion.value() + "|" + reason);
        validateIdempotencyKey(idempotencyKey);

        EditorialWorkflowService.OperationResult result;
        try {
            result = transactionTemplate.execute(status -> {
                lock(actor.subject(), idempotencyKey);
                var receipt = findReceipt(actor.subject(), idempotencyKey);
                if (receipt != null) {
                    if (!receipt.requestHash.equals(requestHash)) {
                        throw new EditorialProblemException(
                                ProblemCode.VERSION_CONFLICT,
                                List.of(new FieldError(
                                        "/Idempotency-Key", "IDEMPOTENCY_KEY_REUSE",
                                        "the idempotency key is already bound to another request"
                                ))
                        );
                    }
                    String replayBody = canonicalJson(receipt.response);
                    return new EditorialWorkflowService.OperationResult(
                            200, replayBody, versionFrom(replayBody)
                    );
                }

                MediaRow media = jdbcTemplate.query("""
                        SELECT processing_state, version
                        FROM media_asset
                        WHERE id = ?
                        FOR UPDATE
                        """, resultSet -> resultSet.next()
                        ? new MediaRow(
                                MediaProcessingState.valueOf(resultSet.getString("processing_state")),
                                resultSet.getLong("version")
                        )
                        : null, assetId);
                if (media == null) {
                    throw EditorialProblemException.notFound("/id", "media asset was not found");
                }
                if (media.version != expectedVersion.value()) {
                    throw new VersionConflictException(expectedVersion, new Version(media.version));
                }
                if (jdbcTemplate.update("""
                        UPDATE media_asset
                        SET processing_state = 'REVOKED', version = version + 1,
                            updated_at = transaction_timestamp()
                        WHERE id = ? AND version = ? AND processing_state <> 'REVOKED'
                        """, assetId, expectedVersion.value()) != 1) {
                    throw new VersionConflictException(
                            expectedVersion,
                            new Version(currentVersion(assetId))
                    );
                }

                // Publication readiness takes the same asset row lock, so no concurrent
                // publication can pass a READY check between revocation and impact discovery.
                jdbcTemplate.update("""
                        INSERT INTO publication_impact_link (snapshot_id, asset_id, impact_type)
                        SELECT snapshot.id, link.asset_id, 'CONTENT_MEDIA'
                        FROM publication_snapshot snapshot
                        JOIN article_revision_media link ON link.article_revision_id = snapshot.revision_id
                        WHERE snapshot.aggregate_type = 'ARTICLE' AND link.asset_id = ?
                        ON CONFLICT (snapshot_id, asset_id, impact_type) DO NOTHING
                        """, assetId);
                closeAffectedOrigins(actor, assetId, reason);
                List<UUID> affectedArticles = jdbcTemplate.query("""
                        SELECT DISTINCT snapshot.aggregate_id
                        FROM publication_snapshot snapshot
                        JOIN publication_impact_link impact ON impact.snapshot_id = snapshot.id
                        WHERE snapshot.aggregate_type = 'ARTICLE' AND impact.asset_id = ?
                        ORDER BY snapshot.aggregate_id
                        """, (row, index) -> row.getObject(1, UUID.class), assetId);
                List<UUID> affectedPackages = jdbcTemplate.query("""
                        SELECT DISTINCT issue.aggregate_id
                        FROM publication_snapshot issue
                        WHERE issue.aggregate_type = 'ISSUE'
                          AND (issue.content_document->>'coverAssetId' = ?
                            OR EXISTS (SELECT 1 FROM publication_impact_link impact
                                       WHERE impact.snapshot_id = issue.id AND impact.asset_id = ?)
                            OR EXISTS (
                                SELECT 1 FROM jsonb_path_query(issue.content_document, '$.sections[*].articles[*]') member
                                JOIN publication_snapshot article
                                  ON article.aggregate_type = 'ARTICLE'
                                 AND article.aggregate_id::text = member->>'articleId'
                                 AND (member->>'revisionId' IS NULL OR article.revision_id::text = member->>'revisionId')
                                JOIN publication_impact_link impact ON impact.snapshot_id = article.id
                                WHERE impact.asset_id = ?))
                        ORDER BY issue.aggregate_id
                        """, (row, index) -> row.getObject(1, UUID.class), assetId.toString(), assetId, assetId);
                appendImpact(assetId, "MEDIA_ASSET", assetId);
                for (UUID articleId : affectedArticles) {
                    appendImpact(assetId, "ARTICLE", articleId);
                }
                for (UUID issueId : affectedPackages) {
                    appendImpact(assetId, "ISSUE", issueId);
                }
                jdbcTemplate.update("""
                        INSERT INTO outbox_event (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
                        VALUES ('media.rights.revoked', 'MEDIA_ASSET', ?, ?, ?::jsonb)
                        """, assetId, "media-revocation:" + assetId, json(Map.of("assetId", assetId.toString())));
                Map<String, Object> responseMap = new LinkedHashMap<>();
                responseMap.put("assetId", assetId.toString());
                responseMap.put("affectedArticles", affectedArticles.stream().map(UUID::toString).toList());
                responseMap.put("affectedOfflinePackages", affectedPackages.stream().map(UUID::toString).toList());
                responseMap.put("status", "REVOKED");
                responseMap.put("version", expectedVersion.next().value());
                String response = json(responseMap);
                jdbcTemplate.update("""
                        INSERT INTO publication_idempotency (
                            actor_subject, operation, idempotency_key,
                            request_hash_sha256, response
                        ) VALUES (?, 'REVOKE_MEDIA', ?, ?, ?::jsonb)
                        """, actor.subject(), idempotencyKey, requestHash, response);
                auditWriter.append(new AuditEventDraft(
                        actor,
                        "MEDIA_REVOKED",
                        "MEDIA_ASSET",
                        assetId,
                        Map.of("reason", reason, "affectedArticles", affectedArticles.size(),
                                "affectedOfflinePackages", affectedPackages.size())
                ));
                Receipt persisted = findReceipt(actor.subject(), idempotencyKey);
                if (persisted == null) {
                    throw new IllegalStateException("media revoke receipt disappeared");
                }
                String persistedBody = canonicalJson(persisted.response);
                return new EditorialWorkflowService.OperationResult(
                        200, persistedBody, versionFrom(persistedBody)
                );
            });
        } catch (CannotAcquireLockException exception) {
            // NOWAIT conflicts leave no partial rights/state/receipt changes. The
            // same idempotency key is safe to retry after the publication finishes.
            throw new EditorialProblemException(ProblemCode.VERSION_CONFLICT, List.of(
                    FieldError.currentVersion(expectedVersion),
                    new FieldError("/state", "MEDIA_REVOCATION_BUSY",
                            "concurrent publication is in progress; retry the same idempotency key")
            ));
        }
        return Objects.requireNonNull(result, "transaction returned no revocation result");
    }

    private void appendImpact(UUID assetId, String aggregateType, UUID aggregateId) {
        jdbcTemplate.update("""
                INSERT INTO media_revocation_impact (asset_id, aggregate_type, aggregate_id)
                VALUES (?, ?, ?) ON CONFLICT DO NOTHING
                """, assetId, aggregateType, aggregateId);
    }

    private void closeAffectedOrigins(ActorContext actor, UUID assetId, String reason) {
        List<UUID> articles = jdbcTemplate.query("""
                SELECT article.id FROM article
                WHERE article.state = 'PUBLISHED' AND EXISTS (
                    SELECT 1 FROM publication_snapshot snapshot
                    JOIN publication_impact_link impact ON impact.snapshot_id = snapshot.id
                    WHERE snapshot.aggregate_type = 'ARTICLE'
                      AND snapshot.aggregate_id = article.id
                      AND snapshot.revision_id = article.published_revision_id
                      AND impact.asset_id = ?)
                ORDER BY article.id FOR UPDATE OF article NOWAIT
                """, (row, index) -> row.getObject(1, UUID.class), assetId);
        List<UUID> issues = jdbcTemplate.query("""
                SELECT id FROM publication_issue WHERE cover_asset_id = ? AND state = 'PUBLISHED'
                ORDER BY id FOR UPDATE NOWAIT
                """, (row, index) -> row.getObject(1, UUID.class), assetId);
        for (UUID articleId : articles) {
            jdbcTemplate.update("""
                    UPDATE article_revision SET state = 'WITHDRAWN', version = version + 1,
                        updated_at = transaction_timestamp()
                    WHERE id = (SELECT published_revision_id FROM article WHERE id = ?)
                      AND state = 'PUBLISHED'
                    """, articleId);
            jdbcTemplate.update("""
                    UPDATE article SET state = 'WITHDRAWN', version = version + 1,
                        updated_at = transaction_timestamp() WHERE id = ?
                    """, articleId);
            auditWriter.append(new AuditEventDraft(actor, "ARTICLE_WITHDRAWN", "ARTICLE", articleId,
                    Map.of("reason", reason, "assetId", assetId.toString(), "cause", "MEDIA_REVOKED")));
        }
        for (UUID issueId : issues) {
            jdbcTemplate.update("""
                    UPDATE publication_issue SET state = 'WITHDRAWN', version = version + 1,
                        updated_at = transaction_timestamp() WHERE id = ?
                    """, issueId);
            auditWriter.append(new AuditEventDraft(actor, "ISSUE_WITHDRAWN", "ISSUE", issueId,
                    Map.of("reason", reason, "assetId", assetId.toString(), "cause", "MEDIA_REVOKED")));
        }
    }

    private long currentVersion(UUID assetId) {
        Long value = jdbcTemplate.queryForObject(
                "SELECT version FROM media_asset WHERE id = ?", Long.class, assetId
        );
        return Objects.requireNonNull(value, "media version");
    }

    private Receipt findReceipt(String actorSubject, String key) {
        return jdbcTemplate.query("""
                SELECT request_hash_sha256, response
                FROM publication_idempotency
                WHERE actor_subject = ? AND operation = 'REVOKE_MEDIA' AND idempotency_key = ?
                """, resultSet -> resultSet.next()
                ? new Receipt(
                        resultSet.getString("request_hash_sha256"),
                        resultSet.getString("response")
                )
                : null, actorSubject, key);
    }

    private void lock(String actorSubject, String key) {
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> null,
                idempotencyLockKey(actorSubject, OPERATION, key)
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

    private static String reason(JsonNode request) {
        JsonNode value = request.get("reason");
        if (value == null || !value.isString() || value.asString().isBlank()
                || value.asString().length() > 500
                || value.asString().codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(
                    "/reason", "REASON_REQUIRED", "a bounded reason is required"
            );
        }
        return value.asString();
    }

    private JsonNode object(String body) {
        if (body == null || body.isBlank()) {
            throw EditorialProblemException.invalid("/", "JSON_REQUIRED", "a JSON object is required");
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            if (node == null || !node.isObject()) {
                throw EditorialProblemException.invalid("/", "OBJECT_REQUIRED", "request must be an object");
            }
            return node;
        } catch (EditorialProblemException exception) {
            throw exception;
        } catch (JacksonException exception) {
            throw EditorialProblemException.invalid("/", "JSON_INVALID", "request JSON is invalid");
        }
    }

    private static void requirePublisher(ActorContext actor) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.PUBLISHER)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires role PUBLISHER");
        }
    }

    private static void validateIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > 512
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(
                    "/Idempotency-Key", "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"
            );
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize impact report", exception);
        }
    }

    private String canonicalJson(String value) {
        try {
            return json(objectMapper.readTree(value));
        } catch (JacksonException exception) {
            throw new IllegalStateException("stored media revoke receipt is not valid JSON", exception);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private static long versionFrom(String body) {
        int marker = body.indexOf("\"version\":");
        if (marker < 0) {
            return 0;
        }
        int start = marker + "\"version\":".length();
        int end = start;
        while (end < body.length() && Character.isDigit(body.charAt(end))) {
            end++;
        }
        try {
            return Long.parseLong(body.substring(start, end));
        } catch (RuntimeException exception) {
            return 0;
        }
    }

    private record MediaRow(MediaProcessingState state, long version) {
    }

    private record Receipt(String requestHash, String response) {
    }
}
