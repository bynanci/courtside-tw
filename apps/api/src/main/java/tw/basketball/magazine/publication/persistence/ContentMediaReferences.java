package tw.basketball.magazine.publication.persistence;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

/** Extracts the bounded public-media references from ContentDocument v1. */
final class ContentMediaReferences {
    private ContentMediaReferences() {
    }

    static List<UUID> extract(JsonNode document) {
        Set<UUID> assetIds = new LinkedHashSet<>();
        for (MediaReference reference : extractPublicVariants(document)) {
            assetIds.add(reference.assetId());
        }
        return List.copyOf(new ArrayList<>(assetIds));
    }

    static List<MediaReference> extractPublicVariants(JsonNode document) {
        if (document == null || !document.isObject()) {
            return List.of();
        }
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            return List.of();
        }

        Set<MediaReference> references = new LinkedHashSet<>();
        for (JsonNode block : blocks) {
            if (block == null || !block.isObject()) {
                continue;
            }
            JsonNode type = block.get("type");
            JsonNode payload = block.get("payload");
            if (type == null || !type.isString() || payload == null || !payload.isObject()) {
                continue;
            }
            switch (type.asString()) {
                case "image" -> add(
                        references,
                        payload.get("assetId"),
                        variant(payload, "inline")
                );
                case "gallery" -> addGallery(references, payload.get("items"));
                case "generative-canvas" -> add(references, payload.get("posterAssetId"), "wide");
                default -> {
                    // Text, video, and related-reading blocks have no local asset reference.
                }
            }
        }
        return List.copyOf(new ArrayList<>(references));
    }

    private static void addGallery(Set<MediaReference> references, JsonNode items) {
        if (items == null || !items.isArray()) {
            return;
        }
        for (JsonNode item : items) {
            if (item != null && item.isObject()) {
                add(references, item.get("assetId"), "inline");
            }
        }
    }

    private static void add(Set<MediaReference> references, JsonNode value, String variant) {
        if (value == null || !value.isString()) {
            return;
        }
        try {
            references.add(new MediaReference(UUID.fromString(value.asString()), variant));
        } catch (IllegalArgumentException ignored) {
            // Content validation owns the user-facing error; persistence stays fail-closed.
        }
    }

    private static String variant(JsonNode payload, String fallback) {
        JsonNode value = payload.get("variant");
        return value != null && value.isString() ? value.asString() : fallback;
    }

    record MediaReference(UUID assetId, String variant) {
    }
}
