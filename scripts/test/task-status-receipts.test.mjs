import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import test from "node:test"

const receiptModule = await import("../task-status-receipts.mjs").catch(() => ({}))
const hash = (text) => createHash("sha256").update(text).digest("hex")
const tasksPath = "specs/001-taiwan-basketball-magazine-ebook/tasks.md"
const ledgerPath = "docs/design/arena-editorial-v3-tasks.md"
const receiptPath = ".loop/evidence/task-status-reconciliation.json"
const root = new URL("../../", import.meta.url)
const baseSha = "a".repeat(40)
const headSha = "b".repeat(40)
const mergeSha = "c".repeat(40)
const uiHead = "d".repeat(40)
const uiMerge = "e".repeat(40)
const signature = (text) => hash([...text.matchAll(/^- \[([ xX])\] (T\d{3})\b/gmu)].map(([, checked, id]) => `${id}:${checked.toLowerCase() === "x" ? "1" : "0"}`).join("\n"))
const definitions = (text) => hash([...text.matchAll(/^- \[[ xX]\] T\d{3}\b[^\n]*/gmu)].map(([row]) => row.replace(/ Current governance state \(\d{4}-\d{2}-\d{2}\):[^\n]*$/u, "")).join("\n"))

function fixture() {
  const baseDocuments = Object.fromEntries(["README.md", tasksPath, ledgerPath].map((p) => [p, fs.readFileSync(new URL(p, root), "utf8")]))
  const targetDocuments = {
    ...baseDocuments,
    "README.md": baseDocuments["README.md"] + "\nReviewed task progress. T086 remains unchecked.\n",
    [tasksPath]: baseDocuments[tasksPath].replace(/ Current governance state \(\d{4}-\d{2}-\d{2}\):[^\n]*/u, " Current governance state (2026-09-12): producer engineering is merged; release acceptance remains pending.") + "\nCurrent task review: 86 checked, 26 pending.\n",
    [ledgerPath]: baseDocuments[ledgerPath].replace("- [ ] UIR-017", "- [x] UIR-017") + "\nProtected-main receipt: PR #187 merged.\n"
  }
  const receipt = {
    schema_version: "courtside-task-status-reconciliation/v1",
    repository: "bynanci/courtside-tw",
    base_sha: baseSha,
    branch: "docs/task-status-reconciliation",
    pull_request: 195,
    authorization_ref: "https://github.com/bynanci/courtside-tw/issues/196#issuecomment-6000000000",
    documents: Object.fromEntries(Object.keys(baseDocuments).map((p) => [p, { before_sha256: hash(baseDocuments[p]), after_sha256: hash(targetDocuments[p]) }])),
    canonical_checkbox_signature_sha256: signature(baseDocuments[tasksPath]),
    task_definition_signature_sha256: definitions(baseDocuments[tasksPath]),
    scope_boundaries: {
      canonical_task_state_changed: false, beta_flag_removed: false, frozen_t085_evidence_changed: false,
      ruleset_changed: false, runtime_changed: false, production_activated: false,
      provider_configured: false, credentials_or_secrets_changed: false,
      participant_research_executed: false, web3_activated: false
    },
    completion_evidence: { pull_request: 187, head_sha: uiHead, merge_sha: uiMerge }
  }
  const contract = { ...receipt, schema_version: "courtside-task-status-reconciliation-owner-authorization/v1", decision: "TASK_STATUS_RECONCILIATION_ACCEPTED", accepted_by: "bynanci" }
  delete contract.authorization_ref
  const authorization = {
    status: "VERIFIED", source: "github-api", html_url: receipt.authorization_ref,
    issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/196",
    user_login: "bynanci", author_association: "OWNER",
    created_at: "2026-09-12T10:00:00Z", updated_at: "2026-09-12T10:00:00Z",
    body: `<!-- task-status-reconciliation:owner-authorization:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- task-status-reconciliation:owner-authorization:end -->`
  }
  return {
    mode: "CANDIDATE", receipt, authorization, baseDocuments, targetDocuments,
    pullRequest: { number: 195, state: "open", merged: false, head: { sha: headSha, ref: receipt.branch, repo: { full_name: receipt.repository } }, base: { sha: baseSha, ref: "main", repo: { full_name: receipt.repository } } },
    mergedUiPullRequest: { number: 187, state: "closed", merged: true, head: { sha: uiHead }, merge_commit_sha: uiMerge },
    uiMergeAncestorOfBase: true, protectedMainSha: baseSha, currentHead: headSha,
    changedPaths: [...Object.keys(baseDocuments), receiptPath],
    candidateHistoryPaths: [...Object.keys(baseDocuments), receiptPath],
    candidateLinearHistory: true,
    candidateCommittedAfterAuthorization: true
  }
}
const validate = (options) => {
  assert.equal(typeof receiptModule.validateTaskStatusReceipt, "function", "reusable authenticated task status receipt validator must exist")
  return receiptModule.validateTaskStatusReceipt(options)
}

test("authenticates an exact docs receipt while preserving all 112 task definitions and 86/26 checkboxes", () => {
  const f = fixture()
  const result = validate(f)
  assert.equal(result.status, "PASS", result.errors.join("\n"))
  assert.equal(result.targetTasksSha256, hash(f.targetDocuments[tasksPath]))
  assert.deepEqual(result.allowedPaths.sort(), f.changedPaths.sort())
})

for (const [name, mutate] of [
  ["missing OWNER read-back", f => { f.authorization = null }],
  ["non-owner comment", f => { f.authorization.user_login = "contributor" }],
  ["edited OWNER comment", f => { f.authorization.updated_at = "2026-09-12T10:01:00Z" }],
  ["wrong exact base", f => { f.protectedMainSha = "f".repeat(40) }],
  ["wrong exact head", f => { f.currentHead = "f".repeat(40) }],
  ["different PR", f => { f.pullRequest.number = 197 }],
  ["unchecked T086 promoted to complete", f => { f.targetDocuments[tasksPath] = f.targetDocuments[tasksPath].replace("- [ ] T086", "- [x] T086") }],
  ["task definition changed", f => { f.targetDocuments[tasksPath] = f.targetDocuments[tasksPath].replace("T086 Execute", "T086 Skip") }],
  ["unapproved README bytes", f => { f.targetDocuments["README.md"] += "unapproved" }],
  ["runtime file in diff", f => { f.changedPaths.push("apps/web/app/pages/index.vue") }],
  ["runtime file reverted from history", f => { f.candidateHistoryPaths.push("apps/web/app/pages/index.vue") }],
  ["merge commit history", f => { f.candidateLinearHistory = false }],
  ["pre-authorization commit", f => { f.candidateCommittedAfterAuthorization = false }],
  ["UI completion without merged evidence", f => { f.mergedUiPullRequest.merged = false }],
  ["UI merge absent from base ancestry", f => { f.uiMergeAncestorOfBase = false }],
  ["duplicate JSON authorization keys", f => { f.authorization.body = f.authorization.body.replace('"decision":', '"decision":"TASK_STATUS_RECONCILIATION_ACCEPTED","decision":') }]
]) {
  test(`rejects ${name}`, () => {
    const f = fixture(); mutate(f)
    assert.equal(validate(f).status, "FAIL")
  })
}

test("accepts a merged receipt as the new task snapshot for ordinary descendant maintenance", () => {
  const f = fixture()
  f.mode = "ACCEPTED_BASE"
  f.pullRequest.state = "closed"
  f.pullRequest.merged = true
  f.pullRequest.merge_commit_sha = mergeSha
  f.receiptMergeAncestorOfBase = true
  f.protectedMainSha = "f".repeat(40)
  const result = validate(f)
  assert.equal(result.status, "PASS", result.errors.join("\n"))
  assert.equal(result.targetTasksSha256, hash(f.targetDocuments[tasksPath]))
  assert.deepEqual(result.allowedPaths, [])
})

test("a receipt copied from an unmerged or unrelated PR cannot authorize descendant task bytes", () => {
  const f = fixture()
  f.mode = "ACCEPTED_BASE"
  f.receiptMergeAncestorOfBase = false
  assert.equal(validate(f).status, "FAIL")
})

test("exports a sealed bootstrap validator for the six authorized implementation paths", () => {
  assert.equal(typeof receiptModule.validateTaskReceiptBootstrap, "function")
  assert.equal(receiptModule.TASK_RECEIPT_BOOTSTRAP_PATHS.length, 6)
  assert.equal(receiptModule.TASK_RECEIPT_BOOTSTRAP_PATHS.includes(tasksPath), false)
})
