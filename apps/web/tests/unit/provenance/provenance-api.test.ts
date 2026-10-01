import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fetchProvenance } from "../../../app/features/provenance/provenance-api.ts"
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../../../contracts/fixtures/provenance/manifest-v1.json", import.meta.url),
    "utf8"
  )
)
function response(change: Record<string, unknown> = {}) {
  return {
    snapshotId: fixture.manifest.snapshotId,
    schemaVersion: 1,
    digest: fixture.digest,
    cid: null,
    status: "VERIFIED",
    manifest: fixture.manifest,
    ...change
  }
}

test("verify manifest locally rather than trusting a VERIFIED label", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json(response())
  try {
    assert.equal(
      (await fetchProvenance("https://api.example.invalid", "one")).locallyVerified,
      true
    )
  } finally {
    globalThis.fetch = original
  }
})

test("tampered digest fails closed and response does not include private or provider data", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json(response({ digest: "sha256:" + "f".repeat(64) }))
  try {
    await assert.rejects(
      () => fetchProvenance("https://api.example.invalid", "one"),
      /checksum mismatch/
    )
  } finally {
    globalThis.fetch = original
  }
})

test("withdrawn receipts never claim current local verification", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json(response({ status: "WITHDRAWN" }))
  try {
    const value = await fetchProvenance("https://api.example.invalid", "one")
    assert.equal(value.status, "WITHDRAWN")
    assert.equal(value.locallyVerified, false)
  } finally {
    globalThis.fetch = original
  }
})

test("provider errors stay inside optional provenance request", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response("unavailable", { status: 503 })
  try {
    await assert.rejects(() => fetchProvenance("https://api.example.invalid", "one"), /unavailable/)
  } finally {
    globalThis.fetch = original
  }
})

test("manifest verification binds the response snapshot identity", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () =>
    Response.json(response({ snapshotId: "0190f7b0-7c4b-7e3a-8f12-123456789aff" }))
  try {
    await assert.rejects(
      () => fetchProvenance("https://api.example.invalid", "one"),
      /checksum mismatch/
    )
  } finally {
    globalThis.fetch = original
  }
})
