package tw.basketball.magazine.fanpassport.recap;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

import tw.basketball.magazine.fanpassport.archive.ArchiveContributionPolicy.Rights;

/** Deterministic projection from reviewed public evidence; private reader activity is not an input. */
public final class SeasonRecapProjectionService {
    private final ProjectionSource source;
    private final Supplier<Instant> clock;

    public SeasonRecapProjectionService(ProjectionSource source, Supplier<Instant> clock) {
        this.source = Objects.requireNonNull(source, "source");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Projection project(Request request) {
        SourceSnapshot snapshot = source.read(request.seasonId(), request.projectionId(), request.posterAssetId());
        return projectSnapshot(request, snapshot);
    }

    public Projection generate(Request request, List<UUID> canonicalFactIds) {
        return projectSnapshot(request, source.readCanonical(request, canonicalFactIds));
    }

    private Projection projectSnapshot(Request request, SourceSnapshot snapshot) {
        Projection result = project(request, snapshot.signals(), snapshot.rights(), clock.get());
        if (!snapshot.evidenceSnapshotIds().containsAll(result.evidenceSnapshotIds())) {
            throw new IllegalArgumentException("recap snapshot omits signal evidence");
        }
        return new Projection(result.seasonId(), result.projectionId(), result.posterAssetId(), result.seed(),
                result.altText(), result.dataSummary(), result.asOf(), result.values(), snapshot.evidenceSnapshotIds());
    }

    /** Source must read a reviewed, immutable evidence projection and current rights through application ports. */
    public interface ProjectionSource {
        SourceSnapshot read(UUID seasonId, UUID projectionId, UUID posterAssetId);

        default SourceSnapshot readCanonical(Request request, List<UUID> canonicalFactIds) {
            throw new IllegalArgumentException("canonical recap generation is unavailable");
        }
    }

    public record SourceSnapshot(List<Signal> signals, Rights rights, List<UUID> evidenceSnapshotIds) {
        public SourceSnapshot(List<Signal> signals, Rights rights) {
            this(signals, rights, signals.stream().map(Signal::snapshotId).distinct().sorted().toList());
        }

        public SourceSnapshot {
            signals = List.copyOf(signals);
            Objects.requireNonNull(rights, "rights");
            evidenceSnapshotIds = List.copyOf(evidenceSnapshotIds);
        }
    }

    public static Projection project(Request request, List<Signal> signals, Rights rights, Instant now) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(rights, "rights");
        Objects.requireNonNull(now, "now");
        List<Signal> ordered = List.copyOf(signals).stream()
                .sorted(Comparator.comparingInt(Signal::ordinal).thenComparing(Signal::id)).toList();
        if (request.asOf().isAfter(now) || !rights.assetId().equals(request.posterAssetId())
                || !rights.permits("PUBLIC_WEB", now) || ordered.isEmpty() || ordered.size() > 32) {
            throw new IllegalArgumentException("recap lacks current rights or bounded public evidence");
        }
        if (ordered.stream().map(Signal::id).distinct().count() != ordered.size()
                || ordered.stream().map(Signal::ordinal).distinct().count() != ordered.size()) {
            throw new IllegalArgumentException("duplicate recap signal identity or ordinal");
        }
        for (Signal signal : ordered) {
            if (!request.seasonId().equals(signal.seasonId()) || !"PUBLIC".equals(signal.visibility())
                    || !"CONFIRMED".equals(signal.status()) || !"fresh".equals(signal.freshness())
                    || !signal.rightsEligible() || signal.effectiveAt().isAfter(request.asOf())
                    || signal.retrievedAt().isAfter(request.asOf())) {
                throw new IllegalArgumentException("recap input is private, stale, unconfirmed or outside its season/as-of");
            }
        }
        return new Projection(request.seasonId(), request.projectionId(), request.posterAssetId(),
                request.seed(), request.altText(), request.dataSummary(), request.asOf(),
                ordered.stream().map(Signal::normalizedValue).toList(),
                ordered.stream().map(Signal::snapshotId).distinct().sorted().toList());
    }

    public record Request(UUID seasonId, UUID projectionId, UUID posterAssetId, int seed,
            String altText, String dataSummary, Instant asOf) {
        public Request {
            Objects.requireNonNull(seasonId, "seasonId");
            Objects.requireNonNull(projectionId, "projectionId");
            Objects.requireNonNull(posterAssetId, "posterAssetId");
            Objects.requireNonNull(asOf, "asOf");
            publicText(altText, 500);
            publicText(dataSummary, 1000);
        }
    }

    public record Signal(UUID id, UUID seasonId, UUID snapshotId, int ordinal, double normalizedValue,
            String visibility, String status, String freshness, Instant effectiveAt, Instant retrievedAt,
            boolean rightsEligible) {
        public Signal {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(seasonId, "seasonId");
            Objects.requireNonNull(snapshotId, "snapshotId");
            Objects.requireNonNull(effectiveAt, "effectiveAt");
            Objects.requireNonNull(retrievedAt, "retrievedAt");
            if (ordinal < 0 || ordinal > 31 || !Double.isFinite(normalizedValue)
                    || normalizedValue < 0 || normalizedValue > 1) {
                throw new IllegalArgumentException("invalid bounded public recap signal");
            }
        }
    }

    public record Projection(UUID seasonId, UUID projectionId, UUID posterAssetId, int seed,
            String altText, String dataSummary, Instant asOf, List<Double> values, List<UUID> evidenceSnapshotIds) {
        public Projection {
            new Request(seasonId, projectionId, posterAssetId, seed, altText, dataSummary, asOf);
            values = List.copyOf(values);
            evidenceSnapshotIds = List.copyOf(evidenceSnapshotIds);
            if (values.isEmpty() || values.size() > 32
                    || values.stream().anyMatch(value -> !Double.isFinite(value) || value < 0 || value > 1)
                    || evidenceSnapshotIds.isEmpty() || evidenceSnapshotIds.size() > 32
                    || evidenceSnapshotIds.stream().distinct().count() != evidenceSnapshotIds.size()) {
                throw new IllegalArgumentException("invalid public recap projection");
            }
        }

        /** Recheck current rights before serving a previously generated projection on any channel. */
        public boolean mayPresent(Rights currentRights, String channel, Instant now) {
            return posterAssetId.equals(currentRights.assetId()) && currentRights.permits(channel, now);
        }

        public Map<String, Object> payload(Rights currentRights, String channel, Instant now) {
            if (!mayPresent(currentRights, channel, now)) {
                throw new IllegalArgumentException("recap presentation rights withdrawn or unavailable");
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("presetId", "season-recap-v1");
            payload.put("seed", seed);
            payload.put("parameters", Map.of("values", values, "lineWeight", 2, "paletteId", "season-ink"));
            payload.put("posterAssetId", posterAssetId.toString());
            payload.put("altText", altText);
            payload.put("dataSummary", dataSummary);
            payload.put("seasonId", seasonId.toString());
            payload.put("projectionId", projectionId.toString());
            payload.put("asOf", asOf.toString());
            payload.put("evidenceSnapshotIds", evidenceSnapshotIds.stream().map(UUID::toString).toList());
            return Map.copyOf(payload);
        }

        public Map<String, Object> contentDocument(UUID documentId, UUID blockId, Rights currentRights, String channel, Instant now) {
            return Map.of("schemaVersion", 1, "documentId", documentId.toString(), "blocks",
                    List.of(Map.of("id", blockId.toString(), "type", "generative-canvas", "version", 1, "payload", payload(currentRights, channel, now))));
        }
    }

    private static void publicText(String value, int limit) {
        if (value == null || value.isBlank() || value.length() > limit
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("invalid recap public text");
        }
    }
}
