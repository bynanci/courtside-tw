import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { canonicalizeManifest, manifestReceipt } from "../src/manifest/index.ts"

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../contracts/fixtures/provenance/manifest-v1.json", import.meta.url),
    "utf8"
  )
)

test("canonical UTF-8, SHA-256 and raw CID match the language-independent fixture", async () => {
  assert.equal(canonicalizeManifest(fixture.manifest), fixture.canonical)
  assert.deepEqual(await manifestReceipt(fixture.manifest), {
    canonical: fixture.canonical,
    digest: fixture.digest,
    cid: fixture.cid
  })
})

test("property insertion order does not alter canonical bytes", () => {
  assert.equal(
    canonicalizeManifest(Object.fromEntries(Object.entries(fixture.manifest).reverse())),
    fixture.canonical
  )
})

for (const key of ["email", "draft", "privateStorageKey", "readingHistory", "content"]) {
  test(`reject unknown public manifest field ${key}`, () => {
    assert.throws(() => canonicalizeManifest({ ...fixture.manifest, [key]: "private" }))
  })
}

test("reject non I-JSON, precision-sensitive numbers, invalid digest and duplicate assets", () => {
  for (const change of [
    { revision: 9007199254740992 },
    { snapshotId: "\ud800" },
    { checksum: "sha256:invalid" },
    { assets: [fixture.manifest.assets[0], fixture.manifest.assets[0]] }
  ]) {
    assert.throws(() => canonicalizeManifest({ ...fixture.manifest, ...change }))
  }
})

test("permanent dissemination rights cannot be inferred from ordinary web rights", () => {
  assert.throws(() => canonicalizeManifest({ ...fixture.manifest, rightsScope: "PUBLIC_WEB" }))
})

test("timestamps reject leap second, end-of-day normalization and nonexistent calendar dates", () => {
  for (const publishedAt of [
    "2016-12-31T23:59:60Z",
    "2026-09-12T24:00:00Z",
    "2026-02-30T00:00:00Z"
  ])
    assert.throws(() => canonicalizeManifest({ ...fixture.manifest, publishedAt }))
})
