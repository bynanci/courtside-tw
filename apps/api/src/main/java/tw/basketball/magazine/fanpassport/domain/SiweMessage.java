package tw.basketball.magazine.fanpassport.domain;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/** Strict server-generated ERC-4361 message; verification compares the entire issued message digest. */
public final class SiweMessage {

  private SiweMessage() {}

  public static String address(String value) {
    if (value == null || !value.matches("0x[0-9a-fA-F]{40}")) {
      throw new IllegalArgumentException("invalid wallet address");
    }
    return value.toLowerCase(Locale.ROOT);
  }

  public static String create(
    String domain,
    String uri,
    String chainId,
    String address,
    String nonce,
    Instant issuedAt,
    Instant expiresAt
  ) {
    URI origin = URI.create(uri);
    if (
      !"https".equals(origin.getScheme()) ||
      !domain.equals(origin.getRawAuthority()) ||
      origin.getRawUserInfo() != null ||
      origin.getRawFragment() != null ||
      !chainId.matches("eip155:[1-9][0-9]{0,17}") ||
      !nonce.matches("[a-zA-Z0-9]{16,128}") ||
      !expiresAt.isAfter(issuedAt) ||
      expiresAt.isAfter(issuedAt.plusSeconds(300))
    ) {
      throw new IllegalArgumentException("invalid SIWE binding");
    }
    return (
      domain +
      " wants you to sign in with your Ethereum account:\n" +
      address(address) +
      "\n\nLink this wallet to your Courtside reader account. No editor authority is granted." +
      "\n\nURI: " +
      uri +
      "\nVersion: 1\nChain ID: " +
      chainId.substring(7) +
      "\nNonce: " +
      nonce +
      "\nIssued At: " +
      issuedAt +
      "\nExpiration Time: " +
      expiresAt
    );
  }

  public static String nonce(String message) {
    if (message == null || message.length() > 2000 || message.indexOf('\r') >= 0) {
      throw new IllegalArgumentException("invalid SIWE message");
    }
    List<String> values = message
      .lines()
      .filter((line) -> line.startsWith("Nonce: "))
      .toList();
    if (values.size() != 1 || !values.get(0).substring(7).matches("[a-zA-Z0-9]{16,128}")) {
      throw new IllegalArgumentException("invalid nonce");
    }
    return values.get(0).substring(7);
  }
}
