package tw.basketball.magazine.fanpassport.recap;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.content.persistence.JdbcPublicArticleRepository;
import tw.basketball.magazine.content.persistence.PublicArticleRepository;
import tw.basketball.magazine.fanpassport.recap.SeasonRecapProjectionService.Request;

/** Publisher generation is separate from public presentation and never consults reader activity. */
public final class SeasonRecapApplication {
    private final JdbcOperations jdbc;
    private final PublicArticleRepository publicArticles;
    private final ObjectMapper json;
    private final JdbcSeasonRecapSource source;
    private final SeasonRecapProjectionService engine;
    private final Supplier<Instant> clock;
    private final TransactionTemplate transactions;

    public SeasonRecapApplication(JdbcTemplate jdbc, ObjectMapper json, JdbcSeasonRecapSource source,
            SeasonRecapProjectionService engine, PlatformTransactionManager manager, Supplier<Instant> clock) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json").rebuild().build();
        this.publicArticles = new JdbcPublicArticleRepository(jdbc, this.json);
        this.source = Objects.requireNonNull(source, "source");
        this.engine = Objects.requireNonNull(engine, "engine");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.transactions = new TransactionTemplate(Objects.requireNonNull(manager, "manager"));
    }

    public JsonNode generate(Generate input) {
        List<UUID> facts = JdbcSeasonRecapSource.boundedIds(input.factIds());
        Request request = new Request(input.seasonId(), input.projectionId(), input.posterAssetId(),
                input.projectionId().hashCode(), "球季參與紀錄的公開資料涵蓋比例",
                "依 " + facts.size() + " 筆已審核球隊球季紀錄，計算各紀錄期間與截至日期前球季日數的交集比例；不是戰績或私人閱讀紀錄。",
                input.asOf());
        return transactions.execute(status -> {
            var projection = engine.generate(request, facts);
            JsonNode payload = json.valueToTree(projection.payload(
                    source.rights(request.posterAssetId(), "PUBLIC_WEB", clock.get()), "PUBLIC_WEB", clock.get()));
            source.insert(request, facts, payload);
            return document(payload);
        });
    }

    public Optional<Map<String, Object>> published(UUID seasonId, UUID projectionId) {
        try {
            JsonNode payload = source.validatedPayload(projectionId, "PUBLIC_WEB");
            Request request = JdbcSeasonRecapSource.request(payload);
            if (!request.seasonId().equals(seasonId)) {
                return Optional.empty();
            }
            // A generated draft is not a publication. Read only the current immutable article snapshot.
            List<String> slugs = jdbc.queryForList("""
                    SELECT COALESCE(s.content_document->>'slug',a.slug)
                    FROM article a JOIN article_revision r ON r.id=a.published_revision_id AND r.article_id=a.id
                    JOIN LATERAL (SELECT id,content_document FROM publication_snapshot p
                        WHERE p.aggregate_type='ARTICLE' AND p.aggregate_id=a.id AND p.revision_id=r.id
                        ORDER BY p.snapshot_version DESC,p.id DESC LIMIT 1) s ON TRUE
                    WHERE a.state='PUBLISHED' AND r.state='PUBLISHED' AND a.published_at<=?
                      AND EXISTS (SELECT 1 FROM publication_impact_link impact
                          WHERE impact.snapshot_id=s.id AND impact.asset_id=? AND impact.impact_type='CONTENT_MEDIA')
                      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s.content_document->'content',s.content_document)->'blocks') b
                          WHERE b->>'type'='generative-canvas' AND b->'payload'=?::jsonb)
                    ORDER BY a.id LIMIT 2
                    """, String.class, Timestamp.from(clock.get()), request.posterAssetId(), json.writeValueAsString(payload));
            if (slugs.size() != 1) {
                return Optional.empty();
            }
            var article = publicArticles.findBySlug(slugs.get(0), null, clock.get());
            if (article.isEmpty()) {
                return Optional.empty();
            }
            var posters = article.get().media().stream().filter(media -> media.assetId().equals(request.posterAssetId())
                    && "poster".equals(media.variant())).toList();
            if (posters.size() != 1) {
                return Optional.empty();
            }
            return Optional.of(Map.of("content", document(payload), "poster", posters.get(0),
                    "canonicalPath", article.get().canonicalPath()));
        } catch (IllegalArgumentException invalid) {
            return Optional.empty();
        }
    }

    private JsonNode document(JsonNode payload) {
        String id = payload.path("projectionId").asString();
        return json.valueToTree(Map.of("schemaVersion", 1, "documentId", id,
                "blocks", List.of(Map.of("id", id, "type", "generative-canvas", "version", 1, "payload", payload))));
    }

    public record Generate(UUID projectionId, UUID seasonId, UUID posterAssetId, Instant asOf, List<UUID> factIds) {
        public Generate {
            factIds = factIds == null ? List.of() : List.copyOf(factIds);
        }

        @JsonAnySetter
        public void rejectUnknown(String field, JsonNode value) {
            throw new IllegalArgumentException("unexpected recap input field");
        }
    }
}
