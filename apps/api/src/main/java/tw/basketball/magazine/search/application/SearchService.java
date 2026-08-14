package tw.basketball.magazine.search.application;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.JdbcTemplate;

/** Normalized, weighted and fail-closed public search application boundary. */
public final class SearchService {
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAXIMUM_LIMIT = 100;
    private static final int MAXIMUM_QUERY_LENGTH = 200;
    private static final int MAXIMUM_FILTERS = 20;
    private static final int MAXIMUM_SNIPPET_CODE_POINTS = 220;
    private static final Pattern TERM_KEY = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Set<String> TAXONOMY_TYPES = Set.of(
            "league", "season", "team", "player", "person", "venue", "topic"
    );

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public SearchService(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, Clock.systemUTC());
    }

    SearchService(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public SearchPage search(
            String rawQuery,
            String cursorValue,
            String limitValue,
            String contentType,
            List<String> taxonomyValues
    ) {
        String raw = rawQuery == null ? "" : rawQuery;
        if (raw.length() > MAXIMUM_QUERY_LENGTH) {
            throw invalid("/q", "invalid_query", "q must contain at most 200 characters");
        }
        int limit = limit(limitValue);
        String normalized = SearchTextNormalizer.normalize(raw);
        List<String> taxonomy = taxonomy(taxonomyValues);
        QueryEcho query = new QueryEcho(raw, normalized, taxonomy);
        if ((normalized.isEmpty() && taxonomy.isEmpty()) || "issue".equals(contentType)) {
            return new SearchPage(query, List.of(), new PageMeta(null, limit));
        }
        if (contentType != null && !contentType.isBlank() && !"article".equals(contentType)) {
            throw invalid("/type", "invalid_search_type", "type must be article or issue");
        }
        SearchCursor cursor = cursorValue == null ? null : SearchCursor.parse(cursorValue);
        Instant now = clock.instant();

        List<Object> parameters = new ArrayList<>();
        String aliasValidity = """
                tt.status = 'ACTIVE'
                AND tt.valid_from <= ?
                AND (tt.valid_until IS NULL OR tt.valid_until > ?)
                AND ta.normalized_alias = ?
                AND ta.valid_from <= ?
                AND (ta.valid_until IS NULL OR ta.valid_until > ?)
                """;
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(normalized);
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(java.sql.Timestamp.from(now));

        String taxonomyPredicate = "";
        if (!taxonomy.isEmpty()) {
            taxonomyPredicate = """
                    AND EXISTS (
                        SELECT 1
                        FROM article_taxonomy selected_article_taxonomy
                        JOIN taxonomy_term selected_term
                          ON selected_term.id = selected_article_taxonomy.term_id
                        WHERE selected_article_taxonomy.article_revision_id = sd.revision_id
                          AND selected_term.status = 'ACTIVE'
                          AND selected_term.valid_from <= ?
                          AND (selected_term.valid_until IS NULL OR selected_term.valid_until > ?)
                          AND selected_term.term_key IN (__PLACEHOLDERS__)
                    )
                    """.replace("__PLACEHOLDERS__", placeholders(taxonomy.size()));
        }

        parameters.add(normalized);
        parameters.add(normalized);
        parameters.add(normalized);
        parameters.add(normalized);
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(normalized);
        parameters.add(normalized);
        parameters.add(normalized);
        if (!taxonomy.isEmpty()) {
            parameters.add(java.sql.Timestamp.from(now));
            parameters.add(java.sql.Timestamp.from(now));
            parameters.addAll(taxonomy);
        }

        String cursorPredicate = "";
        if (cursor != null) {
            cursorPredicate = """
                    WHERE score < ?
                       OR (score = ? AND published_at < ?)
                       OR (score = ? AND published_at = ? AND article_id < ?)
                    """;
            parameters.add(cursor.score());
            parameters.add(cursor.score());
            parameters.add(java.sql.Timestamp.from(cursor.publishedAt()));
            parameters.add(cursor.score());
            parameters.add(java.sql.Timestamp.from(cursor.publishedAt()));
            parameters.add(cursor.articleId());
        }
        parameters.add(limit + 1);

        String searchSql = """
                WITH matching_alias AS (
                    SELECT DISTINCT article_taxonomy.article_revision_id
                    FROM article_taxonomy
                    JOIN taxonomy_term tt ON tt.id = article_taxonomy.term_id
                    JOIN taxonomy_alias ta ON ta.term_id = tt.id
                    WHERE __ALIAS_VALIDITY__
                ), candidates AS (
                    SELECT sd.article_id, sd.slug, sd.title, sd.dek, sd.body_text,
                           pi.slug AS issue_slug, sd.published_at,
                           (CASE WHEN lower(sd.title) = ? THEN 100.0 ELSE 0.0 END
                            + CASE WHEN lower(sd.title) LIKE '%' || ? || '%' THEN 30.0 ELSE 0.0 END
                            + similarity(lower(sd.title), ?) * 20.0
                            + similarity(sd.normalized_text, ?) * 8.0
                            + CASE WHEN matching_alias.article_revision_id IS NULL
                                   THEN 0.0 ELSE 40.0 END) AS score
                    FROM search_document sd
                    JOIN article a ON a.id = sd.article_id
                    JOIN publication_issue pi ON pi.id = sd.issue_id
                    LEFT JOIN matching_alias
                      ON matching_alias.article_revision_id = sd.revision_id
                    WHERE sd.active
                      AND a.state = 'PUBLISHED'
                      AND a.published_revision_id = sd.revision_id
                      AND a.published_at <= ?
                      AND pi.state = 'PUBLISHED'
                      AND pi.published_at <= ?
                      AND sd.published_at <= ?
                      AND (sd.normalized_text LIKE '%' || ? || '%'
                           OR lower(sd.title) LIKE '%' || ? || '%'
                           OR sd.normalized_text % ?
                           OR matching_alias.article_revision_id IS NOT NULL)
                      __TAXONOMY_PREDICATE__
                )
                SELECT article_id, slug, title, dek, body_text, issue_slug, published_at, score
                FROM candidates
                __CURSOR_PREDICATE__
                ORDER BY score DESC, published_at DESC, article_id DESC
                LIMIT ?
                """
                .replace("__ALIAS_VALIDITY__", aliasValidity)
                .replace("__TAXONOMY_PREDICATE__", taxonomyPredicate)
                .replace("__CURSOR_PREDICATE__", cursorPredicate);
        List<SearchRow> rows = jdbcTemplate.query(searchSql,
                (resultSet, rowNumber) -> new SearchRow(
                        resultSet.getObject("article_id", UUID.class),
                        resultSet.getString("slug"),
                        resultSet.getString("title"),
                        resultSet.getString("dek"),
                        resultSet.getString("body_text"),
                        resultSet.getString("issue_slug"),
                        resultSet.getTimestamp("published_at").toInstant(),
                        resultSet.getDouble("score")
                ),
                parameters.toArray());

        boolean hasNext = rows.size() > limit;
        List<SearchRow> visible = hasNext ? rows.subList(0, limit) : rows;
        List<SearchResult> items = visible.stream().map(SearchService::result).toList();
        String nextCursor = null;
        if (hasNext) {
            SearchRow last = visible.getLast();
            nextCursor = new SearchCursor(last.score(), last.publishedAt(), last.articleId()).encode();
        }
        return new SearchPage(query, items, new PageMeta(nextCursor, limit));
    }

    public TaxonomyPage listTaxonomy(String type, String cursorValue, String limitValue) {
        String normalizedType = type == null ? "" : type.toLowerCase(Locale.ROOT);
        if (!TAXONOMY_TYPES.contains(normalizedType)) {
            throw invalid("/type", "invalid_taxonomy_type", "type is not a supported taxonomy");
        }
        int limit = limit(limitValue);
        TaxonomyCursor cursor = TaxonomyCursor.parse(cursorValue);
        Instant now = clock.instant();
        List<Object> parameters = new ArrayList<>();
        parameters.add(normalizedType.toUpperCase(Locale.ROOT));
        parameters.add(java.sql.Timestamp.from(now));
        parameters.add(java.sql.Timestamp.from(now));
        String cursorPredicate = "";
        if (cursor != null) {
            cursorPredicate = "AND (term_key, id) > (?, ?)";
            parameters.add(cursor.termKey());
            parameters.add(cursor.termId());
        }
        parameters.add(limit + 1);
        List<TaxonomyTerm> rows = jdbcTemplate.query("""
                SELECT id, kind, term_key, display_name
                FROM taxonomy_term
                WHERE kind = ?
                  AND status = 'ACTIVE'
                  AND valid_from <= ?
                  AND (valid_until IS NULL OR valid_until > ?)
                  __CURSOR_PREDICATE__
                ORDER BY term_key, id
                LIMIT ?
                """.replace("__CURSOR_PREDICATE__", cursorPredicate),
                (resultSet, rowNumber) -> new TaxonomyTerm(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("kind").toLowerCase(Locale.ROOT),
                        resultSet.getString("term_key"),
                        resultSet.getString("display_name")
                ), parameters.toArray());
        boolean hasNext = rows.size() > limit;
        List<TaxonomyTerm> items = hasNext ? List.copyOf(rows.subList(0, limit)) : List.copyOf(rows);
        String nextCursor = null;
        if (hasNext) {
            TaxonomyTerm last = items.getLast();
            nextCursor = new TaxonomyCursor(last.slug(), last.termId()).encode();
        }
        return new TaxonomyPage(items, new PageMeta(nextCursor, limit));
    }

    private static SearchResult result(SearchRow row) {
        String source = row.dek() == null || row.dek().isBlank() ? row.bodyText() : row.dek();
        return new SearchResult(
                row.articleId(),
                row.slug(),
                row.title(),
                snippet(source),
                row.issueSlug(),
                row.publishedAt()
        );
    }

    private static String snippet(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.strip().replaceAll("\\s+", " ");
        int count = normalized.codePointCount(0, normalized.length());
        if (count <= MAXIMUM_SNIPPET_CODE_POINTS) {
            return normalized;
        }
        int end = normalized.offsetByCodePoints(0, MAXIMUM_SNIPPET_CODE_POINTS);
        return normalized.substring(0, end).stripTrailing() + "…";
    }

    private static int limit(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT_LIMIT;
        }
        if (value.length() > 3) {
            throw invalidLimit();
        }
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 1 || parsed > MAXIMUM_LIMIT) {
                throw invalidLimit();
            }
            return parsed;
        } catch (NumberFormatException exception) {
            throw invalidLimit();
        }
    }

    private static List<String> taxonomy(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> result = values.stream()
                .filter(Objects::nonNull)
                .flatMap(value -> List.of(value.split(",")).stream())
                .map(value -> value.toLowerCase(Locale.ROOT).strip())
                .distinct()
                .toList();
        if (result.size() > MAXIMUM_FILTERS
                || result.stream().anyMatch(value -> !TERM_KEY.matcher(value).matches())) {
            throw invalid(
                    "/taxonomy",
                    "invalid_taxonomy_filter",
                    "taxonomy must contain at most 20 bounded term keys"
            );
        }
        return result;
    }

    private static String placeholders(int count) {
        return String.join(", ", java.util.Collections.nCopies(count, "?"));
    }

    private static SearchRequestException invalidLimit() {
        return invalid("/limit", "invalid_limit", "limit must be an integer between 1 and 100");
    }

    private static SearchRequestException invalid(String path, String code, String message) {
        return new SearchRequestException(path, code, message);
    }

    public record QueryEcho(String raw, String normalized, List<String> taxonomy) {
        public QueryEcho {
            taxonomy = List.copyOf(taxonomy);
        }
    }

    public record SearchResult(
            UUID articleId,
            String slug,
            String title,
            String snippet,
            String issueSlug,
            Instant publishedAt
    ) {
    }

    public record PageMeta(String nextCursor, int limit) {
    }

    public record SearchPage(QueryEcho query, List<SearchResult> items, PageMeta page) {
        public SearchPage {
            items = List.copyOf(items);
        }
    }

    public record TaxonomyTerm(UUID termId, String type, String slug, String name) {
    }

    public record TaxonomyPage(List<TaxonomyTerm> items, PageMeta page) {
        public TaxonomyPage {
            items = List.copyOf(items);
        }
    }

    private record SearchRow(
            UUID articleId,
            String slug,
            String title,
            String dek,
            String bodyText,
            String issueSlug,
            Instant publishedAt,
            double score
    ) {
    }

    private record TaxonomyCursor(String termKey, UUID termId) {
        private static final int MAXIMUM_CURSOR_LENGTH = 256;

        private static TaxonomyCursor parse(String value) {
            if (value == null) {
                return null;
            }
            if (value.isBlank() || value.length() > MAXIMUM_CURSOR_LENGTH) {
                throw invalid("/cursor", "invalid_cursor", "cursor must be a bounded opaque value");
            }
            try {
                String decoded = new String(
                        Base64.getUrlDecoder().decode(value),
                        StandardCharsets.UTF_8
                );
                String[] fields = decoded.split("\\|", -1);
                if (fields.length != 2 || !TERM_KEY.matcher(fields[0]).matches()) {
                    throw new IllegalArgumentException("invalid taxonomy cursor");
                }
                return new TaxonomyCursor(fields[0], UUID.fromString(fields[1]));
            } catch (IllegalArgumentException exception) {
                throw invalid("/cursor", "invalid_cursor", "cursor must be a bounded opaque value");
            }
        }

        private String encode() {
            String value = termKey + "|" + termId;
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(value.getBytes(StandardCharsets.UTF_8));
        }
    }
}
