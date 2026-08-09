import { deepEqual, equal, throws } from "node:assert/strict"
import { test } from "node:test"

import {
  articleRoute,
  issueRoute,
  parsePublicIssueSlug,
  publicIssueApiPath
} from "../../app/features/issues/public-issue-contract.ts"

test("public Issue navigation only builds canonical, bounded reader routes", () => {
  equal(issueRoute("issue-2026-01"), "/issues/issue-2026-01")
  equal(
    articleRoute("courtside-opening-night", "issue-2026-01"),
    "/articles/courtside-opening-night?issue=issue-2026-01"
  )
  equal(
    publicIssueApiPath("issue-2026-01"),
    "/api/v1/public/issues/issue-2026-01"
  )
})

test("public Issue navigation rejects traversal, controls and oversized slugs", () => {
  for (const candidate of ["../draft", "issue/1", "issue%2f1", "issue\n1", "A".repeat(129)]) {
    throws(() => parsePublicIssueSlug(candidate), /public issue slug/i)
  }

  deepEqual(parsePublicIssueSlug("issue-2026-01"), "issue-2026-01")
})
