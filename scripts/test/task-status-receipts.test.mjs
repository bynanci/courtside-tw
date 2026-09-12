import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
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
const signature = (text) =>
  hash(
    [...text.matchAll(/^- \[([ xX])\] (T\d{3})\b/gmu)]
      .map(([, checked, id]) => `${id}:${checked.toLowerCase() === "x" ? "1" : "0"}`)
      .join("\n")
  )
const definitions = (text) =>
  hash(
    [...text.matchAll(/^- \[[ xX]\] T\d{3}\b[^\n]*/gmu)]
      .map(([row]) =>
        row.replace(/ Current governance (?:state|read-back) \(\d{4}-\d{2}-\d{2}\):[^\n]*$/u, "")
      )
      .join("\n")
  )

function fixture() {
  const baseDocuments = Object.fromEntries(
    ["README.md", tasksPath, ledgerPath].map((p) => [p, fs.readFileSync(new URL(p, root), "utf8")])
  )
  const targetDocuments = {
    ...baseDocuments,
    "README.md": baseDocuments["README.md"] + "\nReviewed task progress. T086 remains unchecked.\n",
    [tasksPath]:
      baseDocuments[tasksPath].replace(
        / Current governance state \(\d{4}-\d{2}-\d{2}\):[^\n]*/u,
        " Current governance state (2026-09-12): producer engineering is merged; release acceptance remains pending."
      ) + "\nCurrent task review: 86 checked, 26 pending.\n",
    [ledgerPath]:
      baseDocuments[ledgerPath].replace("- [ ] UIR-017", "- [x] UIR-017") +
      "\nProtected-main receipt: PR #187 merged.\n"
  }
  const receipt = {
    schema_version: "courtside-task-status-reconciliation/v1",
    repository: "bynanci/courtside-tw",
    base_sha: baseSha,
    branch: "docs/task-status-reconciliation",
    pull_request: 195,
    authorization_ref: "https://github.com/bynanci/courtside-tw/issues/196#issuecomment-6000000000",
    documents: Object.fromEntries(
      Object.keys(baseDocuments).map((p) => [
        p,
        { before_sha256: hash(baseDocuments[p]), after_sha256: hash(targetDocuments[p]) }
      ])
    ),
    canonical_checkbox_signature_sha256: signature(baseDocuments[tasksPath]),
    task_definition_signature_sha256: definitions(baseDocuments[tasksPath]),
    scope_boundaries: {
      canonical_task_state_changed: false,
      beta_flag_removed: false,
      frozen_t085_evidence_changed: false,
      ruleset_changed: false,
      runtime_changed: false,
      production_activated: false,
      provider_configured: false,
      credentials_or_secrets_changed: false,
      participant_research_executed: false,
      web3_activated: false
    },
    completion_evidence: { pull_request: 187, head_sha: uiHead, merge_sha: uiMerge }
  }
  const contract = {
    ...receipt,
    schema_version: "courtside-task-status-reconciliation-owner-authorization/v1",
    decision: "TASK_STATUS_RECONCILIATION_ACCEPTED",
    accepted_by: "bynanci"
  }
  delete contract.authorization_ref
  const authorization = {
    status: "VERIFIED",
    source: "github-api",
    html_url: receipt.authorization_ref,
    issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/196",
    user_login: "bynanci",
    author_association: "OWNER",
    created_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:00:00Z",
    body: `<!-- task-status-reconciliation:owner-authorization:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- task-status-reconciliation:owner-authorization:end -->`
  }
  return {
    mode: "CANDIDATE",
    receipt,
    authorization,
    baseDocuments,
    targetDocuments,
    pullRequest: {
      number: 195,
      state: "open",
      merged: false,
      head: { sha: headSha, ref: receipt.branch, repo: { full_name: receipt.repository } },
      base: { sha: baseSha, ref: "main", repo: { full_name: receipt.repository } }
    },
    mergedUiPullRequest: {
      number: 187,
      state: "closed",
      merged: true,
      head: { sha: uiHead },
      merge_commit_sha: uiMerge
    },
    uiMergeAncestorOfBase: true,
    protectedMainSha: baseSha,
    currentHead: headSha,
    changedPaths: [...Object.keys(baseDocuments), receiptPath],
    candidateHistoryPaths: [...Object.keys(baseDocuments), receiptPath],
    candidateLinearHistory: true,
    candidateCommittedAfterAuthorization: true
  }
}

function authorizeTaskStatusFixture(f) {
  f.receipt.documents = Object.fromEntries(
    Object.keys(f.baseDocuments).map((p) => [
      p,
      { before_sha256: hash(f.baseDocuments[p]), after_sha256: hash(f.targetDocuments[p]) }
    ])
  )
  f.receipt.canonical_checkbox_signature_sha256 = signature(f.baseDocuments[tasksPath])
  f.receipt.task_definition_signature_sha256 = definitions(f.baseDocuments[tasksPath])
  const contract = {
    ...f.receipt,
    schema_version: "courtside-task-status-reconciliation-owner-authorization/v1",
    decision: "TASK_STATUS_RECONCILIATION_ACCEPTED",
    accepted_by: "bynanci"
  }
  delete contract.authorization_ref
  f.authorization.body = `<!-- task-status-reconciliation:owner-authorization:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- task-status-reconciliation:owner-authorization:end -->`
  return f
}

export { fixture as taskStatusFixture, authorizeTaskStatusFixture }

const bootstrapAuthorizationFixture = {
  html_url: "https://github.com/bynanci/courtside-tw/issues/196#issuecomment-5645012776",
  issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/196",
  author_association: "OWNER",
  created_at: "2026-09-12T09:28:10Z",
  updated_at: "2026-09-12T09:28:10Z",
  body: '<!-- task-receipt-bootstrap:owner-authorization:start -->\n```json\n{\n  "schema_version": "courtside-task-receipt-bootstrap-owner-authorization/v1",\n  "decision": "DISPATCH_ACCEPTED",\n  "accepted_by": "bynanci",\n  "repository": "bynanci/courtside-tw",\n  "issue": "https://github.com/bynanci/courtside-tw/issues/196",\n  "task": "TASK_RECEIPT_POLICY",\n  "branch": "codex/complete-tasks-receipt-validation",\n  "authorization_base": {\n    "branch": "main",\n    "sha": "ac92f88a7267736325519a8bf12dc6b9ee2bcb86",\n    "tree_sha": "9bff16cfc654a8d506bdc4ecc7ae989595525f79",\n    "protected": true\n  },\n  "authorized_paths": [\n    "scripts/task-status-receipts.mjs",\n    "scripts/test/task-status-receipts.test.mjs",\n    "scripts/validate-traceability.mjs",\n    "scripts/test/validate-traceability.test.mjs",\n    ".github/workflows/t086-required-gate.yml",\n    "scripts/test/task-status-gate.test.mjs"\n  ],\n  "authorized_actions": [\n    "write behavioral RED tests before implementation",\n    "implement authenticated task-status receipt validation and inherited receipt read-back",\n    "correct trusted workflow classification only for fully authenticated documentation-only receipts",\n    "preserve original task definitions, checkbox signatures, historical receipt snapshots and seals",\n    "create bounded code-only PR and run exact-head CI/Security and independent review"\n  ],\n  "completion_requires": [\n    "existing historical fixtures remain green",\n    "new positive and negative receipt tests pass",\n    "trusted workflow does not execute candidate code",\n    "fresh exact-head CI/Security and resolved review findings"\n  ],\n  "scope_boundaries": {\n    "canonical_task_state_changed": false,\n    "beta_flag_removed": false,\n    "frozen_t085_evidence_changed": false,\n    "ruleset_changed": false,\n    "runtime_changed": false,\n    "production_activated": false,\n    "provider_configured": false,\n    "credentials_or_secrets_changed": false,\n    "participant_research_executed": false\n  },\n  "authorization_source": "User instruction in the active session: 我需要你把所有tasks都開發完成 修正收據驗證. This record bounds the first necessary receipt-validation repair; subsequent task implementations retain their own dependency and proof requirements.",\n  "merge_policy": "Protected PR only after all required checks and an accountable owner decision; no bypass or direct protected-main push."\n}\n```\n<!-- task-receipt-bootstrap:owner-authorization:end -->',
  status: "VERIFIED",
  source: "github-api",
  user_login: "bynanci"
}
function bootstrapFixture() {
  return {
    authorization: structuredClone(bootstrapAuthorizationFixture),
    baseSha: "ac92f88a7267736325519a8bf12dc6b9ee2bcb86",
    baseTreeSha: "9bff16cfc654a8d506bdc4ecc7ae989595525f79",
    currentHead: headSha,
    headTreeSha: "9".repeat(40),
    gitClean: true,
    baseAncestor: true,
    changedPaths: [...receiptModule.TASK_RECEIPT_BOOTSTRAP_PATHS],
    historyPaths: [...receiptModule.TASK_RECEIPT_BOOTSTRAP_PATHS],
    linearHistory: true,
    commitsAfterAuthorization: true,
    regularFiles: true,
    protectedMain: {
      name: "main",
      protected: true,
      commit: { sha: "ac92f88a7267736325519a8bf12dc6b9ee2bcb86" }
    },
    pullRequest: {
      number: 197,
      state: "open",
      merged: false,
      draft: true,
      head: {
        sha: headSha,
        ref: "codex/complete-tasks-receipt-validation",
        repo: { full_name: "bynanci/courtside-tw" }
      },
      base: {
        sha: "ac92f88a7267736325519a8bf12dc6b9ee2bcb86",
        ref: "main",
        repo: { full_name: "bynanci/courtside-tw" }
      }
    }
  }
}
export { bootstrapFixture }
test("bootstrap authenticates the exact real OWNER dispatch and six-path candidate", () => {
  const result = receiptModule.validateTaskReceiptBootstrap(bootstrapFixture())
  assert.equal(result.status, "PASS", result.errors.join("\n"))
})
for (const [name, mutate] of [
  [
    "edited authorization",
    (f) => {
      f.authorization.updated_at = "2026-09-12T11:00:00Z"
    }
  ],
  [
    "changed authorized body",
    (f) => {
      f.authorization.body += "\n"
    }
  ],
  [
    "wrong live branch",
    (f) => {
      f.pullRequest.head.ref = "another-branch"
    }
  ],
  [
    "changed protected base",
    (f) => {
      f.protectedMain.commit.sha = "f".repeat(40)
    }
  ],
  [
    "additional docs path",
    (f) => {
      f.changedPaths.push(tasksPath)
    }
  ],
  [
    "reverted runtime history",
    (f) => {
      f.historyPaths.push("apps/web/app/pages/index.vue")
    }
  ],
  [
    "merge history",
    (f) => {
      f.linearHistory = false
    }
  ],
  [
    "non-regular Git path",
    (f) => {
      f.regularFiles = false
    }
  ],
  [
    "pre-dispatch history",
    (f) => {
      f.commitsAfterAuthorization = false
    }
  ]
]) {
  test(`bootstrap rejects ${name}`, () => {
    const f = bootstrapFixture()
    mutate(f)
    assert.equal(receiptModule.validateTaskReceiptBootstrap(f).status, "FAIL")
  })
}
test("bootstrap accepts only its reviewed same-tree single-parent protected squash", () => {
  const f = bootstrapFixture()
  f.protectedPush = true
  f.pullRequest.state = "closed"
  f.pullRequest.merged = true
  f.pullRequest.draft = false
  f.pullRequest.merge_commit_sha = headSha
  f.reviewedHeadTreeSha = f.headTreeSha
  f.headParents = [f.baseSha]
  f.protectedMain.commit.sha = headSha
  assert.equal(receiptModule.validateTaskReceiptBootstrap(f).status, "PASS")
  f.headParents.push("f".repeat(40))
  assert.equal(receiptModule.validateTaskReceiptBootstrap(f).status, "FAIL")
})
test("even a newly authenticated target hash cannot change a canonical definition or checkbox", () => {
  for (const change of [
    (s) => s.replace("- [ ] T086", "- [x] T086"),
    (s) => s.replace("T086 Execute", "T086 Skip")
  ]) {
    const f = fixture()
    f.targetDocuments[tasksPath] = change(f.targetDocuments[tasksPath])
    authorizeTaskStatusFixture(f)
    const result = validate(f)
    assert.equal(result.status, "FAIL")
    assert.match(result.errors.join("\n"), /checkbox|definitions/u)
  }
})

const validate = (options) => {
  assert.equal(
    typeof receiptModule.validateTaskStatusReceipt,
    "function",
    "reusable authenticated task status receipt validator must exist"
  )
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
  [
    "missing OWNER read-back",
    (f) => {
      f.authorization = null
    }
  ],
  [
    "non-owner comment",
    (f) => {
      f.authorization.user_login = "contributor"
    }
  ],
  [
    "edited OWNER comment",
    (f) => {
      f.authorization.updated_at = "2026-09-12T10:01:00Z"
    }
  ],
  [
    "wrong exact base",
    (f) => {
      f.protectedMainSha = "f".repeat(40)
    }
  ],
  [
    "wrong exact head",
    (f) => {
      f.currentHead = "f".repeat(40)
    }
  ],
  [
    "different PR",
    (f) => {
      f.pullRequest.number = 197
    }
  ],
  [
    "unchecked T086 promoted to complete",
    (f) => {
      f.targetDocuments[tasksPath] = f.targetDocuments[tasksPath].replace(
        "- [ ] T086",
        "- [x] T086"
      )
    }
  ],
  [
    "task definition changed",
    (f) => {
      f.targetDocuments[tasksPath] = f.targetDocuments[tasksPath].replace(
        "T086 Execute",
        "T086 Skip"
      )
    }
  ],
  [
    "unapproved README bytes",
    (f) => {
      f.targetDocuments["README.md"] += "unapproved"
    }
  ],
  [
    "runtime file in diff",
    (f) => {
      f.changedPaths.push("apps/web/app/pages/index.vue")
    }
  ],
  [
    "runtime file reverted from history",
    (f) => {
      f.candidateHistoryPaths.push("apps/web/app/pages/index.vue")
    }
  ],
  [
    "merge commit history",
    (f) => {
      f.candidateLinearHistory = false
    }
  ],
  [
    "pre-authorization commit",
    (f) => {
      f.candidateCommittedAfterAuthorization = false
    }
  ],
  [
    "UI completion without merged evidence",
    (f) => {
      f.mergedUiPullRequest.merged = false
    }
  ],
  [
    "UI merge absent from base ancestry",
    (f) => {
      f.uiMergeAncestorOfBase = false
    }
  ],
  [
    "duplicate JSON authorization keys",
    (f) => {
      f.authorization.body = f.authorization.body.replace(
        '"decision":',
        '"decision":"TASK_STATUS_RECONCILIATION_ACCEPTED","decision":'
      )
    }
  ]
]) {
  test(`rejects ${name}`, () => {
    const f = fixture()
    mutate(f)
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

function realReceiptHistory(
  t,
  {
    bootstrap = false,
    hiddenRuntime = false,
    deletedBranch = false,
    preparedBeforeAuthorization = false,
    reviewedDate = "2026-09-12T10:05:00Z"
  } = {}
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-receipt-history-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  let date = "2026-09-12T10:05:00Z"
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    })
  const put = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true })
    fs.writeFileSync(path.join(directory, name), value)
  }
  const commit = (subject) => {
    git("add", ".")
    git("commit", "-m", subject)
    return git("rev-parse", "HEAD").trim()
  }
  const f = bootstrap ? bootstrapFixture() : fixture()
  const runtimePath = "apps/web/app/pages/index.vue"
  let base
  if (bootstrap) {
    git("clone", "--shared", "--no-checkout", fileURLToPath(root), ".")
    git("checkout", "-B", "receipt-review-main", receiptModule.TASK_RECEIPT_BOOTSTRAP_BASE)
    base = receiptModule.TASK_RECEIPT_BOOTSTRAP_BASE
  } else {
    git("init", "-b", "receipt-review-main")
    for (const [name, text] of Object.entries(f.baseDocuments)) put(name, text)
    put(runtimePath, "original runtime\n")
  }
  git("config", "user.name", "Receipt history test")
  git("config", "user.email", "receipt-history@example.invalid")
  if (!bootstrap) {
    base = commit("base fixture")
    f.receipt.base_sha = base
    f.pullRequest.base.sha = base
    f.protectedMainSha = base
    f.receipt.completion_evidence.merge_sha = base
    f.mergedUiPullRequest.merge_commit_sha = base
    authorizeTaskStatusFixture(f)
  }
  const branch = bootstrap ? receiptModule.TASK_RECEIPT_BOOTSTRAP_BRANCH : f.receipt.branch
  const paths = bootstrap ? [...receiptModule.TASK_RECEIPT_BOOTSTRAP_PATHS] : f.changedPaths
  const runtimeBefore = fs.readFileSync(path.join(directory, runtimePath), "utf8")
  git("switch", "-C", branch)
  if (hiddenRuntime) {
    put(runtimePath, runtimeBefore + "\nunauthorized runtime history\n")
    commit("unapproved runtime change")
    put(runtimePath, runtimeBefore)
  } else if (bootstrap && preparedBeforeAuthorization) {
    date = f.authorization.created_at
    put(paths[0], "prepared before bootstrap authorization\n")
    commit("implementation predates bootstrap dispatch")
  } else if (!bootstrap) {
    // Existing, reviewed documentation may precede the authority comment; the closing receipt must not.
    date = "2026-09-12T09:59:00Z"
    put("README.md", f.targetDocuments["README.md"])
    commit("prepared documentation before receipt approval")
  }
  date = reviewedDate
  if (bootstrap) {
    for (const name of paths)
      put(
        name,
        (fs.existsSync(path.join(directory, name))
          ? fs.readFileSync(path.join(directory, name), "utf8")
          : "") + "\nfixture change\n"
      )
  } else {
    for (const [name, text] of Object.entries(f.targetDocuments)) put(name, text)
    put(receiptPath, JSON.stringify(f.receipt))
  }
  const reviewed = commit("close approved receipt scope")
  const reviewedTree = git("rev-parse", `${reviewed}^{tree}`).trim()
  const commits = git("rev-list", "--reverse", `${base}..${reviewed}`)
    .trim()
    .split("\n")
    .map((sha) => ({
      sha,
      parents: git("show", "-s", "--format=%P", sha)
        .trim()
        .split(" ")
        .map((sha) => ({ sha })),
      commit: {
        author: { date: git("show", "-s", "--format=%aI", sha).trim() },
        committer: { date: git("show", "-s", "--format=%cI", sha).trim() }
      },
      files: git("diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", sha)
        .trim()
        .split("\n")
        .map((row) => {
          const [status, filename] = row.split("\t")
          return { filename, status: { A: "added", M: "modified", D: "removed" }[status] ?? status }
        })
    }))
  git("switch", "receipt-review-main")
  git("checkout", reviewed, "--", ...paths)
  date = "2026-09-12T10:06:00Z"
  const squash = commit(`approved squash (#${f.pullRequest.number})`)
  assert.equal(git("rev-parse", `${squash}^{tree}`).trim(), reviewedTree)
  if (deletedBranch) {
    git("branch", "-D", branch)
    git("reflog", "expire", "--expire=now", "--all")
    git("gc", "--prune=now")
    assert.throws(() => git("cat-file", "-e", `${reviewed}^{commit}`))
  }
  const rawComment = { ...f.authorization, user: { login: f.authorization.user_login } }
  const state = { apiMutation: (_url, data) => data, requests: [], commits }
  const fetchJson = (url) => {
    state.requests.push(url)
    let data
    if (url.endsWith("/branches/main"))
      data = { name: "main", protected: true, commit: { sha: squash } }
    else if (url.includes("/issues/comments/")) data = rawComment
    else if (url.endsWith("/pulls/187")) data = f.mergedUiPullRequest
    else if (url.endsWith(`/pulls/${f.pullRequest.number}`))
      data = {
        ...f.pullRequest,
        state: "closed",
        merged: true,
        draft: false,
        merge_commit_sha: squash,
        head: { ...f.pullRequest.head, sha: reviewed }
      }
    else if (url.endsWith(`/git/commits/${reviewed}`)) data = { tree: { sha: reviewedTree } }
    else if (url.includes(`/compare/${base}...${reviewed}?`)) {
      const page = Number(new URL(url).searchParams.get("page"))
      data = {
        total_commits: state.commits.length,
        merge_base_commit: { sha: base },
        commits: state.commits.slice((page - 1) * 100, page * 100)
      }
    } else if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) {
      const sha = new URL(url).pathname.split("/").at(-1)
      data = state.commits.find((item) => item.sha === sha)
    } else throw new Error(`unexpected test API ${url}`)
    return state.apiMutation(url, structuredClone(data))
  }
  return {
    state,
    base,
    reviewed,
    squash,
    inspect(mode = "ACCEPTED_BASE") {
      const push = mode !== "ACCEPTED_BASE"
      const changeBase = push ? base : squash
      const inspection = {
        head: squash,
        change_base_sha: changeBase,
        changedPaths: push ? paths : []
      }
      const readback = receiptModule.inspectTaskReceiptPolicy(directory, {
        inspection,
        environment: push ? { GITHUB_EVENT_NAME: "push" } : {},
        fetchJson
      })
      state.readback = readback
      return receiptModule.validateTaskReceiptPolicy(readback, {
        currentHead: squash,
        changeBaseSha: changeBase,
        changedPaths: inspection.changedPaths,
        tasksText: git("show", `${squash}:${tasksPath}`),
        changeBaseTasksText: git("show", `${changeBase}:${tasksPath}`),
        gitBinding: {
          status: "CLEAN",
          head: squash,
          change_base_sha: changeBase,
          change_base_ancestor: true
        }
      })
    }
  }
}

for (const mode of ["ACCEPTED_BASE", "RECEIPT_PUSH"]) {
  test(`real Git ${mode} rechecks original reviewed history instead of hiding it in a same-tree squash`, (t) => {
    const f = realReceiptHistory(t, { hiddenRuntime: true })
    assert.equal(f.inspect(mode).status, "FAIL")
  })
}

test("real Git bootstrap protected squash cannot hide reverted runtime history", (t) => {
  const f = realReceiptHistory(t, { bootstrap: true, hiddenRuntime: true })
  assert.equal(f.inspect("BOOTSTRAP").status, "FAIL")
})

test("a deleted reviewed branch uses complete API history and still accepts reviewed pre-approval documents", (t) => {
  const f = realReceiptHistory(t, { deletedBranch: true })
  const result = f.inspect()
  assert.equal(result.status, "PASS", result.errors.join("\n"))
  assert.ok(f.state.requests.some((url) => url.includes("/compare/")))
  assert.ok(f.state.requests.some((url) => /\/commits\/[a-f0-9]{40}\?per_page=100/u.test(url)))
})

for (const mode of ["ACCEPTED_BASE", "RECEIPT_PUSH", "BOOTSTRAP"]) {
  test(`real Git ${mode} accepts a valid original reviewed history`, (t) => {
    const f = realReceiptHistory(t, { bootstrap: mode === "BOOTSTRAP" })
    const result = f.inspect(mode)
    assert.equal(result.status, "PASS", result.errors.join("\n"))
  })
  test(`real Git ${mode} cannot use a later squash time to repair an unauthorized original closing time`, (t) => {
    const f = realReceiptHistory(t, {
      bootstrap: mode === "BOOTSTRAP",
      reviewedDate:
        mode === "BOOTSTRAP" ? bootstrapFixture().authorization.created_at : "2026-09-12T10:00:00Z"
    })
    assert.equal(f.inspect(mode).status, "FAIL")
  })
}

test("bootstrap push rechecks a deleted original branch through complete API history", (t) => {
  const f = realReceiptHistory(t, { bootstrap: true, deletedBranch: true })
  const result = f.inspect("BOOTSTRAP")
  assert.equal(result.status, "PASS", result.errors.join("\n"))
  assert.ok(f.state.requests.some((url) => url.includes("/compare/")))
  f.state.apiMutation = (url, data) => {
    if (/\/commits\/[a-f0-9]{40}\?/u.test(url))
      data.commit.author.date = bootstrapFixture().authorization.created_at
    return data
  }
  assert.equal(f.inspect("BOOTSTRAP").status, "FAIL")
})

test("bootstrap rejects an earlier implementation commit even when its final reviewed commit follows approval", (t) => {
  const f = realReceiptHistory(t, { bootstrap: true, preparedBeforeAuthorization: true })
  assert.equal(f.inspect("BOOTSTRAP").status, "FAIL")
})

test("API readback rejects reverted runtime work when the reviewed branch was deleted", (t) => {
  const f = realReceiptHistory(t, { hiddenRuntime: true, deletedBranch: true })
  assert.equal(f.inspect().status, "FAIL")
  assert.ok(f.state.requests.some((url) => url.includes("/compare/")))
  assert.match(f.state.readback.errors.join("\n"), /outside the authorized closure/u)
})

test("API reviewed-history pagination and commit-file readback fail closed", async (t) => {
  const f = realReceiptHistory(t, { deletedBranch: true })
  const original = f.state.commits
  f.state.commits = Array.from({ length: 101 }, (_, index) => ({
    ...structuredClone(original.at(-1)),
    sha: index === 100 ? f.reviewed : (index + 1).toString(16).padStart(40, "0"),
    parents: [{ sha: index === 0 ? f.base : index.toString(16).padStart(40, "0") }],
    files: index === 100 ? original.at(-1).files : [{ filename: "README.md", status: "modified" }]
  }))
  const valid = f.inspect()
  assert.equal(valid.status, "PASS", valid.errors.join("\n"))
  assert.equal(f.state.requests.filter((url) => url.includes("/compare/")).length, 2)
  assert.equal(f.state.requests.filter((url) => /\/commits\/[a-f0-9]{40}\?/u.test(url)).length, 101)
  for (const [name, mutate] of [
    [
      "missing comparison page",
      (url, data) => {
        if (url.includes("/compare/") && url.endsWith("page=2")) data.commits = []
      }
    ],
    [
      "count changes between pages",
      (url, data) => {
        if (url.includes("/compare/") && url.endsWith("page=2")) data.total_commits = 102
      }
    ],
    [
      "history exceeds the bounded complete readback",
      (url, data) => {
        if (url.includes("/compare/")) data.total_commits = 251
      }
    ],
    [
      "wrong original base",
      (url, data) => {
        if (url.includes("/compare/")) data.merge_base_commit.sha = "e".repeat(40)
      }
    ],
    [
      "history does not close at the original head",
      (url, data) => {
        if (url.includes("/compare/") && url.endsWith("page=2"))
          data.commits = [structuredClone(f.state.commits[99])]
      }
    ],
    [
      "commit identity differs from comparison",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.sha = "e".repeat(40)
      }
    ],
    [
      "parent differs from comparison",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.parents = [{ sha: "e".repeat(40) }]
      }
    ],
    [
      "consistent API parent metadata still has to connect to the base",
      (url, data) => {
        if (url.includes("/compare/"))
          for (const commit of data.commits) commit.parents = [{ sha: "e".repeat(40) }]
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.parents = [{ sha: "e".repeat(40) }]
      }
    ],
    [
      "reviewed merge commit",
      (url, data) => {
        if (url.includes("/compare/"))
          for (const commit of data.commits) commit.parents.push({ sha: "e".repeat(40) })
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.parents.push({ sha: "e".repeat(40) })
      }
    ],
    [
      "truncated oversized file list",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url))
          data.files = Array.from({ length: 100 }, () => ({
            filename: "README.md",
            status: "modified"
          }))
      }
    ],
    [
      "renamed authorized file",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.files[0].status = "renamed"
      }
    ],
    [
      "removed authorized file",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.files[0].status = "removed"
      }
    ],
    [
      "previous filename concealed by modified status",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url))
          data.files[0].previous_filename = "apps/web/app/pages/index.vue"
      }
    ],
    [
      "duplicate file records",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.files = [data.files[0], data.files[0]]
      }
    ],
    [
      "invalid closing commit time",
      (url, data) => {
        if (/\/commits\/[a-f0-9]{40}\?/u.test(url)) data.commit.committer.date = "invalid"
      }
    ]
  ]) {
    await t.test(name, () => {
      f.state.apiMutation = (url, data) => {
        mutate(url, data)
        return data
      }
      assert.equal(f.inspect().status, "FAIL")
      assert.equal(f.state.readback.mode, "INVALID")
    })
  }
})
