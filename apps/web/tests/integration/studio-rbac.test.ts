import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { canStudioAction } from "../../app/features/studio/studio-rbac.ts"
import {
  resolveRequiredStudioRole,
  resolveStudioRole
} from "../../app/features/studio/studio-contract.ts"
import { isSafeProxyPath } from "../../server/api/studio/[...path].ts"
import { canReviewAction } from "../../app/features/studio/review/review-contract.ts"

test("Studio authorization keeps editor and publisher actions isolated", () => {
  assert.equal(canStudioAction("EDITOR", "edit"), true)
  assert.equal(canStudioAction("EDITOR", "publish"), false)
  assert.equal(canStudioAction("PUBLISHER", "edit"), false)
  assert.equal(canStudioAction("PUBLISHER", "publish"), true)
  assert.equal(canStudioAction("PUBLISHER", "view-audit"), true)
})

test("review actions enforce publisher-only scope and readiness gates", () => {
  const future = "2026-08-10T02:00:00.000Z"
  const past = "2026-08-10T00:00:00.000Z"
  assert.equal(canReviewAction("EDITOR", "approve", "IN_REVIEW", true), false)
  assert.equal(canReviewAction("PUBLISHER", "approve", "IN_REVIEW", false), false)
  assert.equal(canReviewAction("PUBLISHER", "approve", "IN_REVIEW", true), true)
  assert.equal(canReviewAction("PUBLISHER", "schedule", "APPROVED", false), false)
  assert.equal(canReviewAction("PUBLISHER", "schedule", "APPROVED", true), true)
  assert.equal(
    canReviewAction("PUBLISHER", "publish", "SCHEDULED", true, future, Date.parse(past)),
    false
  )
  assert.equal(
    canReviewAction("PUBLISHER", "publish", "SCHEDULED", true, past, Date.parse(past)),
    true
  )
  assert.equal(canReviewAction("PUBLISHER", "withdraw", "PUBLISHED", false), true)
  assert.equal(canReviewAction("PUBLISHER", "archive", "WITHDRAWN", false), true)
})

test("review queue uses the centralized action matrix", async () => {
  const source = await readFile(
    new URL("../../app/features/studio/review/ReviewQueue.vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /canReviewAction/)
})

test("required route role cannot be selected by query string", () => {
  assert.equal(resolveRequiredStudioRole(["EDITOR", "PUBLISHER"], "EDITOR"), "EDITOR")
  assert.equal(resolveRequiredStudioRole(["PUBLISHER"], "EDITOR"), null)
  assert.equal(resolveStudioRole(["EDITOR"], "PUBLISHER", "EDITOR"), "EDITOR")
})

test("issue route binds its API access to the authenticated editor role", async () => {
  const source = await readFile(
    new URL("../../app/pages/studio/issues/[id].vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /readStudioSession/)
  assert.match(source, /resolveRequiredStudioRole\(session\.roles, "EDITOR"\)/)
})

test("Studio BFF exposes issue CRUD without widening the allowlist", () => {
  assert.equal(isSafeProxyPath("editor/issues"), true)
  assert.equal(isSafeProxyPath("editor/issues/../admin"), false)
  assert.equal(isSafeProxyPath("editor/issues/%2e%2e/admin"), false)
})
