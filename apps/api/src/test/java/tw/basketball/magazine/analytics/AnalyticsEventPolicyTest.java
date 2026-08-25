package tw.basketball.magazine.analytics;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;

class AnalyticsEventPolicyTest {

    @Test
    void acceptsOnlyBoundedArticleViewProperties() {
        assertTrue(AnalyticsEventPolicy.accepts(
                "public_article_view",
                Map.of("surface", "article", "content_kind", "article")));
        assertFalse(AnalyticsEventPolicy.accepts(
                "public_article_view",
                Map.of("surface", "article", "content_kind", "article", "slug", "secret")));
    }

    @Test
    void rejectsUnknownTypesAndRawQueries() {
        assertFalse(AnalyticsEventPolicy.accepts(
                "unknown_event",
                Map.of("surface", "article")));
        assertFalse(AnalyticsEventPolicy.accepts(
                "public_search_submitted",
                Map.of(
                        "surface", "search",
                        "query", "秘密搜尋詞",
                        "query_length_bucket", "6_plus",
                        "result_count_bucket", "zero")));
    }
}
