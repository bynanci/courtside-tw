package tw.basketball.magazine.content.domain;

import java.util.Objects;

import tools.jackson.databind.JsonNode;

/** Immutable server-derived public rendering and text metadata. */
public record ExtractedArticleContent(
        JsonNode renderableContent,
        String plainText,
        int readingTimeMinutes
) {
    public ExtractedArticleContent {
        renderableContent = Objects.requireNonNull(renderableContent, "renderableContent").deepCopy();
        plainText = Objects.requireNonNull(plainText, "plainText");
        if (readingTimeMinutes < 1) {
            throw new IllegalArgumentException("readingTimeMinutes must be positive");
        }
    }

    @Override
    public JsonNode renderableContent() {
        return renderableContent.deepCopy();
    }
}
