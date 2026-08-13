package tw.basketball.magazine.content.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.content.application.ContentDocumentExtractor.ExtractedContent;
import tw.basketball.magazine.content.domain.ContentDocument;

final class ContentDocumentExtractorTest {
    @Test
    void extractsVisibleTextFromEveryV1BlockAndIgnoresExecutionMetadata() {
        ContentDocument document = ContentDocument.fromJson("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000001","type":"paragraph","version":1,
                   "payload":{"content":[{"kind":"text","text":"第一節"},{"kind":"link","text":"連結文字","href":"https://example.com/private"}]}},
                  {"id":"00000000-0000-4000-8000-000000000002","type":"heading","version":1,
                   "payload":{"level":2,"text":"文章標題"}},
                  {"id":"00000000-0000-4000-8000-000000000003","type":"list","version":1,
                   "payload":{"ordered":false,"items":[{"content":[{"kind":"text","text":"項目一"}]},{"content":[{"kind":"text","text":"項目二"}]}]}},
                  {"id":"00000000-0000-4000-8000-000000000004","type":"quote","version":1,
                   "payload":{"content":[{"kind":"text","text":"引言"}],"attribution":"受訪者"}},
                  {"id":"00000000-0000-4000-8000-000000000005","type":"divider","version":1,
                   "payload":{"style":"solid"}},
                  {"id":"00000000-0000-4000-8000-000000000006","type":"image","version":1,
                   "payload":{"assetId":"00000000-0000-4000-8000-000000000101","altText":"球員上籃","caption":"圖片說明","credit":"攝影甲"}},
                  {"id":"00000000-0000-4000-8000-000000000007","type":"gallery","version":1,
                   "payload":{"layout":"grid","items":[
                     {"assetId":"00000000-0000-4000-8000-000000000102","altText":"圖集一","caption":"圖集說明一","credit":"攝影乙"},
                     {"assetId":"00000000-0000-4000-8000-000000000103","altText":"圖集二","caption":"圖集說明二","credit":"攝影丙"}
                   ]}},
                  {"id":"00000000-0000-4000-8000-000000000008","type":"stat","version":1,
                   "payload":{"label":"得分","value":"32","unit":"分","context":"決勝節攻下十二分"}},
                  {"id":"00000000-0000-4000-8000-000000000009","type":"video","version":1,
                   "payload":{"providerId":"rights-pending","videoId":"hidden-id","title":"賽後訪談","caption":"訪談摘要"}},
                  {"id":"00000000-0000-4000-8000-000000000010","type":"related-reading","version":1,
                   "payload":{"articleSlug":"private-routing-slug","label":"延伸閱讀"}},
                  {"id":"00000000-0000-4000-8000-000000000011","type":"generative-canvas","version":1,
                   "payload":{"presetId":"court-pulse-v1","seed":20260813,"parameters":{"density":42,"tempo":0.8,"lineWeight":1.5,"paletteId":"court-dusk","numericSequence":[0.1,0.4,0.9]},"posterAssetId":"00000000-0000-4000-8000-000000000104","altText":"攻防節奏圖","dataSummary":"第三節節奏提升"}}
                ]}
                """);

        ExtractedContent extracted = new ContentDocumentExtractor().extract(document);

        assertEquals("""
                第一節連結文字
                文章標題
                項目一
                項目二
                引言
                受訪者
                球員上籃
                圖片說明
                攝影甲
                圖集一
                圖集說明一
                攝影乙
                圖集二
                圖集說明二
                攝影丙
                得分
                32
                分
                決勝節攻下十二分
                賽後訪談
                訪談摘要
                延伸閱讀
                攻防節奏圖
                第三節節奏提升""", extracted.plainText());
        assertEquals(1, extracted.readingTimeMinutes());
        assertFalse(extracted.plainText().contains("https://example.com/private"));
        assertFalse(extracted.plainText().contains("hidden-id"));
        assertFalse(extracted.plainText().contains("private-routing-slug"));
        assertFalse(extracted.plainText().contains("court-pulse-v1"));
        assertFalse(extracted.plainText().contains("20260813"));
    }

    @Test
    void readingTimeUsesDeterministicMixedLanguageRates() {
        assertEquals(1, ReadingTimeCalculator.estimateMinutes("中".repeat(400)));
        assertEquals(2, ReadingTimeCalculator.estimateMinutes("中".repeat(401)));
        assertEquals(1, ReadingTimeCalculator.estimateMinutes("word ".repeat(200)));
        assertEquals(2, ReadingTimeCalculator.estimateMinutes(
                "中".repeat(400) + " " + "word ".repeat(200)
        ));
        assertEquals(1, ReadingTimeCalculator.estimateMinutes(""));
    }
}
