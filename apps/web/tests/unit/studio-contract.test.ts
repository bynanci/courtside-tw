import assert from "node:assert/strict"
import test from "node:test"

import { canStudioAction } from "../../app/features/studio/studio-rbac.ts"
import {
  canSubmitMedia,
  MAX_UPLOAD_BYTES,
  validateMediaMetadata,
  validateMediaUpload
} from "../../app/features/studio/media/upload-contract.ts"
import {
  parseStudioRole,
  resolveRequiredStudioRole,
  resolveStudioRole
} from "../../app/features/studio/studio-contract.ts"
import { isSafeProxyPath } from "../../server/api/studio/[...path].ts"

test("Studio role policy keeps editor and publisher actions separate", () => {
  assert.equal(canStudioAction("EDITOR", "edit"), true)
  assert.equal(canStudioAction("EDITOR", "publish"), false)
  assert.equal(canStudioAction("PUBLISHER", "edit"), false)
  assert.equal(canStudioAction("PUBLISHER", "withdraw"), true)
  assert.equal(parseStudioRole("unexpected"), "EDITOR")
})

test("OIDC roles are authoritative and URL role cannot elevate a session", () => {
  assert.equal(resolveStudioRole(["EDITOR"], "PUBLISHER", "EDITOR"), "EDITOR")
  assert.equal(resolveStudioRole(["PUBLISHER"], "EDITOR", "PUBLISHER"), "PUBLISHER")
  assert.equal(resolveStudioRole(["READER"], "PUBLISHER", "PUBLISHER"), null)
  assert.equal(resolveStudioRole(["EDITOR", "PUBLISHER"], "PUBLISHER", "EDITOR"), "PUBLISHER")
})

test("Studio routes bind to the API role they expose", () => {
  assert.equal(resolveRequiredStudioRole(["EDITOR", "PUBLISHER"], "EDITOR"), "EDITOR")
  assert.equal(resolveRequiredStudioRole(["EDITOR", "PUBLISHER"], "PUBLISHER"), "PUBLISHER")
  assert.equal(resolveRequiredStudioRole(["PUBLISHER"], "EDITOR"), null)
  assert.equal(resolveRequiredStudioRole(["EDITOR"], "PUBLISHER"), null)
})

test("Studio BFF rejects URL normalization and encoded traversal", () => {
  assert.equal(isSafeProxyPath("publisher/articles/123"), true)
  assert.equal(isSafeProxyPath("publisher/articles:publish"), true)
  for (const path of [
    "publisher/articles/../admin",
    "publisher/articles/%2e%2e/admin",
    "publisher\\articles\\..\\admin",
    "publisher/articles/\u0000admin"
  ]) {
    assert.equal(isSafeProxyPath(path), false)
  }
})

test("media form rejects paths, non-image MIME and oversized originals", () => {
  const errors = validateMediaUpload({
    filename: "../secret.svg",
    contentType: "image/svg+xml",
    sizeBytes: MAX_UPLOAD_BYTES + 1,
    checksumSha256: "not-a-checksum",
    altText: "",
    credit: "",
    rightsStatus: "UNKNOWN"
  })
  assert.equal(errors.length, 4)
})

test("media is not publishable until processing and rights metadata are complete", () => {
  const input = {
    altText: "夜間球場全景",
    credit: "Courtside TW",
    rightsStatus: "VALID" as const
  }
  assert.equal(canSubmitMedia("PROCESSING", input, []), false)
  assert.equal(canSubmitMedia("READY", input, []), true)
  assert.equal(canSubmitMedia("READY", { ...input, rightsStatus: "EXPIRED" }, []), false)
})

test("media metadata requires persisted rights evidence before save", () => {
  const valid = {
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
  assert.deepEqual(validateMediaMetadata(valid), [])
  assert.ok(validateMediaMetadata({ ...valid, credit: "" }).includes("需要 credit。"))
})
