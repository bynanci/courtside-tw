package tw.basketball.magazine.basketball.application;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.Evidence;
import tw.basketball.magazine.evidence.EvidenceStore;
import tw.basketball.magazine.evidence.EvidenceValidation;

/** Explicit human intake boundary; provider adapters cannot invoke this authenticated workflow. */
public final class ReviewedEvidenceIntake {
    private final EvidenceStore store;
    private final ContradictionReview review;
    private final Supplier<String> authority;
    private final Supplier<Instant> clock;

    public ReviewedEvidenceIntake(EvidenceStore store, ContradictionReview review, Supplier<String> authority, Supplier<Instant> clock) {
        this.store = Objects.requireNonNull(store, "store");
        this.review = Objects.requireNonNull(review, "review");
        this.authority = Objects.requireNonNull(authority, "authority");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public record SnapshotCommand(Evidence.Source source, UUID snapshotId, UUID evidenceId, Instant publishedAt,
                                  Instant effectiveAt, String content, String rightsReference, double confidence,
                                  Instant staleAt, Instant expiresAt) {
        public SnapshotCommand {
            Objects.requireNonNull(source, "source");
            Objects.requireNonNull(snapshotId, "snapshotId");
            Objects.requireNonNull(evidenceId, "evidenceId");
            Objects.requireNonNull(staleAt, "staleAt");
            Objects.requireNonNull(expiresAt, "expiresAt");
            if (content == null || content.isBlank() || content.length() > 16000) {
                throw new IllegalArgumentException("content must contain 1..16000 characters of permitted reference material");
            }
        }
    }

    public record ConfirmationCommand(UUID confirmedEvidenceId, String rationale) {
        public ConfirmationCommand {
            Objects.requireNonNull(confirmedEvidenceId, "confirmedEvidenceId");
            rationale = ReviewedEvidenceIntake.rationale(rationale);
        }
    }

    public Evidence.EvidenceRef submit(SnapshotCommand command) {
        String actor = authority.get();
        Instant now = now();
        Instant retrievedAt = store.snapshot(command.snapshotId()).map(Evidence.SourceSnapshot::retrievedAt).orElse(now);
        Evidence.SourceSnapshot snapshot = new Evidence.SourceSnapshot(command.snapshotId(), command.source().id(),
                command.source().sourceUrl(), retrievedAt, command.publishedAt(), command.content(),
                Evidence.digest(command.content()), command.rightsReference());
        Evidence.EvidenceRef reference = new Evidence.EvidenceRef(command.evidenceId(), command.source().id(), command.source().type(),
                snapshot.sourceUrl(), retrievedAt, snapshot.publishedAt(), command.effectiveAt(), command.confidence(),
                Evidence.Status.REPORTED, "fresh", snapshot.id(), command.staleAt(), command.expiresAt(), "Publisher-submitted source");
        if (reference.effectiveAt() != null && reference.effectiveAt().isAfter(now)) {
            throw new IllegalArgumentException("effectiveAt cannot be in the future");
        }
        // Preflight every existing identity before appending anything. Independent immutable steps are retryable.
        store.source(command.source().id()).ifPresent(existing -> immutable(existing, command.source()));
        store.snapshot(snapshot.id()).ifPresent(existing -> immutable(existing, snapshot));
        store.reference(reference.id()).ifPresent(existing -> immutable(existing, reference));
        store.appendSource(command.source());
        store.appendSnapshot(snapshot);
        store.appendReference(reference);
        String key = "evidence:" + reference.id();
        if (store.events(key).isEmpty()) {
            store.appendEvent(new EvidenceStore.ReviewEvent(eventId(key, "submitted"), key, 1,
                    EvidenceStore.EventKind.PROPOSED, "sha256:" + snapshot.sha256(), List.of(reference.id()),
                    Evidence.Status.REPORTED, actor, "Source submitted for review", now), 0);
        }
        return reference;
    }

    public Evidence.EvidenceRef confirm(UUID reportedEvidenceId, ConfirmationCommand command) {
        authority.get();
        Evidence.EvidenceRef reported = reference(reportedEvidenceId);
        if (reported.status() != Evidence.Status.REPORTED || reported.id().equals(command.confirmedEvidenceId())) {
            throw new IllegalArgumentException("confirmation must retain a separate original REPORTED reference");
        }
        requireFactual(reported, now());
        Evidence.EvidenceRef confirmed = new Evidence.EvidenceRef(command.confirmedEvidenceId(), reported.sourceId(), reported.sourceType(),
                reported.sourceUrl(), reported.retrievedAt(), reported.publishedAt(), reported.effectiveAt(), reported.confidence(),
                Evidence.Status.CONFIRMED, reported.freshness(), reported.snapshotId(), reported.staleAt(), reported.expiresAt(),
                "Reviewed reference to " + reported.id());
        store.appendReference(confirmed);
        recordDecision("evidence:" + confirmed.id(), "sourceReference:" + reported.id(), List.of(confirmed.id()), command.rationale());
        return confirmed;
    }

    public record EvidenceView(Evidence.Source source, Evidence.SourceSnapshot snapshot, Evidence.EvidenceRef reference,
                               List<EvidenceStore.ReviewEvent> history) {
        public EvidenceView {
            history = List.copyOf(history);
        }
    }

    public EvidenceView read(UUID evidenceId) {
        authority.get();
        Evidence.EvidenceRef reference = reference(evidenceId);
        return new EvidenceView(store.source(reference.sourceId()).orElseThrow(), store.snapshot(reference.snapshotId()).orElseThrow(),
                reference, store.events("evidence:" + evidenceId));
    }

    public void requireConfirmed(UUID evidenceId) {
        authority.get();
        Evidence.EvidenceRef reference = reference(evidenceId);
        requireFactual(reference, now());
        ContradictionReview.ClaimView state = review.view("evidence:" + evidenceId);
        if (reference.status() != Evidence.Status.CONFIRMED || state.confirmedValue().isEmpty() || state.disputed()) {
            throw new IllegalArgumentException("canonical facts require explicitly reviewed confirmed evidence");
        }
        EvidenceStore.ReviewEvent latest = state.history().get(state.history().size() - 1);
        if (latest.kind() != EvidenceStore.EventKind.REVIEWED || !latest.evidenceIds().contains(evidenceId)
                || latest.createdAt().isAfter(now())) {
            throw new IllegalArgumentException("latest evidence review does not authorize this reference");
        }
    }

    /** The audit records a human review, not a claim that a later catalog write has already committed. */
    public void recordDecision(String key, String value, List<UUID> evidenceIds, String reason) {
        String actor = authority.get();
        String rationale = rationale(reason);
        Instant at = now();
        List<EvidenceStore.ReviewEvent> history = store.events(key);
        if (history.isEmpty()) {
            review.propose(eventId(key, "proposal"), key, value, evidenceIds, Evidence.Status.CONFIRMED, Evidence.Origin.HUMAN, at);
            history = store.events(key);
        }
        EvidenceStore.ReviewEvent proposal = history.get(0);
        if (proposal.kind() != EvidenceStore.EventKind.PROPOSED || !proposal.value().equals(value)
                || !proposal.evidenceIds().equals(evidenceIds)) {
            throw new IllegalStateException("review identity cannot be reused for different material");
        }
        if (history.size() == 1) {
            review.decide(eventId(key, "review"), key, proposal.id(), Evidence.Status.CONFIRMED, actor, rationale, 1, at);
        } else {
            EvidenceStore.ReviewEvent prior = history.get(history.size() - 1);
            if (history.size() != 2 || prior.kind() != EvidenceStore.EventKind.REVIEWED || prior.status() != Evidence.Status.CONFIRMED
                    || !prior.value().equals(value) || !prior.evidenceIds().equals(evidenceIds)
                    || !actor.equals(prior.reviewerId()) || !rationale.equals(prior.rationale())) {
                throw new IllegalStateException("review changed; reread the immutable decision history");
            }
        }
    }

    private Evidence.EvidenceRef reference(UUID id) {
        Evidence.EvidenceRef value = store.reference(id).orElseThrow(() -> new IllegalArgumentException("unknown evidence reference"));
        EvidenceValidation.validate(value, store);
        return value;
    }

    private static void requireFactual(Evidence.EvidenceRef reference, Instant at) {
        if (reference.effectiveAt() == null || reference.effectiveAt().isAfter(at) || reference.retrievedAt().isAfter(at)
                || !"fresh".equals(reference.conditionAt(at, false)) || reference.sourceType() == Evidence.SourceType.INTERNAL_ANALYSIS) {
            throw new IllegalArgumentException("confirmation requires fresh factual source evidence effective by review time");
        }
    }

    private Instant now() {
        return Evidence.canonicalTime(clock.get());
    }

    private static UUID eventId(String key, String step) {
        return UUID.nameUUIDFromBytes(("courtside:intake:" + key + ":" + step).getBytes(StandardCharsets.UTF_8));
    }

    private static String rationale(String value) {
        if (value == null || value.isBlank() || value.length() > 1000 || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("review rationale must contain 1..1000 printable characters");
        }
        return value;
    }

    private static void immutable(Object existing, Object requested) {
        if (!existing.equals(requested)) {
            throw new IllegalStateException("immutable source evidence cannot be overwritten");
        }
    }
}
