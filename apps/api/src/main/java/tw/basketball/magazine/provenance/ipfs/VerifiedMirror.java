package tw.basketball.magazine.provenance.ipfs;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.BooleanSupplier;

import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;

/** Two separately configured routes, bounded attempts and digest verification before claiming a mirror. */
public final class VerifiedMirror {
    private final List<DecentralizedMirrorPort> routes;
    private final BooleanSupplier writeEnabled;
    public VerifiedMirror(List<DecentralizedMirrorPort> routes, BooleanSupplier writeEnabled) {
        this.routes = List.copyOf(routes);
        this.writeEnabled = Objects.requireNonNull(writeEnabled);
    }
    public Result mirror(Map<String, Object> manifest, boolean permanentRights, String key) {
        ManifestCanonicalizer.Receipt receipt = new ManifestCanonicalizer().receipt(manifest);
        if (!writeEnabled.getAsBoolean() || !permanentRights || !"PERMANENT_PUBLIC".equals(manifest.get("rightsScope"))) {
            return new Result("DIGEST_ONLY", null);
        }
        if (routes.size() < 2 || routes.get(0) == routes.get(1)) {
            return new Result("UNAVAILABLE", null);
        }
        byte[] bytes = receipt.canonical().getBytes(StandardCharsets.UTF_8);
        byte[] hash = ManifestCanonicalizer.sha256(bytes);
        if (!receipt.cid().equals(ManifestCanonicalizer.rawCid(hash))) {
            throw new IllegalArgumentException("invalid receipt CID");
        }
        for (DecentralizedMirrorPort route : routes.subList(0, 2)) {
            if (!writeEnabled.getAsBoolean()) {
                return new Result("DIGEST_ONLY", null);
            }
            try {
                route.putRaw(receipt.cid(), bytes.clone(), key);
                for (DecentralizedMirrorPort reader : routes.subList(0, 2)) {
                    try {
                        byte[] roundTrip = reader.getRaw(receipt.cid());
                        if (roundTrip != null && roundTrip.length == bytes.length
                                && MessageDigest.isEqual(hash, ManifestCanonicalizer.sha256(roundTrip))) {
                            return new Result("VERIFIED", receipt.cid());
                        }
                    } catch (RuntimeException ignored) {
                        // Bounded failover, with no provider error or credential reflected into public data.
                    }
                }
            } catch (RuntimeException ignored) {
                // Next approved route may recover. Origin state is never touched.
            }
        }
        return new Result("UNAVAILABLE", null);
    }
    public record Result(String status, String cid) { }
}
