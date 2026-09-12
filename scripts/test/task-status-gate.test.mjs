import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createHash } from "node:crypto"
import test from "node:test"

const workflow = fs.readFileSync(new URL("../../.github/workflows/t086-required-gate.yml", import.meta.url), "utf8")
const pure = workflow.split("// T086_PURE_START")[1].split("// T086_PURE_END")[0].replace(/^            /gm, "")
const sandbox = { createHash }
vm.createContext(sandbox)
vm.runInContext(pure, sandbox)
const docs = ["README.md", "specs/001-taiwan-basketball-magazine-ebook/tasks.md", "docs/design/arena-editorial-v3-tasks.md", ".loop/evidence/task-status-reconciliation.json"]
const rows = docs.map(filename => ({ filename, status: filename.endsWith(".json") ? "added" : "modified" }))

test("trusted classifier recognizes a fully authenticated documentation receipt without treating prose as a release candidate", () => {
  const verdict = { status: "PASS", allowedPaths: docs }
  assert.equal(sandbox.classifyCandidate(195, rows, rows.length, verdict), "NOT_APPLICABLE")
})

test("missing or rejected documentation proof preserves the T086 classification", () => {
  for (const verdict of [undefined, null, { status: "FAIL" }]) {
    assert.equal(sandbox.classifyCandidate(195, rows, rows.length, verdict), "T086")
  }
})

test("documentation verdict cannot exempt release files, arbitrary scope, renames or incomplete pagination", () => {
  const verdict = { status: "PASS", allowedPaths: docs }
  for (const filename of [".github/workflows/release.yml", "scripts/validate-beta-release.mjs", ".loop/t086-beta-release-graph.yaml", "apps/web/app/pages/index.vue"]) {
    const expanded = [...rows, { filename, status: "modified" }]
    assert.notEqual(sandbox.classifyCandidate(195, expanded, expanded.length, verdict), "NOT_APPLICABLE")
  }
  const renamed = rows.map((row, i) => i ? row : { ...row, status: "renamed", previous_filename: "scripts/validate-beta-release.mjs" })
  assert.equal(sandbox.classifyCandidate(195, renamed, renamed.length, verdict), "T086")
  assert.equal(sandbox.classifyCandidate(195, rows, rows.length + 1, verdict), "UNKNOWN")
  assert.equal(sandbox.classifyCandidate(161, rows, rows.length, verdict), "T086")
})
