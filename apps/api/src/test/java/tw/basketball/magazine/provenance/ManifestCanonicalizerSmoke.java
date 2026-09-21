package tw.basketball.magazine.provenance;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;

/** Dependency-free cross-language check; JUnit integration consumes the same JSON fixture. */
public final class ManifestCanonicalizerSmoke {
    private ManifestCanonicalizerSmoke() { }
    public static void main(String[] args) throws Exception {
        Map<String, Object> manifest = Map.of(
                "schemaVersion", "1", "snapshotId", "0190f7b0-7c4b-7e3a-8f12-123456789abc",
                "publicationId", "0190f7b0-7c4b-7e3a-8f12-123456789abd", "revision", "9007199254740993",
                "publishedAt", "2026-09-12T00:00:00Z", "checksum", "sha256:" + "a".repeat(64),
                "rightsScope", "DIGEST_ONLY", "assets", List.of(Map.of(
                        "assetId", "0190f7b0-7c4b-7e3a-8f12-123456789abe", "digest", "sha256:" + "b".repeat(64))));
        ManifestCanonicalizer.Receipt receipt = new ManifestCanonicalizer().receipt(manifest);
        Files.writeString(Path.of(args[0]), receipt.canonical() + "\n" + receipt.digest() + "\n" + receipt.cid() + "\n");
    }
}
