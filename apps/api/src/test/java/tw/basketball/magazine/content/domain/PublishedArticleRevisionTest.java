package tw.basketball.magazine.content.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

final class PublishedArticleRevisionTest {
    @Test
    void revisionOwnsImmutableContentAndContributorCredits() {
        ContentDocument document = ContentDocument.fromJson("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000002","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"Immutable body"}]}}
                ]}
                """);
        List<ContributorCredit> mutableCredits = new ArrayList<>(List.of(new ContributorCredit(
                UUID.fromString("00000000-0000-4000-8000-000000000011"),
                "immutable-author",
                "Immutable author",
                ContributorCredit.Role.AUTHOR
        )));
        PublishedArticleRevision revision = new PublishedArticleRevision(
                UUID.fromString("00000000-0000-4000-8000-000000000012"),
                UUID.fromString("00000000-0000-4000-8000-000000000013"),
                2,
                "Immutable revision",
                "Published pointer snapshot",
                document,
                mutableCredits
        );

        mutableCredits.clear();
        JsonNode exposedContent = revision.content().toJsonNode();
        ((ObjectNode) exposedContent).put("tampered", true);

        assertEquals(1, revision.contributorCredits().size());
        assertFalse(revision.content().toJsonNode().has("tampered"));
        assertThrows(UnsupportedOperationException.class, () -> revision.contributorCredits().clear());
    }
}
