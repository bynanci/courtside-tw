package tw.basketball.magazine.fanpassport.recap;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

final class SeasonRecapPublicationGuardTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void fabricatedRecapCannotPassWithoutAuthoritativePersistence() {
        var content = json.readTree("""
                {"blocks":[{"type":"generative-canvas","payload":{"presetId":"season-recap-v1",
                "projectionId":"00000000-0000-4000-8000-000000000001"}}]}
                """);
        assertFalse(SeasonRecapPublicationGuard.validate(content, new JdbcTemplate(), json, Instant.now(), "PUBLIC_WEB"));
    }

    @Test
    void ordinaryContentDoesNotRequireOptionalRecapTables() {
        assertTrue(SeasonRecapPublicationGuard.validate(json.readTree("{\"blocks\":[]}"),
                new JdbcTemplate(), json, Instant.now(), "PUBLIC_WEB"));
    }
}
