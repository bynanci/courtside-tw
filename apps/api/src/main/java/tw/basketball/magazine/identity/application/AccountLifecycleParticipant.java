package tw.basketball.magazine.identity.application;

import java.time.Instant;
import java.util.UUID;

/** Additional private account records erased inside the existing account transaction. */
@FunctionalInterface
public interface AccountLifecycleParticipant {
  void erase(UUID readerId, Instant now);
}
