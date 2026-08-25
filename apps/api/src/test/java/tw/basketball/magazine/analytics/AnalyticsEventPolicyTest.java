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
    void acceptsAllFourBoundedEventShapes() {
        assertTrue(AnalyticsEventPolicy.accepts(
                "public_issue_view",
                Map.of("surface", "issue", "content_kind", "issue")));
        assertTrue(AnalyticsEventPolicy.accepts(
                "public_search_submitted",
                Map.of(
                        "surface", "search",
                        "query_length_bucket", "3_5",
                        "result_count_bucket", "1_5")));
        assertTrue(AnalyticsEventPolicy.accepts(
                "public_share_started",
                Map.of(
                        "surface", "share",
                        "content_kind", "article",
                        "share_target", "copy_link")));
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
