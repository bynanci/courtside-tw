/** Minimal allowlisted registry ABI. No account, RPC URL or signer is exported. */
export const publicationRegistryAbi = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "idempotencyKey", type: "bytes32" },
      { name: "manifestDigest", type: "bytes32" },
      { name: "cidDigest", type: "bytes32" },
      { name: "snapshotId", type: "bytes16" },
      { name: "schemaVersion", type: "uint32" },
      { name: "publishedAt", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "digestOf",
    stateMutability: "view",
    inputs: [{ name: "idempotencyKey", type: "bytes32" }],
    outputs: [{ name: "digest", type: "bytes32" }]
  }
] as const

export * from "./registry.ts"
