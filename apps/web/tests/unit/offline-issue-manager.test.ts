import { deepEqual, equal, throws } from "node:assert/strict"
import { test } from "node:test"

import {
  getOfflineFallbackAssetPath,
  getOfflineIssueManifestPath,
  OfflineIssueError,
  sha256Hex
} from "../../app/features/offline/services/OfflineIssueManager.ts"

test("offline manager builds bounded public manifest and asset paths", () => {
  equal(
    getOfflineIssueManifestPath("issue-2026-01"),
    "/api/v1/public/offline/issues/issue-2026-01/manifest"
  )
  equal(
    getOfflineFallbackAssetPath("0190f7b0-7c4b-7e3a-8f12-123456789abd"),
    "/media/offline/0190f7b0-7c4b-7e3a-8f12-123456789abd"
  )
})

test("offline manager rejects traversal in fallback asset identifiers", () => {
  throws(
    () => getOfflineFallbackAssetPath("../private-asset"),
    (error: unknown) => error instanceof OfflineIssueError && error.code === "corrupt"
  )
})

test("offline manager computes SHA-256 checksums for downloaded bytes", async () => {
  const checksum = await sha256Hex(new TextEncoder().encode("hello").buffer)
  deepEqual(checksum, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
})
