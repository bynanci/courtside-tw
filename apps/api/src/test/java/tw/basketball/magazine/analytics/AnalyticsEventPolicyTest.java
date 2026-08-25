package tw.basketball.magazine.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;

class AnalyticsEventPolicyTest {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Path CONTRACT_PATH = Path.of(
            System.getProperty("courtside.repoRoot")
    ).resolve("contracts/analytics-event-spec.json");

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

    @Test
    void matchesEveryCanonicalEventPropertyAndValue() throws IOException {
        JsonNode contract = OBJECT_MAPPER.readTree(CONTRACT_PATH.toFile());
        JsonNode events = contract.path("events");
        Set<String> allValues = collectValues(events);

        assertEquals(1, contract.path("version").asInt());

        events.properties().forEach(eventEntry -> {
            String eventType = eventEntry.getKey();
            JsonNode propertySpec = eventEntry.getValue();
            Map<String, String> baseline = baselineProperties(propertySpec);

            assertTrue(AnalyticsEventPolicy.accepts(eventType, baseline), eventType);

            propertySpec.properties().forEach(propertyEntry -> {
                String property = propertyEntry.getKey();
                List<String> allowedValues = values(propertyEntry.getValue());

                for (String value : allowedValues) {
                    Map<String, String> candidate = new HashMap<>(baseline);
                    candidate.put(property, value);
                    assertTrue(
                            AnalyticsEventPolicy.accepts(eventType, candidate),
                            eventType + "." + property + " must accept " + value);
                }

                for (String value : allValues) {
                    if (!allowedValues.contains(value)) {
                        Map<String, String> candidate = new HashMap<>(baseline);
                        candidate.put(property, value);
                        assertFalse(
                                AnalyticsEventPolicy.accepts(eventType, candidate),
                                eventType + "." + property + " must reject " + value);
                    }
                }

                Map<String, String> missingProperty = new HashMap<>(baseline);
                missingProperty.remove(property);
                assertFalse(
                        AnalyticsEventPolicy.accepts(eventType, missingProperty),
                        eventType + "." + property + " is required");
            });

            Map<String, String> extraProperty = new HashMap<>(baseline);
            extraProperty.put("unexpected", "value");
            assertFalse(
                    AnalyticsEventPolicy.accepts(eventType, extraProperty),
                    eventType + " must reject extra properties");
        });
    }

    private static Set<String> collectValues(JsonNode events) {
        Set<String> values = new HashSet<>();
        events.properties().forEach(eventEntry ->
                eventEntry.getValue().properties().forEach(propertyEntry ->
                        values.addAll(values(propertyEntry.getValue()))));
        return Set.copyOf(values);
    }

    private static Map<String, String> baselineProperties(JsonNode propertySpec) {
        Map<String, String> properties = new HashMap<>();
        propertySpec.properties().forEach(entry ->
                properties.put(entry.getKey(), entry.getValue().get(0).asString()));
        return properties;
    }

    private static List<String> values(JsonNode values) {
        return java.util.stream.IntStream.range(0, values.size())
                .mapToObj(index -> values.get(index).asString())
                .toList();
    }
}
