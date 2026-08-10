import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildSectionReorder,
  moveSection,
  sectionKeyboardAction
} from "../../../../app/features/studio/issues/section-editor-contract.ts"

const sections = [
  {
    sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
    title: "場邊現場",
    position: 1,
    articleCount: 2,
    version: 0
  },
  {
    sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
    title: "人物與方法",
    position: 2,
    articleCount: 1,
    version: 0
  }
]

test("keyboard move keeps explicit contiguous positions", () => {
  const moved = moveSection(sections, 1, -1)
  assert.deepEqual(
    moved.map((section) => section.sectionId),
    ["0190f7b0-7c4b-7e3a-8f12-123456789abd", "0190f7b0-7c4b-7e3a-8f12-123456789abc"]
  )
  assert.deepEqual(buildSectionReorder(moved), [
    {
      sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
      position: 1
    },
    {
      sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
      position: 2
    }
  ])
})

test("arrow keys are the only reorder keyboard commands", () => {
  assert.equal(sectionKeyboardAction("ArrowUp"), -1)
  assert.equal(sectionKeyboardAction("ArrowDown"), 1)
  assert.equal(sectionKeyboardAction("Enter"), 0)
  assert.equal(sectionKeyboardAction("Escape"), 0)
})

test("IssueEditor wires the sortable TOC to server section commands", async () => {
  const source = await readFile(
    new URL("../../../../app/features/studio/issues/IssueEditor.vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /listEditorIssueSections/)
  assert.match(source, /createEditorIssueSection/)
  assert.match(source, /reorderEditorIssueSections/)
  assert.match(source, /patchEditorIssueSection/)
  assert.match(source, /deleteEditorIssueSection/)
  assert.match(source, /@keydown="onSectionKeydown\(\$event, index\)"/)
  assert.match(source, /aria-label="可排序的期數章節"/)
})
