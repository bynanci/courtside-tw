package tw.basketball.magazine.media.application;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
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

/** Persists editor-owned media accessibility and rights metadata. */
public final class EditorialMediaMetadataService {
    private static final Set<String> ALLOWED_CHANNELS = Set.of(
            "PUBLIC_WEB", "READER_LIBRARY", "OFFLINE", "PROVENANCE"
    );

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    public EditorialMediaMetadataService(
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

    public EditorialWorkflowService.OperationResult get(ActorContext actor, UUID assetId) {
        requireEditor(actor);
        MediaMetadata metadata = find(assetId).orElseThrow(() -> EditorialProblemException.notFound(
                "/id", "media asset was not found"
        ));
        return result(metadata);
    }

    public EditorialWorkflowService.OperationResult update(
            ActorContext actor,
            UUID assetId,
            Version expectedAssetVersion,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(assetId, "assetId");
        Objects.requireNonNull(expectedAssetVersion, "expectedAssetVersion");
        JsonNode request = object(body);
        String altText = requiredText(request, "altText", "/altText", 1000);
        RightsInput rights = request.has("rights") && !request.get("rights").isNull()
                ? parseRights(request.get("rights"))
                : null;

        EditorialWorkflowService.OperationResult result = transactionTemplate.execute(status -> {
            MediaMetadata current = find(assetId).orElseThrow(() -> EditorialProblemException.notFound(
                    "/id", "media asset was not found"
            ));
            if (current.assetVersion() != expectedAssetVersion.value()) {
                throw new VersionConflictException(
                        expectedAssetVersion,
                        new Version(current.assetVersion())
                );
            }
            if (current.state() == MediaProcessingState.REVOKED) {
                throw new EditorialProblemException(
                        ProblemCode.VERSION_CONFLICT,
                        List.of(new FieldError(
                                "/state", "MEDIA_REVOKED", "revoked media metadata cannot be changed"
                        ))
                );
            }
            if (jdbcTemplate.update(
                    """
                    UPDATE media_asset
                    SET alt_text = ?,
                        processing_state = CASE
                            WHEN processing_state = 'PROCESSING'
                                 AND EXISTS (
                                     SELECT 1 FROM media_variant variant
                                     WHERE variant.asset_id = media_asset.id
                                 )
                                THEN 'READY'
                            ELSE processing_state
                        END,
                        version = version + 1, updated_at = transaction_timestamp()
                    WHERE id = ? AND version = ? AND processing_state <> 'REVOKED'
                    """,
                    altText,
                    assetId,
                    expectedAssetVersion.value()
            ) != 1) {
                throw new VersionConflictException(
                        expectedAssetVersion,
                        new Version(currentVersion(assetId))
                );
            }
            if (rights != null) {
                persistRights(assetId, current.rights(), rights);
            }
            MediaMetadata updated = find(assetId).orElseThrow(() -> new IllegalStateException(
                    "updated media metadata disappeared"
            ));
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "MEDIA_METADATA_UPDATED",
                    "MEDIA_ASSET",
                    assetId,
                    Map.of(
                            "altTextPresent", !altText.isBlank(),
                            "rightsUpdated", rights != null,
                            "state", updated.state().name()
                    )
            ));
            return result(updated);
        });
        return Objects.requireNonNull(result, "metadata transaction returned no result");
    }

    private void persistRights(UUID assetId, RightsRecord current, RightsInput input) {
        if (current == null) {
            if (input.version() != null) {
                throw EditorialProblemException.invalid(
                        "/rights/version", "RIGHTS_VERSION_INVALID", "new rights records cannot have a version"
                );
            }
            jdbcTemplate.update(
                    """
                    INSERT INTO rights_record (
                        id, asset_id, rights_owner, license_name, allowed_channels, territories,
                        valid_from, valid_until, credit, withdrawal_terms, status, version
                    ) VALUES (uuidv7(), ?, ?, ?, ?::text[], ?::text[], ?, ?, ?, ?, ?, 0)
                    """,
                    assetId,
                    input.owner(),
                    input.licenseName(),
                    arrayLiteral(input.allowedChannels()),
                    arrayLiteral(input.territories()),
                    java.sql.Timestamp.from(input.validFrom()),
                    java.sql.Timestamp.from(input.validUntil()),
                    input.credit(),
                    input.withdrawalTerms(),
                    input.status()
            );
            return;
        }
        if (input.version() == null) {
            throw EditorialProblemException.gate(
                    "/rights/version", "RIGHTS_VERSION_REQUIRED", "existing rights records require a version"
            );
        }
        if (current.version() != input.version()) {
            throw new VersionConflictException(
                    new Version(input.version()),
                    new Version(current.version())
            );
        }
        if (jdbcTemplate.update(
                """
                UPDATE rights_record
                SET rights_owner = ?, license_name = ?, allowed_channels = ?::text[],
                    territories = ?::text[], valid_from = ?, valid_until = ?, credit = ?,
                    withdrawal_terms = ?, status = ?, version = version + 1,
                    updated_at = transaction_timestamp()
                WHERE id = ? AND asset_id = ? AND version = ?
                """,
                input.owner(),
                input.licenseName(),
                arrayLiteral(input.allowedChannels()),
                arrayLiteral(input.territories()),
                java.sql.Timestamp.from(input.validFrom()),
                java.sql.Timestamp.from(input.validUntil()),
                input.credit(),
                input.withdrawalTerms(),
                input.status(),
                current.id(),
                assetId,
                input.version()
        ) != 1) {
            throw new VersionConflictException(
                    new Version(input.version()),
                    new Version(currentVersion(assetId))
            );
        }
    }

    private java.util.Optional<MediaMetadata> find(UUID assetId) {
        return jdbcTemplate.query(
                """
                SELECT asset.id, asset.alt_text, asset.processing_state, asset.version,
                       rights.id AS rights_id, rights.rights_owner, rights.license_name,
                       rights.allowed_channels, rights.territories, rights.valid_from,
                       rights.valid_until, rights.credit, rights.withdrawal_terms,
                       rights.status, rights.version AS rights_version
                FROM media_asset asset
                LEFT JOIN LATERAL (
                    SELECT *
                    FROM rights_record
                    WHERE rights_record.asset_id = asset.id
                    ORDER BY rights_record.updated_at DESC, rights_record.id DESC
                    LIMIT 1
                ) rights ON TRUE
                WHERE asset.id = ?
                """,
                resultSet -> resultSet.next()
                        ? java.util.Optional.of(mapMetadata(resultSet))
                        : java.util.Optional.empty(),
                assetId
        );
    }

    private MediaMetadata mapMetadata(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        UUID rightsId = resultSet.getObject("rights_id", UUID.class);
        return new MediaMetadata(
                resultSet.getObject("id", UUID.class),
                resultSet.getLong("version"),
                resultSet.getString("alt_text"),
                MediaProcessingState.valueOf(resultSet.getString("processing_state")),
                rightsId == null
                        ? null
                        : new RightsRecord(
                                rightsId,
                                resultSet.getLong("rights_version"),
                                resultSet.getString("rights_owner"),
                                resultSet.getString("license_name"),
                                textArray(resultSet.getArray("allowed_channels")),
                                textArray(resultSet.getArray("territories")),
                                resultSet.getTimestamp("valid_from").toInstant(),
                                resultSet.getTimestamp("valid_until").toInstant(),
                                resultSet.getString("credit"),
                                resultSet.getString("withdrawal_terms"),
                                resultSet.getString("status")
                        )
        );
    }

    private EditorialWorkflowService.OperationResult result(MediaMetadata metadata) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("assetId", metadata.assetId().toString());
        response.put("version", metadata.assetVersion());
        response.put("altText", metadata.altText());
        response.put("state", metadata.state().name());
        if (metadata.rights() != null) {
            Map<String, Object> rights = new LinkedHashMap<>();
            rights.put("id", metadata.rights().id().toString());
            rights.put("version", metadata.rights().version());
            rights.put("rightsOwner", metadata.rights().owner());
            rights.put("licenseName", metadata.rights().licenseName());
            rights.put("allowedChannels", metadata.rights().allowedChannels());
            rights.put("territories", metadata.rights().territories());
            rights.put("validFrom", metadata.rights().validFrom().toString());
            rights.put("validUntil", metadata.rights().validUntil().toString());
            rights.put("credit", metadata.rights().credit());
            rights.put("withdrawalTerms", metadata.rights().withdrawalTerms());
            rights.put("status", metadata.rights().status());
            response.put("rights", rights);
        } else {
            response.put("rights", null);
        }
        return new EditorialWorkflowService.OperationResult(200, json(response), metadata.assetVersion());
    }

    private RightsInput parseRights(JsonNode value) {
        if (value == null || !value.isObject()) {
            throw EditorialProblemException.invalid("/rights", "OBJECT_REQUIRED", "rights must be an object");
        }
        Long version = optionalNonNegativeLong(value, "version", "/rights/version");
        List<String> allowedChannels = requiredStringList(value, "allowedChannels", "/rights/allowedChannels");
        if (!ALLOWED_CHANNELS.containsAll(allowedChannels)) {
            throw EditorialProblemException.invalid(
                    "/rights/allowedChannels", "CHANNEL_INVALID", "rights channel is not allowlisted"
            );
        }
        List<String> territories = requiredStringList(value, "territories", "/rights/territories");
        String status = requiredEnum(value, "status", "/rights/status", Set.of(
                "UNKNOWN", "PENDING", "VALID", "EXPIRED", "REVOKED", "BLOCKED"
        ));
        Instant validFrom = instant(value, "validFrom", "/rights/validFrom");
        Instant validUntil = instant(value, "validUntil", "/rights/validUntil");
        if (!validUntil.isAfter(validFrom)) {
            throw EditorialProblemException.invalid(
                    "/rights/validUntil", "RIGHTS_TIME_INVALID", "validUntil must be after validFrom"
            );
        }
        return new RightsInput(
                version,
                requiredText(value, "rightsOwner", "/rights/rightsOwner", 512),
                requiredText(value, "licenseName", "/rights/licenseName", 512),
                allowedChannels,
                territories,
                validFrom,
                validUntil,
                requiredText(value, "credit", "/rights/credit", 1000),
                requiredText(value, "withdrawalTerms", "/rights/withdrawalTerms", 2000),
                status
        );
    }

    private static List<String> requiredStringList(JsonNode value, String field, String path) {
        JsonNode node = value.get(field);
        if (node == null || !node.isArray() || node.isEmpty() || node.size() > 16) {
            throw EditorialProblemException.invalid(path, "LIST_REQUIRED", "a bounded non-empty list is required");
        }
        List<String> result = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isString() || item.asString().isBlank() || item.asString().length() > 64
                    || item.asString().codePoints().anyMatch(Character::isISOControl)
                    || !item.asString().matches("^[A-Za-z0-9_-]{1,64}$")) {
                throw EditorialProblemException.invalid(path, "LIST_ITEM_INVALID", "list items are invalid");
            }
            result.add(item.asString());
        }
        return List.copyOf(result);
    }

    private static String requiredEnum(JsonNode value, String field, String path, Set<String> allowed) {
        String text = requiredText(value, field, path, 32).toUpperCase(Locale.ROOT);
        if (!allowed.contains(text)) {
            throw EditorialProblemException.invalid(path, "ENUM_INVALID", "value is not allowlisted");
        }
        return text;
    }

    private static Long optionalNonNegativeLong(JsonNode value, String field, String path) {
        JsonNode node = value.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isIntegralNumber() || node.asLong() < 0) {
            throw EditorialProblemException.invalid(path, "VERSION_INVALID", "version must be non-negative");
        }
        return node.asLong();
    }

    private static Instant instant(JsonNode value, String field, String path) {
        String raw = requiredText(value, field, path, 80);
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException exception) {
            throw EditorialProblemException.invalid(path, "DATETIME_INVALID", "value must be an ISO instant");
        }
    }

    private static String requiredText(JsonNode value, String field, String path, int maximum) {
        JsonNode node = value.get(field);
        if (node == null || !node.isString()) {
            throw EditorialProblemException.invalid(path, "TEXT_REQUIRED", "a text value is required");
        }
        String text = node.asString().strip();
        if (text.isBlank() || text.length() > maximum
                || text.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(path, "TEXT_OUT_OF_RANGE", "text is outside the allowed bounds");
        }
        return text;
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
            throw EditorialProblemException.invalid("/", "MALFORMED_JSON", "request body is not valid JSON");
        }
    }

    private long currentVersion(UUID assetId) {
        Long version = jdbcTemplate.queryForObject(
                "SELECT version FROM media_asset WHERE id = ?", Long.class, assetId
        );
        return Objects.requireNonNull(version, "media asset version");
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize media metadata", exception);
        }
    }

    private static String arrayLiteral(List<String> values) {
        return "{" + String.join(",", values) + "}";
    }

    private static List<String> textArray(java.sql.Array array) throws java.sql.SQLException {
        if (array == null) {
            return List.of();
        }
        try {
            Object value = array.getArray();
            if (!(value instanceof String[] strings)) {
                throw new IllegalArgumentException("rights array must contain text values");
            }
            return List.of(strings);
        } finally {
            array.free();
        }
    }

    private static void requireEditor(ActorContext actor) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.EDITOR)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires role EDITOR");
        }
    }

    private record MediaMetadata(
            UUID assetId,
            long assetVersion,
            String altText,
            MediaProcessingState state,
            RightsRecord rights
    ) {
    }

    private record RightsRecord(
            UUID id,
            long version,
            String owner,
            String licenseName,
            List<String> allowedChannels,
            List<String> territories,
            Instant validFrom,
            Instant validUntil,
            String credit,
            String withdrawalTerms,
            String status
    ) {
    }

    private record RightsInput(
            Long version,
            String owner,
            String licenseName,
            List<String> allowedChannels,
            List<String> territories,
            Instant validFrom,
            Instant validUntil,
            String credit,
            String withdrawalTerms,
            String status
    ) {
    }
}
