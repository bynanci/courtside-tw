package tw.basketball.magazine.content.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import tools.jackson.databind.JsonNode;

/** Extracts only reader-visible text from a validated canonical ContentDocument. */
public final class ContentDocumentExtractor {
    private static final int VISIBLE_CODE_POINTS_PER_MINUTE = 450;

    public ExtractedArticleContent extract(JsonNode document) {
        Objects.requireNonNull(document, "document");
        if (!document.isObject()) {
            throw new IllegalArgumentException("content document must be an object");
        }
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            throw new IllegalArgumentException("content document blocks must be an array");
        }

        List<String> visibleLines = new ArrayList<>();
        for (JsonNode block : blocks) {
            extractBlock(block, visibleLines);
        }
        String plainText = String.join("\n", visibleLines);
        long visibleCodePoints = plainText.codePoints()
                .filter(codePoint -> !Character.isWhitespace(codePoint))
                .count();
        int readingTime = Math.max(
                1,
                Math.toIntExact((visibleCodePoints + VISIBLE_CODE_POINTS_PER_MINUTE - 1)
                        / VISIBLE_CODE_POINTS_PER_MINUTE)
        );
        return new ExtractedArticleContent(document, plainText, readingTime);
    }

    private static void extractBlock(JsonNode block, List<String> lines) {
        if (block == null || !block.isObject()) {
            throw new IllegalArgumentException("content block must be an object");
        }
        JsonNode type = block.get("type");
        JsonNode payload = block.get("payload");
        if (type == null || !type.isString() || payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("content block type and payload are required");
        }
        switch (type.asString()) {
            case "paragraph" -> addInline(payload.get("content"), lines);
            case "heading" -> addText(payload, "text", lines);
            case "list" -> addList(payload, lines);
            case "quote" -> {
                addInline(payload.get("content"), lines);
                addText(payload, "attribution", lines);
            }
            case "divider" -> {
                // Dividers have no reader-visible text.
            }
            case "image" -> addImageText(payload, lines);
            case "gallery" -> addGalleryText(payload, lines);
            case "stat" -> addFields(payload, lines, "label", "value", "unit", "context");
            case "video" -> addFields(payload, lines, "title", "caption");
            case "related-reading" -> addText(payload, "label", lines);
            case "generative-canvas" -> addFields(payload, lines, "altText", "dataSummary");
            default -> throw new IllegalArgumentException("unsupported content block type");
        }
    }

    private static void addList(JsonNode payload, List<String> lines) {
        JsonNode items = payload.get("items");
        if (items == null || !items.isArray()) {
            throw new IllegalArgumentException("list items must be an array");
        }
        for (JsonNode item : items) {
            if (item == null || !item.isObject()) {
                throw new IllegalArgumentException("list item must be an object");
            }
            addInline(item.get("content"), lines);
        }
    }

    private static void addImageText(JsonNode payload, List<String> lines) {
        addFields(payload, lines, "altText", "caption", "credit");
    }

    private static void addGalleryText(JsonNode payload, List<String> lines) {
        JsonNode items = payload.get("items");
        if (items == null || !items.isArray()) {
            throw new IllegalArgumentException("gallery items must be an array");
        }
        for (JsonNode item : items) {
            if (item == null || !item.isObject()) {
                throw new IllegalArgumentException("gallery item must be an object");
            }
            addImageText(item, lines);
        }
    }

    private static void addInline(JsonNode runs, List<String> lines) {
        if (runs == null || !runs.isArray()) {
            throw new IllegalArgumentException("inline content must be an array");
        }
        StringBuilder visible = new StringBuilder();
        for (JsonNode run : runs) {
            if (run == null || !run.isObject()) {
                throw new IllegalArgumentException("inline run must be an object");
            }
            JsonNode kind = run.get("kind");
            if (kind == null || !kind.isString()
                    || !("text".equals(kind.asString()) || "link".equals(kind.asString()))) {
                throw new IllegalArgumentException("inline run kind is unsupported");
            }
            JsonNode text = run.get("text");
            if (text == null || !text.isString()) {
                throw new IllegalArgumentException("inline text is required");
            }
            visible.append(text.asString());
        }
        addNormalized(visible.toString(), lines);
    }

    private static void addFields(JsonNode payload, List<String> lines, String... fields) {
        for (String field : fields) {
            addText(payload, field, lines);
        }
    }

    private static void addText(JsonNode payload, String field, List<String> lines) {
        JsonNode value = payload.get(field);
        if (value == null) {
            return;
        }
        if (!value.isString()) {
            throw new IllegalArgumentException(field + " must be text");
        }
        addNormalized(value.asString(), lines);
    }

    private static void addNormalized(String value, List<String> lines) {
        if (value.codePoints().anyMatch(codePoint ->
                Character.isISOControl(codePoint) && codePoint != '\n')) {
            throw new IllegalArgumentException("reader-visible text must not contain ISO control characters");
        }
        String normalized = value.strip().replaceAll("\\s+", " ");
        if (!normalized.isEmpty()) {
            lines.add(normalized);
        }
    }
}
