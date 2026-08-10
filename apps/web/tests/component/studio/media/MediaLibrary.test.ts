import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  canSubmitMedia,
  validateMediaMetadata
} from "../../../../app/features/studio/media/upload-contract.ts"
import {
  buildMediaMetadataUpdate,
  canPersistMediaMetadata,
  canStartMediaUpload
} from "../../../../app/features/studio/media/media-library-contract.ts"

const validMetadata = {
  altText: "夜間球場全景",
  rightsOwner: "Courtside TW",
  licenseName: "Editorial license",
  allowedChannels: ["PUBLIC_WEB"],
  territories: ["GLOBAL"],
  validFrom: "2026-08-10T00:00:00.000Z",
  validUntil: "2027-08-10T00:00:00.000Z",
  credit: "Courtside TW",
  withdrawalTerms: "Contact the rights desk.",
  rightsStatus: "VALID" as const
}

test("MediaLibrary blocks submit while processing or metadata is invalid", () => {
  assert.equal(canSubmitMedia("PROCESSING", validMetadata, []), false)
  assert.equal(canSubmitMedia("READY", validMetadata, []), true)
  assert.equal(
    canSubmitMedia(
      "READY",
      { ...validMetadata, altText: "" },
      validateMediaMetadata({ ...validMetadata, altText: "" })
    ),
    false
  )
})

test("MediaLibrary requires rights metadata before it can submit", () => {
  const errors = validateMediaMetadata({ ...validMetadata, rightsOwner: "" })
  assert.ok(errors.length > 0)
  assert.equal(canSubmitMedia("READY", { ...validMetadata, rightsOwner: "" }, errors), false)
})

test("MediaLibrary keeps upload and metadata API boundaries role- and state-gated", () => {
  assert.equal(canStartMediaUpload("PUBLISHER", true, false, "PENDING", []), false)
  assert.equal(canStartMediaUpload("EDITOR", true, false, "PROCESSING", []), false)
  assert.equal(canStartMediaUpload("EDITOR", true, false, "PENDING", []), true)
  assert.equal(canPersistMediaMetadata("PUBLISHER", "asset-1", 1, false, false, []), false)
  assert.equal(canPersistMediaMetadata("EDITOR", "asset-1", 1, false, false, []), true)
  assert.equal(canPersistMediaMetadata("EDITOR", "asset-1", 1, false, false, ["invalid"]), false)
})

test("MediaLibrary persists trimmed alt, credit, rights and optimistic version", () => {
  const update = buildMediaMetadataUpdate(
    {
      ...validMetadata,
      altText: "  夜間球場全景  ",
      rightsOwner: "  Courtside TW  ",
      licenseName: "  Editorial license  ",
      territories: ["GLOBAL", " TW "],
      credit: "  Courtside TW  ",
      withdrawalTerms: "  Contact the rights desk.  "
    },
    7
  )
  assert.deepEqual(update, {
    altText: "夜間球場全景",
    rights: {
      version: 7,
      rightsOwner: "Courtside TW",
      licenseName: "Editorial license",
      allowedChannels: ["PUBLIC_WEB"],
      territories: ["GLOBAL", "TW"],
      validFrom: validMetadata.validFrom,
      validUntil: validMetadata.validUntil,
      credit: "Courtside TW",
      withdrawalTerms: "Contact the rights desk.",
      status: "VALID"
    }
  })
})

test("MediaLibrary component wires the tested contracts to the server API", async () => {
  const source = await readFile(
    new URL("../../../../app/features/studio/media/MediaLibrary.vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /canStartMediaUpload/)
  assert.match(source, /canPersistMediaMetadata/)
  assert.match(source, /buildMediaMetadataUpdate/)
  assert.match(source, /updateMediaMetadata/)
})
