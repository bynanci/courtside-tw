import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createHash } from "node:crypto"
import test from "node:test"
import { parse as parseYaml } from "yaml"

const workflow = fs.readFileSync(
  new URL("../../.github/workflows/t086-required-gate.yml", import.meta.url),
  "utf8"
)
const parsedWorkflow = parseYaml(workflow)
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
  assert.notEqual(commentJobRuns(ownerEvent("deleted", 196, "")), false)
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
    incompletePage: false,
    comparisonRequests: [],
    comparisonLimit: 250
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
        compareCommitsWithBasehead: async (parameters) => {
          state.comparisonRequests.push(parameters)
          return {
            data: parameters.basehead.startsWith(f.protectedMainSha)
              ? {
                  merge_base_commit: { sha: state.mainSha },
                  total_commits: state.commits.length,
                  commits: state.commits.slice(0, state.comparisonLimit)
                }
              : { merge_base_commit: { sha: f.receipt.completion_evidence.merge_sha } }
          }
        }
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

function commentJobRuns(payload, eventName = "issue_comment") {
  const condition = parsedWorkflow.jobs["trusted-evaluation"].if
  if (condition === undefined) return true
  // Evaluate the actual YAML expression. The used GitHub operators are also JS
  // operators; optional chaining supplies GitHub's missing-property behavior.
  const expression = condition.replace(/github(?:\.[A-Za-z_][A-Za-z0-9_]*)+/gu, (path) =>
    path.split(".").join("?.")
  )
  return Boolean(
    vm.runInNewContext(expression, {
      github: { event_name: eventName, event: payload },
      contains: (value, text) => typeof value === "string" && value.includes(text)
    })
  )
}
function ownerEvent(action, issue, body, sender = "bynanci") {
  return {
    action,
    issue: { number: issue },
    sender: { login: sender },
    comment: { id: 6000000000, body, user: { login: "bynanci" }, author_association: "OWNER" }
  }
}

test("irrelevant contributors and ordinary new OWNER comments never enter global reconciliation", () => {
  for (const action of ["created", "edited", "deleted"]) {
    const event = ownerEvent(action, 160, "<!-- t086:owner-adjudication:start -->", "bynanci")
    event.comment.user.login = "contributor"
    event.comment.author_association = "CONTRIBUTOR"
    assert.equal(commentJobRuns(event), false, action)
  }
  assert.equal(commentJobRuns(ownerEvent("created", 196, "ordinary discussion")), false)
  assert.equal(
    commentJobRuns(ownerEvent("created", 999, "<!-- t086:owner-adjudication:start -->")),
    false
  )
  assert.equal(
    commentJobRuns(ownerEvent("created", 999, "<!-- t086:owner-authorization:start -->")),
    false
  )
  for (const [login, association] of [
    ["bynanci", "CONTRIBUTOR"],
    ["other-owner", "OWNER"]
  ]) {
    const event = ownerEvent("deleted", 196, "", "bynanci")
    event.comment.user.login = login
    event.comment.author_association = association
    assert.equal(commentJobRuns(event), false)
  }
  assert.equal(commentJobRuns({ action: "created" }), false)
})

test("canonical and receipt authority creation on any permitted issue still triggers live read-back", () => {
  for (const [issue, marker] of [
    [160, "<!-- t086:owner-adjudication:start -->"],
    [164, "<!-- t086-required-gate:owner-exact-path-dispatch:v10:start -->"],
    [193, "<!-- t086:owner-authorization:start -->"],
    [196, "<!-- task-status-reconciliation:owner-authorization:start -->"],
    [999, "<!-- task-status-reconciliation:owner-authorization:start -->"],
    [196, "<!-- task-receipt-bootstrap:owner-authorization:start -->"]
  ])
    assert.equal(commentJobRuns(ownerEvent("created", issue, marker)), true)
})

test("editing or admin deletion of an OWNER authorization invalidates even when all markers disappear", () => {
  for (const issue of [160, 196, 999]) {
    for (const action of ["edited", "deleted"]) {
      const event = ownerEvent(action, issue, "", "other-admin")
      assert.equal(commentJobRuns(event), true, action + ":" + issue)
    }
  }
  for (const eventName of ["pull_request_target", "workflow_run", "push", "schedule"])
    assert.equal(commentJobRuns({}, eventName), true)
})

test("comments on pinned issue seals preserve reconciliation regardless of comment author", () => {
  for (const issue of [188, 191, 192]) {
    for (const action of ["created", "edited", "deleted"]) {
      const event = ownerEvent(action, issue, "ordinary discussion", "other-admin")
      event.comment.user.login = "contributor"
      event.comment.author_association = "CONTRIBUTOR"
      assert.equal(commentJobRuns(event), true, action + ":" + issue)
    }
  }
})

test("only admitted jobs share concurrency, so ignored comments cannot replace a pending invalidation", () => {
  assert.equal(parsedWorkflow.concurrency, undefined)
  const concurrency = parsedWorkflow.jobs["trusted-evaluation"].concurrency
  assert.equal(concurrency?.group, "t086-required-gate-" + "$" + "{{ github.repository }}")
  assert.equal(concurrency?.["cancel-in-progress"], false)
  assert.deepEqual(parsedWorkflow.on.issue_comment.types, ["created", "edited", "deleted"])
})

function linearComparison(state, count) {
  let previous = state.mainSha
  state.commits = Array.from({ length: count }, (_, index) => {
    const sha = index === count - 1 ? state.pr.head.sha : (index + 1).toString(16).padStart(40, "0")
    const row = {
      sha,
      parents: [{ sha: previous }],
      commit: { committer: { date: "2026-09-12T10:01:00Z" } }
    }
    previous = sha
    return row
  })
}
for (const count of [31, 250]) {
  test(
    "unpaginated GitHub Compare verifies the complete bounded " + count + "-commit history",
    async () => {
      const gate = liveGate(taskStatusFixture(), (state) => linearComparison(state, count))
      const verdict = await gate.read()
      assert.equal(verdict.status, "PASS", verdict.errors.join("\n"))
      const request = gate.state.comparisonRequests[0]
      assert.equal(Object.hasOwn(request, "page"), false)
      assert.equal(Object.hasOwn(request, "per_page"), false)
    }
  )
}
test("Compare histories over250 or unexpectedly truncated below the bound fail closed", async () => {
  for (const [count, limit] of [
    [251, 250],
    [31, 30],
    [250, 249]
  ]) {
    const gate = liveGate(taskStatusFixture(), (state) => {
      linearComparison(state, count)
      state.comparisonLimit = limit
    })
    assert.equal((await gate.read()).status, "FAIL")
  }
})
