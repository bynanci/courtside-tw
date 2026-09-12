package tw.basketball.magazine.provenance.chain;

/** Isolated managed signer/registry port; no signer capability exists in HTTP request paths. */
public interface ChainAttestationPort {
    Submission submit(Attestation request);
    Confirmation confirm(Attestation request, String transactionId);
    record Attestation(String idempotencyKey, String network, String contract, String method,
            long gasCeiling, String snapshotId, String manifestDigest, String cidDigest,
            String schemaVersion, String publishedAt) { }
    record Submission(String transactionId, String network, String contract, long gasUsed) { }
    record Confirmation(boolean successful, long confirmations, String network, String contract,
            String manifestDigest, String snapshotId) { }
}
