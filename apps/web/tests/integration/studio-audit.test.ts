import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  parseAuditTarget,
  type StudioAuditTarget
} from "../../app/features/studio/audit/audit-contract.ts"

const issueId = "0190f7b0-7c4b-7e3a-8f12-123456789abc"

test("audit target accepts only a supported target type and UUID", () => {
  const expected: StudioAuditTarget = { targetType: "ISSUE", targetId: issueId }
  assert.deepEqual(parseAuditTarget("ISSUE", issueId), expected)
  assert.deepEqual(parseAuditTarget("ARTICLE", issueId), {
    targetType: "ARTICLE",
    targetId: issueId
  })
  assert.equal(parseAuditTarget("UNKNOWN", issueId), null)
  assert.equal(parseAuditTarget("ISSUE", "not-a-uuid"), null)
})

test("audit target parsing rejects arrays and blank route query values", () => {
  assert.equal(parseAuditTarget(["ISSUE"], issueId), null)
  assert.equal(parseAuditTarget("ISSUE", ""), null)
  assert.equal(parseAuditTarget("ISSUE", "   "), null)
})

test("audit page reads server evidence instead of embedding demo events", async () => {
  const source = await readFile(
    new URL("../../app/pages/studio/audit/index.vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /listEditorialAudit/)
  assert.doesNotMatch(source, /const events = \[/)
  assert.doesNotMatch(source, /editor\.demo|publisher\.demo/)
})
