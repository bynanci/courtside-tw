package tw.basketball.magazine.fanpassport.identity;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.SignatureException;
import java.util.Arrays;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;
import tw.basketball.magazine.fanpassport.domain.SiweMessage;

/** Local EIP-191 recovery using a pinned library; no RPC, provider or signer is contacted. */
public final class Web3jWalletSignatureVerifier implements WalletSignatureVerifier {

  private static final BigInteger ORDER = new BigInteger(
    "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
    16
  );

  @Override
  public boolean verify(String message, String signature, String address) {
    if (
      message == null ||
      message.length() > 2000 ||
      signature == null ||
      !signature.matches("0x[0-9a-fA-F]{130}")
    ) {
      return false;
    }
    try {
      byte[] bytes = Numeric.hexStringToByteArray(signature);
      int v = Byte.toUnsignedInt(bytes[64]);
      if (v == 0 || v == 1) {
        v += 27;
      }
      if (v != 27 && v != 28) {
        return false;
      }
      byte[] rBytes = Arrays.copyOfRange(bytes, 0, 32);
      byte[] sBytes = Arrays.copyOfRange(bytes, 32, 64);
      BigInteger r = new BigInteger(1, rBytes);
      BigInteger s = new BigInteger(1, sBytes);
      if (
        r.signum() <= 0 ||
        r.compareTo(ORDER) >= 0 ||
        s.signum() <= 0 ||
        s.compareTo(ORDER.shiftRight(1)) > 0
      ) {
        return false;
      }
      BigInteger key = Sign.signedPrefixedMessageToKey(
        message.getBytes(StandardCharsets.UTF_8),
        new Sign.SignatureData((byte) v, rBytes, sBytes)
      );
      return ("0x" + Keys.getAddress(key)).equals(SiweMessage.address(address));
    } catch (SignatureException | IllegalArgumentException exception) {
      return false;
    }
  }
}
