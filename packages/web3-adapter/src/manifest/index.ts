/** RFC 8785 profile: schema v1 uses strings for every precision-sensitive value. */
export interface PublicationManifest {
  schemaVersion: "1"
  snapshotId: string
  publicationId: string
  revision: string
  publishedAt: string
  checksum: string
  rightsScope: "DIGEST_ONLY" | "PERMANENT_PUBLIC"
  assets: Array<{ assetId: string; digest: string }>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const digest = /^sha256:[0-9a-f]{64}$/
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== keys.sort().join()
  )
    throw new Error("Invalid manifest fields")
  return value as Record<string, unknown>
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("Invalid manifest value")
  return value
}
export function validateManifest(input: unknown): PublicationManifest {
  const value = object(input, [
    "schemaVersion",
    "snapshotId",
    "publicationId",
    "revision",
    "publishedAt",
    "checksum",
    "rightsScope",
    "assets"
  ])
  if (
    value.schemaVersion !== "1" ||
    !["DIGEST_ONLY", "PERMANENT_PUBLIC"].includes(String(value.rightsScope))
  )
    throw new Error("Unsupported manifest profile")
  text(value.snapshotId, uuid)
  text(value.publicationId, uuid)
  text(value.revision, /^[1-9][0-9]{0,18}$/)
  text(value.checksum, digest)
  const timestamp = text(value.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/)
  if (
    !Number.isFinite(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString().slice(0, 19) !== timestamp.slice(0, 19)
  )
    throw new Error("Invalid manifest timestamp")
  if (!Array.isArray(value.assets) || value.assets.length > 500)
    throw new Error("Invalid manifest assets")
  const ids = new Set<string>()
  for (const asset of value.assets) {
    const item = object(asset, ["assetId", "digest"])
    const id = text(item.assetId, uuid)
    text(item.digest, digest)
    if (ids.has(id)) throw new Error("Duplicate manifest asset")
    ids.add(id)
  }
  return value as unknown as PublicationManifest
}
function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  const data = value as Record<string, unknown>
  return (
    "{" +
    Object.keys(data)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonical(data[key]))
      .join(",") +
    "}"
  )
}
export function canonicalizeManifest(input: unknown): string {
  return canonical(validateManifest(input))
}
function rawCid(hash: Uint8Array): string {
  const bytes = new Uint8Array([1, 0x55, 0x12, 0x20, ...hash])
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567"
  let result = "b",
    buffer = 0,
    bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += alphabet[(buffer >>> bits) & 31]
    }
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31]
  return result
}
export async function manifestReceipt(
  input: unknown
): Promise<{ canonical: string; digest: string; cid: string }> {
  const canonical = canonicalizeManifest(input)
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
  )
  return {
    canonical,
    digest: "sha256:" + [...hash].map((value) => value.toString(16).padStart(2, "0")).join(""),
    cid: rawCid(hash)
  }
}
