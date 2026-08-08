package tw.basketball.magazine.audit;

import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.ObjectMapper;

/** PostgreSQL INSERT-only writer for sanitized audit metadata. */
public final class JdbcAuditWriter implements AuditWriter {
    private static final String INSERT_SQL = """
            INSERT INTO audit_event (
                actor_type,
                actor_subject,
                action,
                target_type,
                target_id,
                request_id,
                metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
            RETURNING id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcAuditWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public UUID append(AuditEventDraft draft) {
        Objects.requireNonNull(draft, "draft");
        String metadataJson = serialize(AuditMetadataSanitizer.sanitize(draft.metadata()));
        UUID id = jdbcTemplate.queryForObject(
                INSERT_SQL,
                (resultSet, rowNumber) -> UUID.fromString(resultSet.getString("id")),
                draft.actor().type().name(),
                AuditMetadataSanitizer.sanitizeActorSubject(draft.actor().subject()),
                draft.action(),
                draft.targetType(),
                draft.targetId(),
                draft.actor().requestId().value(),
                metadataJson
        );
        return Objects.requireNonNull(id, "database returned no audit event id");
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to serialize audit metadata", exception);
        }
    }
}
