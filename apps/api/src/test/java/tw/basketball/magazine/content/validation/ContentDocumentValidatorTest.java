package tw.basketball.magazine.content.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

final class ContentDocumentValidatorTest {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Path FIXTURE_ROOT = Path.of(
            System.getProperty("courtside.repoRoot")
    ).resolve("packages/content-schema/fixtures");

    private final ContentDocumentValidator validator = new ContentDocumentValidator();

    @Test
    void acceptsCanonicalValidFixture() throws IOException {
        JsonNode fixture = read(FIXTURE_ROOT.resolve("valid/content-document-v1-all-blocks.json"));
        ContentDocumentValidator.ValidationResult result = validator.validate(fixture);

        assertTrue(result.valid(), result.errors().toString());
        assertEquals(0, result.errors().size());
    }

    @Test
    void rejectsEveryCanonicalInvalidFixture() throws IOException {
        List<Path> invalidFixtures;
        try (Stream<Path> paths = Files.list(FIXTURE_ROOT.resolve("invalid"))) {
            invalidFixtures = paths
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .toList();
        }

        assertEquals(24, invalidFixtures.size(), "unexpected canonical invalid fixture count");
        for (Path fixturePath : invalidFixtures) {
            ContentDocumentValidator.ValidationResult result = validator.validate(read(fixturePath));
            assertFalse(result.valid(), fixturePath.getFileName() + " unexpectedly passed");
        }
    }

    @Test
    void rejectsDuplicateBlockIdsAsRuntimeSemanticInvariant() throws IOException {
        JsonNode fixture = read(FIXTURE_ROOT.resolve("invalid/duplicate-block-id.json"));
        ContentDocumentValidator.ValidationResult result = validator.validate(fixture);

        assertFalse(result.valid());
        assertEquals(List.of("/blocks/1/id: must be unique"), result.errors());
    }

    private static JsonNode read(Path path) throws IOException {
        return OBJECT_MAPPER.readTree(path.toFile());
    }
}
