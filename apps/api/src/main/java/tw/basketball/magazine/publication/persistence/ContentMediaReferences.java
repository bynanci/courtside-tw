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
        if (document == null || !document.isObject()) {
            return List.of();
        }
        JsonNode blocks = document.get("blocks");
        if (blocks == null || !blocks.isArray()) {
            return List.of();
        }

        Set<UUID> references = new LinkedHashSet<>();
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
                case "image" -> add(references, payload.get("assetId"));
                case "gallery" -> addGallery(references, payload.get("items"));
                case "generative-canvas" -> add(references, payload.get("posterAssetId"));
                default -> {
                    // Text, video, and related-reading blocks have no local asset reference.
                }
            }
        }
        return List.copyOf(new ArrayList<>(references));
    }

    private static void addGallery(Set<UUID> references, JsonNode items) {
        if (items == null || !items.isArray()) {
            return;
        }
        for (JsonNode item : items) {
            if (item != null && item.isObject()) {
                add(references, item.get("assetId"));
            }
        }
    }

    private static void add(Set<UUID> references, JsonNode value) {
        if (value == null || !value.isString()) {
            return;
        }
        try {
            references.add(UUID.fromString(value.asString()));
        } catch (IllegalArgumentException ignored) {
            // Content validation owns the user-facing error; persistence stays fail-closed.
        }
    }
}
