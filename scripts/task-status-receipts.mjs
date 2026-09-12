import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"

// TASK_STATUS_PURE_START
const TASK_STATUS_RECEIPT_PATH = ".loop/evidence/task-status-reconciliation.json"
const TASK_STATUS_DOCUMENT_PATHS = Object.freeze([
  "README.md",
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
  "docs/design/arena-editorial-v3-tasks.md"
])
const TASK_STATUS_RECEIPT_SCHEMA = "courtside-task-status-reconciliation/v1"
const taskReceiptHash = (text) => createHash("sha256").update(text).digest("hex")
const TASK_STATUS_BOUNDARIES = Object.freeze({
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
})
const taskReceiptEqual = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => taskReceiptEqual(v, b[i]))
    )
  if (a && b && typeof a === "object" && typeof b === "object")
    return (
      taskReceiptEqual(Object.keys(a).sort(), Object.keys(b).sort()) &&
      Object.keys(a).every((k) => taskReceiptEqual(a[k], b[k]))
    )
  return a === b
}
const taskReceiptSamePaths = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  new Set(a).size === a.length &&
  taskReceiptEqual([...a].sort(), [...b].sort())
const taskReceiptSha = (v) => typeof v === "string" && /^[a-f0-9]{40}$/u.test(v)
const taskReceiptSha256 = (v) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v)

function parseTaskReceiptJson(text) {
  if (typeof text !== "string" || text.length > 1000000)
    throw new Error("JSON size exceeds receipt limit")
  let offset = 0
  const whitespace = () => {
    while (offset < text.length && /\s/u.test(text[offset])) offset++
  }
  function stringToken() {
    const start = offset++
    while (offset < text.length) {
      if (text[offset] === "\\") {
        offset += 2
        continue
      }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset))
    }
    throw new Error("unterminated JSON string")
  }
  function value(depth) {
    if (depth > 64) throw new Error("JSON nesting exceeds receipt limit")
    whitespace()
    const token = text[offset]
    if (token === '"') {
      stringToken()
      return
    }
    if (token === "{" || token === "[") {
      const object = token === "{",
        close = object ? "}" : "]",
        keys = new Set()
      offset++
      whitespace()
      if (text[offset] === close) {
        offset++
        return
      }
      while (offset < text.length) {
        if (object) {
          whitespace()
          if (text[offset] !== '"') throw new Error("invalid JSON object key")
          const key = stringToken()
          if (keys.has(key)) throw new Error("duplicate JSON key")
          keys.add(key)
          whitespace()
          if (text[offset++] !== ":") throw new Error("invalid JSON object separator")
        }
        value(depth + 1)
        whitespace()
        if (text[offset] === close) {
          offset++
          return
        }
        if (text[offset++] !== ",") throw new Error("invalid JSON entry separator")
      }
      throw new Error("unterminated JSON container")
    }
    const literal = text
      .slice(offset)
      .match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)
    if (!literal) throw new Error("invalid JSON value")
    offset += literal[0].length
  }
  value(0)
  whitespace()
  if (offset !== text.length) throw new Error("trailing JSON content")
  return JSON.parse(text)
}

function taskReceiptContract(body) {
  const start = "<!-- task-status-reconciliation:owner-authorization:start -->"
  const end = "<!-- task-status-reconciliation:owner-authorization:end -->"
  if (
    typeof body !== "string" ||
    body.split(start).length !== 2 ||
    body.split(end).length !== 2 ||
    body.indexOf(start) > body.indexOf(end)
  )
    throw new Error("missing or ambiguous authorization markers")
  const block = body.split(start)[1].split(end)[0].trim()
  if (!/^```json\s+[\s\S]+\s+```$/u.test(block)) throw new Error("invalid authorization JSON fence")
  return parseTaskReceiptJson(block.replace(/^```json\s+/u, "").replace(/\s+```$/u, ""))
}

function taskStatusSignatures(text) {
  if (typeof text !== "string") throw new Error("canonical tasks text is missing")
  const rows = [...text.matchAll(/^- \[([ xX])\] (T\d{3})\b([^\n]*)/gmu)]
  const expectedIds = Array.from({ length: 112 }, (_, i) => `T${String(i + 1).padStart(3, "0")}`)
  if (
    !taskReceiptEqual(
      rows.map((r) => r[2]),
      expectedIds
    )
  )
    throw new Error("canonical task IDs must remain exactly T001–T112 in order")
  const checkbox = taskReceiptHash(
    rows.map(([, checked, id]) => `${id}:${checked.toLowerCase() === "x" ? "1" : "0"}`).join("\n")
  )
  if (checkbox !== "7229c5ad498658144e513f7af91a24b121b91817057e5673d3db3cb62aac73b3")
    throw new Error("canonical checkbox signature must remain 86 complete and 26 pending")
  const definition = taskReceiptHash(
    rows
      .map(([row, , id]) =>
        id === "T086"
          ? row.replace(
              / Current governance (?:state|read-back) \(\d{4}-\d{2}-\d{2}\):[^\n]*$/u,
              ""
            )
          : row
      )
      .join("\n")
  )
  return { checkbox, definition }
}

function validateTaskStatusReceipt(input = {}) {
  const errors = []
  const need = (ok, reason) => {
    if (!ok) errors.push(`task-status receipt: ${reason}`)
  }
  let allowedPaths = [],
    baseTasksSha256 = null,
    targetTasksSha256 = null
  try {
    const {
      receipt: r,
      authorization: a,
      baseDocuments: before,
      targetDocuments: after,
      pullRequest: pr,
      mode = "CANDIDATE"
    } = input
    need(mode === "CANDIDATE" || mode === "ACCEPTED_BASE", "invalid receipt mode")
    need(
      r &&
        taskReceiptSamePaths(Object.keys(r), [
          "schema_version",
          "repository",
          "base_sha",
          "branch",
          "pull_request",
          "authorization_ref",
          "documents",
          "canonical_checkbox_signature_sha256",
          "task_definition_signature_sha256",
          "scope_boundaries",
          "completion_evidence"
        ]),
      "receipt fields are missing or unknown"
    )
    if (!r) throw new Error("receipt is missing")
    need(
      r.schema_version === TASK_STATUS_RECEIPT_SCHEMA && r.repository === "bynanci/courtside-tw",
      "schema or repository mismatch"
    )
    need(
      taskReceiptSha(r.base_sha) &&
        Number.isSafeInteger(r.pull_request) &&
        r.pull_request > 0 &&
        typeof r.branch === "string" &&
        r.branch.length > 0,
      "invalid base or PR binding"
    )
    need(taskReceiptEqual(r.scope_boundaries, TASK_STATUS_BOUNDARIES), "scope boundaries changed")
    need(
      taskReceiptSamePaths(Object.keys(r.documents ?? {}), TASK_STATUS_DOCUMENT_PATHS) &&
        taskReceiptSamePaths(Object.keys(before ?? {}), TASK_STATUS_DOCUMENT_PATHS) &&
        taskReceiptSamePaths(Object.keys(after ?? {}), TASK_STATUS_DOCUMENT_PATHS),
      "document inventory must be exactly README, canonical tasks and Arena ledger"
    )
    for (const p of TASK_STATUS_DOCUMENT_PATHS) {
      const d = r.documents?.[p]
      need(
        taskReceiptSamePaths(Object.keys(d ?? {}), ["before_sha256", "after_sha256"]) &&
          taskReceiptSha256(d?.before_sha256) &&
          taskReceiptSha256(d?.after_sha256),
        `invalid document digest ${p}`
      )
      need(
        typeof before?.[p] === "string" &&
          typeof after?.[p] === "string" &&
          taskReceiptHash(before[p]) === d?.before_sha256 &&
          taskReceiptHash(after[p]) === d?.after_sha256,
        `exact approved bytes mismatch ${p}`
      )
    }
    const ref = r.authorization_ref?.match(
      /^https:\/\/github\.com\/bynanci\/courtside-tw\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)$/u
    )
    need(
      ref &&
        a?.status === "VERIFIED" &&
        a?.source === "github-api" &&
        a?.html_url === r.authorization_ref &&
        a?.issue_url === `https://api.github.com/repos/bynanci/courtside-tw/issues/${ref?.[1]}` &&
        a?.user_login === "bynanci" &&
        a?.author_association === "OWNER" &&
        Number.isFinite(Date.parse(a?.created_at)) &&
        a?.created_at === a?.updated_at,
      "requires the exact unedited repository OWNER comment"
    )
    const expected = {
      ...r,
      schema_version: "courtside-task-status-reconciliation-owner-authorization/v1",
      decision: "TASK_STATUS_RECONCILIATION_ACCEPTED",
      accepted_by: "bynanci"
    }
    delete expected.authorization_ref
    need(
      taskReceiptEqual(taskReceiptContract(a?.body), expected),
      "OWNER contract differs from the complete receipt"
    )
    const oldTasks = taskStatusSignatures(before?.[TASK_STATUS_DOCUMENT_PATHS[1]])
    const newTasks = taskStatusSignatures(after?.[TASK_STATUS_DOCUMENT_PATHS[1]])
    need(
      oldTasks.checkbox === newTasks.checkbox &&
        oldTasks.checkbox === r.canonical_checkbox_signature_sha256,
      "canonical task checkbox signature changed"
    )
    need(
      oldTasks.definition === newTasks.definition &&
        oldTasks.definition === r.task_definition_signature_sha256,
      "canonical task definitions changed"
    )
    const uiRows = (text) => [...text.matchAll(/^- \[([ xX])\] (UIR-\d{3})\b([^\n]*)/gmu)]
    const oldUi = uiRows(before[TASK_STATUS_DOCUMENT_PATHS[2]])
    const newUi = uiRows(after[TASK_STATUS_DOCUMENT_PATHS[2]])
    need(
      taskReceiptEqual(
        oldUi.map((r) => r[2]),
        Array.from({ length: 17 }, (_, i) => `UIR-${String(i + 1).padStart(3, "0")}`)
      ) && oldUi.length === newUi.length,
      "UI ledger task inventory changed"
    )
    for (let i = 0; i < oldUi.length; i++) {
      if (oldUi[i][2] !== "UIR-017")
        need(oldUi[i][0] === newUi[i]?.[0], "only UIR-017 may change in the UI task rows")
      else {
        const definition =
          "UIR-017 — Merge the exact reviewed head and record the protected-main receipt."
        need(
          newUi[i]?.[2] === "UIR-017" &&
            oldUi[i][0].slice(6).startsWith(definition) &&
            newUi[i][0].slice(6).startsWith(definition) &&
            newUi[i][1].toLowerCase() === "x",
          "UIR-017 completion definition must be preserved"
        )
      }
    }
    const evidence = r.completion_evidence,
      ui = input.mergedUiPullRequest
    need(
      taskReceiptSamePaths(Object.keys(evidence ?? {}), [
        "pull_request",
        "head_sha",
        "merge_sha"
      ]) &&
        evidence.pull_request === 187 &&
        taskReceiptSha(evidence.head_sha) &&
        taskReceiptSha(evidence.merge_sha) &&
        ui?.number === 187 &&
        ui?.state === "closed" &&
        ui?.merged === true &&
        ui?.head?.sha === evidence.head_sha &&
        ui?.merge_commit_sha === evidence.merge_sha &&
        input.uiMergeAncestorOfBase === true,
      "UI completion requires the exact merged PR #187 already in the authorized base"
    )
    need(
      pr?.number === r.pull_request &&
        pr?.head?.ref === r.branch &&
        pr?.head?.repo?.full_name === r.repository &&
        pr?.base?.repo?.full_name === r.repository &&
        pr?.base?.ref === "main" &&
        pr?.base?.sha === r.base_sha &&
        taskReceiptSha(pr?.head?.sha),
      "live same-repository PR binding differs"
    )
    const closure = [
      ...TASK_STATUS_DOCUMENT_PATHS.filter((p) => before[p] !== after[p]),
      TASK_STATUS_RECEIPT_PATH
    ]
    need(
      taskReceiptSamePaths(input.changedPaths, closure) &&
        taskReceiptSamePaths(input.candidateHistoryPaths, closure) &&
        input.candidateLinearHistory === true &&
        input.candidateCommittedAfterAuthorization === true,
      "requires exact closed documentation history after authorization"
    )
    if (mode === "CANDIDATE") {
      need(
        input.protectedMainSha === r.base_sha &&
          input.currentHead === pr?.head?.sha &&
          pr?.state === "open" &&
          pr?.merged === false,
        "candidate must bind the current protected base and exact open PR head"
      )
      allowedPaths = closure
    } else {
      need(
        pr?.state === "closed" &&
          pr?.merged === true &&
          taskReceiptSha(pr?.merge_commit_sha) &&
          input.receiptMergeAncestorOfBase === true,
        "accepted snapshot requires a merged receipt ancestor of the evaluated base"
      )
    }
    baseTasksSha256 = r.documents[TASK_STATUS_DOCUMENT_PATHS[1]].before_sha256
    targetTasksSha256 = r.documents[TASK_STATUS_DOCUMENT_PATHS[1]].after_sha256
  } catch (error) {
    errors.push(`task-status receipt: ${error.message}`)
  }
  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    mode: input.mode ?? "CANDIDATE",
    allowedPaths: errors.length ? [] : allowedPaths,
    baseTasksSha256,
    targetTasksSha256
  }
}
// TASK_STATUS_PURE_END

const TASK_RECEIPT_BOOTSTRAP_PATHS = Object.freeze([
  "scripts/task-status-receipts.mjs",
  "scripts/test/task-status-receipts.test.mjs",
  "scripts/validate-traceability.mjs",
  "scripts/test/validate-traceability.test.mjs",
  ".github/workflows/t086-required-gate.yml",
  "scripts/test/task-status-gate.test.mjs"
])

const TASK_RECEIPT_BOOTSTRAP_BASE = "ac92f88a7267736325519a8bf12dc6b9ee2bcb86"
const TASK_RECEIPT_BOOTSTRAP_BRANCH = "codex/complete-tasks-receipt-validation"
const TASK_RECEIPT_BOOTSTRAP_REF =
  "https://github.com/bynanci/courtside-tw/issues/196#issuecomment-5645012776"
const TASK_RECEIPT_BOOTSTRAP_TIME = "2026-09-12T09:28:10Z"

function validateTaskReceiptBootstrap(input = {}) {
  const errors = []
  const need = (ok, reason) => {
    if (!ok) errors.push(`task-status receipt bootstrap: ${reason}`)
  }
  const a = input.authorization,
    pr = input.pullRequest
  need(
    a?.status === "VERIFIED" &&
      a?.source === "github-api" &&
      a?.html_url === TASK_RECEIPT_BOOTSTRAP_REF &&
      a?.issue_url === "https://api.github.com/repos/bynanci/courtside-tw/issues/196" &&
      a?.user_login === "bynanci" &&
      a?.author_association === "OWNER" &&
      a?.created_at === TASK_RECEIPT_BOOTSTRAP_TIME &&
      a?.updated_at === TASK_RECEIPT_BOOTSTRAP_TIME &&
      typeof a?.body === "string" &&
      taskReceiptHash(a.body) ===
        "b0caa224096b98f788577b63e22bf98b4e6bdb286a3abe0e77368ade7e789398",
    "requires the exact immutable #196 OWNER comment"
  )
  need(
    input.baseSha === TASK_RECEIPT_BOOTSTRAP_BASE &&
      input.baseTreeSha === "9bff16cfc654a8d506bdc4ecc7ae989595525f79" &&
      input.gitClean === true &&
      input.baseAncestor === true &&
      taskReceiptSha(input.currentHead) &&
      taskReceiptSha(input.headTreeSha),
    "exact protected base and clean Git binding required"
  )
  need(
    taskReceiptSamePaths(input.changedPaths, TASK_RECEIPT_BOOTSTRAP_PATHS) &&
      taskReceiptSamePaths(input.historyPaths, TASK_RECEIPT_BOOTSTRAP_PATHS) &&
      input.linearHistory === true &&
      input.commitsAfterAuthorization === true &&
      input.regularFiles === true,
    "requires the exact six-path post-dispatch linear history"
  )
  need(
    Number.isSafeInteger(pr?.number) &&
      pr.number > 0 &&
      pr?.head?.ref === TASK_RECEIPT_BOOTSTRAP_BRANCH &&
      pr?.head?.repo?.full_name === "bynanci/courtside-tw" &&
      pr?.base?.repo?.full_name === "bynanci/courtside-tw" &&
      pr?.base?.ref === "main" &&
      pr?.base?.sha === TASK_RECEIPT_BOOTSTRAP_BASE &&
      input.protectedMain?.name === "main" &&
      input.protectedMain?.protected === true,
    "requires the live same-repository bootstrap PR and protected main"
  )
  if (input.protectedPush === true) {
    need(
      pr?.state === "closed" &&
        pr?.merged === true &&
        pr?.draft === false &&
        pr?.merge_commit_sha === input.currentHead &&
        input.reviewedHeadTreeSha === input.headTreeSha &&
        taskReceiptEqual(input.headParents, [TASK_RECEIPT_BOOTSTRAP_BASE]) &&
        input.protectedMain?.commit?.sha === input.currentHead,
      "requires the exact reviewed same-tree single-parent protected squash"
    )
  } else {
    need(
      pr?.state === "open" &&
        pr?.merged === false &&
        pr?.head?.sha === input.currentHead &&
        input.protectedMain?.commit?.sha === TASK_RECEIPT_BOOTSTRAP_BASE,
      "requires the exact open bootstrap head on current main"
    )
  }
  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    mode: "BOOTSTRAP",
    allowedPaths: errors.length ? [] : [...TASK_RECEIPT_BOOTSTRAP_PATHS]
  }
}

function normalizeTaskReceiptComment(comment) {
  return {
    status: "VERIFIED",
    source: "github-api",
    html_url: comment?.html_url,
    issue_url: comment?.issue_url,
    user_login: comment?.user?.login,
    author_association: comment?.author_association,
    created_at: comment?.created_at,
    updated_at: comment?.updated_at,
    body: comment?.body
  }
}

function taskReceiptGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15000
  })
}

const taskReceiptFetchScript = [
  "const u=process.argv[1];if(!u.startsWith('https://api.github.com/repos/bynanci/courtside-tw/'))throw Error('invalid API origin');",
  "const headers={Accept:'application/vnd.github+json','User-Agent':'courtside-task-status-receipt','X-GitHub-Api-Version':'2022-11-28'};",
  "const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;if(token)headers.Authorization='Bearer '+token;",
  "const r=await fetch(u,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GitHub status '+r.status);",
  "const t=await r.text();if(Buffer.byteLength(t)>4*1024*1024)throw Error('GitHub response exceeds limit');process.stdout.write(t);"
].join("\n")

function fetchTaskReceiptJson(url, environment) {
  return parseTaskReceiptJson(
    execFileSync(process.execPath, ["--input-type=module", "--eval", taskReceiptFetchScript, url], {
      encoding: "utf8",
      env: {
        PATH: environment.PATH ?? "",
        GITHUB_TOKEN: environment.GITHUB_TOKEN ?? "",
        GH_TOKEN: environment.GH_TOKEN ?? ""
      },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15000
    })
  )
}

function inspectTaskReceiptHistory({ git, fetchJson, api, base, head, allowedPaths }) {
  if (!taskReceiptSha(base) || !taskReceiptSha(head))
    throw new Error("reviewed receipt history has invalid source identifiers")
  let localHead = false
  try {
    git(["cat-file", "-e", `${head}^{commit}`])
    localHead = true
  } catch {
    // A deleted source branch need not leave its reviewed commits in a fresh checkout.
  }
  let commits
  if (localHead) {
    git(["merge-base", "--is-ancestor", base, head])
    const shas = git(["rev-list", "--reverse", `${base}..${head}`])
      .trim()
      .split("\n")
      .filter(Boolean)
    if (shas.length < 1 || shas.length > 250)
      throw new Error("reviewed receipt history is empty or exceeds 250 commits")
    commits = shas.map((sha) => {
      const [parents, authoredAt, committedAt] = git(["show", "-s", "--format=%P%n%aI%n%cI", sha])
        .trim()
        .split("\n")
      const changes = git([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "--no-renames",
        "-r",
        "-z",
        sha,
        "--"
      ]).split("\0")
      if (changes.pop() !== "" || changes.length % 2 !== 0)
        throw new Error("reviewed receipt changes are incomplete")
      const files = []
      for (let index = 0; index < changes.length; index += 2)
        files.push({
          filename: changes[index + 1],
          status: { A: "added", M: "modified" }[changes[index]]
        })
      return {
        sha,
        parents: parents.split(" ").map((parent) => ({ sha: parent })),
        commit: { author: { date: authoredAt }, committer: { date: committedAt } },
        files
      }
    })
  } else {
    commits = []
    let total = null
    for (let page = 1; page <= 3; page++) {
      const comparison = fetchJson(`${api}/compare/${base}...${head}?per_page=100&page=${page}`)
      if (
        comparison?.merge_base_commit?.sha !== base ||
        !Number.isSafeInteger(comparison.total_commits) ||
        comparison.total_commits < 1 ||
        comparison.total_commits > 250 ||
        (total !== null && total !== comparison.total_commits) ||
        !Array.isArray(comparison.commits)
      )
        throw new Error("reviewed receipt comparison is incomplete or lacks base ancestry")
      total = comparison.total_commits
      if (comparison.commits.length !== Math.min(100, total - commits.length))
        throw new Error("reviewed receipt comparison page is incomplete")
      commits.push(...comparison.commits)
      if (commits.length === total) break
    }
    commits = commits.map((commit) => {
      if (!taskReceiptSha(commit?.sha))
        throw new Error("reviewed receipt commit identity is invalid")
      const detail = fetchJson(`${api}/commits/${commit.sha}?per_page=100&page=1`)
      if (
        detail?.sha !== commit.sha ||
        !Array.isArray(detail.parents) ||
        !Array.isArray(commit.parents) ||
        !taskReceiptEqual(
          detail.parents.map((parent) => parent?.sha),
          commit.parents.map((parent) => parent?.sha)
        )
      )
        throw new Error("reviewed receipt commit read-back differs from comparison")
      return detail
    })
  }
  const paths = new Set()
  let previous = base
  for (const commit of commits) {
    if (
      !taskReceiptSha(commit.sha) ||
      commit.parents?.length !== 1 ||
      commit.parents[0]?.sha !== previous
    )
      throw new Error("reviewed receipt history is not a linear sequence from the authorized base")
    if (
      !Array.isArray(commit.files) ||
      commit.files.length < 1 ||
      commit.files.length > allowedPaths.length ||
      new Set(commit.files.map((file) => file?.filename)).size !== commit.files.length ||
      commit.files.some(
        (file) =>
          !allowedPaths.includes(file?.filename) ||
          !["added", "modified"].includes(file?.status) ||
          file.previous_filename !== undefined
      )
    )
      throw new Error("reviewed receipt history contains changes outside the authorized closure")
    if (
      !Number.isFinite(Date.parse(commit.commit?.author?.date)) ||
      !Number.isFinite(Date.parse(commit.commit?.committer?.date))
    )
      throw new Error("reviewed receipt history has invalid commit times")
    for (const file of commit.files) paths.add(file.filename)
    previous = commit.sha
  }
  if (previous !== head)
    throw new Error("reviewed receipt history does not close at the original PR head")
  return { paths: [...paths].sort(), commits }
}

function inspectTaskReceiptPolicy(
  root,
  {
    inspection,
    environment = process.env,
    fetchJson = (url) => fetchTaskReceiptJson(url, environment)
  } = {}
) {
  const api = "https://api.github.com/repos/bynanci/courtside-tw"
  const git = (args) => taskReceiptGit(root, args)
  const lines = (args) => git(args).trim().split("\n").filter(Boolean)
  const show = (sha, p) => git(["show", `${sha}:${p}`])
  const optionalShow = (sha, p) => {
    try {
      return show(sha, p)
    } catch {
      return null
    }
  }
  const ancestor = (a, b) => {
    try {
      git(["merge-base", "--is-ancestor", a, b])
      return true
    } catch {
      return false
    }
  }
  const currentHead = inspection?.head,
    baseSha = inspection?.change_base_sha
  const receiptText = taskReceiptSha(currentHead)
    ? optionalShow(currentHead, TASK_STATUS_RECEIPT_PATH)
    : null
  const sourceBranch =
    environment.GITHUB_HEAD_REF ||
    (() => {
      try {
        return git(["branch", "--show-current"]).trim()
      } catch {
        return ""
      }
    })()
  const bootstrapRequested =
    baseSha === TASK_RECEIPT_BOOTSTRAP_BASE &&
    (sourceBranch === TASK_RECEIPT_BOOTSTRAP_BRANCH ||
      inspection?.changedPaths?.some(
        (p) =>
          TASK_RECEIPT_BOOTSTRAP_PATHS.includes(p) &&
          p !== "scripts/validate-traceability.mjs" &&
          p !== "scripts/test/validate-traceability.test.mjs"
      ))
  if (!receiptText && !bootstrapRequested) return null
  try {
    if (!taskReceiptSha(currentHead) || !taskReceiptSha(baseSha))
      throw new Error("missing exact Git source/base")
    git(["diff-index", "--quiet", "HEAD", "--"])
    const protectedMain = fetchJson(`${api}/branches/main`)
    if (protectedMain?.name !== "main" || protectedMain?.protected !== true)
      throw new Error("protected main read-back is unavailable")
    const changedPaths = inspection.changedPaths
    const diff = (base, head) =>
      lines(["diff", "--name-only", "--no-renames", base, head, "--"]).sort()
    const regular = (head, paths) => {
      const entries = git(["ls-tree", "-r", "-z", head, "--", ...paths])
        .split("\0")
        .filter(Boolean)
      return (
        entries.length === paths.length &&
        entries.every((e) => /^100644 blob [a-f0-9]{40}\t/u.test(e))
      )
    }
    const headTreeSha = git(["rev-parse", `${currentHead}^{tree}`]).trim()
    const headParents = lines(["show", "-s", "--format=%P", currentHead]).flatMap((s) =>
      s.split(" ")
    )
    const protectedPush = environment.GITHUB_EVENT_NAME === "push"
    if (bootstrapRequested) {
      const authorization = normalizeTaskReceiptComment(
        fetchJson(`${api}/issues/comments/5645012776`)
      )
      let number = null
      if (environment.GITHUB_EVENT_PATH && environment.GITHUB_EVENT_NAME === "pull_request")
        number = parseTaskReceiptJson(fs.readFileSync(environment.GITHUB_EVENT_PATH, "utf8"))
          ?.pull_request?.number
      else if (protectedPush)
        number = Number(
          git(["show", "-s", "--format=%s", currentHead])
            .trim()
            .match(/\(#([1-9]\d*)\)$/u)?.[1]
        )
      else {
        const prs = fetchJson(
          `${api}/pulls?state=open&head=bynanci:${encodeURIComponent(TASK_RECEIPT_BOOTSTRAP_BRANCH)}&base=main&per_page=100`
        )
        if (!Array.isArray(prs) || prs.length !== 1)
          throw new Error("bootstrap live PR is missing or ambiguous")
        number = prs[0].number
      }
      if (!Number.isSafeInteger(number) || number < 1)
        throw new Error("bootstrap PR identity unavailable")
      const pullRequest = fetchJson(`${api}/pulls/${number}`)
      const reviewedHistory = inspectTaskReceiptHistory({
        git,
        fetchJson,
        api,
        base: baseSha,
        head: protectedPush ? pullRequest?.head?.sha : currentHead,
        allowedPaths: TASK_RECEIPT_BOOTSTRAP_PATHS
      })
      const input = {
        authorization,
        pullRequest,
        protectedMain,
        baseSha,
        currentHead,
        headTreeSha,
        headParents,
        protectedPush,
        baseTreeSha: git(["rev-parse", `${baseSha}^{tree}`]).trim(),
        gitClean: true,
        baseAncestor: ancestor(baseSha, currentHead),
        changedPaths,
        historyPaths: reviewedHistory.paths,
        regularFiles: regular(currentHead, TASK_RECEIPT_BOOTSTRAP_PATHS),
        linearHistory: true,
        commitsAfterAuthorization: reviewedHistory.commits.every((commit) =>
          [commit.commit.author.date, commit.commit.committer.date].every(
            (time) => Date.parse(time) > Date.parse(TASK_RECEIPT_BOOTSTRAP_TIME)
          )
        ),
        reviewedHeadTreeSha: protectedPush
          ? fetchJson(`${api}/git/commits/${pullRequest.head.sha}`)?.tree?.sha
          : null
      }
      return { mode: "BOOTSTRAP", input, binding: { head: currentHead, base: baseSha } }
    }

    const receipt = parseTaskReceiptJson(receiptText)
    const ref = receipt?.authorization_ref?.match(
      /^https:\/\/github\.com\/bynanci\/courtside-tw\/issues\/[1-9]\d*#issuecomment-([1-9]\d*)$/u
    )
    if (
      !ref ||
      !Number.isSafeInteger(receipt.pull_request) ||
      receipt.pull_request < 1 ||
      !taskReceiptSha(receipt.base_sha)
    )
      throw new Error("invalid receipt source identifiers")
    const authorization = normalizeTaskReceiptComment(fetchJson(`${api}/issues/comments/${ref[1]}`))
    const pullRequest = fetchJson(`${api}/pulls/${receipt.pull_request}`)
    const mergedUiPullRequest = fetchJson(`${api}/pulls/187`)
    const baseReceiptText = optionalShow(baseSha, TASK_STATUS_RECEIPT_PATH)
    const unchangedReceipt = baseReceiptText === receiptText
    const mode = unchangedReceipt ? "ACCEPTED_BASE" : protectedPush ? "RECEIPT_PUSH" : "CANDIDATE"
    const sourceHead = mode === "CANDIDATE" ? currentHead : pullRequest.merge_commit_sha
    if (!taskReceiptSha(sourceHead)) throw new Error("merged receipt source commit is unavailable")
    const reviewedHistory = inspectTaskReceiptHistory({
      git,
      fetchJson,
      api,
      base: receipt.base_sha,
      head: mode === "CANDIDATE" ? currentHead : pullRequest?.head?.sha,
      allowedPaths: [...TASK_STATUS_DOCUMENT_PATHS, TASK_STATUS_RECEIPT_PATH]
    })
    if (mode !== "CANDIDATE") {
      if (show(sourceHead, TASK_STATUS_RECEIPT_PATH) !== receiptText)
        throw new Error("receipt differs from its merged source")
      const reviewedTree = fetchJson(`${api}/git/commits/${pullRequest.head.sha}`)?.tree?.sha
      if (git(["rev-parse", `${sourceHead}^{tree}`]).trim() !== reviewedTree)
        throw new Error("merged receipt tree differs from the reviewed PR")
      if (
        !taskReceiptEqual(git(["show", "-s", "--format=%P", sourceHead]).trim().split(" "), [
          receipt.base_sha
        ])
      )
        throw new Error("merged receipt is not its reviewed single-parent squash")
      if (
        mode === "RECEIPT_PUSH" &&
        (sourceHead !== currentHead ||
          baseSha !== receipt.base_sha ||
          !taskReceiptEqual(headParents, [baseSha]))
      )
        throw new Error("receipt push is not its exact reviewed single-parent squash")
    }
    if (!regular(sourceHead, [...TASK_STATUS_DOCUMENT_PATHS, TASK_STATUS_RECEIPT_PATH]))
      throw new Error("receipt documents must be regular Git files")
    const sourcePaths = mode === "CANDIDATE" ? changedPaths : diff(receipt.base_sha, sourceHead)
    const input = {
      mode: mode === "CANDIDATE" ? "CANDIDATE" : "ACCEPTED_BASE",
      receipt,
      authorization,
      baseDocuments: Object.fromEntries(
        TASK_STATUS_DOCUMENT_PATHS.map((p) => [p, show(receipt.base_sha, p)])
      ),
      targetDocuments: Object.fromEntries(
        TASK_STATUS_DOCUMENT_PATHS.map((p) => [p, show(sourceHead, p)])
      ),
      pullRequest,
      mergedUiPullRequest,
      uiMergeAncestorOfBase: ancestor(receipt.completion_evidence?.merge_sha, receipt.base_sha),
      protectedMainSha: protectedMain.commit.sha,
      currentHead,
      changedPaths: sourcePaths,
      candidateHistoryPaths: reviewedHistory.paths,
      candidateLinearHistory: true,
      candidateCommittedAfterAuthorization:
        Date.parse(reviewedHistory.commits.at(-1).commit.committer.date) >
        Date.parse(authorization.created_at),
      receiptMergeAncestorOfBase: ancestor(
        sourceHead,
        mode === "RECEIPT_PUSH" ? currentHead : baseSha
      )
    }
    if (mode === "CANDIDATE" && baseSha !== receipt.base_sha)
      throw new Error("receipt base differs from evaluated change base")
    return {
      mode,
      input,
      binding: { head: currentHead, base: baseSha, receiptText, baseReceiptText }
    }
  } catch (error) {
    return { mode: "INVALID", errors: [`task-status receipt inspection: ${error.message}`] }
  }
}

function validateTaskReceiptPolicy(
  readback,
  { currentHead, changeBaseSha, changedPaths, tasksText, changeBaseTasksText, gitBinding } = {}
) {
  if (readback == null)
    return { status: "NOT_REQUESTED", mode: "NONE", errors: [], allowedPaths: [] }
  const fail = (reason) => ({
    status: "FAIL",
    mode: readback.mode ?? "INVALID",
    errors: [`task-status receipt: ${reason}`],
    allowedPaths: []
  })
  if (
    !readback.input ||
    readback.binding?.head !== currentHead ||
    readback.binding?.base !== changeBaseSha ||
    gitBinding?.status !== "CLEAN" ||
    gitBinding?.head !== currentHead ||
    gitBinding?.change_base_sha !== changeBaseSha ||
    gitBinding?.change_base_ancestor !== true
  )
    return fail("authenticated receipt content and clean current Git binding are required")
  const result =
    readback.mode === "BOOTSTRAP"
      ? validateTaskReceiptBootstrap(readback.input)
      : validateTaskStatusReceipt(readback.input)
  if (result.status !== "PASS") return result
  if (readback.mode === "BOOTSTRAP") {
    if (
      !taskReceiptSamePaths(changedPaths, readback.input.changedPaths) ||
      readback.input.currentHead !== currentHead ||
      readback.input.baseSha !== changeBaseSha
    )
      return fail("bootstrap evaluated scope drifted")
    return result
  }
  const target = result.targetTasksSha256
  if (taskReceiptHash(tasksText ?? "") !== target)
    return fail("current tasks do not equal the approved receipt snapshot")
  if (readback.mode === "ACCEPTED_BASE") {
    if (
      taskReceiptHash(changeBaseTasksText ?? "") !== target ||
      readback.binding.receiptText !== readback.binding.baseReceiptText
    )
      return fail("accepted base receipt or task snapshot changed")
    return { ...result, mode: "ACCEPTED_BASE", baseTasksSha256: target, allowedPaths: [] }
  }
  if (readback.mode !== "CANDIDATE" && readback.mode !== "RECEIPT_PUSH")
    return fail("invalid receipt policy mode")
  if (
    taskReceiptHash(changeBaseTasksText ?? "") !== result.baseTasksSha256 ||
    !taskReceiptSamePaths(changedPaths, readback.input.changedPaths)
  )
    return fail("candidate base or closed document scope differs")
  return { ...result, mode: readback.mode, allowedPaths: [...readback.input.changedPaths] }
}

export {
  TASK_STATUS_RECEIPT_PATH,
  TASK_STATUS_DOCUMENT_PATHS,
  TASK_STATUS_RECEIPT_SCHEMA,
  TASK_RECEIPT_BOOTSTRAP_PATHS,
  TASK_RECEIPT_BOOTSTRAP_BASE,
  TASK_RECEIPT_BOOTSTRAP_BRANCH,
  TASK_RECEIPT_BOOTSTRAP_REF,
  TASK_STATUS_BOUNDARIES,
  taskReceiptHash,
  taskStatusSignatures,
  parseTaskReceiptJson,
  inspectTaskReceiptPolicy,
  validateTaskReceiptPolicy,
  validateTaskStatusReceipt,
  validateTaskReceiptBootstrap
}
