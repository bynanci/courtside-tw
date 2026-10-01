package tw.basketball.magazine.fanpassport;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;
import tw.basketball.magazine.fanpassport.domain.SiweMessage;
import tw.basketball.magazine.fanpassport.identity.Web3jWalletSignatureVerifier;

final class WalletSignatureVerifierTest {

  @Test
  void exactSignedMessageMustMatchAddressAndRejectsTampering() {
    ECKeyPair key = ECKeyPair.create(BigInteger.valueOf(105));
    String address = "0x" + Keys.getAddress(key.getPublicKey());
    Instant now = Instant.parse("2026-09-12T00:00:00Z");
    String message = SiweMessage.create(
      "courtside.tw",
      "https://courtside.tw",
      "eip155:1",
      address,
      "ab12".repeat(8),
      now,
      now.plusSeconds(300)
    );
    Sign.SignatureData data = Sign.signPrefixedMessage(
      message.getBytes(StandardCharsets.UTF_8),
      key
    );
    String signature =
      Numeric.toHexString(data.getR()) +
      Numeric.toHexStringNoPrefix(data.getS()) +
      Numeric.toHexStringNoPrefix(data.getV());
    var verifier = new Web3jWalletSignatureVerifier();
    assertTrue(verifier.verify(message, signature, address));
    assertFalse(verifier.verify(message.replace("courtside.tw", "evil.test"), signature, address));
    assertFalse(verifier.verify(message, signature, "0x0000000000000000000000000000000000000001"));
    assertFalse(verifier.verify(message, "0x" + "00".repeat(65), address));
    assertFalse(verifier.verify(message, signature.substring(0, 130) + "ff", address));
  }
}
