package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

final class ContentPayloadBoundaryTest {
    @Test
    void generativeCanvasSchemaIsDenyByDefaultAndCodeFree() throws IOException {
        Path repositoryRoot = Path.of(System.getProperty("courtside.repoRoot", "."));
        String schema = Files.readString(
                repositoryRoot.resolve("contracts/content-document.schema.json")
        );
        int start = schema.indexOf("\"generativeCanvasPayload\"");
        int end = schema.indexOf("\"block\"", start);
        String canvasSchema = schema.substring(start, end);

        assertTrue(canvasSchema.contains("\"additionalProperties\": false"));
        assertTrue(canvasSchema.contains("\"presetId\""));
        assertTrue(canvasSchema.contains("\"seed\""));
        assertTrue(canvasSchema.contains("\"parameters\""));
        assertTrue(canvasSchema.contains("\"posterAssetId\""));
        assertTrue(canvasSchema.contains("\"dataSummary\""));
        assertFalse(canvasSchema.contains("\"eval\""));
        assertFalse(canvasSchema.contains("\"shader\""));
        assertFalse(canvasSchema.contains("\"remoteModule\""));
        assertFalse(canvasSchema.contains("\"fetch\""));
        assertFalse(canvasSchema.contains("\"sourceCode\""));
    }
}
