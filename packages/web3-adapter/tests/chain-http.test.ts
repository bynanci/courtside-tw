import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import test, { type TestContext } from "node:test"
import { decodeFunctionData } from "viem"
import { createManagedSignerHttpPort, createRegistryAdapter, publicationRegistryAbi, type RegistryRequest } from "../src/chain/index.ts"

const CONTRACT = "0x0000000000000000000000000000000000000001"
const TRANSACTION = `0x${"12".repeat(32)}`
const BLOCK = `0x${"34".repeat(32)}`
const DIGEST = `sha256:${"ab".repeat(32)}`
const request: RegistryRequest = { network: "eip155:1", contract: CONTRACT, method: "attest", gasCeiling: 100000n, manifestDigest: DIGEST, cidDigest: DIGEST, snapshotId: "0190f7b0-7c4b-7e3a-8f12-123456789abc", schemaVersion: "1", publishedAt: "2026-09-12T00:00:00Z", idempotencyKey: "snapshot:0190f7b0-7c4b-7e3a-8f12-123456789abc:v1" }

async function fixture(t: TestContext) {
  const calls: string[] = []
  const submissions: Array<Record<string, unknown>> = []
  const brokerKeys: Array<string | undefined> = []
  const durable = new Map<string, string>()
  let actualTransactions = 0
  const state = {
    chain: "0x1", pending: false, status: "0x1", latest: "0xc", canonical: BLOCK,
    failRpc: false, failBroker: false, preflightDigest: `0x${"00".repeat(32)}`, confirmedDigest: `0x${"ab".repeat(32)}`,
    transactionOverrides: {} as Record<string, unknown>, receiptOverrides: {} as Record<string, unknown>
  }
  const server = createServer(async (incoming, outgoing) => {
    let body = ""
    for await (const chunk of incoming) body += String(chunk)
    const input = JSON.parse(body) as Record<string, unknown>
    outgoing.setHeader("content-type", "application/json")
    if (incoming.url === "/signer") {
      calls.push("broker.submit")
      if (state.failBroker) { outgoing.writeHead(503); outgoing.end("{}"); return }
      const key = String(input.idempotencyKey)
      const fingerprint = JSON.stringify(input)
      if (durable.has(key) && durable.get(key) !== fingerprint) { outgoing.writeHead(409); outgoing.end("{}"); return }
      if (!durable.has(key)) { durable.set(key, fingerprint); actualTransactions += 1 }
      brokerKeys.push(incoming.headers["idempotency-key"] as string | undefined)
      submissions.push(input)
      outgoing.end(JSON.stringify({ transactionId: TRANSACTION }))
      return
    }
    const method = String(input.method)
    calls.push(method)
    if (state.failRpc) { outgoing.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, error: { code: -32000, message: "provider unavailable" } })); return }
    const params = input.params as unknown[]
    let result: unknown
    switch (method) {
      case "eth_chainId": result = state.chain; break
      case "eth_call": result = params[1] === "latest" ? state.preflightDigest : state.confirmedDigest; break
      case "eth_getTransactionReceipt": result = state.pending ? null : { transactionHash: TRANSACTION, blockHash: BLOCK, blockNumber: "0xa", to: CONTRACT, status: state.status, gasUsed: "0x10000", ...state.receiptOverrides }; break
      case "eth_getTransactionByHash": result = { hash: TRANSACTION, to: CONTRACT, input: submissions.at(-1)?.data, value: "0x0", gas: "0x186a0", chainId: "0x1", blockHash: BLOCK, blockNumber: "0xa", ...state.transactionOverrides }; break
      case "eth_blockNumber": result = state.latest; break
      case "eth_getBlockByNumber": result = { number: "0xa", hash: state.canonical }; break
      default: outgoing.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, error: { code: -32601, message: "method not allowed" } })); return
    }
    outgoing.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve()) }))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("HTTP fixture failed")
  const origin = `http://127.0.0.1:${address.port}`
  const options = {
    rpcUrl: `${origin}/rpc`, policy: { network: "eip155:1", contract: CONTRACT, gasCeiling: 120000n, minimumConfirmations: 3 },
    signer: createManagedSignerHttpPort({ endpoint: `${origin}/signer`, allowLoopbackHttp: true }),
    allowLoopbackHttp: true, writeEnabled: () => true
  }
  return { state, calls, submissions, brokerKeys, options, origin, get actualTransactions() { return actualTransactions } }
}

test("disabled by default: configured clients perform no RPC or signer HTTP writes", async (t) => {
  const f = await fixture(t)
  const { writeEnabled: _enabled, ...disabled } = f.options
  assert.equal((await createRegistryAdapter(disabled).attest(request)).status, "DISABLED")
  assert.deepEqual(f.calls, [])
})

test("viem sends exact ABI bytes to the managed broker and verifies canonical digest with three confirmations", async (t) => {
  const f = await fixture(t)
  const result = await createRegistryAdapter(f.options).attest(request)
  assert.deepEqual(result, { status: "VERIFIED", transactionId: TRANSACTION, confirmations: 3n, reason: null })
  const command = f.submissions[0]!
  assert.equal(command.to, CONTRACT)
  assert.equal(command.value, "0")
  assert.equal(command.gasCeiling, "100000")
  assert.equal(command.method, "attest")
  assert.deepEqual(f.brokerKeys, [request.idempotencyKey])
  const decoded = decodeFunctionData({ abi: publicationRegistryAbi, data: command.data as `0x${string}` })
  assert.equal(decoded.functionName, "attest")
  assert.deepEqual(decoded.args, [
    `0x${createHash("sha256").update(request.idempotencyKey).digest("hex")}`,
    `0x${"ab".repeat(32)}`, `0x${"ab".repeat(32)}`, "0x0190f7b07c4b7e3a8f12123456789abc", 1,
    BigInt(Date.parse(request.publishedAt) / 1000)
  ])
  assert.equal(String(command.data).slice(0, 10), "0x85eecf4c")
  assert.equal(f.calls.includes("eth_sendTransaction") || f.calls.includes("eth_sendRawTransaction"), false)
})

for (const [field, value] of [["network", "eip155:2"], ["contract", "0x0000000000000000000000000000000000000002"], ["method", "transfer"], ["gasCeiling", 120001n], ["manifestDigest", "invalid"], ["cidDigest", `sha256:${"cd".repeat(32)}`], ["idempotencyKey", "unsafe\nkey"]] as const) {
  test(`policy denies unapproved ${field} before any HTTP interaction`, async (t) => {
    const f = await fixture(t)
    const result = await createRegistryAdapter(f.options).attest({ ...request, [field]: value })
    assert.equal(result.status, "DENIED")
    assert.deepEqual(f.calls, [])
  })
}

test("RPC chain mismatch stops before contacting managed signer", async (t) => {
  const f = await fixture(t)
  f.state.chain = "0x2"
  const result = await createRegistryAdapter(f.options).attest(request)
  assert.equal(result.status, "DENIED")
  assert.deepEqual(f.calls, ["eth_chainId"])
})

test("pending receipt and insufficient depth remain PENDING", async (t) => {
  const f = await fixture(t)
  const adapter = createRegistryAdapter(f.options)
  f.state.pending = true
  assert.equal((await adapter.attest(request)).status, "PENDING")
  f.state.pending = false
  f.state.latest = "0xa"
  const result = await adapter.attest(request)
  assert.equal(result.status, "PENDING")
  assert.equal(result.confirmations, 1n)
})

for (const scenario of ["reverted", "wrong-calldata", "wrong-contract", "value", "gas", "gas-used", "reorg", "digest"]) {
  test(`${scenario} read-back can never report VERIFIED`, async (t) => {
    const f = await fixture(t)
    if (scenario === "reverted") f.state.status = "0x0"
    if (scenario === "wrong-calldata") f.state.transactionOverrides.input = "0x00"
    if (scenario === "wrong-contract") f.state.transactionOverrides.to = "0x0000000000000000000000000000000000000002"
    if (scenario === "value") f.state.transactionOverrides.value = "0x1"
    if (scenario === "gas") f.state.transactionOverrides.gas = "0xfffff"
    if (scenario === "gas-used") f.state.receiptOverrides.gasUsed = "0xfffff"
    if (scenario === "reorg") f.state.canonical = `0x${"45".repeat(32)}`
    if (scenario === "digest") f.state.confirmedDigest = `0x${"cd".repeat(32)}`
    assert.equal((await createRegistryAdapter(f.options).attest(request)).status, "FAILED")
  })
}

test("conflicting on-chain idempotency digest never reaches signer", async (t) => {
  const f = await fixture(t)
  f.state.preflightDigest = `0x${"cd".repeat(32)}`
  assert.equal((await createRegistryAdapter(f.options).attest(request)).status, "DENIED")
  assert.equal(f.calls.includes("broker.submit"), false)
})

test("same request retries coalesce and changed calldata cannot reuse the local or durable broker key", async (t) => {
  const f = await fixture(t)
  const adapter = createRegistryAdapter(f.options)
  const results = await Promise.all(Array.from({ length: 8 }, () => adapter.attest(request)))
  assert.equal(results.every((result) => result.status === "VERIFIED"), true)
  assert.equal(f.actualTransactions, 1)
  assert.equal(f.submissions.length, 1)
  assert.equal((await adapter.attest({ ...request, publishedAt: "2026-09-13T00:00:00Z" })).status, "DENIED")
  assert.equal((await createRegistryAdapter(f.options).attest(request)).status, "VERIFIED")
  assert.equal(f.actualTransactions, 1)
})

test("RPC and signer outages return UNAVAILABLE without unbounded retries", async (t) => {
  const f = await fixture(t)
  f.state.failRpc = true
  assert.equal((await createRegistryAdapter(f.options).attest(request)).status, "UNAVAILABLE")
  assert.equal(f.calls.length, 1)
  f.state.failRpc = false
  f.state.failBroker = true
  assert.equal((await createRegistryAdapter(f.options).attest(request)).status, "UNAVAILABLE")
  assert.equal(f.calls.filter((method) => method === "broker.submit").length, 1)
})

test("production transport rejects insecure endpoints and embedded credentials", () => {
  assert.throws(() => createManagedSignerHttpPort({ endpoint: "http://signer.example.test" }), /ENDPOINT/u)
  assert.throws(() => createManagedSignerHttpPort({ endpoint: "https://user:secret@signer.example.test" }), /ENDPOINT/u)
})
