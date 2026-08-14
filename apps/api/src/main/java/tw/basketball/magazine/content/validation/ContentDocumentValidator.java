package tw.basketball.magazine.content.validation;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.networknt.schema.Error;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public final class ContentDocumentValidator {
    private static final String SCHEMA_RESOURCE = "/contracts/content-document.schema.json";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final Schema schema;

    public ContentDocumentValidator() {
        this.schema = loadSchema();
    }

    public ValidationResult validate(JsonNode document) {
        if (document == null) {
            return invalid(List.of("document must not be null"));
        }

        List<String> errors = new ArrayList<>(schema.validate(document).stream()
                .map(Error::getMessage)
                .sorted()
                .toList());
        addDuplicateBlockIdErrors(document, errors);
        addControlCharacterErrors(document, "", errors);
        return new ValidationResult(errors.isEmpty(), List.copyOf(errors));
    }

    public ValidationResult validate(String documentJson) {
        try {
            return validate(OBJECT_MAPPER.readTree(documentJson));
        } catch (JacksonException exception) {
            return invalid(List.of("document is not valid JSON: " + exception.getMessage()));
        }
    }

    public void validateOrThrow(JsonNode document) {
        ValidationResult result = validate(document);
        if (!result.valid()) {
            throw new IllegalArgumentException("Invalid ContentDocument: " + result.errors());
        }
    }

    private static Schema loadSchema() {
        try (InputStream schemaStream = ContentDocumentValidator.class.getResourceAsStream(SCHEMA_RESOURCE)) {
            if (schemaStream == null) {
                throw new IllegalStateException("Missing canonical ContentDocument schema resource");
            }

            SchemaRegistryConfig config = SchemaRegistryConfig.builder()
                    .formatAssertionsEnabled(true)
                    .build();
            SchemaRegistry registry = SchemaRegistry.withDefaultDialect(
                    SpecificationVersion.DRAFT_2020_12,
                    builder -> builder.schemaRegistryConfig(config));
            return registry.getSchema(schemaStream);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load canonical ContentDocument schema", exception);
        }
    }

    private static void addDuplicateBlockIdErrors(JsonNode document, List<String> errors) {
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            return;
        }

        Set<String> blockIds = new HashSet<>();
        for (int index = 0; index < blocks.size(); index++) {
            JsonNode block = blocks.get(index);
            JsonNode id = block == null ? null : block.get("id");
            if (id != null && id.isString() && !blockIds.add(id.stringValue())) {
                errors.add("/blocks/" + index + "/id: must be unique");
            }
        }
    }

    private static void addControlCharacterErrors(JsonNode node, String path, List<String> errors) {
        if (node == null) {
            return;
        }
        if (node.isString()) {
            if (node.asString().codePoints().anyMatch(Character::isISOControl)) {
                errors.add(path + ": must not contain ISO control characters");
            }
            return;
        }
        if (node.isArray()) {
            for (int index = 0; index < node.size(); index++) {
                addControlCharacterErrors(node.get(index), path + "/" + index, errors);
            }
            return;
        }
        if (node.isObject()) {
            node.properties().forEach(entry -> addControlCharacterErrors(
                    entry.getValue(),
                    path + "/" + entry.getKey(),
                    errors
            ));
        }
    }

    private static ValidationResult invalid(List<String> errors) {
        return new ValidationResult(false, List.copyOf(errors));
    }

    public record ValidationResult(boolean valid, List<String> errors) {
        public ValidationResult {
            errors = List.copyOf(errors);
        }

        @Override
        public List<String> errors() {
            return List.copyOf(errors);
        }
    }
}
