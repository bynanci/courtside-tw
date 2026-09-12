package tw.basketball.magazine.evidence;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Deterministic fixture/local implementation; production wiring uses the JDBC persistence port. */
public final class MemoryEvidenceStore implements EvidenceStore {
    private final Map<UUID, Evidence.Source> sources = new HashMap<>();
    private final Map<UUID, Evidence.SourceSnapshot> snapshots = new HashMap<>();
    private final Map<UUID, Evidence.EvidenceRef> references = new HashMap<>();
    private final List<ReviewEvent> history = new ArrayList<>();

    @Override
    public synchronized void appendSource(Evidence.Source source) {
        append(sources, source.id(), source);
    }

    @Override
    public synchronized void appendSnapshot(Evidence.SourceSnapshot snapshot) {
        if (!sources.containsKey(snapshot.sourceId())) {
            throw new IllegalArgumentException("source must exist before snapshot");
        }
        append(snapshots, snapshot.id(), snapshot);
    }

    @Override
    public synchronized void appendReference(Evidence.EvidenceRef reference) {
        EvidenceValidation.validate(reference, this);
        append(references, reference.id(), reference);
    }

    @Override
    public synchronized Optional<Evidence.Source> source(UUID id) {
        return Optional.ofNullable(sources.get(id));
    }

    @Override
    public synchronized Optional<Evidence.SourceSnapshot> snapshot(UUID id) {
        return Optional.ofNullable(snapshots.get(id));
    }

    @Override
    public synchronized Optional<Evidence.EvidenceRef> reference(UUID id) {
        return Optional.ofNullable(references.get(id));
    }

    @Override
    public synchronized List<ReviewEvent> events(String claimKey) {
        return history.stream().filter(event -> event.claimKey().equals(claimKey)).toList();
    }

    @Override
    public synchronized void appendEvent(ReviewEvent event, int expectedRevision) {
        Optional<ReviewEvent> existing = history.stream().filter(row -> row.id().equals(event.id())).findFirst();
        if (existing.isPresent()) {
            if (!existing.get().equals(event)) {
                throw new IllegalStateException("immutable event cannot be overwritten");
            }
            return;
        }
        if (events(event.claimKey()).size() != expectedRevision || event.revision() != expectedRevision + 1) {
            throw new IllegalStateException("review revision conflict; reread before deciding");
        }
        event.evidenceIds().forEach(id -> {
            if (!references.containsKey(id)) {
                throw new IllegalArgumentException("missing evidence reference");
            }
        });
        history.add(event);
    }

    private static <T> void append(Map<UUID, T> rows, UUID id, T value) {
        T existing = rows.get(id);
        if (existing != null && !existing.equals(value)) {
            throw new IllegalStateException("immutable identity cannot be overwritten");
        }
        rows.putIfAbsent(id, value);
    }
}
