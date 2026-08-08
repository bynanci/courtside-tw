package tw.basketball.magazine.audit;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import tw.basketball.magazine.shared.ActorContext;

/** Immutable input boundary for one append-only audit event. */
public record AuditEventDraft(
        ActorContext actor,
        String action,
        String targetType,
        UUID targetId,
        Map<String, ?> metadata
) {
    public AuditEventDraft {
        actor = Objects.requireNonNull(actor, "actor");
        action = bounded(action, "action", 128);
        targetType = bounded(targetType, "targetType", 128);
        metadata = immutableMetadata(metadata);
    }

    private static Map<String, ?> immutableMetadata(Map<String, ?> value) {
        Objects.requireNonNull(value, "metadata");
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, ?> entry : value.entrySet()) {
            if (entry.getKey() == null) {
                throw new IllegalArgumentException("metadata keys cannot be null");
            }
            copy.put(entry.getKey(), entry.getValue());
        }
        return Collections.unmodifiableMap(copy);
    }

    private static String bounded(String value, String name, int maximumLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()
                || value.length() > maximumLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    name + " must be bounded and free of control characters"
            );
        }
        return value;
    }
}
