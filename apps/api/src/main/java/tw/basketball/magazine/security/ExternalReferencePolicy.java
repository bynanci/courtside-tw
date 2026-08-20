package tw.basketball.magazine.security;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.Objects;

/**
 * Deny-by-default policy for server-fetched provider, embed, RPC and signer
 * references. This policy deliberately does not resolve DNS; the outbound
 * adapter must still enforce resolver pinning and egress ACLs at connection
 * time to prevent DNS rebinding.
 */
public final class ExternalReferencePolicy {
    private static final int MAX_REFERENCE_LENGTH = 2048;

    private ExternalReferencePolicy() {
    }

    /** Requires a public HTTPS reference suitable for a server-side adapter. */
    public static String requireSafe(String reference) {
        return requireSafe(reference, false);
    }

    /**
     * Allows HTTP only for an explicitly configured local adapter, while still
     * rejecting loopback, private, link-local and metadata destinations.
     */
    public static String requireSafe(String reference, boolean allowHttp) {
        String value = bounded(reference);
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("reference must be an absolute HTTP(S) URI", exception);
        }

        String scheme = uri.getScheme();
        if (uri.getHost() == null
                || (!"https".equalsIgnoreCase(scheme)
                && !(allowHttp && "http".equalsIgnoreCase(scheme)))
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || isBlockedHost(uri.getHost())) {
            throw new IllegalArgumentException(
                    "reference must use a public HTTP(S) destination without credentials or fragments"
            );
        }
        return uri.toASCIIString();
    }

    private static String bounded(String reference) {
        Objects.requireNonNull(reference, "reference");
        if (reference.isBlank()
                || reference.length() > MAX_REFERENCE_LENGTH
                || reference.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("reference must be bounded and free of control characters");
        }
        return reference;
    }

    private static boolean isBlockedHost(String rawHost) {
        String host = rawHost.toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        if (host.equals("localhost")
                || host.endsWith(".localhost")
                || host.endsWith(".local")
                || host.endsWith(".internal")
                || host.equals("metadata")
                || host.equals("metadata.google.internal")) {
            return true;
        }
        if (host.indexOf(':') >= 0) {
            return blockedIpAddress(host);
        }
        if (host.chars().allMatch(Character::isDigit)
                || host.matches("(?i)0x[0-9a-f]+")) {
            return true;
        }
        if (host.matches("[0-9.]+")) {
            return blockedIpAddress(host);
        }
        return false;
    }

    private static boolean blockedIpAddress(String host) {
        try {
            InetAddress address = InetAddress.getByName(host);
            if (address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress()
                    || address.isMulticastAddress()) {
                return true;
            }
            byte[] bytes = address.getAddress();
            return bytes.length == 16
                    && bytes[0] == 0
                    && bytes[1] == 0
                    && bytes[2] == 0
                    && bytes[3] == 0
                    && bytes[4] == 0
                    && bytes[5] == 0
                    && bytes[6] == 0
                    && bytes[7] == 0
                    && bytes[8] == 0
                    && bytes[9] == 0
                    && bytes[10] == (byte) 0xff
                    && bytes[11] == (byte) 0xff
                    && blockedIpv4(bytes[12] & 0xff, bytes[13] & 0xff, bytes[14] & 0xff, bytes[15] & 0xff);
        } catch (UnknownHostException exception) {
            return true;
        }
    }

    private static boolean blockedIpv4(int first, int second, int third, int fourth) {
        return first == 0
                || first == 10
                || first == 127
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 168)
                || first >= 224;
    }
}
