package tw.basketball.magazine.basketball.ports;

import java.util.UUID;

/** Domain writes require a previously validated reference; adapters do not receive this write capability. */
@FunctionalInterface
public interface EvidenceLookup {
    void requireValidated(UUID evidenceId);
}
