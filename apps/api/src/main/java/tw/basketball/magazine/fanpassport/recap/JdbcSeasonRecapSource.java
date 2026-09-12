package tw.basketball.magazine.fanpassport.recap;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.EvidenceStore;
import tw.basketball.magazine.evidence.EvidenceValidation;
import tw.basketball.magazine.evidence.JdbcEvidenceStore;
import tw.basketball.magazine.fanpassport.archive.ArchiveContributionPolicy.Rights;
import tw.basketball.magazine.fanpassport.recap.SeasonRecapProjectionService.Request;
import tw.basketball.magazine.fanpassport.recap.SeasonRecapProjectionService.Signal;
import tw.basketball.magazine.fanpassport.recap.SeasonRecapProjectionService.SourceSnapshot;

/** Immutable canonical facts produce metrics; caller-supplied canvas values are never a source. */
public final class JdbcSeasonRecapSource implements SeasonRecapProjectionService.ProjectionSource {
    private final JdbcOperations jdbc;
    private final ObjectMapper json;
    private final Supplier<Instant> clock;
    private final EvidenceStore evidence;
    private final ContradictionReview review;

    public JdbcSeasonRecapSource(JdbcTemplate jdbc, ObjectMapper json, Supplier<Instant> clock) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json").rebuild().build();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.evidence = new JdbcEvidenceStore(Objects.requireNonNull(jdbc.getDataSource(), "dataSource"));
        this.review = new ContradictionReview(evidence, actor -> {
            throw new SecurityException("recap source cannot review evidence");
        });
    }

    @Override
    public SourceSnapshot read(UUID seasonId, UUID projectionId, UUID posterAssetId) {
        Stored stored = stored(projectionId);
        Request request = request(stored.payload());
        if (!seasonId.equals(request.seasonId()) || !posterAssetId.equals(request.posterAssetId())) {
            throw unavailable();
        }
        return readCanonical(request, stored.factIds());
    }

    @Override
    public SourceSnapshot readCanonical(Request request, List<UUID> canonicalFactIds) {
        List<UUID> ids = boundedIds(canonicalFactIds);
        Instant now = clock.get();
        if (request.asOf().isAfter(now)) {
            throw unavailable();
        }
        Fact season = fact(request.seasonId(), "SEASON");
        LocalDate start = date(season.payload().path("period"), "startDate");
        LocalDate end = date(season.payload().path("period"), "endDate");
        LocalDate asOf = request.asOf().atZone(ZoneOffset.UTC).toLocalDate();
        Set<UUID> snapshots = new LinkedHashSet<>();
        requireEvidence(season.evidenceIds(), request.asOf(), now, snapshots);
        List<Signal> signals = new ArrayList<>();
        Set<String> teams = new LinkedHashSet<>();
        for (UUID id : ids) {
            Fact fact = fact(id, "TEAM_SEASON");
            JsonNode payload = fact.payload();
            if (!request.seasonId().toString().equals(payload.path("seasonId").asString())
                    || !season.payload().path("leagueId").equals(payload.path("leagueId"))
                    || !teams.add(payload.path("teamId").asString())) {
                throw unavailable();
            }
            List<Evidence.EvidenceRef> refs = requireEvidence(fact.evidenceIds(), request.asOf(), now, snapshots);
            LocalDate participationEnd = payload.path("period").path("endDate").isNull()
                    ? null : date(payload.path("period"), "endDate");
            double value = SeasonCoverage.fraction(start, end,
                    date(payload.path("period"), "startDate"), participationEnd, asOf);
            Evidence.EvidenceRef primary = refs.get(0);
            signals.add(new Signal(id, request.seasonId(), primary.snapshotId(), signals.size(), value,
                    "PUBLIC", "CONFIRMED", "fresh", primary.effectiveAt(), primary.retrievedAt(), true));
        }
        if (snapshots.size() > 32) {
            throw unavailable();
        }
        return new SourceSnapshot(signals, rights(request.posterAssetId(), "PUBLIC_WEB", now),
                snapshots.stream().sorted().toList());
    }

    private List<Evidence.EvidenceRef> requireEvidence(List<UUID> ids, Instant asOf, Instant now, Set<UUID> snapshots) {
        List<Evidence.EvidenceRef> refs = new ArrayList<>();
        for (UUID id : boundedIds(ids)) {
            Evidence.EvidenceRef ref = evidence.reference(id).orElseThrow(JdbcSeasonRecapSource::unavailable);
            EvidenceValidation.validate(ref, evidence);
            Evidence.Source source = evidence.source(ref.sourceId()).orElseThrow(JdbcSeasonRecapSource::unavailable);
            if (!Evidence.project(ref, source, now, false, true).currentFact()
                    || ref.effectiveAt().isAfter(asOf) || ref.retrievedAt().isAfter(asOf)) {
                throw unavailable();
            }
            List<String> claims = jdbc.queryForList("""
                    SELECT DISTINCT claim_key FROM basketball_claim_event
                    WHERE ? = ANY(evidence_ids) ORDER BY claim_key LIMIT 33
                    """, String.class, id);
            if (claims.isEmpty() || claims.size() > 32) {
                throw unavailable();
            }
            for (String claim : claims) {
                ContradictionReview.ClaimView view = review.view(claim);
                EvidenceStore.ReviewEvent decision = view.history().stream()
                        .filter(row -> row.kind() == EvidenceStore.EventKind.REVIEWED)
                        .reduce((previous, next) -> next).orElseThrow(JdbcSeasonRecapSource::unavailable);
                if (view.disputed() || view.confirmedValue().isEmpty() || !decision.evidenceIds().contains(id)
                        || decision.createdAt().isAfter(asOf)) {
                    throw unavailable();
                }
            }
            refs.add(ref);
            snapshots.add(ref.snapshotId());
        }
        return List.copyOf(refs);
    }

    private Fact fact(UUID id, String kind) {
        List<Fact> found = jdbc.query("SELECT payload,evidence_ids FROM basketball_fact WHERE id=? AND fact_kind=?",
                (rs, row) -> new Fact(json.readTree(rs.getString("payload")),
                        Arrays.asList((UUID[]) rs.getArray("evidence_ids").getArray())), id, kind);
        if (found.size() != 1 || !id.toString().equals(found.get(0).payload().path("id").asString())) {
            throw unavailable();
        }
        return found.get(0);
    }

    public Rights rights(UUID assetId, String channel, Instant now) {
        if (!Set.of("PUBLIC_WEB", "OFFLINE").contains(channel)) {
            throw unavailable();
        }
        List<Rights> result = jdbc.query("""
                SELECT rr.* FROM media_asset asset JOIN rights_record rr ON rr.asset_id=asset.id
                WHERE asset.id=? AND asset.processing_state='READY' AND asset.archived_at IS NULL
                  AND rr.status='VALID' AND ?=ANY(rr.allowed_channels)
                  AND rr.valid_from<=? AND rr.valid_until>?
                  AND NOT EXISTS (SELECT 1 FROM rights_record denied WHERE denied.asset_id=asset.id
                      AND denied.status IN ('REVOKED','BLOCKED'))
                  AND EXISTS (SELECT 1 FROM media_variant v WHERE v.asset_id=asset.id AND v.variant='poster'
                      AND v.public_storage_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
                      AND position('..' IN v.public_storage_key)=0 AND position('//' IN v.public_storage_key)=0
                      AND position('/./' IN v.public_storage_key)=0 AND right(v.public_storage_key,1)<>'/')
                ORDER BY rr.version DESC,rr.updated_at DESC,rr.id DESC LIMIT 1
                """, (rs, row) -> new Rights(assetId, rs.getString("rights_owner"), rs.getString("license_name"),
                        Set.of(channel), false, false, rs.getTimestamp("valid_from").toInstant(),
                        rs.getTimestamp("valid_until").toInstant(), rs.getString("credit"), "ORIGIN_WITHDRAWAL", null),
                assetId, channel, Timestamp.from(now), Timestamp.from(now));
        if (result.isEmpty()) {
            throw unavailable();
        }
        return result.get(0);
    }

    public Stored stored(UUID id) {
        List<Stored> result = jdbc.query("SELECT fact_ids,payload FROM season_recap_projection WHERE id=?",
                (rs, row) -> new Stored(Arrays.asList((UUID[]) rs.getArray("fact_ids").getArray()),
                        json.readTree(rs.getString("payload"))), id);
        if (result.size() != 1) {
            throw unavailable();
        }
        return result.get(0);
    }

    public void insert(Request request, List<UUID> facts, JsonNode payload) {
        String[] ids = boundedIds(facts).stream().map(UUID::toString).toArray(String[]::new);
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("""
                    INSERT INTO season_recap_projection(id,season_id,poster_asset_id,metric,fact_ids,payload)
                    VALUES(?,?,?,'TEAM_SEASON_COVERAGE_V1',?,?::jsonb) ON CONFLICT(id) DO NOTHING
                    """);
            statement.setObject(1, request.projectionId());
            statement.setObject(2, request.seasonId());
            statement.setObject(3, request.posterAssetId());
            statement.setArray(4, connection.createArrayOf("uuid", ids));
            statement.setString(5, json.writeValueAsString(payload));
            return statement;
        });
        Stored saved = stored(request.projectionId());
        if (!saved.factIds().equals(boundedIds(facts)) || !saved.payload().equals(payload)) {
            throw new IllegalArgumentException("projection identity already binds different immutable content");
        }
    }

    public JsonNode validatedPayload(UUID id, String channel) {
        Stored stored = stored(id);
        Request request = request(stored.payload());
        var projection = new SeasonRecapProjectionService(this, clock).project(request);
        JsonNode expected = json.valueToTree(projection.payload(rights(request.posterAssetId(), channel, clock.get()),
                channel, clock.get()));
        if (!expected.equals(stored.payload())) {
            throw unavailable();
        }
        return expected;
    }

    public static Request request(JsonNode payload) {
        return new Request(UUID.fromString(payload.path("seasonId").asString()),
                UUID.fromString(payload.path("projectionId").asString()),
                UUID.fromString(payload.path("posterAssetId").asString()), payload.path("seed").asInt(),
                payload.path("altText").asString(), payload.path("dataSummary").asString(),
                Instant.parse(payload.path("asOf").asString()));
    }

    public static List<UUID> boundedIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 32 || ids.stream().anyMatch(Objects::isNull)
                || ids.stream().distinct().count() != ids.size()) {
            throw new IllegalArgumentException("one to 32 unique canonical facts are required");
        }
        return ids.stream().sorted().toList();
    }

    private static LocalDate date(JsonNode value, String field) {
        if (!value.path(field).isString()) {
            throw unavailable();
        }
        return LocalDate.parse(value.path(field).asString());
    }

    static IllegalArgumentException unavailable() {
        return new IllegalArgumentException("recap unavailable or no longer approved for presentation");
    }

    private record Fact(JsonNode payload, List<UUID> evidenceIds) { }
    public record Stored(List<UUID> factIds, JsonNode payload) {
        public Stored {
            factIds = List.copyOf(factIds);
            payload = Objects.requireNonNull(payload, "payload").deepCopy();
        }

        @Override
        public JsonNode payload() {
            return payload.deepCopy();
        }
    }
}
