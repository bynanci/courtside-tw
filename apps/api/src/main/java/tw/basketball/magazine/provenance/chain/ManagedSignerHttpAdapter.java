package tw.basketball.magazine.provenance.chain;

import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.provenance.manifest.ManifestCanonicalizer;
import tw.basketball.magazine.provenance.transport.WorkerHttpTransport;

/** Actual isolated signing-broker transport with independent EVM RPC read-back of transaction bytes. */
public final class ManagedSignerHttpAdapter implements ChainAttestationPort {
    private static final String ATTEST_SELECTOR = "0x85eecf4c";
    private final URI signerEndpoint;
    private final URI rpcEndpoint;
    private final WorkerHttpTransport http;
    private final ObjectMapper json;
    private final ManagedAttestationWorker.Policy policy;
    private final Map<String, String> signerAuthentication;
    public ManagedSignerHttpAdapter(URI signerEndpoint, URI rpcEndpoint, WorkerHttpTransport http,
            ObjectMapper json, ManagedAttestationWorker.Policy policy, Map<String, String> signerAuthentication) {
        this.signerEndpoint = Objects.requireNonNull(signerEndpoint);
        this.rpcEndpoint = Objects.requireNonNull(rpcEndpoint);
        this.http = Objects.requireNonNull(http);
        this.json = Objects.requireNonNull(json);
        this.policy = Objects.requireNonNull(policy);
        this.signerAuthentication = Map.copyOf(signerAuthentication);
    }
    @Override
    public Submission submit(Attestation request) {
        allowed(request);
        verifyChain();
        Map<String, Object> command = Map.of("network", request.network(), "to", request.contract(),
                "method", "attest", "data", calldata(request), "gasCeiling", Long.toString(request.gasCeiling()),
                "value", "0", "idempotencyKey", request.idempotencyKey());
        Map<String, String> headers = new java.util.HashMap<>(signerAuthentication);
        headers.put("Idempotency-Key", request.idempotencyKey());
        JsonNode response = json.readTree(http.request("POST", signerEndpoint, "application/json",
                json.writeValueAsBytes(command), headers));
        String transactionId = response.path("transactionId").asString("");
        if (!transactionId.matches("0x[0-9a-fA-F]{64}")) {
            throw new IllegalStateException("signer returned invalid transaction identity");
        }
        // The broker is required to persist idempotency keys. No private key or signature enters this service.
        return new Submission(transactionId, request.network(), request.contract(), 0);
    }
    @Override
    public Confirmation confirm(Attestation request, String transactionId) {
        allowed(request);
        if (!transactionId.matches("0x[0-9a-fA-F]{64}")) {
            throw new IllegalArgumentException("invalid transaction identity");
        }
        verifyChain();
        JsonNode receipt = rpc("eth_getTransactionReceipt", List.of(transactionId));
        if (receipt == null || receipt.isNull()) {
            return new Confirmation(true, 0, policy.network(), policy.contract(), request.manifestDigest(), request.snapshotId());
        }
        JsonNode transaction = rpc("eth_getTransactionByHash", List.of(transactionId));
        boolean valid = transaction != null && transaction.isObject()
                && transactionId.equalsIgnoreCase(transaction.path("hash").asString(""))
                && transactionId.equalsIgnoreCase(receipt.path("transactionHash").asString(""))
                && policy.contract().equalsIgnoreCase(receipt.path("to").asString(""))
                && policy.contract().equalsIgnoreCase(transaction.path("to").asString(""))
                && calldata(request).equalsIgnoreCase(transaction.path("input").asString(""))
                && quantity(transaction.path("value").asString("0x1")).signum() == 0
                && "0x1".equals(receipt.path("status").asString(""))
                && quantity(receipt.path("gasUsed").asString("")).compareTo(BigInteger.valueOf(request.gasCeiling())) <= 0
                && quantity(transaction.path("gas").asString("")).compareTo(BigInteger.valueOf(request.gasCeiling())) <= 0;
        if (!valid) {
            return new Confirmation(false, 0, policy.network(), policy.contract(), request.manifestDigest(), request.snapshotId());
        }
        BigInteger block = quantity(receipt.path("blockNumber").asString(""));
        BigInteger latest = quantity(rpc("eth_blockNumber", List.of()).asString(""));
        // Re-check the receipt block hash through the canonical block endpoint (reorgs cannot claim finality).
        JsonNode canonicalBlock = rpc("eth_getBlockByNumber", List.of("0x" + block.toString(16), false));
        String registryKey = HexFormat.of().formatHex(ManifestCanonicalizer.sha256(request.idempotencyKey().getBytes(StandardCharsets.UTF_8)));
        String registryDigest = rpc("eth_call", List.of(Map.of("to", policy.contract(), "data", "0x6901eb1e" + registryKey),
                "0x" + block.toString(16))).asString("");
        boolean canonical = ("0x" + request.manifestDigest().substring(7)).equalsIgnoreCase(registryDigest)
                && canonicalBlock != null && canonicalBlock.isObject()
                && canonicalBlock.path("hash").asString("").equalsIgnoreCase(receipt.path("blockHash").asString("invalid"));
        long confirmations = latest.compareTo(block) >= 0 ? latest.subtract(block).add(BigInteger.ONE).min(BigInteger.valueOf(Long.MAX_VALUE)).longValue() : 0;
        return new Confirmation(canonical, confirmations, policy.network(), policy.contract(), request.manifestDigest(), request.snapshotId());
    }
    private void allowed(Attestation request) {
        if (policy.gasCeiling() <= 0 || !policy.network().equals(request.network())
                || !policy.contract().equals(request.contract()) || !"attest".equals(request.method())
                || request.gasCeiling() <= 0 || request.gasCeiling() > policy.gasCeiling()
                || !request.manifestDigest().matches("sha256:[0-9a-f]{64}")
                || !request.cidDigest().equals(request.manifestDigest())
                || !request.snapshotId().matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                || !"1".equals(request.schemaVersion()) || !request.idempotencyKey().matches("[a-zA-Z0-9:._-]{1,200}")) {
            throw new IllegalArgumentException("signer policy denied request");
        }
        if (Instant.parse(request.publishedAt()).getEpochSecond() < 0) {
            throw new IllegalArgumentException("invalid publication timestamp");
        }
    }
    private void verifyChain() {
        String actual = "eip155:" + quantity(rpc("eth_chainId", List.of()).asString("")).toString();
        if (!policy.network().equals(actual)) {
            throw new IllegalStateException("RPC network does not match approval");
        }
    }
    private JsonNode rpc(String method, List<?> parameters) {
        JsonNode response = json.readTree(http.request("POST", rpcEndpoint, "application/json",
                json.writeValueAsBytes(Map.of("jsonrpc", "2.0", "id", 1, "method", method, "params", parameters)), Map.of()));
        if (!response.path("jsonrpc").asString("").equals("2.0") || response.path("id").asInt() != 1
                || response.has("error") || !response.has("result")) {
            throw new IllegalStateException("invalid RPC response");
        }
        return response.get("result");
    }
    public static String calldata(Attestation request) {
        String key = HexFormat.of().formatHex(ManifestCanonicalizer.sha256(request.idempotencyKey().getBytes(StandardCharsets.UTF_8)));
        String snapshot = request.snapshotId().replace("-", "") + "0".repeat(32);
        return ATTEST_SELECTOR + key + request.manifestDigest().substring(7) + request.cidDigest().substring(7)
                + snapshot + word(BigInteger.ONE) + word(BigInteger.valueOf(Instant.parse(request.publishedAt()).getEpochSecond()));
    }
    private static String word(BigInteger value) {
        String hex = value.toString(16);
        if (value.signum() < 0 || hex.length() > 64) {
            throw new IllegalArgumentException("invalid registry uint");
        }
        return "0".repeat(64 - hex.length()) + hex;
    }
    private static BigInteger quantity(String value) {
        if (!value.matches("0x(0|[1-9a-fA-F][0-9a-fA-F]{0,63})")) {
            throw new IllegalStateException("invalid RPC quantity");
        }
        return new BigInteger(value.substring(2), 16);
    }
}
