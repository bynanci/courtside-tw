package tw.basketball.magazine.fanpassport.domain;

/** Every predicate is required at delivery time; cost is expressed in chain gas units. */
public final class CredentialPolicy {

  private CredentialPolicy() { }

  public static boolean mayDeliver(
    boolean enabled,
    boolean explicitConsent,
    boolean claimed,
    boolean currentRights,
    long gasCeiling,
    long estimatedGas
  ) {
    return (
      enabled &&
      explicitConsent &&
      claimed &&
      currentRights &&
      gasCeiling >= 0 &&
      estimatedGas >= 0 &&
      estimatedGas <= gasCeiling
    );
  }
}
