package tw.basketball.magazine.provenance.ipfs;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Objects;

import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;
import tw.basketball.magazine.provenance.transport.WorkerHttpTransport;

/** Actual Kubo raw-block upload + gateway block download; no UnixFS or provider-default chunking. */
public final class KuboHttpMirrorAdapter implements DecentralizedMirrorPort {
    private final URI rpcRoot;
    private final URI gatewayRoot;
    private final WorkerHttpTransport http;
    private final Map<String, String> authentication;
    public KuboHttpMirrorAdapter(URI rpcRoot, URI gatewayRoot, WorkerHttpTransport http, Map<String, String> authentication) {
        this.rpcRoot = trailing(Objects.requireNonNull(rpcRoot));
        this.gatewayRoot = trailing(Objects.requireNonNull(gatewayRoot));
        this.http = Objects.requireNonNull(http);
        this.authentication = Map.copyOf(authentication);
    }
    private static URI trailing(URI uri) {
        if (uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("provider roots cannot contain queries or fragments");
        }
        return URI.create(uri.toString().endsWith("/") ? uri.toString() : uri + "/");
    }
    @Override
    public void putRaw(String cid, byte[] canonicalBytes, String idempotencyKey) {
        if (!cid.matches("b[a-z2-7]{58}") || canonicalBytes.length > 150_000
                || !MessageDigest.isEqual(cid.getBytes(StandardCharsets.US_ASCII),
                ManifestCanonicalizer.rawCid(ManifestCanonicalizer.sha256(canonicalBytes)).getBytes(StandardCharsets.US_ASCII))) {
            throw new IllegalArgumentException("invalid raw block receipt");
        }
        String boundary = "courtside-" + java.util.UUID.randomUUID();
        byte[] prefix = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"manifest.json\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] multipart = new byte[prefix.length + canonicalBytes.length + suffix.length];
        System.arraycopy(prefix, 0, multipart, 0, prefix.length);
        System.arraycopy(canonicalBytes, 0, multipart, prefix.length, canonicalBytes.length);
        System.arraycopy(suffix, 0, multipart, prefix.length + canonicalBytes.length, suffix.length);
        Map<String, String> headers = new java.util.HashMap<>(authentication);
        headers.put("Idempotency-Key", idempotencyKey);
        http.request("POST", rpcRoot.resolve("block/put?cid-codec=raw&mhtype=sha2-256&mhlen=32&pin=true"),
                "multipart/form-data; boundary=" + boundary, multipart, headers);
    }
    @Override
    public byte[] getRaw(String cid) {
        if (!cid.matches("b[a-z2-7]{58}")) {
            throw new IllegalArgumentException("invalid raw CID");
        }
        // Gateway reads deliberately receive no pinning credentials.
        return http.request("GET", gatewayRoot.resolve("ipfs/" + cid + "?format=raw"), "application/vnd.ipld.raw", new byte[0], Map.of());
    }
}
