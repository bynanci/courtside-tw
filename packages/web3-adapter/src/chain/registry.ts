export type RegistryRequest = {
  network: string
  contract: string
  method: string
  gasCeiling: bigint
  manifestDigest: string
  cidDigest: string
  snapshotId: string
  schemaVersion: string
  publishedAt: string
  idempotencyKey: string
}
export type RegistryPolicy = {
  network: string
  contract: string
  gasCeiling: bigint
  minimumConfirmations: number
}
export type RegistryResult = {
  status: "DISABLED" | "DENIED" | "PENDING" | "VERIFIED" | "FAILED" | "UNAVAILABLE"
  transactionId: string | null
  confirmations: bigint
  reason: string | null
}
export type ManagedSignerCommand = {
  network: string
  to: string
  method: "attest"
  data: string
  gasCeiling: string
  value: "0"
  idempotencyKey: string
}
export type ManagedSignerPort = {
  submit(command: ManagedSignerCommand): Promise<{ transactionId: string }>
}
export function createManagedSignerHttpPort(options: {
  endpoint: string
  allowLoopbackHttp?: boolean
  timeoutMs?: number
  writeEnabled?: () => boolean
  authenticationHeaders?: () => Readonly<Record<string, string>>
}): ManagedSignerPort {
  workerOnly()
  const endpoint = approvedEndpoint(options.endpoint, options.allowLoopbackHttp === true)
  const timeoutMs = boundedTimeout(options.timeoutMs)
  return {
    async submit(command) {
      workerOnly()
      if (options.writeEnabled?.() !== true) throw new RegistryFault("DENIED", "SIGNER_DISABLED")
      const headers = new Headers(options.authenticationHeaders?.())
      headers.set("content-type", "application/json")
      headers.set("accept", "application/json")
      headers.set("Idempotency-Key", command.idempotencyKey)
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(command),
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs)
      })
      if ([401, 403, 409].includes(response.status))
        throw new RegistryFault("DENIED", "SIGNER_DENIED")
      if (!response.ok) throw new Error("SIGNER_UNAVAILABLE")
      const body: unknown = await boundedJson(response)
      if (!record(body) || !transactionHash(body.transactionId))
        throw new Error("INVALID_SIGNER_RESPONSE")
      return { transactionId: body.transactionId }
    }
  }
}

/** Worker-only client. The signer broker must persist the complete command fingerprint per key. */
export function createRegistryAdapter(options: {
  rpcUrl: string
  policy: RegistryPolicy
  signer: ManagedSignerPort
  writeEnabled?: () => boolean
  allowLoopbackHttp?: boolean
  timeoutMs?: number
}) {
  workerOnly()
  const endpoint = approvedEndpoint(options.rpcUrl, options.allowLoopbackHttp === true)
  const policy = Object.freeze({
    ...options.policy,
    contract: options.policy.contract.toLowerCase()
  })
  if (
    !/^eip155:[1-9][0-9]{0,15}$/u.test(policy.network) ||
    BigInt(policy.network.slice(7)) > BigInt(Number.MAX_SAFE_INTEGER) ||
    !isAddress(policy.contract) ||
    typeof policy.gasCeiling !== "bigint" ||
    policy.gasCeiling <= 0n ||
    policy.gasCeiling >= 2n ** 64n ||
    !Number.isSafeInteger(policy.minimumConfirmations) ||
    policy.minimumConfirmations < 1 ||
    policy.minimumConfirmations > 10000
  )
    throw new Error("INVALID_REGISTRY_POLICY")
  const client = createPublicClient({
    cacheTime: 0,
    transport: http(endpoint, {
      timeout: boundedTimeout(options.timeoutMs),
      retryCount: 0,
      batch: false,
      maxResponseBodySize: 65536,
      fetchOptions: { redirect: "error", credentials: "omit", cache: "no-store" },
      methods: {
        include: [
          "eth_chainId",
          "eth_call",
          "eth_getTransactionReceipt",
          "eth_getTransactionByHash",
          "eth_blockNumber",
          "eth_getBlockByNumber"
        ]
      }
    })
  })
  const entries = new Map<
    string,
    { fingerprint: string; transactionId: Hex | null; inflight?: Promise<RegistryResult> }
  >()

  function commandFor(request: RegistryRequest): ManagedSignerCommand {
    if (
      request.network !== policy.network ||
      typeof request.contract !== "string" ||
      request.contract.toLowerCase() !== policy.contract ||
      request.method !== "attest" ||
      typeof request.gasCeiling !== "bigint" ||
      request.gasCeiling <= 0n ||
      request.gasCeiling > policy.gasCeiling ||
      typeof request.manifestDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(request.manifestDigest) ||
      request.cidDigest !== request.manifestDigest ||
      typeof request.snapshotId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(request.snapshotId) ||
      request.schemaVersion !== "1" ||
      typeof request.idempotencyKey !== "string" ||
      !/^[a-zA-Z0-9:._-]{1,200}$/u.test(request.idempotencyKey) ||
      typeof request.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(request.publishedAt) ||
      !Number.isFinite(Date.parse(request.publishedAt)) ||
      Date.parse(request.publishedAt) < 0 ||
      new Date(request.publishedAt).toISOString().slice(0, 19) !== request.publishedAt.slice(0, 19)
    ) {
      throw new RegistryFault("DENIED", "POLICY_MISMATCH")
    }
    const key = sha256(stringToHex(request.idempotencyKey))
    const data = encodeFunctionData({
      abi: publicationRegistryAbi,
      functionName: "attest",
      args: [
        key,
        `0x${request.manifestDigest.slice(7)}`,
        `0x${request.cidDigest.slice(7)}`,
        `0x${request.snapshotId.replaceAll("-", "")}`,
        1,
        BigInt(Math.floor(Date.parse(request.publishedAt) / 1000))
      ]
    })
    return Object.freeze({
      network: policy.network,
      to: policy.contract,
      method: "attest",
      data,
      gasCeiling: request.gasCeiling.toString(),
      value: "0",
      idempotencyKey: request.idempotencyKey
    })
  }

  async function verifyChain(): Promise<void> {
    const chain = await client.request({ method: "eth_chainId" })
    if (`eip155:${quantity(chain)}` !== policy.network)
      throw new RegistryFault("DENIED", "CHAIN_MISMATCH")
  }

  async function digestOf(request: RegistryRequest, block: "latest" | Hex): Promise<string> {
    const data = encodeFunctionData({
      abi: publicationRegistryAbi,
      functionName: "digestOf",
      args: [sha256(stringToHex(request.idempotencyKey))]
    })
    const digest = await client.request({
      method: "eth_call",
      params: [{ to: policy.contract as Hex, data }, block]
    })
    if (!transactionHash(digest)) throw new RegistryFault("FAILED", "INVALID_REGISTRY_DIGEST")
    return digest.toLowerCase()
  }

  async function confirm(input: RegistryRequest, transactionId: string): Promise<RegistryResult> {
    workerOnly()
    const request = Object.freeze({ ...input })
    try {
      const command = commandFor(request)
      if (!transactionHash(transactionId)) throw new RegistryFault("DENIED", "INVALID_TRANSACTION")
      await verifyChain()
      const receipt: unknown = await client.request({
        method: "eth_getTransactionReceipt",
        params: [transactionId]
      })
      if (receipt === null) return result("PENDING", transactionId)
      if (
        !record(receipt) ||
        !sameHex(receipt.transactionHash, transactionId) ||
        !sameHex(receipt.to, policy.contract) ||
        receipt.status !== "0x1" ||
        !transactionHash(receipt.blockHash) ||
        quantity(receipt.gasUsed) <= 0n ||
        quantity(receipt.gasUsed) > request.gasCeiling
      )
        throw new RegistryFault("FAILED", "RECEIPT_MISMATCH")
      const block = quantity(receipt.blockNumber)
      const blockTag: Hex = `0x${block.toString(16)}`
      const transaction: unknown = await client.request({
        method: "eth_getTransactionByHash",
        params: [transactionId]
      })
      if (
        !record(transaction) ||
        !sameHex(transaction.hash, transactionId) ||
        !sameHex(transaction.to, policy.contract) ||
        !sameHex(transaction.input, command.data) ||
        !sameHex(transaction.blockHash, receipt.blockHash) ||
        quantity(transaction.blockNumber) !== block ||
        quantity(transaction.value) !== 0n ||
        quantity(transaction.gas) > request.gasCeiling ||
        quantity(transaction.gas) < quantity(receipt.gasUsed) ||
        `eip155:${quantity(transaction.chainId)}` !== policy.network
      )
        throw new RegistryFault("FAILED", "TRANSACTION_MISMATCH")
      const latest = quantity(await client.request({ method: "eth_blockNumber" }))
      const canonical: unknown = await client.request({
        method: "eth_getBlockByNumber",
        params: [blockTag, false]
      })
      if (
        !record(canonical) ||
        !sameHex(canonical.hash, receipt.blockHash) ||
        quantity(canonical.number) !== block ||
        latest < block
      )
        throw new RegistryFault("FAILED", "NONCANONICAL_RECEIPT")
      if ((await digestOf(request, blockTag)) !== `0x${request.manifestDigest.slice(7)}`)
        throw new RegistryFault("FAILED", "REGISTRY_DIGEST_MISMATCH")
      const confirmations = latest - block + 1n
      return result(
        confirmations >= BigInt(policy.minimumConfirmations) ? "VERIFIED" : "PENDING",
        transactionId,
        confirmations
      )
    } catch (error) {
      return failure(error, transactionHash(transactionId) ? transactionId : null)
    }
  }

  return {
    /** Read-back remains available after disabling new writes, so an existing transaction can settle. */
    confirm,
    async attest(input: RegistryRequest): Promise<RegistryResult> {
      workerOnly()
      if (options.writeEnabled?.() !== true) return result("DISABLED")
      const request = Object.freeze({ ...input })
      let command: ManagedSignerCommand
      try {
        command = commandFor(request)
      } catch (error) {
        return failure(error, null)
      }
      const fingerprint = sha256(stringToHex(JSON.stringify(command)))
      let entry = entries.get(request.idempotencyKey)
      if (entry && entry.fingerprint !== fingerprint)
        return result("DENIED", null, 0n, "IDEMPOTENCY_CONFLICT")
      if (entry?.inflight) return entry.inflight
      if (!entry) {
        if (entries.size >= 1000) {
          const evictable = [...entries].find(([, candidate]) => !candidate.inflight)
          if (!evictable) return result("DENIED", null, 0n, "CAPACITY")
          entries.delete(evictable[0])
        }
        entry = { fingerprint, transactionId: null }
        entries.set(request.idempotencyKey, entry)
      }
      const current = entry
      current.inflight = (async () => {
        try {
          await verifyChain()
          const digest = await digestOf(request, "latest")
          if (
            digest !== `0x${"00".repeat(32)}` &&
            digest !== `0x${request.manifestDigest.slice(7)}`
          ) {
            throw new RegistryFault("DENIED", "IDEMPOTENCY_CONFLICT")
          }
          if (!current.transactionId) {
            if (options.writeEnabled?.() !== true) return result("DISABLED")
            const submission = await options.signer.submit(command)
            if (!transactionHash(submission.transactionId))
              throw new Error("INVALID_SIGNER_RESPONSE")
            current.transactionId = submission.transactionId
          }
          return await confirm(request, current.transactionId)
        } catch (error) {
          return failure(error, current.transactionId)
        } finally {
          delete current.inflight
        }
      })()
      return current.inflight
    }
  }
}

class RegistryFault extends Error {
  readonly status: "DENIED" | "FAILED"
  constructor(status: "DENIED" | "FAILED", reason: string) {
    super(reason)
    this.status = status
  }
}
function result(
  status: RegistryResult["status"],
  transactionId: string | null = null,
  confirmations = 0n,
  reason: string | null = null
): RegistryResult {
  return { status, transactionId, confirmations, reason }
}
function failure(error: unknown, transactionId: string | null): RegistryResult {
  return error instanceof RegistryFault
    ? result(error.status, transactionId, 0n, error.message)
    : result("UNAVAILABLE", transactionId, 0n, "PROVIDER_UNAVAILABLE")
}
function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/u.test(value))
    throw new RegistryFault("FAILED", "INVALID_RPC_QUANTITY")
  return BigInt(value)
}
function sameHex(value: unknown, expected: string): boolean {
  return typeof value === "string" && value.toLowerCase() === expected.toLowerCase()
}
function transactionHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/u.test(value)
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function workerOnly(): void {
  if (typeof window !== "undefined") throw new Error("WORKER_ONLY")
}
function approvedEndpoint(value: string, allowLoopbackHttp: boolean): string {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        allowLoopbackHttp &&
        url.protocol === "http:" &&
        ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
      ))
  )
    throw new Error("UNAPPROVED_ENDPOINT")
  return url.href
}
function boundedTimeout(value = 10000): number {
  if (!Number.isInteger(value) || value <= 0 || value > 30000) throw new Error("INVALID_TIMEOUT")
  return value
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("EMPTY_RESPONSE")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > 32768) {
        await reader.cancel()
        throw new Error("OVERSIZED_RESPONSE")
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  sha256,
  stringToHex,
  type Hex
} from "viem"
import { publicationRegistryAbi } from "./abi.ts"
