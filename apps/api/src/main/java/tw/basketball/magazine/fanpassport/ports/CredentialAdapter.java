package tw.basketball.magazine.fanpassport.ports;

import java.util.UUID;

/** Optional delivery boundary receives opaque entitlement data only, never content or personal behavior. */
public interface CredentialAdapter {
  DeliveryResult deliver(MinimalCredential credential, DeliveryPolicy policy);

  record MinimalCredential(UUID id, String season, String credentialType) { }

  record DeliveryPolicy(
    boolean externalWritesEnabled,
    boolean consent,
    boolean claimed,
    boolean rightsAllowed,
    boolean transferable,
    long gasCeiling,
    long estimatedGas
  ) { }

  record DeliveryResult(
    String status,
    boolean transferable,
    long gasCeiling,
    String permanenceDisclosure
  ) { }
}
