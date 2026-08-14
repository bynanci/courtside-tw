package tw.basketball.magazine.content.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.domain.ContentDocumentExtractor;
import tw.basketball.magazine.content.domain.ExtractedArticleContent;
import tw.basketball.magazine.content.domain.PublicArticleModels.Contributor;
import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;
import tw.basketball.magazine.content.validation.ContentDocumentValidator;

/** Creates the complete immutable envelope consumed by public Article reads. */
public final class PublishedArticleSnapshotFactory {
    private static final int MAXIMUM_MEDIA_REFERENCES = 5_000;
    private final ObjectMapper objectMapper;
    private final ContentDocumentValidator validator;
    private final ContentDocumentExtractor extractor;

    public PublishedArticleSnapshotFactory(ObjectMapper objectMapper) {
        this(objectMapper, new ContentDocumentValidator(), new ContentDocumentExtractor());
    }

    PublishedArticleSnapshotFactory(
            ObjectMapper objectMapper,
            ContentDocumentValidator validator,
            ContentDocumentExtractor extractor
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.validator = Objects.requireNonNull(validator, "validator");
        this.extractor = Objects.requireNonNull(extractor, "extractor");
    }

    public JsonNode create(
            UUID articleId,
            UUID revisionId,
            int revisionNumber,
            String slug,
            String title,
            String dek,
            JsonNode content,
            List<Contributor> contributors,
            List<PublicArticleMedia> publicMedia,
            Instant publishedAt,
            Instant updatedAt
    ) {
        Objects.requireNonNull(articleId, "articleId");
        Objects.requireNonNull(revisionId, "revisionId");
        Objects.requireNonNull(content, "content");
        Objects.requireNonNull(contributors, "contributors");
        Objects.requireNonNull(publicMedia, "publicMedia");
        Objects.requireNonNull(publishedAt, "publishedAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (!validator.validate(content.toString()).valid()) {
            throw new IllegalArgumentException("published content failed canonical validation");
        }
        ExtractedArticleContent extracted = extractor.extract(content);
        if (extracted.plainText().isBlank()) {
            throw new IllegalArgumentException("published content must contain reader-visible text");
        }

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("schemaVersion", 1);
        envelope.put("snapshotType", "published-article");
        envelope.put("projectionVersion", 2);
        envelope.put("articleId", articleId.toString());
        envelope.put("revisionId", revisionId.toString());
        envelope.put("revisionNumber", revisionNumber);
        envelope.put("slug", slug);
        envelope.put("title", title);
        envelope.put("dek", dek);
        envelope.put("content", extracted.renderableContent());
        envelope.put("plainText", extracted.plainText());
        envelope.put("readingTimeMinutes", extracted.readingTimeMinutes());
        envelope.put("publishedAt", publishedAt.toString());
        envelope.put("updatedAt", updatedAt.toString());
        envelope.put("canonicalPath", "/articles/" + slug);
        List<Map<String, Object>> byline = new ArrayList<>();
        for (Contributor contributor : contributors) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("contributorId", contributor.contributorId().toString());
            value.put("slug", contributor.slug());
            value.put("displayName", contributor.displayName());
            value.put("role", contributor.role());
            byline.add(value);
        }
        envelope.put("contributors", byline);
        envelope.put("media", freezeReferencedMedia(extracted.renderableContent(), publicMedia));
        try {
            return objectMapper.readTree(objectMapper.writeValueAsString(envelope));
        } catch (Exception exception) {
            throw new IllegalStateException("unable to create published Article snapshot", exception);
        }
    }

    private static List<PublicArticleMedia> freezeReferencedMedia(
            JsonNode content,
            List<PublicArticleMedia> candidates
    ) {
        if (candidates.size() > MAXIMUM_MEDIA_REFERENCES) {
            throw new IllegalArgumentException("publication media exceeds the bounded snapshot limit");
        }
        Map<MediaKey, PublicArticleMedia> available = new LinkedHashMap<>();
        for (PublicArticleMedia media : candidates) {
            PublicArticleMedia existing = available.putIfAbsent(
                    new MediaKey(media.assetId(), media.variant()),
                    media
            );
            if (existing != null) {
                throw new IllegalArgumentException("publication media contains a duplicate variant");
            }
        }

        Map<MediaKey, Boolean> referenced = new LinkedHashMap<>();
        JsonNode blocks = content.get("blocks");
        for (JsonNode block : blocks) {
            String type = block.get("type").asString();
            JsonNode payload = block.get("payload");
            switch (type) {
                case "image" -> referenced.putIfAbsent(
                        key(payload, "assetId", variant(payload, "inline")),
                        Boolean.TRUE
                );
                case "gallery" -> {
                    for (JsonNode item : payload.get("items")) {
                        referenced.putIfAbsent(key(item, "assetId", "inline"), Boolean.TRUE);
                    }
                }
                case "generative-canvas" -> referenced.putIfAbsent(
                        key(payload, "posterAssetId", "wide"),
                        Boolean.TRUE
                );
                default -> {
                    // Canonical non-media blocks have no frozen media metadata.
                }
            }
            if (referenced.size() > MAXIMUM_MEDIA_REFERENCES) {
                throw new IllegalArgumentException("publication media exceeds the bounded snapshot limit");
            }
        }

        List<PublicArticleMedia> frozen = new ArrayList<>();
        for (MediaKey reference : referenced.keySet()) {
            PublicArticleMedia media = available.get(reference);
            if (media == null) {
                throw new IllegalArgumentException(
                        "publication media metadata is missing for a referenced variant"
                );
            }
            frozen.add(media);
        }
        return List.copyOf(frozen);
    }

    private static MediaKey key(JsonNode value, String assetIdField, String variant) {
        try {
            return new MediaKey(
                    UUID.fromString(value.get(assetIdField).asString()),
                    variant
            );
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("publication media reference is invalid", exception);
        }
    }

    private static String variant(JsonNode payload, String fallback) {
        JsonNode value = payload.get("variant");
        return value == null ? fallback : value.asString();
    }

    private record MediaKey(UUID assetId, String variant) {
        private MediaKey {
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(variant, "variant");
        }
    }
}
