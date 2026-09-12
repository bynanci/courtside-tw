package tw.basketball.magazine.provenance.ipfs;

/** Worker-only raw-block transport. A production implementation needs separate provider approval. */
public interface DecentralizedMirrorPort {
    void putRaw(String cid, byte[] canonicalBytes, String idempotencyKey);
    byte[] getRaw(String cid);
}
