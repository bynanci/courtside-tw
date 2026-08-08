package tw.basketball.magazine.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

final class AuditMetadataSanitizerTest {
    private static final String REDACTED = "[REDACTED]";

    @Test
    void redactsCredentialsArticleBodyStorageKeyAndSignedUrl() {
        Map<String, Object> nestedTarget = new LinkedHashMap<>();
        nestedTarget.put("privateStorageKey", "private/originals/secret.jpg");
        nestedTarget.put("variant", "hero");

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("authorization", "Bearer top-secret-token");
        metadata.put("article_body", "A private article body must never enter audit metadata.");
        metadata.put(
                "assetUrl",
                "https://storage.example.test/object.jpg?X-Amz-Signature=top-signed-secret"
        );
        metadata.put("target", nestedTarget);
        metadata.put("result", "SUCCESS");

        Map<String, Object> sanitized = AuditMetadataSanitizer.sanitize(metadata);

        assertEquals(REDACTED, sanitized.get("authorization"));
        assertEquals(REDACTED, sanitized.get("article_body"));
        assertEquals(REDACTED, sanitized.get("assetUrl"));
        Map<?, ?> sanitizedTarget = assertInstanceOf(Map.class, sanitized.get("target"));
        assertEquals(REDACTED, sanitizedTarget.get("privateStorageKey"));
        assertEquals("hero", sanitizedTarget.get("variant"));
        assertEquals("SUCCESS", sanitized.get("result"));

        String serialized = sanitized.toString();
        assertFalse(serialized.contains("top-secret-token"));
        assertFalse(serialized.contains("private article body"));
        assertFalse(serialized.contains("top-signed-secret"));
        assertFalse(serialized.contains("private/originals/secret.jpg"));
    }

    @Test
    void boundsNestedValuesAndNormalizesControlCharacters() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("result\n", "ok\u0000value");
        metadata.put("unsupported", new Object());

        Map<String, Object> sanitized = AuditMetadataSanitizer.sanitize(metadata);

        assertEquals("result", sanitized.keySet().iterator().next());
        assertEquals("ok value", sanitized.get("result"));
        assertEquals("[REDACTED_UNSUPPORTED]", sanitized.get("unsupported"));
    }
}
