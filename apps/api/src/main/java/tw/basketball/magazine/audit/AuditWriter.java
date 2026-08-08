package tw.basketball.magazine.audit;

import java.util.UUID;

/** Append-only audit persistence boundary. */
@FunctionalInterface
public interface AuditWriter {
    UUID append(AuditEventDraft draft);
}
