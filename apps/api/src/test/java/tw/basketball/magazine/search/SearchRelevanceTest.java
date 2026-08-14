package tw.basketball.magazine.search;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.publication.PublicIssueApiIntegrationTestSupport;
import tw.basketball.magazine.search.application.SearchService;
import tw.basketball.magazine.search.worker.SearchProjectionHandler;

/** Exact-head relevance, query latency and projection-freshness gate for US4. */
final class SearchRelevanceTest extends PublicIssueApiIntegrationTestSupport {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant ARTICLE_PUBLISHED_AT = Instant.parse("2026-08-01T00:00:00Z");
    private static final Instant INDEXED_AT = ARTICLE_PUBLISHED_AT.plusSeconds(30);

    @Test
    void curatedZhTwSetMeetsNdcgLatencyAndFreshnessThresholds() throws Exception {
        JsonNode fixture = fixture();
        IssueFixture issue = createIssue(
                "relevance-issue",
                41,
                Instant.parse("2026-07-31T00:00:00Z"),
                "PUBLISHED",
                true
        );
        int position = 1;
        for (JsonNode document : fixture.path("documents")) {
            String slug = document.path("slug").asString();
            addArticle(issue, "Discovery " + position, position, slug, position, "PUBLISHED");
            appendSearchSnapshot(
                    slug,
                    document.path("title").asString(),
                    document.path("dek").asString()
            );
            UUID articleId = articleId(slug);
            UUID revisionId = revisionId(articleId);
            new SearchProjectionHandler(jdbcTemplate, JSON).project(articleId, revisionId, INDEXED_AT);
            if (!document.path("termKey").isMissingNode()) {
                attachAlias(
                        revisionId,
                        document.path("termKey").asString(),
                        document.path("alias").asString()
                );
            }
            position++;
        }

        SearchService service = new SearchService(jdbcTemplate);
        List<Double> queryScores = new ArrayList<>();
        List<Long> latencySamples = new ArrayList<>();
        for (JsonNode query : fixture.path("queries")) {
            String queryText = query.path("query").asString();
            SearchService.SearchPage page = service.search(queryText, null, "10", "article", null);
            List<String> actual = page.items().stream().map(SearchService.SearchResult::slug).toList();
            queryScores.add(ndcgAt10(actual, judgments(query.path("judgments"))));
            for (int sample = 0; sample < 7; sample++) {
                long started = System.nanoTime();
                service.search(queryText, null, "10", "article", null);
                latencySamples.add((System.nanoTime() - started) / 1_000_000L);
            }
        }

        double ndcgAt10 = queryScores.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        latencySamples.sort(Comparator.naturalOrder());
        long p95Milliseconds = percentile95(latencySamples);
        Double freshnessValue = jdbcTemplate.queryForObject("""
                SELECT MAX(EXTRACT(EPOCH FROM (indexed_at - published_at)))
                FROM search_document
                WHERE active
                """, Double.class);
        double freshnessSeconds = Objects.requireNonNull(freshnessValue, "freshnessSeconds");

        double minimumNdcg = fixture.path("thresholds").path("minimumNdcgAt10").asDouble();
        long maximumP95 = fixture.path("thresholds").path("maximumP95Milliseconds").asLong();
        long maximumFreshness = fixture.path("thresholds").path("maximumFreshnessSeconds").asLong();
        System.out.printf(
                "SEARCH_GATE ndcgAt10=%.3f p95Milliseconds=%d freshnessSeconds=%.1f%n",
                ndcgAt10,
                p95Milliseconds,
                freshnessSeconds
        );
        assertTrue(ndcgAt10 >= minimumNdcg, "NDCG@10 missed the curated relevance threshold");
        assertTrue(p95Milliseconds <= maximumP95, "search query p95 missed the latency threshold");
        assertTrue(
                freshnessSeconds <= maximumFreshness,
                "search projection missed the 60-second freshness threshold"
        );
    }

    private void appendSearchSnapshot(String slug, String title, String dek) {
        jdbcTemplate.update("""
                INSERT INTO publication_snapshot (
                    aggregate_type, aggregate_id, revision_id, snapshot_version,
                    content_document, checksum_sha256, created_by
                )
                SELECT latest.aggregate_type, latest.aggregate_id, latest.revision_id,
                       latest.snapshot_version + 1,
                       jsonb_set(
                           jsonb_set(latest.content_document, '{title}', to_jsonb(?::text)),
                           '{dek}', to_jsonb(?::text)
                       ), ?, 'search-relevance-fixture'
                FROM publication_snapshot latest
                WHERE latest.aggregate_type = 'ARTICLE'
                  AND latest.aggregate_id = (SELECT id FROM article WHERE slug = ?)
                ORDER BY latest.snapshot_version DESC, latest.id DESC
                LIMIT 1
                """, title, dek, "d".repeat(64), slug);
    }

    private void attachAlias(UUID revisionId, String termKey, String alias) {
        UUID termId = jdbcTemplate.queryForObject("""
                INSERT INTO taxonomy_term (
                    term_key, kind, display_name, locale, valid_from, status
                ) VALUES (?, 'LEAGUE', ?, 'zh-TW', ?, 'ACTIVE')
                RETURNING id
                """, UUID.class, termKey, "超級籃球聯賽", Timestamp.from(ARTICLE_PUBLISHED_AT));
        jdbcTemplate.update("""
                INSERT INTO taxonomy_alias (
                    term_id, alias, normalized_alias, locale, valid_from
                ) VALUES (?, ?, ?, 'en', ?)
                """, termId, alias, alias.toLowerCase(java.util.Locale.ROOT),
                Timestamp.from(ARTICLE_PUBLISHED_AT));
        jdbcTemplate.update("""
                INSERT INTO article_taxonomy (article_revision_id, term_id, relevance)
                VALUES (?, ?, 'PRIMARY')
                """, revisionId, termId);
    }

    private UUID articleId(String slug) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM article WHERE slug = ?",
                UUID.class,
                slug
        );
    }

    private UUID revisionId(UUID articleId) {
        return jdbcTemplate.queryForObject(
                "SELECT published_revision_id FROM article WHERE id = ?",
                UUID.class,
                articleId
        );
    }

    private static JsonNode fixture() throws Exception {
        try (InputStream input = Objects.requireNonNull(
                SearchRelevanceTest.class.getResourceAsStream("/search/zh-tw-relevance.json"),
                "missing curated relevance fixture"
        )) {
            return JSON.readTree(input);
        }
    }

    private static Map<String, Integer> judgments(JsonNode values) {
        Map<String, Integer> result = new HashMap<>();
        for (JsonNode value : values) {
            result.put(value.path("slug").asString(), value.path("relevance").asInt());
        }
        return result;
    }

    private static double ndcgAt10(List<String> actual, Map<String, Integer> judgments) {
        double dcg = 0.0;
        for (int index = 0; index < Math.min(10, actual.size()); index++) {
            dcg += gain(judgments.getOrDefault(actual.get(index), 0), index);
        }
        List<Integer> ideal = judgments.values().stream()
                .sorted(Comparator.reverseOrder())
                .limit(10)
                .toList();
        double idealDcg = 0.0;
        for (int index = 0; index < ideal.size(); index++) {
            idealDcg += gain(ideal.get(index), index);
        }
        return idealDcg == 0.0 ? 1.0 : dcg / idealDcg;
    }

    private static double gain(int relevance, int zeroBasedRank) {
        return (Math.pow(2.0, relevance) - 1.0)
                / (Math.log(zeroBasedRank + 2.0) / Math.log(2.0));
    }

    private static long percentile95(List<Long> sortedValues) {
        int index = Math.max(0, (int) Math.ceil(sortedValues.size() * 0.95) - 1);
        return sortedValues.get(index);
    }
}
