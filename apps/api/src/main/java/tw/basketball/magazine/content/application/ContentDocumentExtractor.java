package tw.basketball.magazine.content.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import tools.jackson.databind.JsonNode;

import tw.basketball.magazine.content.domain.ContentDocument;

/** Extracts public-visible text and server-derived reading metadata from ContentDocument v1. */
public final class ContentDocumentExtractor {
    public ExtractedContent extract(ContentDocument document) {
        Objects.requireNonNull(document, "document");
        List<String> segments = new ArrayList<>();
        JsonNode blocks = document.toJsonNode().get("blocks");
        if (blocks == null || !blocks.isArray()) {
            throw new IllegalArgumentException("ContentDocument blocks must be an array");
        }

        for (JsonNode block : blocks) {
            extractBlock(block, segments);
        }
        String plainText = String.join("\n", segments);
        return new ExtractedContent(plainText, ReadingTimeCalculator.estimateMinutes(plainText));
    }

    private static void extractBlock(JsonNode block, List<String> segments) {
        if (block == null || !block.isObject()) {
            throw new IllegalArgumentException("ContentDocument block must be an object");
        }
        JsonNode type = block.get("type");
        JsonNode payload = block.get("payload");
        if (type == null || !type.isString() || payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("ContentDocument block type and payload are required");
        }

        switch (type.asString()) {
            case "paragraph" -> addInline(segments, payload.get("content"));
            case "heading" -> addText(segments, payload.get("text"));
            case "list" -> addList(segments, payload.get("items"));
            case "quote" -> {
                addInline(segments, payload.get("content"));
                addText(segments, payload.get("attribution"));
            }
            case "divider" -> {
                // A divider has no text semantics.
            }
            case "image" -> addMediaText(segments, payload);
            case "gallery" -> addGalleryText(segments, payload.get("items"));
            case "stat" -> {
                addText(segments, payload.get("label"));
                addText(segments, payload.get("value"));
                addText(segments, payload.get("unit"));
                addText(segments, payload.get("context"));
            }
            case "video" -> {
                addText(segments, payload.get("title"));
                addText(segments, payload.get("caption"));
            }
            case "related-reading" -> addText(segments, payload.get("label"));
            case "generative-canvas" -> {
                addText(segments, payload.get("altText"));
                addText(segments, payload.get("dataSummary"));
            }
            default -> throw new IllegalArgumentException("Unsupported ContentDocument block type");
        }
    }

    private static void addInline(List<String> segments, JsonNode content) {
        if (content == null || !content.isArray()) {
            throw new IllegalArgumentException("inline content must be an array");
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode run : content) {
            if (run != null && run.isObject()) {
                text.append(stringValue(run.get("text")));
            }
        }
        addNormalized(segments, text.toString());
    }

    private static void addList(List<String> segments, JsonNode items) {
        if (items == null || !items.isArray()) {
            throw new IllegalArgumentException("list items must be an array");
        }
        for (JsonNode item : items) {
            if (item == null || !item.isObject()) {
                throw new IllegalArgumentException("list item must be an object");
            }
            addInline(segments, item.get("content"));
        }
    }

    private static void addMediaText(List<String> segments, JsonNode payload) {
        addText(segments, payload.get("altText"));
        addText(segments, payload.get("caption"));
        addText(segments, payload.get("credit"));
    }

    private static void addGalleryText(List<String> segments, JsonNode items) {
        if (items == null || !items.isArray()) {
            throw new IllegalArgumentException("gallery items must be an array");
        }
        for (JsonNode item : items) {
            if (item == null || !item.isObject()) {
                throw new IllegalArgumentException("gallery item must be an object");
            }
            addMediaText(segments, item);
        }
    }

    private static void addText(List<String> segments, JsonNode node) {
        addNormalized(segments, stringValue(node));
    }

    private static String stringValue(JsonNode node) {
        return node != null && node.isString() ? node.asString() : "";
    }

    private static void addNormalized(List<String> segments, String value) {
        String normalized = normalize(value);
        if (!normalized.isEmpty()) {
            segments.add(normalized);
        }
    }

    private static String normalize(String value) {
        StringBuilder result = new StringBuilder();
        boolean pendingSpace = false;
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (Character.isWhitespace(codePoint)) {
                pendingSpace = !result.isEmpty();
            } else if (!Character.isISOControl(codePoint)) {
                if (pendingSpace) {
                    result.append(' ');
                    pendingSpace = false;
                }
                result.appendCodePoint(codePoint);
            }
        }
        return result.toString();
    }

    public record ExtractedContent(String plainText, int readingTimeMinutes) {
        public ExtractedContent {
            plainText = Objects.requireNonNull(plainText, "plainText");
            if (readingTimeMinutes < 1) {
                throw new IllegalArgumentException("readingTimeMinutes must be positive");
            }
        }
    }
}
