import { manifestReceipt } from "@courtside/web3-adapter/manifest"

export interface ProvenanceView {
  status: "PENDING" | "VERIFIED" | "FAILED" | "SUPERSEDED" | "WITHDRAWN"
  snapshotId: string
  digest: string
  cid: string | null
  verifiedAt: string | null
  locallyVerified: boolean
}
export async function fetchProvenance(
  apiBase: string,
  slug: string,
  signal?: AbortSignal
): Promise<ProvenanceView> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 128)
    throw new Error("Invalid issue slug")
  const response = await fetch(
    apiBase.replace(/\/$/, "") + "/api/v1/public/issues/" + slug + "/provenance",
    {
      credentials: "omit",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" }
    }
  )
  if (!response.ok) throw new Error("Provenance unavailable")
  const value: unknown = await response.json()
  if (!value || typeof value !== "object") throw new Error("Invalid provenance response")
  const data = value as Record<string, unknown>
  if (
    !["PENDING", "VERIFIED", "FAILED", "SUPERSEDED", "WITHDRAWN"].includes(String(data.status)) ||
    typeof data.digest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(data.digest) ||
    data.schemaVersion !== 1 ||
    typeof data.snapshotId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.snapshotId)
  )
    throw new Error("Invalid provenance response")
  let locallyVerified = false
  if (data.status === "VERIFIED" && data.manifest) {
    const receipt = await manifestReceipt(data.manifest)
    const manifestSnapshot = (data.manifest as Record<string, unknown>).snapshotId
    locallyVerified =
      manifestSnapshot === data.snapshotId &&
      receipt.digest === data.digest &&
      (data.cid == null || data.cid === receipt.cid)
    if (!locallyVerified) throw new Error("Manifest checksum mismatch")
  }
  return {
    status: data.status as ProvenanceView["status"],
    snapshotId: data.snapshotId,
    digest: data.digest,
    cid: typeof data.cid === "string" && /^b[a-z2-7]{58}$/.test(data.cid) ? data.cid : null,
    verifiedAt:
      typeof data.verifiedAt === "string" && Number.isFinite(Date.parse(data.verifiedAt))
        ? data.verifiedAt
        : null,
    locallyVerified
  }
}
