package tw.basketball.magazine.fanpassport;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import tw.basketball.magazine.shared.ApplicationClock;

/** Uses the application's actual Clock wrapper while allowing deterministic challenge expiry. */
final class PassportTestClock extends Clock {

  private final AtomicReference<Instant> current;
  private final ZoneId zone;

  private PassportTestClock(AtomicReference<Instant> current, ZoneId zone) {
    this.current = current;
    this.zone = zone;
  }

  static ApplicationClock fixed(Instant instant) {
    return new ApplicationClock(Clock.fixed(instant, ZoneOffset.UTC));
  }

  static ApplicationClock following(AtomicReference<Instant> current) {
    return new ApplicationClock(new PassportTestClock(current, ZoneOffset.UTC));
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId requestedZone) {
    return new PassportTestClock(current, requestedZone);
  }

  @Override
  public Instant instant() {
    return current.get();
  }
}
