package tw.basketball.magazine.provenance.ipfs;

/** Worker-only raw-block transport. A production implementation needs separate provider approval. */
public interface DecentralizedMirrorPort {
    void putRaw(String cid, byte[] canonicalBytes, String idempotencyKey);
    default void putRaw(String cid, byte[] canonicalBytes, String idempotencyKey,
            java.util.function.BooleanSupplier stillEligible) {
        if (!stillEligible.getAsBoolean()) { throw new IllegalStateException("mirror write disabled"); }
        putRaw(cid, canonicalBytes, idempotencyKey);
    }
    byte[] getRaw(String cid);
}
