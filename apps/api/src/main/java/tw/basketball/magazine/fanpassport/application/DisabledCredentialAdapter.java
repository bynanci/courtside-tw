package tw.basketball.magazine.fanpassport.application;

import tw.basketball.magazine.fanpassport.domain.CredentialPolicy;
import tw.basketball.magazine.fanpassport.ports.CredentialAdapter;

/** The shipped adapter has no transport or signing capability. Operational activation needs a new adapter. */
public final class DisabledCredentialAdapter implements CredentialAdapter {

  @Override
  public DeliveryResult deliver(MinimalCredential credential, DeliveryPolicy policy) {
    if (credential == null || policy.transferable() || !policy.consent()) {
      throw new IllegalArgumentException(
        "non-transferable credential and explicit consent required"
      );
    }
    if (
      CredentialPolicy.mayDeliver(
        policy.externalWritesEnabled(),
        policy.consent(),
        policy.claimed(),
        policy.rightsAllowed(),
        policy.gasCeiling(),
        policy.estimatedGas()
      )
    ) {
      throw new IllegalStateException("external credential adapter is not provisioned");
    }
    return new DeliveryResult(
      "DISABLED",
      false,
      0,
      "Public-chain copies cannot be guaranteed deletable. Off-chain status and rights withdrawal remain authoritative."
    );
  }
}
