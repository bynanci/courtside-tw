package tw.basketball.magazine.content.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.domain.PublicArticleModels.Contributor;
import tw.basketball.magazine.content.domain.PublicArticleModels.PublicArticleMedia;

final class PublishedArticleSnapshotFactoryTest {
    private static final UUID ARTICLE_ID = UUID.fromString("00000000-0000-4000-8000-000000000101");
    private static final UUID REVISION_ID = UUID.fromString("00000000-0000-4000-8000-000000000102");
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-4000-8000-000000000103");
    private static final Instant PUBLISHED_AT = Instant.parse("2026-08-13T00:00:00Z");

    @Test
    void freezesOnlyCompleteReferencedPublicMediaMetadata() throws Exception {
        PublishedArticleSnapshotFactory factory = new PublishedArticleSnapshotFactory(new ObjectMapper());

        JsonNode snapshot = factory.create(
                ARTICLE_ID,
                REVISION_ID,
                1,
                "frozen-media",
                "Frozen media",
                "Snapshot fixture",
                document(),
                List.of(new Contributor(
                        UUID.fromString("00000000-0000-4000-8000-000000000104"),
                        "courtside-editorial",
                        "Courtside TW 編輯部",
                        "EDITOR"
                )),
                List.of(media()),
                PUBLISHED_AT,
                PUBLISHED_AT
        );

        assertEquals(2, snapshot.get("projectionVersion").asInt());
        assertEquals(1, snapshot.get("media").size());
        assertEquals(ASSET_ID.toString(), snapshot.get("media").get(0).get("assetId").asString());
        assertEquals("/media/published/frozen.webp",
                snapshot.get("media").get(0).get("url").asString());
        assertEquals("Courtside TW", snapshot.get("media").get(0).get("rightsOwner").asString());
    }

    @Test
    void rejectsSnapshotCreationWhenReferencedMediaMetadataIsMissing() throws Exception {
        PublishedArticleSnapshotFactory factory = new PublishedArticleSnapshotFactory(new ObjectMapper());

        assertThrows(IllegalArgumentException.class, () -> factory.create(
                ARTICLE_ID,
                REVISION_ID,
                1,
                "frozen-media",
                "Frozen media",
                null,
                document(),
                List.of(),
                List.of(),
                PUBLISHED_AT,
                PUBLISHED_AT
        ));
    }

    @Test
    void rejectsSnapshotCreationWithoutReaderVisibleText() throws Exception {
        PublishedArticleSnapshotFactory factory = new PublishedArticleSnapshotFactory(new ObjectMapper());
        JsonNode dividerOnly = new ObjectMapper().readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000106","type":"divider","version":1,
                   "payload":{"style":"space"}}
                ]}
                """);

        assertThrows(IllegalArgumentException.class, () -> factory.create(
                ARTICLE_ID,
                REVISION_ID,
                1,
                "divider-only",
                "Divider only",
                null,
                dividerOnly,
                List.of(),
                List.of(),
                PUBLISHED_AT,
                PUBLISHED_AT
        ));
    }

    private static JsonNode document() throws Exception {
        return new ObjectMapper().readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000105","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"凍結媒體","variant":"wide"}}
                ]}
                """.formatted(ASSET_ID));
    }

    private static PublicArticleMedia media() {
        return new PublicArticleMedia(
                ASSET_ID,
                "wide",
                "/media/published/frozen.webp",
                "image/webp",
                1200,
                675,
                "凍結媒體",
                "Courtside TW",
                "Courtside TW",
                "Editorial license"
        );
    }
}
