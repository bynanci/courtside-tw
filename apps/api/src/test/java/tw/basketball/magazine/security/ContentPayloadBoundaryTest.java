package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;

final class ContentPayloadBoundaryTest {
    private static final String DOCUMENT_TEMPLATE = """
            {
              "schemaVersion": 1,
              "documentId": "00000000-0000-4000-8000-000000000001",
              "blocks": [
                {
                  "id": "00000000-0000-4000-8000-000000000002",
                  "type": "generative-canvas",
                  "version": 1,
                  "payload": {
                    "presetId": "court-pulse-v1",
                    "seed": 1,
                    "parameters": {
                      "density": 1,
                      "tempo": 1,
                      "lineWeight": 1,
                      "paletteId": "court-dusk",
                      "numericSequence": [0.5]
                    },
                    "posterAssetId": "00000000-0000-4000-8000-000000000003",
                    "altText": "poster",
                    "dataSummary": "bounded summary"%s
                  }
                }
              ]
            }
            """;

    @Test
    void acceptsAValidGenerativeCanvasPayload() {
        ContentDocumentValidator.ValidationResult result = new ContentDocumentValidator()
                .validate(DOCUMENT_TEMPLATE.formatted(""));

        assertTrue(result.valid(), result.errors().toString());
    }

    @Test
    void rejectsForbiddenGenerativeCanvasCapabilitiesAtRuntime() {
        ContentDocumentValidator validator = new ContentDocumentValidator();

        for (String field : List.of("eval", "shader", "remoteModule", "fetch", "sourceCode")) {
            ContentDocumentValidator.ValidationResult result = validator.validate(
                    DOCUMENT_TEMPLATE.formatted(",
                    "" + field + "": "blocked"")
            );

            assertFalse(result.valid(), field + " unexpectedly passed");
            assertTrue(
                    result.errors().stream().anyMatch(error -> error.contains(field)),
                    result.errors().toString()
            );
        }
    }
}
