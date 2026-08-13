package tw.basketball.magazine.content.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class ContentDocumentExtractorTest {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Path ALL_BLOCKS_FIXTURE = Path.of(
            System.getProperty("courtside.repoRoot")
    ).resolve("packages/content-schema/fixtures/valid/content-document-v1-all-blocks.json");

    private final ContentDocumentExtractor extractor = new ContentDocumentExtractor();

    @Test
    void extractsOnlyVisibleAllBlockTextInCanonicalOrder() throws IOException {
        ExtractedArticleContent extracted = extractor.extract(
                OBJECT_MAPPER.readTree(ALL_BLOCKS_FIXTURE.toFile())
        );

        assertTrue(extracted.plainText().startsWith(
                "這是一份涵蓋台籃雜誌 MVP 內容區塊的固定 fixture。官方資料\n本期觀察"
        ));
        assertTrue(extracted.plainText().contains("第一個重點\n第二個重點"));
        assertTrue(extracted.plainText().contains("比賽之外，也要記得文化如何被保存。\nCourtside TW"));
        assertTrue(extracted.plainText().contains("球場在夜間燈光下的全景\n首期 fixture 的示意圖片"));
        assertTrue(extracted.plainText().contains("延伸閱讀：賽季開幕觀察"));
        assertTrue(extracted.plainText().contains("視覺使用固定 seed 與文章數據摘要產生"));
        assertFalse(extracted.plainText().contains("https://example.com/official"));
        assertFalse(extracted.plainText().contains("00000000-0000-4000-8000-000000000011"));
        assertFalse(extracted.plainText().contains("T009-demo-video"));
        assertFalse(extracted.plainText().contains("20260807"));
        assertEquals(1, extracted.readingTimeMinutes());
        assertEquals(11, extracted.renderableContent().path("blocks").size());
    }

    @Test
    void readingTimeUsesNormalizedVisibleCodePointsAndRoundsUpDeterministically() throws Exception {
        String visibleText = "文".repeat(451);
        JsonNode document = OBJECT_MAPPER.readTree("""
                {
                  "schemaVersion": 1,
                  "documentId": "00000000-0000-7000-8000-000000000001",
                  "blocks": [{
                    "id": "00000000-0000-4000-8000-000000000101",
                    "type": "paragraph",
                    "version": 1,
                    "payload": {"content": [{"kind": "text", "text": "%s"}]}
                  }]
                }
                """.formatted(visibleText));

        ExtractedArticleContent first = extractor.extract(document);
        ExtractedArticleContent second = extractor.extract(document.deepCopy());

        assertEquals(visibleText, first.plainText());
        assertEquals(2, first.readingTimeMinutes());
        assertEquals(first, second);
    }
}
