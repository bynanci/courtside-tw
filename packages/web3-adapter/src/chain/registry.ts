export type RegistryRequest = {
  network: string; contract: string; method: string; gasCeiling: bigint;
  manifestDigest: string; cidDigest: string; snapshotId: string; schemaVersion: string;
  publishedAt: string; idempotencyKey: string
}
export type RegistryPolicy = { network: string; contract: string; gasCeiling: bigint; minimumConfirmations: number }
export type RegistryResult = { status: "DISABLED" | "DENIED" | "PENDING" | "VERIFIED" | "FAILED" | "UNAVAILABLE"; transactionId: string | null; confirmations: bigint; reason: string | null }
export type ManagedSignerCommand = { network: string; to: string; method: "attest"; data: string; gasCeiling: string; value: "0"; idempotencyKey: string }
export type ManagedSignerPort = { submit(command: ManagedSignerCommand): Promise<{ transactionId: string }> }
export function createManagedSignerHttpPort(_options: { endpoint: string; allowLoopbackHttp?: boolean; timeoutMs?: number }): ManagedSignerPort {
  return { async submit() { throw new Error("NOT_IMPLEMENTED") } }
}
export function createRegistryAdapter(_options: { rpcUrl: string; policy: RegistryPolicy; signer: ManagedSignerPort; writeEnabled?: () => boolean; allowLoopbackHttp?: boolean; timeoutMs?: number }) {
  return {
    async attest(_request: RegistryRequest): Promise<RegistryResult> { return { status: "DISABLED", transactionId: null, confirmations: 0n, reason: null } }
  }
}
