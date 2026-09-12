package tw.basketball.magazine.basketball.domain;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Append-only identity map. Exact retries succeed; a changed payload needs a new fact ID. */
public final class TemporalHistory<T> {
    private final Map<UUID, T> entries = new LinkedHashMap<>();

    public synchronized void append(UUID id, T value) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(value, "value");
        T existing = entries.get(id);
        if (existing != null && !existing.equals(value)) {
            throw new IllegalStateException("immutable record identity already exists");
        }
        entries.putIfAbsent(id, value);
    }

    public synchronized List<T> values() {
        return List.copyOf(entries.values());
    }
}
