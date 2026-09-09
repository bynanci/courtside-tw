package tw.basketball.magazine.media.application;

import java.util.List;
import java.util.Objects;
import java.util.TreeSet;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxEventHandler;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.publication.worker.PublicationExternalInvalidator;
import tw.basketball.magazine.publication.worker.PublicationInvalidationKeys;

/** Reconciles committed revocation impacts, then purges external surfaces through the durable outbox. */
public final class MediaRevocationHandler implements OutboxEventHandler {
    public static final String EVENT_TYPE = "media.rights.revoked";
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactions;
    private final ObjectMapper objectMapper;
    private final PublicationExternalInvalidator externalInvalidator;

    public MediaRevocationHandler(
            JdbcTemplate jdbcTemplate,
            TransactionTemplate transactions,
            ObjectMapper objectMapper,
            PublicationExternalInvalidator externalInvalidator
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.externalInvalidator = Objects.requireNonNull(externalInvalidator, "externalInvalidator");
    }

    @Override
    public void handle(OutboxEvent event) throws OutboxHandlerException {
        if (!EVENT_TYPE.equals(event.eventType()) || !"MEDIA_ASSET".equals(event.aggregateType())
                || !("media-revocation:" + event.aggregateId()).equals(event.idempotencyKey())) {
            throw new OutboxHandlerException("media revocation event identity is invalid", false);
        }
        try {
            JsonNode payload = objectMapper.readTree(event.payloadJson());
            if (!payload.isObject() || !event.aggregateId().toString().equals(payload.path("assetId").asString())) {
                throw new IllegalArgumentException("asset identity does not match");
            }
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("media revocation payload is invalid", exception, false);
        }
        try {
            List<String> keys = transactions.execute(status -> reconcile(event.aggregateId()));
            // The origin was closed in the command transaction. Search removal commits
            // here before any purge can trigger a cache refill on another connection.
            externalInvalidator.invalidate(new PublicationExternalInvalidator.Request(
                    event.idempotencyKey(), Objects.requireNonNull(keys, "revocation keys")));
            // OutboxWorker acknowledges only after this call returns. An unavailable
            // provider therefore retains the event for bounded retries/dead-letter alerting.
        } catch (RuntimeException exception) {
            throw new OutboxHandlerException("media revocation propagation failed", exception, true);
        }
    }

    private List<String> reconcile(UUID assetId) {
        String state = jdbcTemplate.queryForObject(
                "SELECT processing_state FROM media_asset WHERE id = ? FOR UPDATE", String.class, assetId);
        if (!"REVOKED".equals(state)) {
            throw new IllegalStateException("revocation source is not closed");
        }
        jdbcTemplate.update("""
                UPDATE search_document document
                SET active = false, indexed_at = transaction_timestamp(), version = version + 1
                WHERE document.active AND (EXISTS (
                    SELECT 1 FROM publication_snapshot snapshot
                    JOIN publication_impact_link impact ON impact.snapshot_id = snapshot.id
                    WHERE snapshot.aggregate_type = 'ARTICLE'
                      AND snapshot.aggregate_id = document.article_id
                      AND snapshot.revision_id = document.revision_id
                      AND impact.asset_id = ?)
                    OR EXISTS (SELECT 1 FROM publication_issue issue
                               WHERE issue.id = document.issue_id AND issue.cover_asset_id = ?
                                 AND issue.state IN ('WITHDRAWN', 'ARCHIVED')))
                """, assetId, assetId);
        TreeSet<String> keys = new TreeSet<>();
        keys.add("media:" + assetId);
        keys.add("offline:withdrawals");
        List<Impact> impacts = jdbcTemplate.query("""
                SELECT aggregate_type, aggregate_id FROM media_revocation_impact
                WHERE asset_id = ? ORDER BY aggregate_type, aggregate_id
                """, (row, index) -> new Impact(row.getString(1), row.getObject(2, UUID.class)), assetId);
        if (impacts.isEmpty()) {
            throw new IllegalStateException("durable revocation impacts are missing");
        }
        for (Impact impact : impacts) {
            if ("ISSUE".equals(impact.type())) {
                keys.addAll(PublicationInvalidationKeys.forIssue(impact.id()));
                keys.add("offline:issue:" + impact.id());
            } else if ("ARTICLE".equals(impact.type())) {
                keys.add("article:" + impact.id());
                keys.add("search:article:" + impact.id());
                keys.add("sitemap:articles");
            }
        }
        return List.copyOf(keys);
    }

    private record Impact(String type, UUID id) {
    }
}
