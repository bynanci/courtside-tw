package tw.basketball.magazine.fanpassport.identity;

/** A locally vetted EOA verifier; wallet signatures are never OIDC or editorial authority. */
@FunctionalInterface
public interface WalletSignatureVerifier {
  boolean verify(String message, String signature, String address);
}
