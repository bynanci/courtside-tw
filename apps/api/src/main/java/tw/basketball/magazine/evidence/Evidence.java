package tw.basketball.magazine.evidence;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Evidence values are immutable; missing publication/effective dates remain unknown (null). */
public final class Evidence {
    private Evidence() {
    }

    public enum SourceType { ASSOCIATION, LEAGUE, TEAM, GAME_DATA, MEDIA, INTERVIEW, SOCIAL, INTERNAL_ANALYSIS }
    public enum Status { CONFIRMED, REPORTED, ANALYSIS, RUMOR, UNKNOWN }
    public enum Origin { HUMAN, ADAPTER, MODEL }

    public record Source(UUID id, SourceType type, String name, URI sourceUrl, boolean publicReferenceAllowed) {
        public Source {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(type, "type");
            name = text(name, "name", 500);
            safeUrl(sourceUrl);
        }
    }

    /** Content is a rights-approved minimal excerpt or a controlled reference, never an unrestricted crawl. */
    public record SourceSnapshot(UUID id, UUID sourceId, URI sourceUrl, Instant retrievedAt,
                                 Instant publishedAt, String content, String sha256, String rightsReference) {
        public SourceSnapshot {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(sourceId, "sourceId");
            safeUrl(sourceUrl);
            Objects.requireNonNull(retrievedAt, "retrievedAt");
            retrievedAt = canonicalTime(retrievedAt);
            publishedAt = canonicalTime(publishedAt);
            content = text(content, "content", 1_000_000);
            rightsReference = text(rightsReference, "rightsReference", 500);
            if (publishedAt != null && publishedAt.isAfter(retrievedAt)) {
                throw new IllegalArgumentException("publication cannot be later than snapshot retrieval");
            }
            if (!digest(content).equals(sha256)) {
                throw new IllegalArgumentException("snapshot checksum mismatch");
            }
        }
    }

    public record EvidenceRef(UUID id, UUID sourceId, SourceType sourceType, URI sourceUrl,
                              Instant retrievedAt, Instant publishedAt, Instant effectiveAt,
                              double confidence, Status status, String freshness, UUID snapshotId,
                              Instant staleAt, Instant expiresAt, String note) {
        public EvidenceRef {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(sourceId, "sourceId");
            Objects.requireNonNull(sourceType, "sourceType");
            safeUrl(sourceUrl);
            Objects.requireNonNull(retrievedAt, "retrievedAt");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(snapshotId, "snapshotId");
            Objects.requireNonNull(staleAt, "staleAt");
            Objects.requireNonNull(expiresAt, "expiresAt");
            retrievedAt = canonicalTime(retrievedAt);
            publishedAt = canonicalTime(publishedAt);
            effectiveAt = canonicalTime(effectiveAt);
            staleAt = canonicalTime(staleAt);
            expiresAt = canonicalTime(expiresAt);
            if (!Double.isFinite(confidence) || confidence < 0 || confidence > 1) {
                throw new IllegalArgumentException("confidence must be between 0 and 1");
            }
            if (!List.of("fresh", "stale", "expired", "disputed").contains(freshness)) {
                throw new IllegalArgumentException("unsupported freshness");
            }
            if (staleAt.isBefore(retrievedAt) || expiresAt.isBefore(staleAt)) {
                throw new IllegalArgumentException("invalid freshness window");
            }
            if (status == Status.CONFIRMED && effectiveAt == null) {
                throw new IllegalArgumentException("confirmed facts require effectiveAt");
            }
            note = note == null ? "" : note;
            if (note.length() > 1000) {
                throw new IllegalArgumentException("note exceeds minimal metadata limit");
            }
        }

        public String conditionAt(Instant at, boolean disputed) {
            String computed = EvidenceFreshness.at(at, staleAt, expiresAt, disputed || "disputed".equals(freshness));
            if ("disputed".equals(computed) || "expired".equals(freshness)) {
                return "disputed".equals(computed) ? computed : "expired";
            }
            if ("expired".equals(computed) || "stale".equals(freshness)) {
                return "expired".equals(computed) ? computed : "stale";
            }
            return computed;
        }
    }

    public record Projection(Status status, String condition, Instant asOf, boolean currentFact,
                             URI sourceUrl, UUID snapshotId) {
    }

    public static Projection project(EvidenceRef reference, Source source, Instant at, boolean disputed,
                                     boolean rightsStillAllowed) {
        if (!source.id().equals(reference.sourceId())) {
            throw new IllegalArgumentException("source identity mismatch");
        }
        String condition = reference.conditionAt(at, disputed);
        boolean eligible = rightsStillAllowed && source.publicReferenceAllowed();
        boolean current = eligible && reference.status() == Status.CONFIRMED && "fresh".equals(condition)
                && reference.effectiveAt() != null && !reference.effectiveAt().isAfter(at)
                && !reference.retrievedAt().isAfter(at);
        return new Projection(reference.status(), eligible ? condition : "expired", reference.retrievedAt(),
                current, eligible ? reference.sourceUrl() : null, eligible ? reference.snapshotId() : null);
    }

    public static void requirePermittedTransition(Status before, Status after, Origin origin) {
        Objects.requireNonNull(before, "before");
        Objects.requireNonNull(after, "after");
        Objects.requireNonNull(origin, "origin");
        if (origin != Origin.HUMAN && before != after) {
            throw new IllegalArgumentException("adapter/model cannot change evidence status");
        }
    }

    public static String digest(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }

    /** PostgreSQL stores microsecond timestamps; normalize before identity comparison or persistence. */
    public static Instant canonicalTime(Instant value) {
        return value == null ? null : value.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    private static String text(String value, String field, int maximum) {
        if (value == null || value.isBlank() || value.length() > maximum) {
            throw new IllegalArgumentException(field + " has invalid length");
        }
        return value;
    }

    private static void safeUrl(URI uri) {
        Objects.requireNonNull(uri, "sourceUrl");
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getFragment() != null || uri.getQuery() != null) {
            throw new IllegalArgumentException("sourceUrl must be HTTPS without credentials/query/fragment");
        }
    }
}
