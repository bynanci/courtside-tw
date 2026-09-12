import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createHash } from "node:crypto"
import test from "node:test"

const workflow = fs.readFileSync(
  new URL("../../.github/workflows/t086-required-gate.yml", import.meta.url),
  "utf8"
)
const pure = workflow
  .split("// T086_PURE_START")[1]
  .split("// T086_PURE_END")[0]
  .replace(/^ {12}/gm, "")
const sandbox = { createHash }
vm.createContext(sandbox)
vm.runInContext(pure, sandbox)
const docs = [
  "README.md",
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
  "docs/design/arena-editorial-v3-tasks.md",
  ".loop/evidence/task-status-reconciliation.json"
]
const rows = docs.map((filename) => ({
  filename,
  status: filename.endsWith(".json") ? "added" : "modified"
}))

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
  for (const filename of [
    ".github/workflows/release.yml",
    "scripts/validate-beta-release.mjs",
    ".loop/t086-beta-release-graph.yaml",
    "apps/web/app/pages/index.vue"
  ]) {
    const expanded = [...rows, { filename, status: "modified" }]
    assert.notEqual(
      sandbox.classifyCandidate(195, expanded, expanded.length, verdict),
      "NOT_APPLICABLE"
    )
  }
  const renamed = rows.map((row, i) =>
    i ? row : { ...row, status: "renamed", previous_filename: "scripts/validate-beta-release.mjs" }
  )
  assert.equal(sandbox.classifyCandidate(195, renamed, renamed.length, verdict), "T086")
  assert.equal(sandbox.classifyCandidate(195, rows, rows.length + 1, verdict), "UNKNOWN")
  assert.equal(sandbox.classifyCandidate(161, rows, rows.length, verdict), "T086")
})

test("trusted workflow carries exactly the reviewed pure receipt validator and parses without candidate code", () => {
  const module = fs.readFileSync(new URL("../task-status-receipts.mjs", import.meta.url), "utf8")
  const modulePure = module
    .split("// TASK_STATUS_PURE_START")[1]
    .split("// TASK_STATUS_PURE_END")[0]
  const workflowPure = workflow
    .split("// TASK_STATUS_PURE_START")[1]
    .split("// TASK_STATUS_PURE_END")[0]
    .replace(/^ {12}/gm, "")
  assert.equal(workflowPure.trim(), modulePure.trim())
  const script = workflow.split("          script: |\n")[1].replace(/^ {12}/gm, "")
  assert.doesNotThrow(() => new vm.Script(`(async function(){${script}\n})`))
  assert.doesNotMatch(workflow, /github\.event\.issue\.number == 160/u)
})

test("a malformed receipt without canonical tasks edits still requires release classification", () => {
  const receiptOnly = [{ filename: docs[3], status: "added" }]
  assert.equal(sandbox.classifyCandidate(195, receiptOnly, 1, { status: "FAIL" }), "T086")
  assert.equal(
    sandbox.classifyCandidate(195, rows, rows.length, {
      status: "PASS",
      allowedPaths: [...docs, "unapproved.md"]
    }),
    "T086"
  )
})

const { taskStatusFixture } = await import("./task-status-receipts.test.mjs")
function liveGate(fixture, mutate = () => {}) {
  const f = fixture
  const state = {
    comment: { ...f.authorization, id: 6000000000, user: { login: f.authorization.user_login } },
    files: f.changedPaths.map((filename) => ({
      filename,
      status: filename === docs[3] ? "added" : "modified"
    })),
    historyFiles: f.changedPaths.map((filename) => ({
      filename,
      status: filename === docs[3] ? "added" : "modified"
    })),
    commits: [
      {
        sha: f.currentHead,
        parents: [{ sha: f.protectedMainSha }],
        commit: { committer: { date: "2026-09-12T10:01:00Z" } }
      }
    ],
    mainSha: f.protectedMainSha,
    pr: f.pullRequest,
    unavailable: false,
    incompletePage: false
  }
  mutate(state)
  const api = {
    rest: {
      issues: {
        getComment: async () => {
          if (state.unavailable) throw new Error("Comment not found")
          return { data: structuredClone(state.comment) }
        }
      },
      pulls: { get: async () => ({ data: f.mergedUiPullRequest }) },
      repos: {
        getContent: async ({ path, ref }) => ({
          data: {
            type: "file",
            encoding: "base64",
            size: 100,
            sha: "0".repeat(40),
            content: Buffer.from(
              path === docs[3]
                ? JSON.stringify(f.receipt)
                : (ref === f.protectedMainSha ? f.baseDocuments : f.targetDocuments)[path]
            ).toString("base64")
          }
        }),
        compareCommitsWithBasehead: async ({ basehead }) => ({
          data: basehead.startsWith(f.protectedMainSha)
            ? {
                merge_base_commit: { sha: state.mainSha },
                total_commits: state.commits.length,
                commits: state.commits
              }
            : { merge_base_commit: { sha: f.receipt.completion_evidence.merge_sha } }
        })
      }
    },
    request: async () => ({
      data: { files: state.historyFiles },
      headers: { link: state.incompletePage ? '<https://api.github.com/next>; rel="next"' : "" }
    })
  }
  const context = { createHash, Buffer, github: api, owner: "bynanci", repo: "courtside-tw" }
  vm.createContext(context)
  const taskPure = workflow
    .split("// TASK_STATUS_PURE_START")[1]
    .split("// TASK_STATUS_PURE_END")[0]
  const helpers = workflow.slice(
    workflow.indexOf("            async function paginated"),
    workflow.indexOf("            async function checkStart")
  )
  vm.runInContext(`${pure}\n${taskPure}\n${helpers}`, context)
  return {
    state,
    read: () => context.taskDocumentationRead(state.pr, state.mainSha, state.files),
    recheck: (verdict) => context.taskDocumentationRecheck(verdict)
  }
}

test("trusted API read-back authenticates source bytes, merged UI evidence and the complete commit history", async () => {
  const gate = liveGate(taskStatusFixture())
  const verdict = await gate.read()
  assert.equal(verdict.status, "PASS", verdict.errors.join("\n"))
  assert.equal(verdict.authority_comment_id, 6000000000)
  await gate.recheck(verdict)
})

for (const [name, mutate] of [
  [
    "deleted authority",
    (state) => {
      state.unavailable = true
    }
  ],
  [
    "edited authority",
    (state) => {
      state.comment.updated_at = "2026-09-12T10:02:00Z"
    }
  ],
  [
    "wrong authority actor",
    (state) => {
      state.comment.user.login = "contributor"
    }
  ],
  [
    "nonlinear history",
    (state) => {
      state.commits[0].parents.push({ sha: "f".repeat(40) })
    }
  ],
  [
    "hidden runtime history",
    (state) => {
      state.historyFiles[0].filename = "apps/web/app/pages/index.vue"
    }
  ],
  [
    "incomplete API page",
    (state) => {
      state.incompletePage = true
    }
  ],
  [
    "commit predates authority",
    (state) => {
      state.commits[0].commit.committer.date = "2026-09-12T09:00:00Z"
    }
  ]
]) {
  test(`trusted API read-back rejects ${name}`, async () => {
    const gate = liveGate(taskStatusFixture(), mutate)
    assert.equal((await gate.read()).status, "FAIL")
  })
}

test("the receipt-closing commit must postdate authority even at second precision", async () => {
  const gate = liveGate(taskStatusFixture(), (state) => {
    state.commits[0].commit.committer.date = state.comment.created_at
  })
  assert.equal((await gate.read()).status, "FAIL")
})

for (const mutation of ["edit", "delete", "actor"]) {
  test(`authority ${mutation} after read-back prevents publishing the cached documentation verdict`, async () => {
    const gate = liveGate(taskStatusFixture())
    const verdict = await gate.read()
    assert.equal(verdict.status, "PASS")
    if (mutation === "edit") gate.state.comment.body += "\nchanged"
    if (mutation === "delete") gate.state.unavailable = true
    if (mutation === "actor") gate.state.comment.user.login = "contributor"
    await assert.rejects(() => gate.recheck(verdict))
  })
}
