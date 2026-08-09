package tw.basketball.magazine.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

final class AuditWriterIntegrationTest extends AuditIntegrationTestSupport {
    private static final UUID TARGET_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000017");

    @Test
    void appendsSanitizedMetadataWithoutOverwritingPriorEvents() {
        UUID firstId = auditWriter.append(draft("req_t017_audit_1"));
        UUID secondId = auditWriter.append(draft("req_t017_audit_2"));

        assertNotEquals(firstId, secondId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT actor_type, actor_subject, action, target_type, target_id,
                       request_id, metadata::text AS metadata_json
                FROM audit_event
                ORDER BY occurred_at, id
                """);

        assertEquals(2, rows.size());
        assertEquals("USER", rows.getFirst().get("actor_type"));
        assertEquals("oidc|editor-1", rows.getFirst().get("actor_subject"));
        assertEquals("publication.publish", rows.getFirst().get("action"));
        assertEquals("article_revision", rows.getFirst().get("target_type"));
        assertEquals(TARGET_ID, rows.getFirst().get("target_id"));
        assertEquals("req_t017_audit_1", rows.getFirst().get("request_id"));

        String metadata = String.valueOf(rows.getFirst().get("metadata_json"));
        assertFalse(metadata.contains("top-secret-token"));
        assertFalse(metadata.contains("private article body"));
        assertFalse(metadata.contains("top-signed-secret"));
        assertFalse(metadata.contains("private/originals/secret.jpg"));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event",
                Integer.class
        ));
    }

    private static AuditEventDraft draft(String requestId) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("authorization", "Bearer top-secret-token");
        metadata.put("article_body", "private article body");
        metadata.put(
                "assetUrl",
                "https://storage.example.test/object.jpg?X-Amz-Signature=top-signed-secret"
        );
        metadata.put("privateStorageKey", "private/originals/secret.jpg");
        metadata.put("result", "SUCCESS");
        return new AuditEventDraft(
                ActorContext.user(
                        "oidc|editor-1",
                        Set.of(RoleCode.EDITOR),
                        RequestId.of(requestId)
                ),
                "publication.publish",
                "article_revision",
                TARGET_ID,
                metadata
        );
    }
}
