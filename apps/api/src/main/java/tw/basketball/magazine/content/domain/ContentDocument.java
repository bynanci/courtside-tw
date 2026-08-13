package tw.basketball.magazine.content.domain;

import java.util.Objects;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Immutable value object for one canonical ContentDocument snapshot. */
public final class ContentDocument {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final String json;

    private ContentDocument(String json) {
        this.json = json;
    }

    public static ContentDocument fromJson(String json) {
        Objects.requireNonNull(json, "json");
        try {
            return fromJsonNode(OBJECT_MAPPER.readTree(json));
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("ContentDocument must be valid JSON", exception);
        }
    }

    public static ContentDocument fromJsonNode(JsonNode document) {
        Objects.requireNonNull(document, "document");
        if (!document.isObject()) {
            throw new IllegalArgumentException("ContentDocument must be a JSON object");
        }
        return new ContentDocument(document.toString());
    }

    public JsonNode toJsonNode() {
        try {
            return OBJECT_MAPPER.readTree(json);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Stored ContentDocument is not valid JSON", exception);
        }
    }

    public String json() {
        return json;
    }

    @Override
    public boolean equals(Object candidate) {
        return candidate instanceof ContentDocument other && json.equals(other.json);
    }

    @Override
    public int hashCode() {
        return json.hashCode();
    }

    @Override
    public String toString() {
        return json;
    }
}
