package tw.basketball.magazine.fanpassport.recap;

import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Binds authoring/publication/online/offline blocks to the same immutable trusted projection. */
public final class SeasonRecapPublicationGuard {
    private SeasonRecapPublicationGuard() { }

    public static boolean validate(JsonNode content, JdbcTemplate jdbc, ObjectMapper json, Instant now, String channel) {
        if (!containsRecap(content)) {
            return true;
        }
        try {
            JdbcSeasonRecapSource source = new JdbcSeasonRecapSource(jdbc, json, () -> now);
            int count = 0;
            for (JsonNode block : content.path("blocks")) {
                if (recap(block)) {
                    if (++count > 32) {
                        return false;
                    }
                    JsonNode payload = block.path("payload");
                    UUID id = UUID.fromString(payload.path("projectionId").asString());
                    if (!source.validatedPayload(id, channel).equals(payload)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (RuntimeException unavailable) {
            // Missing schema/data, stale evidence and withdrawn rights all fail closed.
            return false;
        }
    }

    public static boolean containsRecap(JsonNode content) {
        if (content == null || !content.path("blocks").isArray()) {
            return false;
        }
        for (JsonNode block : content.path("blocks")) {
            if (recap(block)) {
                return true;
            }
        }
        return false;
    }

    private static boolean recap(JsonNode block) {
        return "generative-canvas".equals(block.path("type").asString())
                && "season-recap-v1".equals(block.path("payload").path("presetId").asString());
    }
}
