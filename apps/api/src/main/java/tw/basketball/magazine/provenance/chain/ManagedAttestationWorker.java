package tw.basketball.magazine.provenance.chain;

import java.util.Objects;
import java.util.function.BooleanSupplier;

/** Enforces the complete approved destination and cost boundary before an optional signer call. */
public final class ManagedAttestationWorker {
    private final Policy policy;
    private final ChainAttestationPort port;
    private final BooleanSupplier writeEnabled;
    public ManagedAttestationWorker(Policy policy, ChainAttestationPort port, BooleanSupplier writeEnabled) {
        this.policy = Objects.requireNonNull(policy);
        this.port = Objects.requireNonNull(port);
        this.writeEnabled = Objects.requireNonNull(writeEnabled);
    }
    public Result attest(ChainAttestationPort.Attestation request) {
        return attest(request, () -> true);
    }
    public Result attest(ChainAttestationPort.Attestation request, BooleanSupplier eligible) {
        if (!eligible.getAsBoolean()) {
            return new Result("DENIED", null);
        }
        if (!writeEnabled.getAsBoolean() || policy.gasCeiling() == 0) {
            return new Result("DISABLED", null);
        }
        if (!policy.network().equals(request.network()) || !policy.contract().equals(request.contract())
                || !"attest".equals(request.method()) || request.gasCeiling() <= 0
                || request.gasCeiling() > policy.gasCeiling()
                || !request.manifestDigest().matches("sha256:[0-9a-f]{64}")
                || !request.cidDigest().equals(request.manifestDigest())
                || !request.snapshotId().matches("[0-9a-f-]{36}")
                || !"1".equals(request.schemaVersion()) || request.idempotencyKey().isBlank()) {
            return new Result("DENIED", null);
        }
        String transactionId = null;
        try {
            if (!eligible.getAsBoolean() || !writeEnabled.getAsBoolean()) {
                return new Result("DENIED", null);
            }
            ChainAttestationPort.Submission submission = port.submit(request, () -> eligible.getAsBoolean() && writeEnabled.getAsBoolean());
            transactionId = submission.transactionId();
            if (!policy.network().equals(submission.network()) || !policy.contract().equals(submission.contract())
                    || submission.gasUsed() > request.gasCeiling() || submission.gasUsed() < 0) {
                return new Result("DENIED", null);
            }
            ChainAttestationPort.Confirmation confirmation = port.confirm(request, submission.transactionId());
            if (!confirmation.successful() || !policy.network().equals(confirmation.network())
                    || !policy.contract().equals(confirmation.contract())
                    || !request.manifestDigest().equals(confirmation.manifestDigest())
                    || !request.snapshotId().equals(confirmation.snapshotId())) {
                return new Result("FAILED", submission.transactionId());
            }
            return new Result(!eligible.getAsBoolean() ? "DENIED"
                    : confirmation.confirmations() >= policy.minimumConfirmations() ? "VERIFIED" : "PENDING",
                    submission.transactionId());
        } catch (RuntimeException ignored) {
            return new Result("UNAVAILABLE", transactionId);
        }
    }
    public record Policy(String network, String contract, long gasCeiling, long minimumConfirmations) {
        public Policy {
            Objects.requireNonNull(network); Objects.requireNonNull(contract);
            if (gasCeiling < 0 || minimumConfirmations < 1 || (gasCeiling > 0
                    && (!network.matches("eip155:[1-9][0-9]{0,18}") || !contract.matches("0x[0-9a-fA-F]{40}")))) {
                throw new IllegalArgumentException("invalid attestation policy");
            }
        }
    }
    public record Result(String status, String transactionId) { }
}
