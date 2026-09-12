package tw.basketball.magazine.provenance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.provenance.chain.ChainAttestationPort;
import tw.basketball.magazine.provenance.chain.ManagedAttestationWorker;
import tw.basketball.magazine.provenance.chain.ManagedSignerHttpAdapter;
import tw.basketball.magazine.provenance.ipfs.KuboHttpMirrorAdapter;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;
import tw.basketball.magazine.provenance.transport.WorkerHttpTransport;

final class ProvenanceHttpTransportIT {
    private static final ObjectMapper JSON = new ObjectMapper();
    @Test
    void kuboRawMultipartAndGatewayRoundTripUseActualHttpWithoutSharingCredentials() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> multipart = new AtomicReference<>();
        AtomicReference<String> gatewayAuth = new AtomicReference<>();
        byte[] bytes = "canonical bytes".getBytes(StandardCharsets.UTF_8);
        String cid = ManifestCanonicalizer.rawCid(ManifestCanonicalizer.sha256(bytes));
        server.createContext("/api/v0/block/put", exchange -> {
            assertEquals("cid-codec=raw&mhtype=sha2-256&mhlen=32&pin=true", exchange.getRequestURI().getQuery());
            assertEquals("Bearer test-only", exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("snapshot:v1", exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            multipart.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = JSON.writeValueAsBytes(Map.of("Key", cid, "Size", bytes.length));
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        server.createContext("/ipfs/", exchange -> {
            gatewayAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            URI base = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/");
            KuboHttpMirrorAdapter adapter = new KuboHttpMirrorAdapter(base.resolve("api/v0/"), base,
                    new WorkerHttpTransport(Set.of("127.0.0.1"), true), Map.of("Authorization", "Bearer test-only"));
            adapter.putRaw(cid, bytes, "snapshot:v1");
            assertEquals("canonical bytes", new String(adapter.getRaw(cid), StandardCharsets.UTF_8));
            assertTrue(multipart.get().contains("canonical bytes"));
            assertEquals(null, gatewayAuth.get());
            assertThrows(IllegalArgumentException.class, () -> adapter.putRaw(cid, new byte[0], "snapshot:v1"));
        } finally { server.stop(0); }
    }
    @Test
    void managedSignerVerifiesRpcChainReceiptCalldataAndCanonicalBlockAndRejectsWrongChainBeforeSigning() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger signatures = new AtomicInteger();
        AtomicReference<String> chainId = new AtomicReference<>("0xaa36a7");
        AtomicReference<String> input = new AtomicReference<>();
        String transaction = "0x" + "c".repeat(64);
        String blockHash = "0x" + "d".repeat(64);
        String contract = "0x" + "a".repeat(40);
        server.createContext("/signer", exchange -> {
            signatures.incrementAndGet();
            var command = JSON.readTree(exchange.getRequestBody().readAllBytes());
            input.set(command.path("data").asString());
            assertEquals("provenance:fixture:v1", exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            byte[] response = JSON.writeValueAsBytes(Map.of("transactionId", transaction));
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        server.createContext("/rpc", exchange -> {
            var request = JSON.readTree(exchange.getRequestBody().readAllBytes());
            Object result = switch (request.path("method").asString()) {
                case "eth_chainId" -> chainId.get();
                case "eth_getTransactionReceipt" -> Map.of("transactionHash", transaction, "to", contract, "gasUsed", "0x5208", "status", "0x1", "blockNumber", "0xa", "blockHash", blockHash);
                case "eth_getTransactionByHash" -> Map.of("hash", transaction, "to", contract, "input", input.get(), "value", "0x0", "gas", "0x186a0");
                case "eth_blockNumber" -> "0xb";
                case "eth_call" -> "0x" + "a".repeat(64);
                case "eth_getBlockByNumber" -> Map.of("hash", blockHash);
                default -> throw new IllegalArgumentException("unexpected RPC method");
            };
            byte[] response = JSON.writeValueAsBytes(Map.of("jsonrpc", "2.0", "id", 1, "result", result));
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        server.start();
        try {
            URI base = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            var policy = new ManagedAttestationWorker.Policy("eip155:11155111", contract, 100_000, 2);
            var adapter = new ManagedSignerHttpAdapter(base.resolve("/signer"), base.resolve("/rpc"),
                    new WorkerHttpTransport(Set.of("127.0.0.1"), true), JSON, policy, Map.of());
            var request = new ChainAttestationPort.Attestation("provenance:fixture:v1", policy.network(), contract,
                    "attest", 100_000, "0190f7b0-7c4b-7e3a-8f12-123456789abc", "sha256:" + "a".repeat(64),
                    "sha256:" + "a".repeat(64), "1", "2026-09-12T00:00:00Z");
            assertEquals("VERIFIED", new ManagedAttestationWorker(policy, adapter, () -> true).attest(request).status());
            assertEquals(1, signatures.get());
            input.set("0xdeadbeef");
            assertEquals(false, adapter.confirm(request, transaction).successful());
            chainId.set("0x1");
            assertThrows(IllegalStateException.class, () -> adapter.submit(request));
            assertEquals(1, signatures.get());
        } finally { server.stop(0); }
    }
}
