package tw.basketball.magazine.analytics;

import java.util.Map;
import java.util.Set;

public final class AnalyticsEventPolicy {

    private static final Map<String, Map<String, Set<String>>> EVENT_SPECS = Map.of(
            "public_issue_view", Map.of(
                    "content_kind", Set.of("issue"),
                    "surface", Set.of("issue")),
            "public_article_view", Map.of(
                    "content_kind", Set.of("article"),
                    "surface", Set.of("article")),
            "public_search_submitted", Map.of(
                    "query_length_bucket", Set.of("empty", "1_2", "3_5", "6_plus"),
                    "result_count_bucket", Set.of("zero", "1_5", "6_20", "21_plus"),
                    "surface", Set.of("search")),
            "public_share_started", Map.of(
                    "content_kind", Set.of("article", "issue", "none"),
                    "share_target", Set.of("copy_link", "native_share"),
                    "surface", Set.of("share")));

    private AnalyticsEventPolicy() {
    }

    static Map<String, Map<String, Set<String>>> eventSpecs() {
        return EVENT_SPECS;
    }

    public static boolean accepts(String eventType, Map<String, String> properties) {
        if (eventType == null || properties == null) {
            return false;
        }

        Map<String, Set<String>> allowedProperties = EVENT_SPECS.get(eventType);
        if (allowedProperties == null || !allowedProperties.keySet().equals(properties.keySet())) {
            return false;
        }

        for (Map.Entry<String, Set<String>> entry : allowedProperties.entrySet()) {
            String value = properties.get(entry.getKey());
            if (value == null || !entry.getValue().contains(value)) {
                return false;
            }
        }

        return true;
    }
}
