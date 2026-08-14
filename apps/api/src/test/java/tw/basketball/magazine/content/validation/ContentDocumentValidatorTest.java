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

    @Test
    void rejectsEscapedIsoControlCharactersBeforePublication() throws IOException {
        JsonNode document = OBJECT_MAPPER.readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"a\\u0001b"}]}}
                ]}
                """);

        ContentDocumentValidator.ValidationResult result = validator.validate(document);

        assertFalse(result.valid());
        assertTrue(result.errors().stream().anyMatch(error ->
                error.contains("/blocks/0/payload/content/0/text")
                        && error.contains("ISO control characters")));
    }

    @Test
    void acceptsReaderVisibleLineBreaksButRejectsOtherIsoControls() throws IOException {
        JsonNode document = OBJECT_MAPPER.readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"第一行\\n第二行"}]}}
                ]}
                """);

        ContentDocumentValidator.ValidationResult valid = validator.validate(document);
        assertTrue(valid.valid(), valid.errors().toString());

        JsonNode invalid = OBJECT_MAPPER.readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"a\\rb"}]}}
                ]}
                """);

        ContentDocumentValidator.ValidationResult invalidResult = validator.validate(invalid);
        assertFalse(invalidResult.valid());
        assertTrue(invalidResult.errors().stream().anyMatch(error ->
                error.contains("ISO control characters")));
    }

    private static JsonNode read(Path path) throws IOException {
        return OBJECT_MAPPER.readTree(path.toFile());
    }
}
