import assert from "node:assert/strict"
import test from "node:test"

import {
  buildIssuePatch,
  isIssueEditable
} from "../../../../app/features/studio/issues/issue-editor-contract.ts"

test("issue editor builds a trimmed server patch from the current draft", () => {
  assert.deepEqual(
    buildIssuePatch("0190f7b0-7c4b-7e3a-8f12-123456789abc", "  第 04 期  ", "  城市與球場  "),
    {
      issueId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
      changes: {
        title: "第 04 期",
        description: "城市與球場"
      }
    }
  )
})

test("only draft issues are editable", () => {
  assert.equal(isIssueEditable("DRAFT"), true)
  assert.equal(isIssueEditable("PUBLISHED"), false)
  assert.equal(isIssueEditable("ARCHIVED"), false)
})
