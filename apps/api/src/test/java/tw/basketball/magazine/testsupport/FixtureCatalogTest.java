package tw.basketball.magazine.testsupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.Test;

final class FixtureCatalogTest {
    @Test
    void exposesAllFoundationAcceptanceScenarios() {
        assertEquals(
                Set.of("published", "draft", "withdrawn", "expired-rights", "reduced-motion"),
                FixtureCatalog.scenarios().stream()
                        .map(FixtureCatalog.Scenario::id)
                        .collect(java.util.stream.Collectors.toSet())
        );

        FixtureCatalog.Scenario validCanvas = FixtureCatalog.generativeCanvasValid();
        FixtureCatalog.Scenario invalidCanvas = FixtureCatalog.generativeCanvasInvalid();
        assertTrue(validCanvas.canvas().valid());
        assertFalse(invalidCanvas.canvas().valid());
        assertEquals(validCanvas.canvas().seed(), invalidCanvas.canvas().seed());
    }
}
