package tw.basketball.magazine.provenance.application;

import java.util.Map;
import java.util.Optional;
import java.util.function.BooleanSupplier;

import tw.basketball.magazine.provenance.chain.ChainAttestationPort;
import tw.basketball.magazine.provenance.chain.ManagedAttestationWorker;
import tw.basketball.magazine.provenance.ipfs.VerifiedMirror;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;

/** Runs after origin commit, under durable outbox retry. Never receives article bytes or signer material. */
public final class ProvenanceExternalPublisher {
    private final Optional<VerifiedMirror> mirror;
    private final Optional<ManagedAttestationWorker> chain;
    private final ManagedAttestationWorker.Policy policy;
    public ProvenanceExternalPublisher(Optional<VerifiedMirror> mirror, Optional<ManagedAttestationWorker> chain,
            ManagedAttestationWorker.Policy policy) {
        this.mirror = mirror; this.chain = chain; this.policy = policy;
    }
    public boolean configured() { return mirror.isPresent() || chain.isPresent(); }
    public Result publish(Map<String, Object> manifest, BooleanSupplier rightsStillValid) {
        ManifestCanonicalizer.Receipt receipt = new ManifestCanonicalizer().receipt(manifest);
        if (!rightsStillValid.getAsBoolean()) {
            return new Result("WITHDRAWN", null, null);
        }
        String key = "provenance:" + manifest.get("snapshotId") + ":v1";
        String cid = null;
        if (mirror.isPresent()) {
            VerifiedMirror.Result result = mirror.get().mirror(manifest, rightsStillValid.getAsBoolean(), key);
            cid = result.cid();
        }
        if (chain.isEmpty()) {
            return new Result("VERIFIED", cid, null);
        }
        if (!rightsStillValid.getAsBoolean()) {
            return new Result("WITHDRAWN", null, null);
        }
        ChainAttestationPort.Attestation request = new ChainAttestationPort.Attestation(key, policy.network(),
                policy.contract(), "attest", policy.gasCeiling(), (String) manifest.get("snapshotId"), receipt.digest(),
                receipt.digest(), "1", (String) manifest.get("publishedAt"));
        ManagedAttestationWorker.Result result = chain.get().attest(request);
        String status = switch (result.status()) {
            case "VERIFIED", "DISABLED" -> "VERIFIED";
            case "PENDING", "UNAVAILABLE" -> "PENDING";
            default -> "FAILED";
        };
        return new Result(status, cid, result.transactionId());
    }
    public record Result(String status, String cid, String transactionId) { }
}
