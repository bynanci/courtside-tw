import { equal, match } from "node:assert/strict"
import { test } from "node:test"

import {
  formatOfflineExpiry,
  formatStorageBytes
} from "../../app/features/offline/services/offline-ui-contract.ts"

test("offline storage labels use bounded readable binary units", () => {
  equal(formatStorageBytes(Number.NaN), "0 B")
  equal(formatStorageBytes(-1), "0 B")
  equal(formatStorageBytes(512), "512 B")
  equal(formatStorageBytes(2 * 1024 * 1024), "2 MB")
  equal(formatStorageBytes(2.25 * 1024 * 1024), "2.3 MB")
  equal(formatStorageBytes(3 * 1024 * 1024 * 1024), "3 GB")
})

test("offline expiry labels fail closed for malformed local state", () => {
  equal(formatOfflineExpiry("not-an-instant"), "期限未知")
  match(formatOfflineExpiry("2026-09-01T00:00:00Z"), /2026.*9.*1/)
})
