package tw.basketball.magazine.provenance.application;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.support.TransactionOperations;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;

/** Durable, immutable projection. Publication is never made conditional on this service. */
public final class ProvenanceService {
    private static final String SOURCE_QUERY = """
            SELECT s.id, s.aggregate_type, s.aggregate_id, s.snapshot_version, s.checksum_sha256, s.created_at,
                COALESCE(i.state, a.state) AS publication_state,
                NOT EXISTS (SELECT 1 FROM publication_impact_link impact WHERE impact.snapshot_id = s.id
                    AND NOT EXISTS (SELECT 1 FROM publication_provenance_asset proof
                        WHERE proof.snapshot_id = impact.snapshot_id AND proof.asset_id = impact.asset_id)) AS asset_coverage_complete,
                EXISTS (SELECT 1 FROM publication_provenance_mirror_approval approval
                    WHERE approval.publication_id = s.aggregate_id AND approval.snapshot_checksum = lower(s.checksum_sha256)
                    AND approval.revoked_at IS NULL) AS permanent_mirror,
                NOT EXISTS (
                    SELECT 1 FROM publication_impact_link impact
                    WHERE impact.snapshot_id = s.id AND (
                        NOT EXISTS (SELECT 1 FROM media_asset media WHERE media.id = impact.asset_id AND media.processing_state = 'READY' AND media.archived_at IS NULL)
                        OR EXISTS (SELECT 1 FROM rights_record revoked WHERE revoked.asset_id = impact.asset_id
                            AND revoked.status IN ('REVOKED', 'BLOCKED'))
                        OR NOT EXISTS (SELECT 1 FROM rights_record rights WHERE rights.asset_id = impact.asset_id
                            AND rights.status = 'VALID' AND rights.allowed_channels @> ARRAY['PUBLIC_WEB']::text[]
                            AND rights.valid_from <= ? AND rights.valid_until > ?)
                    )
                ) AS rights_valid,
                EXISTS (SELECT 1 FROM publication_snapshot newer WHERE newer.aggregate_type = s.aggregate_type
                    AND newer.aggregate_id = s.aggregate_id AND newer.snapshot_version > s.snapshot_version) AS superseded
            FROM publication_snapshot s
            LEFT JOIN publication_issue i ON s.aggregate_type = 'ISSUE' AND i.id = s.aggregate_id
            LEFT JOIN article a ON s.aggregate_type = 'ARTICLE' AND a.id = s.aggregate_id
            WHERE s.id = ?
            """;
    private final JdbcOperations jdbc;
    private final TransactionOperations transaction;
    private final ObjectReader manifestReader;
    private final ObjectWriter jsonWriter;
    private final Clock clock;
    private final ManifestCanonicalizer canonicalizer = new ManifestCanonicalizer();

    public ProvenanceService(JdbcOperations jdbc, TransactionOperations transaction, ObjectMapper json, Clock clock) {
        this.jdbc = Objects.requireNonNull(jdbc);
        this.transaction = Objects.requireNonNull(transaction);
        this.manifestReader = Objects.requireNonNull(json).readerFor(new TypeReference<Map<String, Object>>() { });
        this.jsonWriter = json.writer();
        this.clock = Objects.requireNonNull(clock);
    }

    public void project(UUID snapshotId) {
        transaction.executeWithoutResult(ignored -> {
            Source identity = source(snapshotId).orElseThrow(() -> new IllegalArgumentException("snapshot not found"));
            // Aggregate lock serializes versions and duplicates without UPDATE privilege on immutable snapshots.
            jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", identity.aggregateId().toString());
            Source source = source(snapshotId).orElseThrow(() -> new IllegalArgumentException("snapshot not found"));
            List<Map<String, String>> assets = jdbc.query("""
                    SELECT asset_id, digest FROM publication_provenance_asset
                    WHERE snapshot_id = ? ORDER BY asset_id
                    LIMIT 501
                    """, (row, number) -> Map.of("assetId", row.getObject("asset_id", UUID.class).toString(),
                    "digest", row.getString("digest")), snapshotId);
            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("schemaVersion", "1");
            manifest.put("snapshotId", snapshotId.toString());
            manifest.put("publicationId", source.aggregateId().toString());
            manifest.put("revision", Long.toString(source.version()));
            manifest.put("publishedAt", source.publishedAt().toString());
            manifest.put("checksum", "sha256:" + source.checksum().toLowerCase(java.util.Locale.ROOT));
            // PUBLIC_WEB alone never establishes permanence; only a separately stored operations approval may do so.
            manifest.put("rightsScope", source.permanentMirror() ? "PERMANENT_PUBLIC" : "DIGEST_ONLY");
            manifest.put("assets", assets);
            List<String> existing = jdbc.query("SELECT canonical_manifest FROM publication_provenance WHERE snapshot_id = ? AND manifest_version = '1'",
                    (row, number) -> row.getString("canonical_manifest"), snapshotId);
            if (!existing.isEmpty()) {
                // Approval changes never mutate already issued canonical bytes; external delivery rechecks live approval.
                manifest = manifestReader.readValue(existing.get(0));
            }
            ManifestCanonicalizer.Receipt receipt = canonicalizer.receipt(manifest);
            jdbc.update("""
                    INSERT INTO publication_provenance(snapshot_id, manifest_version, canonical_manifest, digest, status)
                    VALUES (?, '1', ?, ?, 'PENDING') ON CONFLICT (snapshot_id, manifest_version) DO NOTHING
                    """, snapshotId, receipt.canonical(), receipt.digest());
            String persistedDigest = jdbc.queryForObject("""
                    SELECT digest FROM publication_provenance WHERE snapshot_id = ? AND manifest_version = '1' FOR UPDATE
                    """, String.class, snapshotId);
            if (!receipt.digest().equals(persistedDigest)) {
                throw new IllegalStateException("immutable manifest projection changed");
            }
            String status = source.status();
            jdbc.update("""
                    UPDATE publication_provenance SET status = ?, verified_at = ?
                    WHERE snapshot_id = ? AND manifest_version = '1' AND status <> 'WITHDRAWN'
                    """, status, "VERIFIED".equals(status) ? Timestamp.from(clock.instant()) : null, snapshotId);
            jdbc.update("""
                    UPDATE publication_provenance older SET status = 'SUPERSEDED'
                    FROM publication_snapshot s WHERE older.snapshot_id = s.id AND s.aggregate_type = ?
                    AND s.aggregate_id = ? AND s.snapshot_version < ? AND older.status <> 'WITHDRAWN'
                    """, source.aggregateType(), source.aggregateId(), source.version());
        });
    }

    public Optional<Map<String, Object>> publicIssue(String slug) {
        List<UUID> snapshots = jdbc.query("""
                SELECT s.id FROM publication_issue i JOIN publication_snapshot s
                    ON s.aggregate_type = 'ISSUE' AND s.aggregate_id = i.id
                WHERE i.slug = ? AND i.state IN ('PUBLISHED', 'WITHDRAWN', 'ARCHIVED') AND i.published_at <= ?
                ORDER BY s.snapshot_version DESC LIMIT 1
                """, (row, number) -> row.getObject("id", UUID.class), slug, Timestamp.from(clock.instant()));
        if (snapshots.isEmpty()) {
            return Optional.empty();
        }
        UUID id = snapshots.get(0);
        Optional<Source> source = source(id);
        if (source.isEmpty()) {
            return Optional.empty();
        }
        return jdbc.query("""
                SELECT canonical_manifest, digest, cid, attestation, status, verified_at FROM publication_provenance
                WHERE snapshot_id = ? AND manifest_version = '1'
                """, (row, number) -> {
            String liveStatus = source.get().status();
            String status = "VERIFIED".equals(liveStatus) ? row.getString("status") : liveStatus;
            Map<String, Object> manifest = manifestReader.readValue(row.getString("canonical_manifest"));
            if ("PERMANENT_PUBLIC".equals(manifest.get("rightsScope")) && !source.get().permanentMirror()) {
                status = "WITHDRAWN";
            }
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("snapshotId", id.toString());
            response.put("schemaVersion", 1);
            response.put("digest", row.getString("digest"));
            response.put("status", status);
            response.put("cid", "WITHDRAWN".equals(status) ? null : row.getString("cid"));
            String attestation = row.getString("attestation");
            response.put("attestation", attestation == null || "WITHDRAWN".equals(status) ? null : manifestReader.readValue(attestation));
            response.put("rightsScope", manifest.get("rightsScope"));
            response.put("manifestVersion", "1");
            Timestamp verifiedAt = row.getTimestamp("verified_at");
            response.put("verifiedAt", verifiedAt == null ? null : verifiedAt.toInstant().toString());
            if (!"WITHDRAWN".equals(status) && !"SUPERSEDED".equals(status)) {
                response.put("manifest", manifest);
            }
            return response;
        }, id).stream().findFirst();
    }

    public boolean deliverExternal(UUID snapshotId, ProvenanceExternalPublisher publisher) {
        if (!publisher.configured()) {
            return true;
        }
        if (source(snapshotId).map(value -> "PENDING".equals(value.status())).orElse(true)) {
            // Historical snapshots without frozen asset proof need a new reviewed publication, not guessed bytes.
            return true;
        }
        String canonical = jdbc.queryForObject("SELECT canonical_manifest FROM publication_provenance WHERE snapshot_id = ? AND manifest_version = '1'",
                String.class, snapshotId);
        Map<String, Object> manifest = manifestReader.readValue(canonical);
        boolean mirrorEligible = "PERMANENT_PUBLIC".equals(manifest.get("rightsScope"));
        ProvenanceExternalPublisher.Result result = publisher.publish(manifest, () -> source(snapshotId)
                .map(value -> "VERIFIED".equals(value.status()) && (!mirrorEligible || value.permanentMirror())).orElse(false));
        transaction.executeWithoutResult(ignored -> {
            String liveStatus = source(snapshotId).map(value -> mirrorEligible && !value.permanentMirror()
                    ? "WITHDRAWN" : value.status()).orElse("WITHDRAWN");
            String finalStatus = "VERIFIED".equals(liveStatus) ? result.status() : liveStatus;
            jdbc.update("""
                    UPDATE publication_provenance SET status = ?, cid = ?, attestation = ?::jsonb
                    WHERE snapshot_id = ? AND manifest_version = '1' AND status <> 'WITHDRAWN'
                    """, finalStatus, result.cid(), result.transactionId() == null ? null
                    : jsonWriter.writeValueAsString(Map.of("transactionId", result.transactionId())), snapshotId);
        });
        return !"PENDING".equals(result.status());
    }

    private Optional<Source> source(UUID id) {
        Instant now = clock.instant();
        return jdbc.query(SOURCE_QUERY, (row, number) -> new Source(row.getObject("aggregate_id", UUID.class),
                row.getString("aggregate_type"), row.getLong("snapshot_version"), row.getString("checksum_sha256"),
                row.getTimestamp("created_at").toInstant(), row.getString("publication_state"),
                row.getBoolean("rights_valid"), row.getBoolean("superseded"), row.getBoolean("permanent_mirror"), row.getBoolean("asset_coverage_complete")), Timestamp.from(now), Timestamp.from(now), id)
                .stream().findFirst();
    }

    private record Source(UUID aggregateId, String aggregateType, long version, String checksum,
            Instant publishedAt, String publicationState, boolean rightsValid, boolean superseded, boolean permanentMirror, boolean assetCoverageComplete) {
        private String status() {
            if (!"PUBLISHED".equals(publicationState) || !rightsValid) {
                return "WITHDRAWN";
            }
            return superseded ? "SUPERSEDED" : assetCoverageComplete ? "VERIFIED" : "PENDING";
        }
    }
}
