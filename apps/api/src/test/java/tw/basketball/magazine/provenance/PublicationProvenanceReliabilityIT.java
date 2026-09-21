package tw.basketball.magazine.provenance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.provenance.chain.ChainAttestationPort;
import tw.basketball.magazine.provenance.chain.ManagedAttestationWorker;
import tw.basketball.magazine.provenance.ipfs.DecentralizedMirrorPort;
import tw.basketball.magazine.provenance.ipfs.VerifiedMirror;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;

final class PublicationProvenanceReliabilityIT {
    @Test
    void writesRemainOffAndOrdinaryRightsCannotEnableMirror() {
        AtomicInteger calls = new AtomicInteger();
        DecentralizedMirrorPort port = route(calls, false, false);
        assertEquals("DIGEST_ONLY", new VerifiedMirror(List.of(port, port), () -> false).mirror(manifest(), true, "one").status());
        assertEquals("DIGEST_ONLY", new VerifiedMirror(List.of(port, port), () -> true).mirror(manifest(), false, "one").status());
        assertEquals(0, calls.get());
    }

    @Test
    void corruptGatewayFailsOverAndBothOutagesReturnUnavailable() {
        AtomicInteger calls = new AtomicInteger();
        DecentralizedMirrorPort corrupt = route(calls, false, true);
        DecentralizedMirrorPort working = route(calls, false, false);
        assertEquals("VERIFIED", new VerifiedMirror(List.of(corrupt, working), () -> true).mirror(manifest(), true, "same-key").status());
        DecentralizedMirrorPort down = route(calls, true, false);
        assertEquals("UNAVAILABLE", new VerifiedMirror(List.of(down, down), () -> true).mirror(manifest(), true, "same-key").status());
        assertEquals("UNAVAILABLE", new VerifiedMirror(List.of(working), () -> true).mirror(manifest(), true, "same-key").status());
    }

    @Test
    void withdrawalBetweenMirrorRoutesPreventsTheNextWrite() {
        java.util.concurrent.atomic.AtomicBoolean eligible = new java.util.concurrent.atomic.AtomicBoolean(true);
        AtomicInteger secondWrites = new AtomicInteger();
        DecentralizedMirrorPort first = new DecentralizedMirrorPort() {
            @Override public void putRaw(String cid, byte[] bytes, String key) { eligible.set(false); throw new IllegalStateException("withdrawn"); }
            @Override public byte[] getRaw(String cid) { throw new AssertionError("no reads after withdrawal"); }
        };
        assertEquals("DIGEST_ONLY", new VerifiedMirror(List.of(first, route(secondWrites, false, false)), () -> true)
                .mirror(manifest(), eligible::get, "same-key").status());
        assertEquals(0, secondWrites.get());
    }

    @Test
    void configuredMirrorOutageRemainsRetryable() {
        VerifiedMirror mirror = new VerifiedMirror(List.of(route(new AtomicInteger(), true, false),
                route(new AtomicInteger(), true, false)), () -> true);
        var publisher = new tw.basketball.magazine.provenance.application.ProvenanceExternalPublisher(
                java.util.Optional.of(mirror), java.util.Optional.empty(), new ManagedAttestationWorker.Policy("", "", 0, 1));
        assertEquals("PENDING", publisher.publish(manifest(), () -> true).status());
    }

    @Test
    void timestampValidationMatchesTypeScriptForLeapSecondAndEndOfDay() {
        for (String timestamp : List.of("2016-12-31T23:59:60Z", "2026-09-12T24:00:00Z", "2026-02-30T00:00:00Z")) {
            Map<String, Object> invalid = new java.util.HashMap<>(manifest());
            invalid.put("publishedAt", timestamp);
            assertThrows(RuntimeException.class, () -> new ManifestCanonicalizer().receipt(invalid));
        }
    }

    @Test
    void signerNeverReceivesUnapprovedDestinationOrGas() {
        AtomicInteger calls = new AtomicInteger();
        ChainAttestationPort denied = new ChainAttestationPort() {
            @Override public Submission submit(Attestation value) { calls.incrementAndGet(); throw new IllegalStateException("signer denied"); }
            @Override public Confirmation confirm(Attestation request, String value) { throw new AssertionError("must not confirm denied signature"); }
        };
        ManagedAttestationWorker.Policy policy = new ManagedAttestationWorker.Policy("eip155:11155111", "0x" + "a".repeat(40), 100_000, 2);
        ManagedAttestationWorker worker = new ManagedAttestationWorker(policy, denied, () -> true);
        assertEquals("DENIED", worker.attest(request("eip155:1", 10)).status());
        assertEquals("DENIED", worker.attest(request("eip155:11155111", 100_001)).status());
        assertEquals(0, calls.get());
        assertEquals("UNAVAILABLE", worker.attest(request("eip155:11155111", 100_000)).status());
        assertEquals(1, calls.get());
        assertEquals("DISABLED", new ManagedAttestationWorker(policy, denied, () -> false).attest(request("eip155:11155111", 100_000)).status());
        assertEquals(1, calls.get());
    }

    @Test
    void manifestCannotCarryPrivateDataOrInvalidPrecision() {
        Map<String, Object> manifest = new java.util.HashMap<>(manifest());
        manifest.put("revision", 9_007_199_254_740_992L);
        assertThrows(IllegalArgumentException.class, () -> new ManifestCanonicalizer().receipt(manifest));
    }

    private static ChainAttestationPort.Attestation request(String chain, long gas) {
        return new ChainAttestationPort.Attestation("snapshot:v1", chain, "0x" + "a".repeat(40), "attest", gas,
                "0190f7b0-7c4b-7e3a-8f12-123456789abc", "sha256:" + "a".repeat(64), "sha256:" + "a".repeat(64), "1", "2026-09-12T00:00:00Z");
    }
    private static ManifestCanonicalizer.Receipt receipt() { return new ManifestCanonicalizer().receipt(manifest()); }
    private static Map<String, Object> manifest() {
        return Map.of("schemaVersion", "1", "snapshotId", "0190f7b0-7c4b-7e3a-8f12-123456789abc",
                "publicationId", "0190f7b0-7c4b-7e3a-8f12-123456789abd", "revision", "1",
                "publishedAt", "2026-09-12T00:00:00Z", "checksum", "sha256:" + "a".repeat(64),
                "rightsScope", "PERMANENT_PUBLIC", "assets", List.of());
    }
    private static DecentralizedMirrorPort route(AtomicInteger calls, boolean down, boolean corrupt) {
        return new DecentralizedMirrorPort() {
            @Override public void putRaw(String cid, byte[] bytes, String key) { calls.incrementAndGet(); if (down) { throw new IllegalStateException("down"); } }
            @Override public byte[] getRaw(String cid) { return (corrupt ? "corrupt" : receipt().canonical()).getBytes(StandardCharsets.UTF_8); }
        };
    }
}
