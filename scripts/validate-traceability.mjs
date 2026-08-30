/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"
import typescriptPlugin from "prettier/plugins/typescript"
import YAML from "yaml"

export const TRACEABILITY_SCHEMA = "courtside-traceability/v1"
export const COMPLETION_RECEIPT_SCHEMA = "courtside-t085-completion-receipt/v1"
export const COMPLETION_RECEIPT_PATH = ".loop/evidence/t085-completion-receipt.json"
export const ACCEPTED_IMPLEMENTATION_HEAD_SHA = "27b955581a909e292ae4fe6c1fb05de0e94753da"
export const ACCEPTED_IMPLEMENTATION_MERGE_SHA = "a2491b81066ac225a0b5d2dab93be79fb6dfbe65"
export const ACCEPTED_CI_RUN_ID = 33226451857
export const ACCEPTED_SECURITY_RUN_ID = 33226451860
export const ACCEPTED_FRONTEND_ARTIFACT_ID = 9707044002
export const ACCEPTED_FRONTEND_ARCHIVE_SHA256 =
  "88baa1d7bd1e3ef08193b7d65799484d16363677c7c446001fa531efb6a8706f"
export const ACCEPTED_EXACT_HEAD_ARTIFACT_SHA256 =
  "8126aebe79e1cacbbdcac5136373cc2cfa889b9c09264e1ce75cbf06d506e803"
export const ACCEPTED_TRACEABILITY_REPORT_SHA256 =
  "5e6201ee0b646e0d9c619b440cccf0dd6928bede6869032fa81d06d05bd9a440"
export const PRE_REMEDIATION_TRACEABILITY_SHA256 =
  "026581386d6e99e9bf1a2f124a9360e9cfd65088b8734177759801caa0723bed"
export const ACCEPTED_TRACEABILITY_SHA256 =
  "204662214eada892332d1ddbeab8d0b8037cfc5477d9152d6fb3a61e56832b79"
export const ACCEPTED_PENDING_TASKS_SHA256 =
  "23190fbeab15b181800ddb275478f058cc0a0514e581b8f3c2aaeb82c184b1f3"
export const ACCEPTED_COMPLETED_TASKS_SHA256 =
  "90b950e3522e9d6e119f57d92d4ab9f8d3fe013b456450415a8abbdd70f446c3"
export const ACCEPTED_RECEIPT_OWNER = "bynanci"
export const ACCEPTED_RECEIPT_AUTHORIZATION_REF =
  "https://github.com/bynanci/courtside-tw/issues/145#issuecomment-5459765126"
export const ACCEPTED_RECEIPT_AUTHORIZATION_RECORDED_AT = "2026-08-29T02:24:09Z"
export const ACCEPTED_IMPLEMENTATION_CHANGED_PATHS = Object.freeze([
  ".github/workflows/ci.yml",
  ".loop/evidence/t085-dispatch.json",
  ".loop/evidence/t085-local.json",
  ".loop/evidence/t085-red.json",
  ".loop/evidence/t085-review.json",
  ".loop/t085-traceability-ledger.json",
  ".loop/t085-traceability.yaml",
  "Makefile",
  "package.json",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs",
  "specs/001-taiwan-basketball-magazine-ebook/plan.md",
  "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
])
export const POST_T085_REMEDIATION_BASE_SHA = "d99df471a08608bb8b6da609e17095d285c11489"
export const POST_T085_REMEDIATION_CHANGED_PATHS = Object.freeze([
  ".loop/evidence/t085-review.json",
  "apps/web/scripts/android-chrome-performance-smoke.mjs",
  "apps/web/tests/unit/android-creative-timeline.test.ts",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs",
  "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
])
export const CONTRACT_START = "<!-- t085:contract:start -->"
export const CONTRACT_END = "<!-- t085:contract:end -->"
export const AUTHORIZED_BASE_SHA = "3fc14dd29b216ce46e4d364ceaec79a971dcef44"
export const REVIEW_BASE_SHA = "84db3db95aa596eb317b71c4eea0926fc1fc15ce"

const requirementPattern = /^- \*\*((?:FR|SC)-\d{3})\*\*:/gm
const taskPattern = /^- \[([ xX])\] (T\d{3})\b/gm
const evidenceStates = new Set([
  "VERIFIED",
  "PARTIAL",
  "MISSING",
  "HUMAN_OPEN",
  "EXTERNAL_OPEN",
  "PROXY_ONLY",
  "PLANNED_BLOCKED"
])
const implementationStates = new Set(["COMPLETE", "PLANNED", "NOT_APPLICABLE"])
const taskClassifications = new Set([
  "FOUNDATION",
  "TEST",
  "IMPLEMENTATION",
  "QUALITY_GATE",
  "TRACEABILITY",
  "RELEASE_GATE",
  "ALIGNMENT",
  "FUTURE"
])
const deviationStates = new Set(["OPEN", "ACCEPTED", "RESOLVED"])
const forbiddenProofPaths = new Set([
  "specs/001-taiwan-basketball-magazine-ebook/traceability.md",
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md"
])
const proofKinds = new Set([
  "REPOSITORY_PROOF",
  "HUMAN_RECEIPT",
  "EXTERNAL_METRIC_RECEIPT",
  "CI_STABILITY_RECEIPT"
])
const receiptProofSchemas = new Map([
  ["HUMAN_RECEIPT", "courtside-human-acceptance/v1"],
  ["EXTERNAL_METRIC_RECEIPT", "courtside-external-metric/v1"],
  ["CI_STABILITY_RECEIPT", "courtside-ci-stability/v1"]
])
const t085RepositoryReviewReceipt = Object.freeze({
  path: ".loop/evidence/t085-review.json",
  schema_version: "courtside-t085-review/v1",
  task: "T085",
  repository: "bynanci/courtside-tw",
  issue: "https://github.com/bynanci/courtside-tw/issues/145",
  requirement_id: "SC-010",
  historical_task: "T081",
  artifact_id: 9414805375,
  artifact_name: "ci-dependency-reports",
  artifact_digest: "sha256:2572e7202c4f8b5429654c7f052ebea5e88e20650c845863925ea54e1264a5b7",
  source_head_sha: "3fcc7f2f29e5c3d41370fffcebd34d925c4c9911",
  workflow: "CI",
  workflow_run_id: 32390737392,
  workflow_run_number: 816,
  exact_head_manifest_sha256: "01eff14b71a4a9592dc82c16460ca05be834566b9b5517df15acaf654b3d119a",
  restore_receipt_sha256: "e43cdc024bb9317ffbbf4620de237c9578470a5bb38633c798309da8be930210",
  restore_receipt: Object.freeze({
    result: "PASS",
    release_ready: true,
    rpo_hours: 0.001,
    rpo_limit_hours: 24,
    rto_minutes: 0.037,
    rto_limit_minutes: 240,
    media_assets: 2,
    media_variants: 2,
    checksum_sample_requested: 2,
    checksum_sample_verified: 2
  }),
  scope_review: Object.freeze({
    pr_diff_paths_expected: 13,
    runtime_files_added_to_pr_diff: false,
    workflow_changed: true,
    t085_checked: false,
    ready_or_merge_performed: false,
    forbidden_scope_changed: false
  }),
  post_merge_scope_correction: Object.freeze({
    schema_version: "courtside-t085-review-correction/v1",
    recorded_at: "2026-08-29T05:34:16Z",
    source: "https://github.com/bynanci/courtside-tw/pull/149#discussion_r3885070244",
    target: "current_base_reconciliation_review.scope_review",
    supersedes: Object.freeze({
      pr_diff_paths_expected: 12,
      workflow_changed: false
    }),
    corrected: Object.freeze({
      pr_diff_paths_expected: 13,
      workflow_changed: true
    }),
    reason:
      "The accepted PR149 implementation scope contains 13 paths, including .github/workflows/ci.yml."
  })
})
const implementationCheckedTasks = new Set([
  ...Array.from({ length: 84 }, (_, index) => `T${String(index + 1).padStart(3, "0")}`),
  "T097"
])
const receiptChangedPaths = [
  COMPLETION_RECEIPT_PATH,
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md"
]
const t086LockedPaths = new Set([".github/workflows/release.yml", "docs/release/beta-checklist.md"])

function isT086LockedPath(changedPath) {
  return (
    t086LockedPaths.has(changedPath) ||
    changedPath.startsWith(".loop/evidence/t086") ||
    changedPath.startsWith(".loop/t086")
  )
}

function isPostT085ResearchDocumentationPath(changedPath) {
  return changedPath.startsWith("docs/research/")
}
const authorizedChangedPaths = new Set(ACCEPTED_IMPLEMENTATION_CHANGED_PATHS)
const receiptSupportChangedPaths = new Set([
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
])
const postT085RemediationChangedPaths = new Set(POST_T085_REMEDIATION_CHANGED_PATHS)
const expectedDispatch = {
  schema_version: "courtside-t085-dispatch/v1",
  recorded_at: "2026-08-25T12:42:58Z",
  repository: "bynanci/courtside-tw",
  issue: "https://github.com/bynanci/courtside-tw/issues/145",
  branch: "task/t085-cross-artifact-traceability",
  base: {
    branch: "main",
    sha: AUTHORIZED_BASE_SHA,
    protected: true,
    t084_complete: true,
    t085_complete: false,
    t086_complete: false,
    open_pull_requests_at_dispatch: 0
  },
  inventory: {
    functional_requirements: 74,
    success_criteria: 23,
    tasks: 112,
    checked_tasks: 85,
    unchecked_tasks: 27,
    existing_traceability_artifact: false
  },
  authorized: [
    "T085 traceability contract and human-readable matrix",
    "deterministic validator and mutation tests",
    "plan documentation-tree and traceability-status correction",
    "T085-only Graphify evidence",
    "draft pull request and exact-head CI/Security/artifact/read-back"
  ],
  forbidden: [
    "ready-for-review transition, protected merge or T085 completion receipt",
    "T086 or later task dispatch or modification",
    "participant research execution",
    "Web3, wallet, chain, IPFS or credential implementation",
    "production activation, provider configuration, credentials, secrets or external writes",
    "runtime remediation for documentation-only locator drift"
  ],
  tests_first: {
    red_claim:
      "The validator and its mutation suite pass, then the repository contract fails only because traceability.md is absent.",
    green_claim:
      "The same validator passes after an exact 97-requirement matrix, 112-task reverse ledger and explicit deviation register are added."
  },
  terminal_policy:
    "Stop at needs_human after draft-head CI/Security, artifact digest, review-thread and protected-merge boundary read-back."
}
const nonExecutableTestModifiers = new Set([
  "disabled",
  "failing",
  "fixme",
  "only",
  "pending",
  "skip",
  "todo"
])
const githubActionsAuthorityToken = Symbol("courtside-github-actions-authority")

function idsFrom(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1])
}

function duplicates(values) {
  const seen = new Set()
  return [...new Set(values.filter((value) => (seen.has(value) ? true : !seen.add(value))))]
}

function expectedIds(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`
  )
}

function sameValues(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function sha256(text) {
  return text === null ? null : createHash("sha256").update(text).digest("hex")
}

const t085States = Object.freeze({
  PENDING: "T085_PENDING",
  RECEIPT_CANDIDATE: "T085_RECEIPT_CANDIDATE",
  COMPLETE_STEADY: "T085_COMPLETE_STEADY",
  ROLLBACK: "T085_INVALID_ROLLBACK",
  UNKNOWN: "T085_INVALID_UNKNOWN"
})

function t085Checkbox(text) {
  if (typeof text !== "string") return null
  const matches = [...text.matchAll(/^- \[([ xX])\] T085\b/gm)]
  return matches.length === 1 ? matches[0][1].toLowerCase() === "x" : null
}

function classifyT085State(changeBaseTasksText, tasksText) {
  const baseChecked = t085Checkbox(changeBaseTasksText)
  const currentChecked = t085Checkbox(tasksText)
  if (baseChecked === true && currentChecked === false) return t085States.ROLLBACK
  if (baseChecked === true && currentChecked === true) return t085States.COMPLETE_STEADY
  if (baseChecked === false && currentChecked === true) return t085States.RECEIPT_CANDIDATE
  if (currentChecked === false && (baseChecked === false || baseChecked === null)) {
    return t085States.PENDING
  }
  if (currentChecked === true && baseChecked === null) return t085States.RECEIPT_CANDIDATE
  return t085States.UNKNOWN
}

function isExactPostT085RemediationScope({
  state,
  changeBaseSha,
  boundedScopeActive,
  changedPaths
}) {
  return (
    state === t085States.PENDING &&
    boundedScopeActive === false &&
    changeBaseSha === POST_T085_REMEDIATION_BASE_SHA &&
    Array.isArray(changedPaths) &&
    changedPaths.length === POST_T085_REMEDIATION_CHANGED_PATHS.length &&
    sameValues(changedPaths, POST_T085_REMEDIATION_CHANGED_PATHS)
  )
}

function distribution(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row?.[key]).filter(Boolean))]
      .sort()
      .map((value) => [value, rows.filter((row) => row?.[key] === value).length])
  )
}

function humanRequirementRows(markdown) {
  if (markdown === null) return []
  return markdown
    .split("\n")
    .filter((line) => /^\| (?:FR|SC)-\d{3}\s+\|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
      return {
        id: cells[0],
        story_slice: cells[1],
        task_ids: [...cells[2].matchAll(/T\d{3}/g)].map((match) => match[0]),
        implementation_state: cells[3],
        evidence_state: cells[4],
        proof_ids: [...cells[5].matchAll(/P_[A-Z0-9_]+/g)].map((match) => match[0]),
        deviation_ids: [...cells[6].matchAll(/DEV-T085-\d{3}/g)].map((match) => match[0]),
        release_impact: cells[7]
      }
    })
}

function humanDeviationRows(markdown) {
  if (markdown === null) return []
  return markdown
    .split("\n")
    .filter((line) => /^\| DEV-T085-\d{3}\s+\|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
      return {
        id: cells[0],
        type: cells[1],
        severity: cells[2],
        state: cells[3],
        affected_ids: [...cells[4].matchAll(/(?:(?:FR|SC)-\d{3}|T\d{3})/g)].map(
          (match) => match[0]
        ),
        disposition_target: cells[5],
        release_impact: cells[6]
      }
    })
}

function taskRangeClaims(tasksText) {
  if (tasksText === null) return []
  const claims = []
  const pattern = /^- \[[ xX]\] (T\d{3}).*?\bfor ((?:FR|SC)-\d{3})[–-]((?:FR|SC)-\d{3})/gm
  for (const match of tasksText.matchAll(pattern)) {
    const [startPrefix, startNumber] = match[2].split("-")
    const [endPrefix, endNumber] = match[3].split("-")
    if (startPrefix !== endPrefix) continue
    claims.push({
      task_id: match[1],
      requirement_ids: Array.from(
        { length: Number(endNumber) - Number(startNumber) + 1 },
        (_, index) => `${startPrefix}-${String(Number(startNumber) + index).padStart(3, "0")}`
      )
    })
  }
  return claims
}

function requireString(value, label, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} must be a non-empty string`)
    return false
  }
  return true
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/)
  if (!match) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  const [, year, month, day, hour, minute, second] = match
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day) &&
    parsed.getUTCHours() === Number(hour) &&
    parsed.getUTCMinutes() === Number(minute) &&
    parsed.getUTCSeconds() === Number(second)
  )
}

function isPositiveIntegerText(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

function assertUniqueJsonObjectKeys(text) {
  let index = 0
  const fail = (message) => {
    throw new Error(message)
  }
  const skipWhitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1
  }
  const readString = () => {
    if (text[index] !== '"') fail(`expected JSON string at offset ${index}`)
    const start = index
    index += 1
    while (index < text.length) {
      const character = text[index]
      if (character === '"') {
        index += 1
        try {
          return JSON.parse(text.slice(start, index))
        } catch (error) {
          fail(`invalid JSON string at offset ${start}: ${error.message}`)
        }
      }
      if (character === "\\") {
        index += 2
      } else {
        if (character.charCodeAt(0) < 0x20) fail(`invalid JSON control character at ${index}`)
        index += 1
      }
    }
    fail(`unterminated JSON string at offset ${start}`)
  }
  const parseValue = () => {
    skipWhitespace()
    if (text[index] === "{") return parseObject()
    if (text[index] === "[") return parseArray()
    if (text[index] === '"') {
      readString()
      return
    }
    const start = index
    while (index < text.length && !/[\s,\]}]/.test(text[index])) index += 1
    if (start === index) fail(`expected JSON value at offset ${index}`)
    try {
      JSON.parse(text.slice(start, index))
    } catch (error) {
      fail(`invalid JSON value at offset ${start}: ${error.message}`)
    }
  }
  const parseObject = () => {
    const keys = new Set()
    index += 1
    skipWhitespace()
    if (text[index] === "}") {
      index += 1
      return
    }
    while (index < text.length) {
      skipWhitespace()
      const key = readString()
      if (keys.has(key)) fail(`duplicate JSON object key: ${key}`)
      keys.add(key)
      skipWhitespace()
      if (text[index] !== ":") fail(`expected JSON colon at offset ${index}`)
      index += 1
      parseValue()
      skipWhitespace()
      if (text[index] === "}") {
        index += 1
        return
      }
      if (text[index] !== ",") fail(`expected JSON object separator at offset ${index}`)
      index += 1
    }
    fail("unterminated JSON object")
  }
  const parseArray = () => {
    index += 1
    skipWhitespace()
    if (text[index] === "]") {
      index += 1
      return
    }
    while (index < text.length) {
      parseValue()
      skipWhitespace()
      if (text[index] === "]") {
        index += 1
        return
      }
      if (text[index] !== ",") fail(`expected JSON array separator at offset ${index}`)
      index += 1
    }
    fail("unterminated JSON array")
  }

  parseValue()
  skipWhitespace()
  if (index !== text.length) fail(`unexpected JSON content at offset ${index}`)
}

export function inspectGitHubActionsContext({ environment = process.env, gitBinding = null } = {}) {
  const errors = []
  const context = {
    status: "UNTRUSTED",
    event_name: environment.GITHUB_EVENT_NAME ?? null,
    repository: environment.GITHUB_REPOSITORY ?? null,
    workflow: environment.GITHUB_WORKFLOW ?? null,
    job: environment.GITHUB_JOB ?? null,
    run_id: environment.GITHUB_RUN_ID ?? null,
    run_number: environment.GITHUB_RUN_NUMBER ?? null,
    run_attempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    github_sha: environment.GITHUB_SHA ?? null,
    github_ref: environment.GITHUB_REF ?? null,
    base_ref: environment.GITHUB_BASE_REF ?? "",
    head_ref: environment.GITHUB_HEAD_REF ?? "",
    source_ref: environment.GITHUB_HEAD_REF || environment.GITHUB_REF_NAME || null,
    source_head_sha: gitBinding?.head ?? null,
    source_base_sha: gitBinding?.change_base_sha ?? null,
    authority: null,
    errors
  }

  if (environment.GITHUB_ACTIONS !== "true") errors.push("GITHUB_ACTIONS must be true")
  if (context.repository !== "bynanci/courtside-tw") {
    errors.push("GITHUB_REPOSITORY must be bynanci/courtside-tw")
  }
  if (!new Set(["pull_request", "push"]).has(context.event_name)) {
    errors.push("GITHUB_EVENT_NAME must be pull_request or push for receipt authority")
  }
  if (context.workflow !== "CI" || context.job !== "frontend-contract") {
    errors.push("receipt authority must come from the CI frontend-contract job")
  }
  for (const [label, value] of [
    ["GITHUB_RUN_ID", context.run_id],
    ["GITHUB_RUN_NUMBER", context.run_number],
    ["GITHUB_RUN_ATTEMPT", context.run_attempt]
  ]) {
    if (!isPositiveIntegerText(value)) errors.push(`${label} must be a positive integer`)
  }
  if (!/^[0-9a-f]{40}$/.test(context.github_sha ?? "")) {
    errors.push("GITHUB_SHA must be a full lowercase commit SHA")
  }
  if (
    !/^[0-9a-f]{40}$/.test(context.source_head_sha ?? "") ||
    !/^[0-9a-f]{40}$/.test(context.source_base_sha ?? "") ||
    gitBinding?.change_base_ancestor !== true
  ) {
    errors.push("Git binding must provide an exact source head and ancestor base")
  }

  let event = null
  if (typeof environment.GITHUB_EVENT_PATH !== "string" || environment.GITHUB_EVENT_PATH === "") {
    errors.push("GITHUB_EVENT_PATH must identify the authenticated event payload")
  } else {
    try {
      event = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, "utf8"))
    } catch {
      errors.push("GITHUB_EVENT_PATH must contain readable JSON")
    }
  }
  if (event !== null) {
    if (event?.repository?.full_name !== context.repository) {
      errors.push("event repository must match GITHUB_REPOSITORY")
    }
    if (context.event_name === "pull_request") {
      context.authority = "PULL_REQUEST"
      if (context.base_ref !== "main") errors.push("GITHUB_BASE_REF must be main")
      if (!/^refs\/pull\/\d+\/(?:merge|head)$/.test(context.github_ref ?? "")) {
        errors.push("GITHUB_REF must identify a pull-request ref")
      }
      if (event?.pull_request?.head?.sha !== context.source_head_sha) {
        errors.push("event pull-request head must match the evaluated Git head")
      }
      if (event?.pull_request?.base?.sha !== context.source_base_sha) {
        errors.push("event pull-request base must match the audited change base")
      }
      if (event?.pull_request?.head?.ref !== context.head_ref) {
        errors.push("event pull-request head ref must match GITHUB_HEAD_REF")
      }
      if (event?.pull_request?.base?.ref !== context.base_ref) {
        errors.push("event pull-request base ref must match GITHUB_BASE_REF")
      }
    }
    if (context.event_name === "push") {
      context.authority = "PROTECTED_MAIN_PUSH"
      if (
        context.github_ref !== "refs/heads/main" ||
        context.source_ref !== "main" ||
        context.base_ref !== "" ||
        context.head_ref !== ""
      ) {
        errors.push("push receipt authority must identify the protected main ref")
      }
      if (
        event?.ref !== "refs/heads/main" ||
        event?.before !== context.source_base_sha ||
        event?.after !== context.source_head_sha ||
        context.github_sha !== context.source_head_sha
      ) {
        errors.push("push event must bind the audited main before and exact source head")
      }
    }
  }

  if (errors.length === 0) {
    context.status = "MATCHED_GITHUB_ACTIONS_METADATA"
    Object.defineProperty(context, githubActionsAuthorityToken, { value: true })
  }
  return context
}

function isAuthenticatedGitHubActionsContext(context) {
  return (
    context?.status === "MATCHED_GITHUB_ACTIONS_METADATA" &&
    context?.[githubActionsAuthorityToken] === true
  )
}

function exactHeadMatchesGitHubActionsContext(evidence, context) {
  return (
    evidence?.source_head_sha === context.source_head_sha &&
    evidence?.expected_source_head === context.source_head_sha &&
    evidence?.source_event === context.event_name &&
    evidence?.source_ref === context.source_ref &&
    evidence?.github_sha === context.github_sha &&
    evidence?.github_repository === context.repository &&
    evidence?.github_workflow === context.workflow &&
    evidence?.github_job === context.job &&
    evidence?.github_run_id === context.run_id &&
    evidence?.github_run_number === context.run_number &&
    evidence?.github_run_attempt === context.run_attempt &&
    evidence?.github_ref === context.github_ref &&
    evidence?.github_base_ref === context.base_ref
  )
}

function expectedTaskClassification(taskId) {
  const number = Number(taskId.slice(1))
  if (number <= 23) return "FOUNDATION"
  if ([24, 25, 32, 33, 42, 43, 44, 57, 64, 71].includes(number)) return "TEST"
  if (number <= 76) return "IMPLEMENTATION"
  if (number <= 84) return "QUALITY_GATE"
  if (number === 85) return "TRACEABILITY"
  if (number === 86) return "RELEASE_GATE"
  if (number <= 96 || number >= 98) return "FUTURE"
  if (number === 97) return "ALIGNMENT"
  return null
}

function readText(root, relativePath, errors, label) {
  const absolutePath = path.resolve(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing ${label}: ${relativePath}`)
    return null
  }
  if (!fs.statSync(absolutePath).isFile()) {
    errors.push(`${label} must be a file: ${relativePath}`)
    return null
  }
  return fs.readFileSync(absolutePath, "utf8")
}

function safeProofPath(root, relativePath, errors, label) {
  if (!requireString(relativePath, `${label}.path`, errors)) return null
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..")
  ) {
    errors.push(`${label}.path must be a safe repository-relative path: ${relativePath}`)
    return null
  }

  const absoluteRoot = fs.realpathSync(root)
  const candidate = path.resolve(absoluteRoot, relativePath)
  if (!candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    errors.push(`${label}.path escapes the repository root: ${relativePath}`)
    return null
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    errors.push(`${label}.path does not identify an existing file: ${relativePath}`)
    return null
  }

  const realCandidate = fs.realpathSync(candidate)
  if (!realCandidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    errors.push(`${label}.path resolves outside the repository root: ${relativePath}`)
    return null
  }
  return realCandidate
}

function proofFileSha256(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..")
  ) {
    return null
  }
  const absoluteRoot = fs.realpathSync(root)
  const candidate = path.resolve(absoluteRoot, relativePath)
  if (!candidate.startsWith(`${absoluteRoot}${path.sep}`) || !fs.existsSync(candidate)) return null
  const realCandidate = fs.realpathSync(candidate)
  if (!realCandidate.startsWith(`${absoluteRoot}${path.sep}`)) return null
  return fs.statSync(realCandidate).isFile() ? sha256(fs.readFileSync(realCandidate, "utf8")) : null
}

function literalOccurrenceCount(text, selector) {
  let count = 0
  let offset = 0
  while (offset <= text.length - selector.length) {
    const index = text.indexOf(selector, offset)
    if (index === -1) break
    count += 1
    offset = index + 1
  }
  return count
}

function readRunnerConfiguration(root, relativePath) {
  try {
    return fs.readFileSync(path.resolve(root, relativePath), "utf8")
  } catch {
    return null
  }
}

function javaScriptRunnerCommandSelects(command, packageRelativePath) {
  if (typeof command !== "string") return false
  const commandWithoutAndChains = command.replaceAll("&&", "")
  if (command.includes("||") || /[;&|\n\r]/.test(commandWithoutAndChains)) return false
  const [unconditionalSegment] = command.split("&&")
  const tokens = unconditionalSegment.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []
  const normalizedTokens = tokens.map((rawToken) =>
    rawToken.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2")
  )
  if (normalizedTokens[0] !== "node" || !normalizedTokens.includes("--test")) return false
  if (
    normalizedTokens.some((token) =>
      /^(?:-c|--check|-e|--eval(?:=|$)|-h|--help|-p|--print(?:=|$)|-v|--version|--v8-options|--completion-bash)$/.test(
        token
      )
    )
  ) {
    return false
  }
  if (
    normalizedTokens.some((token) =>
      /^--test-(?:name-pattern|only|rerun-failures|shard|skip-pattern)(?:=|$)/.test(token)
    )
  ) {
    return false
  }
  if (normalizedTokens.some((token) => /^--env-file(?:-if-exists)?(?:=|$)/.test(token))) {
    return false
  }
  return normalizedTokens.some((rawToken) => {
    const token = rawToken.replace(/^\.\//, "")
    return (
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(token) && path.matchesGlob(packageRelativePath, token)
    )
  })
}

function packageRunnerSelectsJavaScriptProof(root, relativePath) {
  const absoluteRoot = path.resolve(root)
  const absoluteProof = path.resolve(absoluteRoot, relativePath)
  if (!absoluteProof.startsWith(`${absoluteRoot}${path.sep}`)) return false

  let packageDirectory = path.dirname(absoluteProof)
  while (packageDirectory.startsWith(absoluteRoot)) {
    const packagePath = path.join(packageDirectory, "package.json")
    if (fs.existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"))
        const packageRelativePath = path
          .relative(packageDirectory, absoluteProof)
          .split(path.sep)
          .join("/")
        const scriptNames =
          packageDirectory === absoluteRoot ? ["test", "contract:traceability"] : ["test"]
        return scriptNames.some((name) =>
          javaScriptRunnerCommandSelects(packageJson.scripts?.[name], packageRelativePath)
        )
      } catch {
        return false
      }
    }
    if (packageDirectory === absoluteRoot) break
    packageDirectory = path.dirname(packageDirectory)
  }
  return false
}

function playwrightRunnerCommandSelectsAllProofs(command) {
  if (typeof command !== "string") return false
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []
  const normalizedTokens = tokens.map((rawToken) =>
    rawToken.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2")
  )
  return (
    normalizedTokens.length === 2 &&
    normalizedTokens[0] === "playwright" &&
    normalizedTokens[1] === "test"
  )
}

const playwrightCollectionFilterKeys = new Set([
  "grep",
  "grepInvert",
  "shard",
  "testIgnore",
  "testMatch"
])
const playwrightLifecycleHookKeys = new Set(["globalSetup", "globalTeardown"])

function playwrightRunnerConfiguration(configText) {
  let ast
  try {
    ast = typescriptPlugin.parsers.typescript.parse(configText, {
      filepath: "apps/web/playwright.config.ts"
    })
  } catch {
    return null
  }
  if (ast?.type !== "Program" || typeof ast?.then === "function") return null

  const declarations = new Map()
  for (const statement of ast.body ?? []) {
    if (statement?.type !== "VariableDeclaration") continue
    for (const declaration of statement.declarations ?? []) {
      if (declaration?.id?.type !== "Identifier" || declarations.has(declaration.id.name)) {
        return null
      }
      declarations.set(declaration.id.name, declaration.init)
    }
  }

  const defaultExports = (ast.body ?? []).filter(
    (statement) => statement?.type === "ExportDefaultDeclaration"
  )
  if (defaultExports.length !== 1) return null
  const exportedExpression = defaultExports[0].declaration
  const resolving = new Set()
  const resolveConfigurationObject = (value) => {
    const normalized = normalizeJavaScriptExpression(value)
    const expression = normalized.expression
    if (normalized.ambiguous) return null
    if (expression?.type === "ObjectExpression") return expression
    if (expression?.type === "Identifier") {
      if (resolving.has(expression.name) || !declarations.has(expression.name)) return null
      resolving.add(expression.name)
      const resolved = resolveConfigurationObject(declarations.get(expression.name))
      resolving.delete(expression.name)
      return resolved
    }
    if (expression?.type !== "CallExpression" || expression.arguments?.length !== 1) return null
    const callee = javaScriptMemberPath(expression.callee)
    if (callee.ambiguous || callee.segments.at(-1) !== "defineConfig") return null
    return resolveConfigurationObject(expression.arguments[0])
  }
  const configurationObject = resolveConfigurationObject(exportedExpression)
  if (configurationObject === null) return null

  const exportedNames = new Set()
  const collectExportedName = (value) => {
    const normalized = normalizeJavaScriptExpression(value)
    const expression = normalized.expression
    if (normalized.ambiguous) return
    if (expression?.type === "Identifier") exportedNames.add(expression.name)
    if (expression?.type === "CallExpression" && expression.arguments?.length === 1) {
      const callee = javaScriptMemberPath(expression.callee)
      if (!callee.ambiguous && callee.segments.at(-1) === "defineConfig") {
        collectExportedName(expression.arguments[0])
      }
    }
  }
  collectExportedName(exportedExpression)
  let aliasesChanged = true
  while (aliasesChanged) {
    aliasesChanged = false
    for (const [name, initializer] of declarations) {
      const normalized = normalizeJavaScriptExpression(initializer)
      if (normalized.ambiguous || normalized.expression?.type !== "Identifier") continue
      const sourceName = normalized.expression.name
      if (exportedNames.has(name) && !exportedNames.has(sourceName)) {
        exportedNames.add(sourceName)
        aliasesChanged = true
      }
      if (exportedNames.has(sourceName) && !exportedNames.has(name)) {
        exportedNames.add(name)
        aliasesChanged = true
      }
    }
  }

  let invalid = false
  let filtered = false
  let testDirectory = null
  const assignTestDirectory = (value) => {
    const normalized = normalizeJavaScriptExpression(value)
    const expression = normalized.expression
    if (
      normalized.ambiguous ||
      expression?.type !== "Literal" ||
      typeof expression.value !== "string" ||
      testDirectory !== null
    ) {
      invalid = true
      return
    }
    testDirectory = expression.value
  }

  for (const property of configurationObject.properties ?? []) {
    if (
      property?.type !== "Property" ||
      property.kind !== "init" ||
      property.method === true ||
      property.shorthand === true
    ) {
      invalid = true
      continue
    }
    const key = staticJavaScriptObjectPropertyKey(property)
    if (!key.known) {
      invalid = true
      continue
    }
    if (playwrightCollectionFilterKeys.has(key.value)) filtered = true
    if (playwrightLifecycleHookKeys.has(key.value)) invalid = true
    if (key.value === "testDir") assignTestDirectory(property.value)
  }
  walkJavaScriptAst(configurationObject, (node) => {
    if (node.type !== "Property") return
    const key = staticJavaScriptObjectPropertyKey(node)
    if (key.known && playwrightCollectionFilterKeys.has(key.value)) filtered = true
    if (key.known && playwrightLifecycleHookKeys.has(key.value)) invalid = true
  })
  walkJavaScriptAst(ast, (node) => {
    if (node.type === "CallExpression") {
      const callee = javaScriptMemberPath(node.callee)
      if (
        !callee.ambiguous &&
        callee.segments.join(".") === "Object.assign" &&
        node.arguments?.some(
          (argument) => argument?.type === "Identifier" && exportedNames.has(argument.name)
        )
      ) {
        invalid = true
      }
      return
    }
    if (node.type !== "AssignmentExpression") return
    if (node.left?.type === "Identifier" && exportedNames.has(node.left.name)) {
      invalid = true
      return
    }
    const memberPath = javaScriptMemberPath(node.left)
    if (!exportedNames.has(memberPath.segments[0])) return
    if (memberPath.ambiguous || memberPath.segments.length !== 2) {
      invalid = true
      return
    }
    const property = memberPath.segments[1]
    if (playwrightCollectionFilterKeys.has(property)) filtered = true
    if (playwrightLifecycleHookKeys.has(property)) invalid = true
    if (node.operator !== "=") {
      invalid = true
      return
    }
    if (property === "testDir") assignTestDirectory(node.right)
  })

  if (invalid || filtered || testDirectory === null) return null
  return { testDirectory }
}

function playwrightRunnerSelectsProof(root, relativePath) {
  if (!/^apps\/web\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath)) return false
  const packageText = readRunnerConfiguration(root, "apps/web/package.json")
  const configText = readRunnerConfiguration(root, "apps/web/playwright.config.ts")
  const workflowText = readRunnerConfiguration(root, ".github/workflows/ci.yml")
  if (packageText === null || configText === null || workflowText === null) return false

  try {
    const packageJson = JSON.parse(packageText)
    if (!playwrightRunnerCommandSelectsAllProofs(packageJson.scripts?.["test:e2e"])) {
      return false
    }
  } catch {
    return false
  }
  if (
    !ciWorkflowExecutableRunSteps(workflowText).some((script) =>
      shellRunStepExecutesPlaywrightTest(script)
    )
  ) {
    return false
  }
  const configuration = playwrightRunnerConfiguration(configText)
  if (configuration === null) return false
  const { testDirectory } = configuration
  const packageRelativePath = relativePath.slice("apps/web/".length)
  const normalizedTestDirectory = testDirectory.replace(/^\.\//, "").replace(/\/$/, "")
  return packageRelativePath.startsWith(`${normalizedTestDirectory}/`)
}

const gradleJavaTestIncludesBySourceSuffix = new Map([
  ["Test.java", "**/*Test.class"],
  ["Tests.java", "**/*Tests.class"],
  ["TestCase.java", "**/*TestCase.class"],
  ["IT.java", "**/*IT.class"]
])

function gradleJavaTestInclude(relativePath) {
  for (const [sourceSuffix, configuredInclude] of gradleJavaTestIncludesBySourceSuffix) {
    if (relativePath.endsWith(sourceSuffix)) return configuredInclude
  }
  return null
}

function gradleJavaTestIncludeForClassName(className) {
  for (const [sourceSuffix, configuredInclude] of gradleJavaTestIncludesBySourceSuffix) {
    const classSuffix = sourceSuffix.slice(0, -".java".length)
    if (className.endsWith(classSuffix)) return configuredInclude
  }
  return null
}

function gradleKotlinTokens(text) {
  const tokens = []
  for (let index = 0; index < text.length;) {
    const character = text[index]
    if (/\s/.test(character)) {
      index += 1
      continue
    }
    if (text.startsWith("//", index)) {
      const newline = text.indexOf("\n", index + 2)
      index = newline === -1 ? text.length : newline + 1
      continue
    }
    if (text.startsWith("/*", index)) {
      let depth = 1
      index += 2
      while (index < text.length && depth > 0) {
        if (text.startsWith("/*", index)) {
          depth += 1
          index += 2
        } else if (text.startsWith("*/", index)) {
          depth -= 1
          index += 2
        } else {
          index += 1
        }
      }
      if (depth !== 0) return null
      continue
    }
    if (text.startsWith('"""', index)) {
      const close = text.indexOf('"""', index + 3)
      if (close === -1) return null
      tokens.push({ type: "string", value: text.slice(index + 3, close) })
      index = close + 3
      continue
    }
    if (character === '"') {
      let value = ""
      let closed = false
      index += 1
      while (index < text.length) {
        if (text[index] === '"') {
          closed = true
          index += 1
          break
        }
        if (text[index] === "\\") {
          if (index + 1 >= text.length) return null
          value += text[index + 1]
          index += 2
        } else {
          value += text[index]
          index += 1
        }
      }
      if (!closed) return null
      tokens.push({ type: "string", value })
      continue
    }
    if (character === "'") {
      let closed = false
      index += 1
      while (index < text.length) {
        if (text[index] === "\\") index += 2
        else if (text[index] === "'") {
          closed = true
          index += 1
          break
        } else index += 1
      }
      if (!closed) return null
      continue
    }
    const identifier = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]
    if (identifier !== undefined) {
      tokens.push({ type: "identifier", value: identifier })
      index += identifier.length
      continue
    }
    tokens.push({ type: "punctuation", value: character })
    index += 1
  }
  return tokens
}

function gradleTestSelection(buildText) {
  const tokens = gradleKotlinTokens(buildText)
  if (tokens === null) return null
  const includes = new Set()
  const excludes = new Set()
  const dynamicConfigurationKeywords = new Set([
    "catch",
    "do",
    "else",
    "finally",
    "for",
    "fun",
    "if",
    "return",
    "try",
    "when",
    "while"
  ])
  const junitPlatformSelectionMethods = new Set([
    "excludeEngines",
    "excludeTags",
    "includeEngines",
    "includeTags"
  ])
  let invalid = false
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      tokens[index].type === "identifier" &&
      junitPlatformSelectionMethods.has(tokens[index].value) &&
      tokens[index + 1].value === "("
    ) {
      invalid = true
    }
  }
  const testBlocks = []
  const testBlockPrefixes = [
    ["tasks", ".", "withType", "<", "Test", ">", "{"],
    ["tasks", ".", "withType", "<", "Test", ">", "(", ")", ".", "configureEach", "{"],
    ["tasks", ".", "withType", "<", "Test", ">", "(", ")", ".", "all", "{"],
    ["tasks", ".", "test", "{"],
    ["tasks", ".", "named", "<", "Test", ">", "(", "test", ")", "{"],
    ["tasks", ".", "named", "(", "test", ")", "{"],
    ["tasks", ".", "getByName", "<", "Test", ">", "(", "test", ")", "{"]
  ]
  for (let index = 0; index < tokens.length; index += 1) {
    const prefix = testBlockPrefixes.find((candidate) =>
      candidate.every((value, offset) => tokens[index + offset]?.value === value)
    )
    if (prefix === undefined) continue
    let depth = 1
    let close = index + prefix.length
    while (close < tokens.length && depth > 0) {
      if (tokens[close].value === "{") depth += 1
      else if (tokens[close].value === "}") depth -= 1
      close += 1
    }
    if (depth !== 0) return null
    testBlocks.push(tokens.slice(index + prefix.length, close - 1))
    index = close - 1
  }

  for (const block of testBlocks) {
    let blockDepth = 0
    for (let index = 0; index < block.length; index += 1) {
      const method = block[index]
      if (method.value === "{") {
        blockDepth += 1
        continue
      }
      if (method.value === "}") {
        blockDepth -= 1
        if (blockDepth < 0) invalid = true
        continue
      }
      if (method.type === "identifier" && dynamicConfigurationKeywords.has(method.value)) {
        invalid = true
        continue
      }
      if (method.value === "enabled" && block[index + 1]?.value === "=") {
        if (block[index + 2]?.value !== "true") invalid = true
        index += 2
        continue
      }
      if (method.value === "setEnabled" && block[index + 1]?.value === "(") {
        if (block[index + 2]?.value !== "true" || block[index + 3]?.value !== ")") {
          invalid = true
        }
        index += 3
        continue
      }
      if (["onlyIf", "setOnlyIf"].includes(method.value)) {
        invalid = true
        continue
      }
      if (
        method.type !== "identifier" ||
        !["exclude", "include"].includes(method.value) ||
        block[index + 1].value !== "("
      ) {
        continue
      }
      if (blockDepth !== 0) {
        invalid = true
        continue
      }
      const patterns = []
      let cursor = index + 2
      let expectPattern = true
      while (cursor < block.length && block[cursor].value !== ")") {
        if (expectPattern && block[cursor].type === "string") {
          patterns.push(block[cursor].value)
          expectPattern = false
        } else if (!expectPattern && block[cursor].value === ",") {
          expectPattern = true
        } else {
          invalid = true
        }
        cursor += 1
      }
      if (cursor >= block.length || patterns.length === 0 || expectPattern) {
        invalid = true
        continue
      }
      const target = method.value === "include" ? includes : excludes
      for (const pattern of patterns) target.add(pattern)
      index = cursor
    }
    if (blockDepth !== 0) invalid = true
  }
  return { excludes, includes, invalid }
}

function gradleBuildSelectsTestPattern(buildText, configuredInclude) {
  const selection = gradleTestSelection(buildText)
  return (
    selection !== null &&
    !selection.invalid &&
    selection.includes.has(configuredInclude) &&
    selection.excludes.size === 0
  )
}

function gradleRunnerSelectsJavaProof(root, relativePath) {
  const configuredInclude = gradleJavaTestInclude(relativePath)
  if (!relativePath.startsWith("apps/api/src/test/java/") || configuredInclude === null) {
    return false
  }
  const buildText = readRunnerConfiguration(root, "apps/api/build.gradle.kts")
  const workflowText = readRunnerConfiguration(root, ".github/workflows/ci.yml")
  if (buildText === null || workflowText === null) return false
  return (
    gradleBuildSelectsTestPattern(buildText, configuredInclude) &&
    ciWorkflowExecutableRunSteps(workflowText).some((script) =>
      shellRunStepExecutesGradleTest(script)
    )
  )
}

function shellCommandSegments(script) {
  const segments = []
  let words = []
  let word = ""
  let quote = null
  let escaped = false
  let comment = false
  const finishWord = () => {
    if (word.length === 0) return
    words.push(word)
    word = ""
  }
  const finishSegment = () => {
    finishWord()
    if (words.length > 0) segments.push(words)
    words = []
  }

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index]
    if (comment) {
      if (character === "\n") {
        comment = false
        finishSegment()
      }
      continue
    }
    if (escaped) {
      if (character !== "\n") word += character
      escaped = false
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = null
      else word += character
      continue
    }
    if (quote === '"') {
      if (character === '"') quote = null
      else if (character === "\\") escaped = true
      else word += character
      continue
    }
    if (character === "\\") {
      escaped = true
    } else if (character === "'" || character === '"') {
      quote = character
    } else if (character === "#" && word.length === 0) {
      comment = true
    } else if (/\s/.test(character)) {
      if (character === "\n") finishSegment()
      else finishWord()
    } else if (
      [";", "|"].includes(character) ||
      (character === "&" && ![">", "<"].includes(script[index - 1]))
    ) {
      finishSegment()
    } else {
      word += character
    }
  }
  if (quote !== null || escaped) return []
  finishSegment()
  return segments
}

function shellSetNamedOptionState(words, optionName, currentState) {
  let index = 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
  while (["builtin", "command"].includes(words[index])) {
    index += 1
    while ((words[index] ?? "").startsWith("-")) {
      if (words[index] === "--") {
        index += 1
        break
      }
      index += 1
    }
  }
  if (words[index] !== "set") return currentState
  let state = currentState
  for (let argumentIndex = index + 1; argumentIndex < words.length; argumentIndex += 1) {
    const argument = words[argumentIndex]
    if (argument === "--") break
    if (["-o", "+o"].includes(argument)) {
      if (words[argumentIndex + 1] === optionName) state = argument === "-o"
      argumentIndex += 1
      continue
    }
    if (!/^[-+][A-Za-z]+$/.test(argument)) continue
    if (optionName === "errexit" && argument.slice(1).includes("e")) {
      state = argument[0] === "-"
      continue
    }
    const optionIndex = argument.indexOf("o", 1)
    if (optionIndex === -1) continue
    const inlineOption = argument.slice(optionIndex + 1)
    if (inlineOption === optionName) state = argument[0] === "-"
    else if (inlineOption.length === 0 && words[argumentIndex + 1] === optionName) {
      state = argument[0] === "-"
      argumentIndex += 1
    }
  }
  return state
}

function shellPipelinesHaveActivePipefail(script) {
  let pipefailEnabled = false
  for (const line of script.split(/\r?\n/)) {
    const segments = shellCommandSegments(line)
    const operators = shellLineControlOperators(line)
    if (segments.length === 0 && operators?.length === 0) continue
    if (operators === null || segments.length !== operators.length + 1) return false
    for (let index = 0; index < segments.length; index += 1) {
      const operator = operators[index]
      if (operator === "|" && !pipefailEnabled) return false
      if (operator !== "|") {
        pipefailEnabled = shellSetNamedOptionState(segments[index], "pipefail", pipefailEnabled)
      }
    }
  }
  return true
}

function shellRunStepHasUnsafeControlFlow(script) {
  return (
    /<<-?/.test(script) ||
    /(?:^|[;\n])\s*[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\)\s*\{/m.test(script) ||
    /(?:^|[;\n])\s*(?:case|do|done|elif|else|esac|fi|for|function|if|select|then|until|while)\b/.test(
      script
    ) ||
    script.includes("||") ||
    script.includes("&&") ||
    shellCommandSegments(script).some(
      (words) => shellSetNamedOptionState(words, "errexit", true) === false
    ) ||
    /(^|[^&<>|])&(?=$|[^&>])/m.test(script) ||
    !shellPipelinesHaveActivePipefail(script)
  )
}

function shellScriptOperandIndex(words, shellIndex) {
  let index = shellIndex + 1
  while (index < words.length) {
    const argument = words[index]
    if (argument === "--") return index + 1 < words.length ? index + 1 : null
    if (argument === "-" || !argument.startsWith("-")) return index
    if (
      ["--noexec", "--dump-strings", "--dump-po-strings", "--help", "--version"].includes(
        argument
      ) ||
      ["--noexec=", "--dump-strings=", "--dump-po-strings="].some((prefix) =>
        argument.startsWith(prefix)
      )
    ) {
      return null
    }
    if (["--option", "-o"].includes(argument)) {
      const option = words[index + 1]
      if (option === undefined || option === "noexec") return null
      index += 2
      continue
    }
    if (argument.startsWith("--option=")) {
      if (argument.slice("--option=".length) === "noexec") return null
      index += 1
      continue
    }
    if (/^-[^-]*[cDns]/.test(argument)) return null
    const optionIndex = argument.indexOf("o", 1)
    if (optionIndex !== -1) {
      const inlineOption = argument.slice(optionIndex + 1)
      if (inlineOption === "noexec") return null
      if (inlineOption.length === 0) {
        const option = words[index + 1]
        if (option === undefined || option === "noexec") return null
        index += 2
        continue
      }
    }
    index += 1
  }
  return null
}

function shellRunStepExecutesProof(script, relativePath) {
  if (shellRunStepHasUnsafeControlFlow(script)) return false
  const expectedCommands = new Set([relativePath, `./${relativePath}`])
  for (const words of shellCommandSegments(script)) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    if (["builtin", "command"].includes(words[index])) {
      index += 1
      while ((words[index] ?? "").startsWith("-")) index += 1
    }
    if (["exec", "exit", "return"].includes(words[index])) return false
    const shell = words[index]
    if (["bash", "/bin/bash", "sh", "/bin/sh"].includes(shell)) {
      const scriptIndex = shellScriptOperandIndex(words, index)
      if (scriptIndex === null) continue
      index = scriptIndex
    }
    if (expectedCommands.has(words[index])) return true
  }
  return false
}

function shellRunStepExecutesGradleTest(script) {
  if (shellRunStepHasUnsafeControlFlow(script)) return false
  for (const words of shellCommandSegments(script)) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    if (["builtin", "command"].includes(words[index])) {
      index += 1
      while ((words[index] ?? "").startsWith("-")) index += 1
    }
    if (["exec", "exit", "return"].includes(words[index])) return false
    if (!["gradle", "./gradlew", "apps/api/gradlew"].includes(words[index])) continue
    const argumentsAfterCommand = words.slice(index + 1)
    const projectDirectorySelected = argumentsAfterCommand.some(
      (argument, argumentIndex) =>
        (["-p", "--project-dir"].includes(argument) &&
          argumentsAfterCommand[argumentIndex + 1] === "apps/api") ||
        /^(?:-p|--project-dir)=apps\/api$/.test(argument)
    )
    const gradleTaskName = (argument) => {
      if (typeof argument !== "string" || argument.length === 0) return null
      return (
        argument
          .split(":")
          .filter((segment) => segment.length > 0)
          .at(-1) ?? null
      )
    }
    const testExcluded = argumentsAfterCommand.some((argument, argumentIndex) => {
      if (["-x", "--exclude-task"].includes(argument)) {
        return gradleTaskName(argumentsAfterCommand[argumentIndex + 1]) === "test"
      }
      const inlineExclusion = argument.match(/^(?:-x|--exclude-task)=(.+)$/)
      return inlineExclusion !== null && gradleTaskName(inlineExclusion[1]) === "test"
    })
    const testFiltered = argumentsAfterCommand.some(
      (argument) => argument === "--tests" || argument.startsWith("--tests=")
    )
    const executionSuppressed = argumentsAfterCommand.some(
      (argument) =>
        [
          "-?",
          "-h",
          "--help",
          "-v",
          "--version",
          "--status",
          "--stop",
          "--foreground",
          "-m",
          "--dry-run"
        ].includes(argument) ||
        ["--help=", "--version=", "--dry-run="].some((prefix) => argument.startsWith(prefix))
    )
    if (
      projectDirectorySelected &&
      argumentsAfterCommand.includes("test") &&
      !testExcluded &&
      !testFiltered &&
      !executionSuppressed
    ) {
      return true
    }
  }
  return false
}

function shellRunStepExecutesPlaywrightTest(script) {
  if (shellRunStepHasUnsafeControlFlow(script)) return false
  for (const words of shellCommandSegments(script)) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    if (["builtin", "command"].includes(words[index])) {
      index += 1
      while ((words[index] ?? "").startsWith("-")) index += 1
    }
    if (["exec", "exit", "return"].includes(words[index])) return false
    if (words[index] !== "pnpm") continue
    const command = words.slice(index)
    const exactPrefix = ["pnpm", "--filter", "@courtside/web", "run", "test:e2e"]
    if (!exactPrefix.every((token, tokenIndex) => command[tokenIndex] === token)) continue
    const trailing = command.slice(exactPrefix.length)
    if (trailing.every((token) => /^\d*(?:[<>]|[<>]&\d+)$/.test(token))) return true
  }
  return false
}

function ciWorkflowExecutableRunSteps(workflowText) {
  try {
    const workflow = YAML.parse(workflowText)
    if (workflow === null || typeof workflow !== "object" || Array.isArray(workflow.jobs)) {
      return []
    }
    const jobs = workflow.jobs ?? {}
    if (jobs === null || typeof jobs !== "object" || Array.isArray(jobs)) return []
    const workflowShell = workflow.defaults?.run?.shell
    const reachability = new Map()
    const visiting = new Set()
    const isUnconditionallyReachable = (jobName) => {
      if (reachability.has(jobName)) return reachability.get(jobName)
      if (visiting.has(jobName) || !Object.hasOwn(jobs, jobName)) return false
      const job = jobs[jobName]
      if (
        job === null ||
        typeof job !== "object" ||
        Array.isArray(job) ||
        job.if !== undefined ||
        (job["continue-on-error"] !== undefined && job["continue-on-error"] !== false)
      ) {
        reachability.set(jobName, false)
        return false
      }
      const dependencies =
        job.needs === undefined
          ? []
          : typeof job.needs === "string"
            ? [job.needs]
            : Array.isArray(job.needs) && job.needs.every((need) => typeof need === "string")
              ? job.needs
              : null
      if (dependencies === null) {
        reachability.set(jobName, false)
        return false
      }
      visiting.add(jobName)
      const reachable = dependencies.every((dependency) => isUnconditionallyReachable(dependency))
      visiting.delete(jobName)
      reachability.set(jobName, reachable)
      return reachable
    }
    return Object.entries(jobs).flatMap(([jobName, job]) => {
      if (!isUnconditionallyReachable(jobName)) return []
      return (job.steps ?? [])
        .filter(
          (step) =>
            step !== null &&
            typeof step === "object" &&
            step.if === undefined &&
            (step["continue-on-error"] === undefined || step["continue-on-error"] === false) &&
            typeof step.run === "string" &&
            githubActionsShellPropagatesFailure(
              step.shell ?? job.defaults?.run?.shell ?? workflowShell
            )
        )
        .map((step) => step.run)
    })
  } catch {
    return []
  }
}

function githubActionsShellPropagatesFailure(shell) {
  if (shell === undefined) return true
  if (typeof shell !== "string") return false
  const words = shell.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []
  const normalizedWords = words.map((word) => word.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2"))
  const executable = path.posix.basename(normalizedWords[0] ?? "")
  if (!["bash", "sh"].includes(executable)) return false
  if (normalizedWords.length === 1) return true
  const placeholderIndex = normalizedWords.indexOf("{0}")
  const shellArguments = normalizedWords.slice(
    1,
    placeholderIndex === -1 ? normalizedWords.length : placeholderIndex
  )
  const optionBoundary = shellArguments.indexOf("--")
  const shellOptions = shellArguments.slice(
    0,
    optionBoundary === -1 ? shellArguments.length : optionBoundary
  )
  if (shellOptions.some((word) => ["-c", "--command"].includes(word))) return false
  return shellOptions.some((word, index, arguments_) => {
    if (/^-[A-Za-z]*e[A-Za-z]*$/.test(word)) return true
    return word === "-o" && arguments_[index + 1] === "errexit"
  })
}

function ciWorkflowSelectsShellProof(root, relativePath) {
  if (!relativePath.startsWith("scripts/test/") || !relativePath.endsWith(".sh")) return false
  const workflowText = readRunnerConfiguration(root, ".github/workflows/ci.yml")
  if (workflowText === null) return false
  return ciWorkflowExecutableRunSteps(workflowText).some((script) =>
    shellRunStepExecutesProof(script, relativePath)
  )
}

function isExecutableProofPath(root, relativePath) {
  if (typeof relativePath !== "string") return false
  if (
    relativePath.startsWith(".github/workflows/") ||
    (relativePath.startsWith(".loop/evidence/") && relativePath.endsWith(".json"))
  ) {
    return true
  }
  if (gradleJavaTestInclude(relativePath) !== null) {
    return gradleRunnerSelectsJavaProof(root, relativePath)
  }
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath)) {
    return (
      packageRunnerSelectsJavaScriptProof(root, relativePath) ||
      playwrightRunnerSelectsProof(root, relativePath)
    )
  }
  return ciWorkflowSelectsShellProof(root, relativePath)
}

const disabledJavaScriptSuiteModifiers = new Set([
  "disabled",
  "failing",
  "fixme",
  "pending",
  "skip",
  "todo"
])
const javaScriptModifierChainKey = (segments) => JSON.stringify(segments)
const activeJavaScriptSuiteModifierChains = new Map([
  ["node-suite", new Set([javaScriptModifierChainKey([])])],
  [
    "playwright-test",
    new Set([
      javaScriptModifierChainKey([]),
      javaScriptModifierChainKey(["parallel"]),
      javaScriptModifierChainKey(["serial"])
    ])
  ]
])
const activeJavaScriptTestModifierChains = new Map([
  ["node-test", new Set([javaScriptModifierChainKey([])])],
  ["playwright-test", new Set([javaScriptModifierChainKey([])])]
])
const transparentJavaScriptExpressionTypes = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TypeCastExpression"
])
const javaScriptFunctionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression"
])
const javaScriptProofBindingRoles = new Set(["node-test", "playwright-test"])
const nodeTestLifecycleHookNames = new Set(["after", "afterEach", "before", "beforeEach"])

function normalizeJavaScriptExpression(node) {
  let current = node
  let ambiguous = false
  while (
    current &&
    transparentJavaScriptExpressionTypes.has(current.type) &&
    current.expression &&
    current.expression !== current
  ) {
    if (current.type === "ChainExpression") ambiguous = true
    current = current.expression
  }
  return { ambiguous, expression: current }
}

function staticJavaScriptMemberProperty(node) {
  if (!node?.computed && node?.property?.type === "Identifier") {
    return { known: true, value: node.property.name }
  }
  if (
    node?.computed &&
    node?.property?.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return { known: true, value: node.property.value }
  }
  if (
    node?.computed &&
    node?.property?.type === "TemplateLiteral" &&
    node.property.expressions?.length === 0 &&
    node.property.quasis?.length === 1
  ) {
    const value = node.property.quasis[0]?.value?.cooked
    if (typeof value === "string") return { known: true, value }
  }
  return { known: false, value: null }
}

function javaScriptMemberPath(node) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  const ambiguous = normalized.ambiguous || expression?.optional === true
  if (expression?.type === "Identifier") {
    return { ambiguous, segments: [expression.name] }
  }
  if (expression?.type === "CallExpression") {
    const calleePath = javaScriptMemberPath(expression.callee)
    return { ambiguous: true, segments: calleePath.segments }
  }
  if (expression?.type === "TaggedTemplateExpression") {
    const tagPath = javaScriptMemberPath(expression.tag)
    return { ambiguous: true, segments: tagPath.segments }
  }
  if (expression?.type !== "MemberExpression") {
    return { ambiguous, segments: [] }
  }

  const objectPath = javaScriptMemberPath(expression.object)
  const property = staticJavaScriptMemberProperty(expression)
  return {
    ambiguous: ambiguous || objectPath.ambiguous || !property.known,
    segments: property.known ? [...objectPath.segments, property.value] : objectPath.segments
  }
}

function staticJavaScriptObjectPropertyKey(node) {
  if (!node?.computed && node?.key?.type === "Identifier") {
    return { known: true, value: node.key.name }
  }
  if (
    node?.key?.type === "Literal" &&
    typeof node.key.value === "string" &&
    (node.computed === true || node.computed === false)
  ) {
    return { known: true, value: node.key.value }
  }
  if (
    node?.computed === true &&
    node?.key?.type === "TemplateLiteral" &&
    node.key.expressions?.length === 0 &&
    node.key.quasis?.length === 1
  ) {
    const value = node.key.quasis[0]?.value?.cooked
    if (typeof value === "string") return { known: true, value }
  }
  return { known: false, value: null }
}

function classifyNodeTestOptions(node, { rejectCallbackOverride = false } = {}) {
  if (node === null) return "active"
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (normalized.ambiguous || expression?.type !== "ObjectExpression") return "unknown"

  const seen = new Set()
  for (const property of expression.properties ?? []) {
    if (
      property?.type !== "Property" ||
      property.kind !== "init" ||
      property.method === true ||
      property.shorthand === true
    ) {
      return "unknown"
    }
    const key = staticJavaScriptObjectPropertyKey(property)
    if (
      !key.known ||
      ![
        "concurrency",
        "expectFailure",
        "fn",
        "only",
        "plan",
        "signal",
        "skip",
        "timeout",
        "todo"
      ].includes(key.value) ||
      seen.has(key.value)
    ) {
      return "unknown"
    }
    seen.add(key.value)
    if (rejectCallbackOverride && key.value === "fn") return "unknown"
    if (key.value === "signal") return "unknown"
    if (key.value === "fn") {
      const value = normalizeJavaScriptExpression(property.value)
      if (
        value.ambiguous ||
        !javaScriptFunctionTypes.has(value.expression?.type) ||
        value.expression.generator === true
      ) {
        return "unknown"
      }
      continue
    }

    const value = normalizeJavaScriptExpression(property.value)
    if (value.ambiguous || value.expression?.type !== "Literal") return "unknown"
    const literal = value.expression.value
    if (["skip", "todo"].includes(key.value)) {
      if (literal === false) continue
      if (literal === true || (typeof literal === "string" && literal.length > 0)) {
        return "disabled"
      }
      return "unknown"
    }
    if (["only", "expectFailure"].includes(key.value)) {
      if (literal === false) continue
      return literal === true ? "disabled" : "unknown"
    }
    if (key.value === "concurrency") {
      if (
        typeof literal === "boolean" ||
        (typeof literal === "number" && Number.isInteger(literal) && literal > 0)
      ) {
        continue
      }
      return "unknown"
    }
    if (key.value === "timeout") {
      if (typeof literal === "number" && Number.isFinite(literal) && literal >= 0) continue
      return "unknown"
    }
    if (key.value === "plan") {
      if (typeof literal === "number" && Number.isInteger(literal) && literal >= 0) continue
      return "unknown"
    }
  }
  return "active"
}

function isStaticJavaScriptSuiteTitle(node) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  return (
    normalized.ambiguous === false &&
    ((expression?.type === "Literal" && typeof expression.value === "string") ||
      expression?.type === "TemplateLiteral")
  )
}

function isExecutableJavaScriptTestCallback(node) {
  const normalized = normalizeJavaScriptExpression(node)
  const callback = normalized.expression
  return (
    normalized.ambiguous === false &&
    javaScriptFunctionTypes.has(callback?.type) &&
    callback.generator !== true
  )
}

function isStaticJavaScriptOptionsObject(node) {
  const normalized = normalizeJavaScriptExpression(node)
  return normalized.ambiguous === false && normalized.expression?.type === "ObjectExpression"
}

function isExecutableJavaScriptSuiteCallback(node, binding) {
  const normalized = normalizeJavaScriptExpression(node)
  const callback = normalized.expression
  return (
    normalized.ambiguous === false &&
    javaScriptFunctionTypes.has(callback?.type) &&
    callback.generator !== true &&
    !(binding?.role === "playwright-test" && callback.async === true)
  )
}

function isStaticPlaywrightAnnotation(node) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (normalized.ambiguous || expression?.type !== "ObjectExpression") return false

  const values = new Map()
  for (const property of expression.properties ?? []) {
    if (
      property?.type !== "Property" ||
      property.kind !== "init" ||
      property.method === true ||
      property.shorthand === true
    ) {
      return false
    }
    const key = staticJavaScriptObjectPropertyKey(property)
    if (!key.known || !["type", "description"].includes(key.value) || values.has(key.value)) {
      return false
    }
    const value = normalizeJavaScriptExpression(property.value)
    if (
      value.ambiguous ||
      value.expression?.type !== "Literal" ||
      typeof value.expression.value !== "string"
    ) {
      return false
    }
    values.set(key.value, value.expression.value)
  }
  return values.has("type")
}

function isStaticPlaywrightDetailsValue(node, key) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (normalized.ambiguous) return false
  if (key === "tag") {
    if (expression?.type === "Literal") {
      return typeof expression.value === "string" && expression.value.startsWith("@")
    }
    return (
      expression?.type === "ArrayExpression" &&
      (expression.elements ?? []).every(
        (element) =>
          element?.type === "Literal" &&
          typeof element.value === "string" &&
          element.value.startsWith("@")
      )
    )
  }
  if (isStaticPlaywrightAnnotation(expression)) return true
  return (
    expression?.type === "ArrayExpression" &&
    (expression.elements ?? []).every((element) => isStaticPlaywrightAnnotation(element))
  )
}

function classifyPlaywrightSuiteDetails(node) {
  if (node === null) return "active"
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (normalized.ambiguous || expression?.type !== "ObjectExpression") return "unknown"

  const seen = new Set()
  for (const property of expression.properties ?? []) {
    if (
      property?.type !== "Property" ||
      property.kind !== "init" ||
      property.method === true ||
      property.shorthand === true
    ) {
      return "unknown"
    }
    const key = staticJavaScriptObjectPropertyKey(property)
    if (!key.known || !["tag", "annotation"].includes(key.value) || seen.has(key.value)) {
      return "unknown"
    }
    if (!isStaticPlaywrightDetailsValue(property.value, key.value)) return "unknown"
    seen.add(key.value)
  }
  return "active"
}

function javaScriptSuiteCallOverload(expression, binding) {
  const args = expression.arguments ?? []
  if (args.some((argument) => argument?.type === "SpreadElement")) return null
  if (args.length === 1 && isExecutableJavaScriptSuiteCallback(args[0], binding)) {
    return { callback: args[0], options: null }
  }
  if (args.length === 2 && isExecutableJavaScriptSuiteCallback(args[1], binding)) {
    if (isStaticJavaScriptSuiteTitle(args[0])) {
      return { callback: args[1], options: null }
    }
    if (binding?.role === "node-suite" && isStaticJavaScriptOptionsObject(args[0])) {
      return { callback: args[1], options: args[0] }
    }
    return null
  }
  if (
    args.length === 3 &&
    isStaticJavaScriptSuiteTitle(args[0]) &&
    isStaticJavaScriptOptionsObject(args[1]) &&
    isExecutableJavaScriptSuiteCallback(args[2], binding)
  ) {
    return { callback: args[2], options: args[1] }
  }
  return null
}

function javaScriptTestCallOverload(expression) {
  const args = expression.arguments ?? []
  if (args.some((argument) => argument?.type === "SpreadElement")) return null
  if (args.length === 2 && isExecutableJavaScriptTestCallback(args[1])) {
    return { callback: args[1], options: null }
  }
  if (args.length === 3 && isExecutableJavaScriptTestCallback(args[2])) {
    return { callback: args[2], options: args[1] }
  }
  return null
}

function javaScriptSuiteBinding(expression, memberPath, bindings) {
  const importedBinding = bindings.get(memberPath.segments[0], expression)
  if (importedBinding?.role === "node-suite") {
    return { binding: importedBinding, modifierStart: 1 }
  }
  if (
    importedBinding?.role === "node-test" &&
    ["describe", "suite"].includes(memberPath.segments[1])
  ) {
    return { binding: { role: "node-suite" }, modifierStart: 2 }
  }
  if (
    importedBinding?.role === "node-test-namespace" &&
    ["describe", "suite"].includes(memberPath.segments[1])
  ) {
    return { binding: { role: "node-suite" }, modifierStart: 2 }
  }
  if (importedBinding?.role === "playwright-test" && memberPath.segments[1] === "describe") {
    return { binding: importedBinding, modifierStart: 2 }
  }
  return null
}

function classifyJavaScriptSuiteCall(node, bindings, playwrightDisableNames = new Set()) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (expression?.type !== "CallExpression") return "unknown"
  const memberPath = javaScriptMemberPath(expression.callee)
  if (["xcontext", "xdescribe", "xsuite"].includes(memberPath.segments[0])) {
    return "disabled"
  }

  const suite = javaScriptSuiteBinding(expression, memberPath, bindings)
  if (suite === null) return "unknown"
  const { binding, modifierStart } = suite
  if (normalized.ambiguous || expression.optional === true || memberPath.ambiguous) {
    return "ambiguous"
  }

  const modifiers = memberPath.segments.slice(modifierStart)
  if (modifiers.some((modifier) => disabledJavaScriptSuiteModifiers.has(modifier))) {
    return "disabled"
  }
  const activeModifierChains = activeJavaScriptSuiteModifierChains.get(binding.role)
  if (!activeModifierChains?.has(javaScriptModifierChainKey(modifiers))) return "unknown"

  const overload = javaScriptSuiteCallOverload(expression, binding)
  if (overload === null) return "unknown"
  if (binding.role === "node-suite") {
    const options = classifyNodeTestOptions(overload.options, {
      rejectCallbackOverride: true
    })
    if (options !== "active") return options
  } else if (binding.role === "playwright-test") {
    const details = classifyPlaywrightSuiteDetails(overload.options)
    if (details !== "active") return details
    if (hasPlaywrightTestDisable(overload.callback, bindings, playwrightDisableNames)) {
      return "disabled"
    }
  }
  return "active"
}

function hasBoundedJavaScriptRange(node, textLength) {
  return (
    Array.isArray(node?.range) &&
    node.range.length === 2 &&
    Number.isInteger(node.range[0]) &&
    Number.isInteger(node.range[1]) &&
    node.range[0] >= 0 &&
    node.range[0] <= node.range[1] &&
    node.range[1] <= textLength
  )
}

function javaScriptTitleContainsSelector(title, targetOffset, selector, textLength) {
  if (
    !hasBoundedJavaScriptRange(title, textLength) ||
    targetOffset < title.range[0] ||
    targetOffset >= title.range[1]
  ) {
    return false
  }
  if (title.type === "Literal") {
    return typeof title.value === "string" && title.value.includes(selector)
  }
  if (title.type !== "TemplateLiteral") return false

  return (
    title.quasis?.some(
      (quasi) =>
        hasBoundedJavaScriptRange(quasi, textLength) &&
        quasi.range[0] <= targetOffset &&
        targetOffset < quasi.range[1] &&
        typeof quasi.value?.cooked === "string" &&
        quasi.value.cooked.includes(selector)
    ) === true
  )
}

function walkJavaScriptAst(node, visitor, ancestors = [], seen = new WeakSet()) {
  if (node === null || typeof node !== "object" || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) {
    for (const child of node) walkJavaScriptAst(child, visitor, ancestors, seen)
    return
  }
  visitor(node, ancestors)
  const childAncestors = [...ancestors, node]
  for (const [key, child] of Object.entries(node)) {
    if (!["comments", "loc", "range", "tokens"].includes(key)) {
      walkJavaScriptAst(child, visitor, childAncestors, seen)
    }
  }
}

function collectJavaScriptPatternBindings(pattern, names) {
  if (!pattern || typeof pattern !== "object") return
  if (pattern.type === "Identifier") {
    names.add(pattern.name)
  } else if (pattern.type === "RestElement") {
    collectJavaScriptPatternBindings(pattern.argument, names)
  } else if (pattern.type === "AssignmentPattern") {
    collectJavaScriptPatternBindings(pattern.left, names)
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements ?? []) collectJavaScriptPatternBindings(element, names)
  } else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties ?? []) {
      collectJavaScriptPatternBindings(
        property.type === "RestElement" ? property.argument : property.value,
        names
      )
    }
  } else if (pattern.type === "TSParameterProperty") {
    collectJavaScriptPatternBindings(pattern.parameter, names)
  }
}

function collectJavaScriptAssignedBindings(target, names) {
  const expression = normalizeJavaScriptExpression(target).expression
  if (expression?.type === "MemberExpression") {
    collectJavaScriptAssignedBindings(expression.object, names)
  } else {
    collectJavaScriptPatternBindings(expression, names)
  }
}

function javaScriptImportedName(specifier) {
  if (specifier?.imported?.type === "Identifier") return specifier.imported.name
  return typeof specifier?.imported?.value === "string" ? specifier.imported.value : null
}

function authorizedJavaScriptImportRole(declaration, specifier) {
  if (declaration.importKind === "type" || specifier.importKind === "type") return null
  const source = declaration.source?.value
  if (source === "node:test") {
    if (specifier.type === "ImportNamespaceSpecifier") return "node-test-namespace"
    if (specifier.type === "ImportDefaultSpecifier") return "node-test"
    if (specifier.type !== "ImportSpecifier") return null
    const importedName = javaScriptImportedName(specifier)
    if (["it", "test"].includes(importedName)) return "node-test"
    if (["describe", "suite"].includes(importedName)) return "node-suite"
    if (nodeTestLifecycleHookNames.has(importedName)) return "node-hook"
  }
  if (
    source === "@playwright/test" &&
    specifier.type === "ImportSpecifier" &&
    javaScriptImportedName(specifier) === "test"
  ) {
    return "playwright-test"
  }
  return null
}

const javaScriptLexicalScopeTypes = new Set([
  "BlockStatement",
  "CatchClause",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "Program",
  "StaticBlock",
  "SwitchStatement",
  ...javaScriptFunctionTypes
])

function nearestJavaScriptScope(ancestors, { functionScope = false } = {}) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (
      ancestor?.type === "Program" ||
      javaScriptFunctionTypes.has(ancestor?.type) ||
      (!functionScope && javaScriptLexicalScopeTypes.has(ancestor?.type))
    ) {
      return ancestor
    }
  }
  return null
}

function attributableJavaScriptBindings(ast) {
  const authorizedImports = new Map()
  const nodeAncestors = new WeakMap()
  const shadowedBindings = new WeakMap()
  const writes = []
  const shadow = (scope, name) => {
    if (scope === null) return
    const names = shadowedBindings.get(scope) ?? new Set()
    names.add(name)
    shadowedBindings.set(scope, names)
  }
  const shadowPattern = (scope, pattern) => {
    const names = new Set()
    collectJavaScriptPatternBindings(pattern, names)
    for (const name of names) shadow(scope, name)
  }

  walkJavaScriptAst(ast, (node, ancestors) => {
    nodeAncestors.set(node, ancestors)
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers ?? []) {
        const localName = specifier.local?.name
        if (typeof localName !== "string") continue
        const role = authorizedJavaScriptImportRole(node, specifier)
        if (role !== null) {
          const candidates = authorizedImports.get(localName) ?? []
          candidates.push({ role })
          authorizedImports.set(localName, candidates)
        } else {
          shadow(ast, localName)
        }
      }
    } else if (node.type === "VariableDeclarator") {
      const declaration = ancestors.at(-1)
      const scope = nearestJavaScriptScope(ancestors, {
        functionScope: declaration?.kind === "var"
      })
      shadowPattern(scope, node.id)
    } else if (["FunctionDeclaration", "TSDeclareFunction"].includes(node.type)) {
      shadowPattern(nearestJavaScriptScope(ancestors), node.id)
      for (const parameter of node.params ?? []) shadowPattern(node, parameter)
    } else if (node.type === "FunctionExpression") {
      shadowPattern(node, node.id)
      for (const parameter of node.params ?? []) shadowPattern(node, parameter)
    } else if (node.type === "ArrowFunctionExpression") {
      for (const parameter of node.params ?? []) shadowPattern(node, parameter)
    } else if (["ClassDeclaration", "TSEnumDeclaration"].includes(node.type)) {
      shadowPattern(nearestJavaScriptScope(ancestors), node.id)
    } else if (node.type === "ClassExpression") {
      shadowPattern(node, node.id)
    } else if (node.type === "CatchClause") {
      shadowPattern(node, node.param)
    } else if (node.type === "TSImportEqualsDeclaration") {
      shadowPattern(nearestJavaScriptScope(ancestors), node.id)
    } else if (
      ["ForInStatement", "ForOfStatement"].includes(node.type) &&
      node.left?.type !== "VariableDeclaration"
    ) {
      const names = new Set()
      collectJavaScriptAssignedBindings(node.left, names)
      writes.push({ names, node })
    } else if (node.type === "AssignmentExpression") {
      const names = new Set()
      collectJavaScriptAssignedBindings(node.left, names)
      writes.push({ names, node })
    } else if (node.type === "UpdateExpression") {
      const names = new Set()
      collectJavaScriptAssignedBindings(node.argument, names)
      writes.push({ names, node })
    } else if (node.type === "UnaryExpression" && node.operator === "delete") {
      const names = new Set()
      collectJavaScriptAssignedBindings(node.argument, names)
      writes.push({ names, node })
    }
  })

  const resolvesAuthorizedImport = (name, node) => {
    const candidates = authorizedImports.get(name)
    if (candidates?.length !== 1) return null
    const ancestors = nodeAncestors.get(node) ?? []
    for (const ancestor of ancestors) {
      if (shadowedBindings.get(ancestor)?.has(name)) return null
    }
    return candidates[0]
  }

  const writtenImports = new Set()
  for (const write of writes) {
    for (const name of write.names) {
      if (resolvesAuthorizedImport(name, write.node) !== null) writtenImports.add(name)
    }
  }

  return {
    get(name, node) {
      if (writtenImports.has(name)) return null
      return resolvesAuthorizedImport(name, node)
    }
  }
}

function javaScriptProofCall(
  node,
  targetOffset,
  selector,
  textLength,
  bindings,
  ast,
  playwrightDisableNames
) {
  if (node?.type !== "CallExpression" || node.optional === true) return false
  const expression = node

  const memberPath = javaScriptMemberPath(expression.callee)
  const importedBinding = bindings.get(memberPath.segments[0], expression)
  const binding =
    importedBinding?.role === "node-test-namespace" &&
    ["it", "test"].includes(memberPath.segments[1])
      ? { role: "node-test" }
      : importedBinding
  const modifierStart = importedBinding?.role === "node-test-namespace" ? 2 : 1
  if (memberPath.ambiguous || !javaScriptProofBindingRoles.has(binding?.role)) return false
  if (binding.role === "playwright-test" && memberPath.segments[1] === "describe") return false
  const modifiers = memberPath.segments.slice(modifierStart)
  const activeModifierChains = activeJavaScriptTestModifierChains.get(binding.role)
  if (
    modifiers.some((modifier) => nonExecutableTestModifiers.has(modifier)) ||
    !activeModifierChains?.has(javaScriptModifierChainKey(modifiers))
  ) {
    return false
  }
  const overload = javaScriptTestCallOverload(expression)
  if (overload === null) return false
  const processExitTerminators = javaScriptProcessExitTerminatorNames(ast)
  if (
    hasJavaScriptProcessExit(overload.callback, { includeFunctions: true }) ||
    javaScriptCallsTerminator(overload.callback, processExitTerminators, {
      includeFunctions: true
    })
  ) {
    return false
  }
  if (binding.role === "node-test") {
    if (
      classifyNodeTestOptions(overload.options, { rejectCallbackOverride: true }) !== "active" ||
      hasNodeTestContextDisable(overload.callback)
    ) {
      return false
    }
  } else if (
    binding.role === "playwright-test" &&
    hasPlaywrightTestDisable(overload.callback, bindings, playwrightDisableNames)
  ) {
    return false
  }

  const title = expression.arguments?.[0]
  return javaScriptTitleContainsSelector(title, targetOffset, selector, textLength)
}

function javaScriptNodeTestHookCallback(node, bindings) {
  if (node?.type !== "CallExpression" || node.optional === true) return null
  const memberPath = javaScriptMemberPath(node.callee)
  if (memberPath.ambiguous) return null
  const binding = bindings.get(memberPath.segments[0], node)
  const directHook = binding?.role === "node-hook" && memberPath.segments.length === 1
  const namespaceHook =
    binding?.role === "node-test-namespace" &&
    memberPath.segments.length === 2 &&
    nodeTestLifecycleHookNames.has(memberPath.segments[1])
  if (!directHook && !namespaceHook) return null
  if (node.arguments?.some((argument) => argument?.type === "SpreadElement")) return null
  const callback = normalizeJavaScriptExpression(node.arguments?.[0]).expression
  return isExecutableJavaScriptTestCallback(callback) || callback?.type === "Identifier"
    ? callback
    : null
}

function hasPotentialNodeTestHookRegistration(ancestors, bindings, playwrightDisableNames) {
  for (let index = 0; index < ancestors.length; index += 1) {
    if (!javaScriptFunctionTypes.has(ancestors[index]?.type)) continue
    if (
      javaScriptFunctionRegistration(index, ancestors, bindings, playwrightDisableNames) !==
      "active"
    ) {
      return false
    }
  }
  return true
}

function hasEscapedNodeTestLifecycleHook(ast, bindings) {
  let escaped = false
  walkJavaScriptAst(ast, (node, ancestors) => {
    if (escaped) return
    if (node.type === "MemberExpression") {
      const memberPath = javaScriptMemberPath(node)
      const binding = bindings.get(memberPath.segments[0], node)
      const lifecycleMember =
        !memberPath.ambiguous &&
        binding?.role === "node-test-namespace" &&
        memberPath.segments.length === 2 &&
        nodeTestLifecycleHookNames.has(memberPath.segments[1])
      const parent = ancestors.at(-1)
      if (lifecycleMember && !(parent?.type === "CallExpression" && parent.callee === node)) {
        escaped = true
      }
      return
    }
    if (node.type === "Identifier" && bindings.get(node.name, node)?.role === "node-hook") {
      const parent = ancestors.at(-1)
      const declarationIdentifier = parent?.type === "ImportSpecifier"
      const staticPropertyKey =
        parent?.type === "Property" &&
        parent.key === node &&
        parent.computed !== true &&
        parent.shorthand !== true
      if (
        !declarationIdentifier &&
        !staticPropertyKey &&
        !(parent?.type === "CallExpression" && parent.callee === node)
      ) {
        escaped = true
      }
      return
    }
    if (!["AssignmentExpression", "VariableDeclarator"].includes(node.type)) return
    const source = normalizeJavaScriptExpression(
      node.type === "VariableDeclarator" ? node.init : node.right
    ).expression
    const target = node.type === "VariableDeclarator" ? node.id : node.left
    const sourcePath = javaScriptMemberPath(source)
    if (sourcePath.ambiguous) return
    const sourceBinding = bindings.get(sourcePath.segments[0], node)
    const aliasesDirectHook =
      (sourceBinding?.role === "node-hook" && sourcePath.segments.length === 1) ||
      (sourceBinding?.role === "node-test-namespace" &&
        sourcePath.segments.length === 2 &&
        nodeTestLifecycleHookNames.has(sourcePath.segments[1]))
    if (aliasesDirectHook) {
      const names = new Set()
      collectJavaScriptPatternBindings(target, names)
      escaped = names.size > 0
      return
    }
    if (
      sourceBinding?.role !== "node-test-namespace" ||
      sourcePath.segments.length !== 1 ||
      target?.type !== "ObjectPattern"
    ) {
      return
    }
    escaped = (target.properties ?? []).some((property) => {
      if (property?.type === "RestElement") return true
      const key = staticJavaScriptObjectPropertyKey(property)
      return !key.known || nodeTestLifecycleHookNames.has(key.value)
    })
  })
  return escaped
}

function hasUnsafeNodeTestHook(ast, bindings, playwrightDisableNames) {
  const processExitTerminators = javaScriptProcessExitTerminatorNames(ast)
  let terminating = false
  walkJavaScriptAst(ast, (node, ancestors) => {
    if (terminating) return
    const callback = javaScriptNodeTestHookCallback(node, bindings)
    if (
      callback === null ||
      !hasPotentialNodeTestHookRegistration(ancestors, bindings, playwrightDisableNames)
    ) {
      return
    }
    terminating =
      hasNodeTestContextDisable(callback) ||
      (callback.type === "Identifier" && processExitTerminators.has(callback.name)) ||
      hasJavaScriptProcessExit(callback, { includeFunctions: true }) ||
      javaScriptCallsTerminator(callback, processExitTerminators, { includeFunctions: true })
  })
  return terminating
}

function javaScriptFunctionRegistration(
  functionIndex,
  ancestors,
  bindings,
  playwrightDisableNames
) {
  let child = ancestors[functionIndex]
  let parentIndex = functionIndex - 1
  while (
    parentIndex >= 0 &&
    transparentJavaScriptExpressionTypes.has(ancestors[parentIndex]?.type) &&
    ancestors[parentIndex].expression === child
  ) {
    child = ancestors[parentIndex]
    parentIndex -= 1
  }
  const parent = ancestors[parentIndex]
  if (parent?.type !== "CallExpression") return "unknown"
  const memberPath = javaScriptMemberPath(parent.callee)
  const suite = javaScriptSuiteBinding(parent, memberPath, bindings)
  const overload = javaScriptSuiteCallOverload(parent, suite?.binding)
  if (overload?.callback !== child) return "unknown"
  return classifyJavaScriptSuiteCall(parent, bindings, playwrightDisableNames)
}

function isProvablyNonemptyJavaScriptForOf(statement) {
  const normalized = normalizeJavaScriptExpression(statement?.right)
  const expression = normalized.expression
  const declaration = statement?.left?.declarations?.[0]
  return (
    normalized.ambiguous === false &&
    statement?.left?.type === "VariableDeclaration" &&
    statement.left.declarations?.length === 1 &&
    declaration?.id?.type === "Identifier" &&
    declaration.init === null &&
    expression?.type === "ArrayExpression" &&
    expression.elements?.length > 0 &&
    expression.elements.every((element) => element === null || element?.type === "Literal")
  )
}

const javaScriptGlobalObjectNames = new Set(["global", "globalThis"])

function javaScriptProcessObjectPathIndex(memberPath, processObjectNames) {
  if (processObjectNames.has(memberPath.segments[0])) return 0
  if (
    javaScriptGlobalObjectNames.has(memberPath.segments[0]) &&
    memberPath.segments[1] === "process"
  ) {
    return 1
  }
  return -1
}

function javaScriptMemberPathReferencesProcessObject(memberPath, processObjectNames) {
  return javaScriptProcessObjectPathIndex(memberPath, processObjectNames) !== -1
}

function javaScriptMemberPathInvokesProcessExit(memberPath, processObjectNames) {
  const processIndex = javaScriptProcessObjectPathIndex(memberPath, processObjectNames)
  return (
    processIndex !== -1 &&
    (memberPath.ambiguous || memberPath.segments[processIndex + 1] === "exit")
  )
}

function javaScriptExpressionReferencesProcessObject(expression, processObjectNames) {
  let referencesProcess = false
  walkJavaScriptAst(expression, (node, ancestors) => {
    if (referencesProcess) return
    if (
      node.type === "Identifier" &&
      isJavaScriptIdentifierReference(node, ancestors) &&
      processObjectNames.has(node.name)
    ) {
      referencesProcess = true
      return
    }
    if (
      node.type === "MemberExpression" &&
      javaScriptMemberPathReferencesProcessObject(javaScriptMemberPath(node), processObjectNames)
    ) {
      referencesProcess = true
    }
  })
  return referencesProcess
}

function hasJavaScriptProcessExit(
  expression,
  { includeFunctions = false, processObjectNames = new Set(["process"]) } = {}
) {
  let exits = false
  walkJavaScriptAst(expression, (node, ancestors) => {
    const functionDepth = ancestors.filter((ancestor) =>
      javaScriptFunctionTypes.has(ancestor?.type)
    ).length
    if (
      exits ||
      !["CallExpression", "MemberExpression"].includes(node.type) ||
      (!includeFunctions && functionDepth > 0)
    ) {
      return
    }
    if (node.type === "CallExpression") {
      const reflectiveCallee = javaScriptMemberPath(node.callee)
      if (
        !reflectiveCallee.ambiguous &&
        reflectiveCallee.segments.join(".") === "Reflect.get" &&
        node.arguments?.length >= 2 &&
        javaScriptMemberPathReferencesProcessObject(
          javaScriptMemberPath(node.arguments[0]),
          processObjectNames
        )
      ) {
        const reflectedProperty = normalizeJavaScriptExpression(node.arguments[1])
        if (
          reflectedProperty.ambiguous ||
          reflectedProperty.expression?.type !== "Literal" ||
          reflectedProperty.expression.value === "exit"
        ) {
          exits = true
          return
        }
      }
    }
    const memberPath = javaScriptMemberPath(node.type === "CallExpression" ? node.callee : node)
    if (javaScriptMemberPathInvokesProcessExit(memberPath, processObjectNames)) {
      exits = true
    }
  })
  return exits
}

function javaScriptCallsTerminator(expression, terminatorNames, { includeFunctions = false } = {}) {
  let callsTerminator = false
  walkJavaScriptAst(expression, (node, ancestors) => {
    if (callsTerminator || node.type !== "CallExpression") return
    if (
      !includeFunctions &&
      ancestors.some((ancestor) => javaScriptFunctionTypes.has(ancestor?.type))
    ) {
      return
    }
    const calleePath = javaScriptMemberPath(node.callee)
    if (!terminatorNames.has(calleePath.segments[0])) return
    callsTerminator = true
  })
  return callsTerminator
}

function javaScriptProcessExitTerminatorNames(expression) {
  const functionBodies = new Map()
  const classBodies = new Map()
  const aliases = []
  const terminatorNames = new Set()
  const processObjectNames = new Set(["process"])
  const isProcessModuleCall = (value) => {
    const normalized = normalizeJavaScriptExpression(value)
    const call = normalized.expression
    return (
      normalized.ambiguous === false &&
      call?.type === "CallExpression" &&
      call.callee?.type === "Identifier" &&
      call.callee.name === "require" &&
      call.arguments?.length === 1 &&
      call.arguments[0]?.type === "Literal" &&
      ["node:process", "process"].includes(call.arguments[0].value)
    )
  }
  const addProcessModuleBinding = (target) => {
    if (target?.type === "Identifier") {
      processObjectNames.add(target.name)
      return
    }
    if (target?.type !== "ObjectPattern") return
    for (const property of target.properties ?? []) {
      if (property?.type === "RestElement") {
        const names = new Set()
        collectJavaScriptAssignedBindings(property.argument, names)
        for (const name of names) processObjectNames.add(name)
        continue
      }
      const key = staticJavaScriptObjectPropertyKey(property)
      if (!key.known || key.value !== "exit") continue
      const names = new Set()
      collectJavaScriptAssignedBindings(property.value, names)
      for (const name of names) terminatorNames.add(name)
    }
  }
  walkJavaScriptAst(expression, (node) => {
    if (
      node.type === "ImportDeclaration" &&
      node.source?.type === "Literal" &&
      ["node:process", "process"].includes(node.source.value)
    ) {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type === "ImportSpecifier") {
          const importedName = specifier.imported?.name ?? specifier.imported?.value
          if (importedName === "exit" && specifier.local?.type === "Identifier") {
            terminatorNames.add(specifier.local.name)
          } else if (importedName === "default" && specifier.local?.type === "Identifier") {
            processObjectNames.add(specifier.local.name)
          }
        } else if (
          ["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(specifier.type) &&
          specifier.local?.type === "Identifier"
        ) {
          processObjectNames.add(specifier.local.name)
        }
      }
      return
    }
    if (node.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
      functionBodies.set(node.id.name, node.body)
      return
    }
    if (node.type === "VariableDeclarator") {
      if (isProcessModuleCall(node.init)) {
        addProcessModuleBinding(node.id)
        return
      }
      const initializer = normalizeJavaScriptExpression(node.init)
      if (
        node.id?.type === "Identifier" &&
        !initializer.ambiguous &&
        javaScriptFunctionTypes.has(initializer.expression?.type)
      ) {
        functionBodies.set(node.id.name, initializer.expression.body)
      } else {
        aliases.push({ target: node.id, source: node.init })
      }
      return
    }
    if (
      ["ClassDeclaration", "ClassExpression"].includes(node.type) &&
      node.id?.type === "Identifier"
    ) {
      classBodies.set(node.id.name, node.body)
      return
    }
    if (node.type === "AssignmentExpression" && node.operator === "=") {
      if (isProcessModuleCall(node.right)) {
        addProcessModuleBinding(node.left)
        return
      }
      aliases.push({ target: node.left, source: node.right })
    }
  })

  let processAliasesChanged = true
  while (processAliasesChanged) {
    processAliasesChanged = false
    for (const { target, source } of aliases) {
      const normalizedSource = normalizeJavaScriptExpression(source)
      if (
        target?.type === "Identifier" &&
        !normalizedSource.ambiguous &&
        normalizedSource.expression?.type === "Identifier" &&
        processObjectNames.has(normalizedSource.expression.name) &&
        !processObjectNames.has(target.name)
      ) {
        processObjectNames.add(target.name)
        processAliasesChanged = true
      }
    }
  }

  for (const [name, body] of functionBodies) {
    const referencesProcess = javaScriptExpressionReferencesProcessObject(body, processObjectNames)
    if (
      referencesProcess ||
      hasJavaScriptProcessExit(body, { includeFunctions: true, processObjectNames })
    ) {
      terminatorNames.add(name)
    }
  }
  for (const [name, body] of classBodies) {
    const referencesProcess = javaScriptExpressionReferencesProcessObject(body, processObjectNames)
    if (
      referencesProcess ||
      hasJavaScriptProcessExit(body, { includeFunctions: true, processObjectNames })
    ) {
      terminatorNames.add(name)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [name, body] of functionBodies) {
      if (
        !terminatorNames.has(name) &&
        javaScriptCallsTerminator(body, terminatorNames, { includeFunctions: true })
      ) {
        terminatorNames.add(name)
        changed = true
      }
    }
    for (const { target, source } of aliases) {
      const normalizedSource = normalizeJavaScriptExpression(source)
      const sourcePath = javaScriptMemberPath(source)
      const sourceReferencesProcess = javaScriptExpressionReferencesProcessObject(
        source,
        processObjectNames
      )
      const sourceTerminates =
        javaScriptMemberPathReferencesProcessObject(sourcePath, processObjectNames) ||
        sourceReferencesProcess ||
        hasJavaScriptProcessExit(normalizedSource.expression, {
          includeFunctions: true,
          processObjectNames
        }) ||
        (!normalizedSource.ambiguous &&
          normalizedSource.expression?.type === "Identifier" &&
          terminatorNames.has(normalizedSource.expression.name))
      if (sourceTerminates) {
        const targetNames = new Set()
        collectJavaScriptAssignedBindings(target, targetNames)
        for (const name of targetNames) {
          if (!terminatorNames.has(name)) {
            terminatorNames.add(name)
            changed = true
          }
        }
      }
      if (
        target?.type === "ObjectPattern" &&
        normalizedSource.ambiguous === false &&
        normalizedSource.expression?.type === "Identifier" &&
        processObjectNames.has(normalizedSource.expression.name)
      ) {
        for (const property of target.properties ?? []) {
          const key = staticJavaScriptObjectPropertyKey(property)
          const alias = property?.value
          if (
            key.known &&
            key.value === "exit" &&
            alias?.type === "Identifier" &&
            !terminatorNames.has(alias.name)
          ) {
            terminatorNames.add(alias.name)
            changed = true
          }
        }
      }
    }
  }
  for (const name of processObjectNames) {
    if (name !== "process") terminatorNames.add(name)
  }
  return terminatorNames
}

function hasInvokedJavaScriptProcessExit(expression, terminatorNames = new Set()) {
  let invokedExit = false
  walkJavaScriptAst(expression, (node) => {
    if (invokedExit || node.type !== "CallExpression") return
    const callee = normalizeJavaScriptExpression(node.callee)
    if (
      !callee.ambiguous &&
      javaScriptFunctionTypes.has(callee.expression?.type) &&
      (hasJavaScriptProcessExit(callee.expression.body, { includeFunctions: true }) ||
        javaScriptCallsTerminator(callee.expression.body, terminatorNames, {
          includeFunctions: true
        }))
    ) {
      invokedExit = true
    }
  })
  return invokedExit
}

const javaScriptCallbackSchedulerNames = new Set([
  "queueMicrotask",
  "setImmediate",
  "setInterval",
  "setTimeout"
])

function staticJavaScriptRequiredModule(node) {
  const normalized = normalizeJavaScriptExpression(node)
  const call = normalized.expression
  return normalized.ambiguous === false &&
    call?.type === "CallExpression" &&
    call.callee?.type === "Identifier" &&
    call.callee.name === "require" &&
    call.arguments?.length === 1 &&
    call.arguments[0]?.type === "Literal" &&
    typeof call.arguments[0].value === "string"
    ? call.arguments[0].value
    : null
}

function javaScriptCallbackSchedulers(ast) {
  const globalObjectNames = new Set(javaScriptGlobalObjectNames)
  const processObjectNames = new Set(["process"])
  const timerObjectNames = new Set()
  const schedulerNames = new Set(javaScriptCallbackSchedulerNames)
  const aliases = []

  const addImportedBinding = (moduleName, importedName, localName) => {
    if (typeof localName !== "string") return
    if (["node:process", "process"].includes(moduleName)) {
      if (importedName === "nextTick") schedulerNames.add(localName)
      else if (["default", "*"].includes(importedName)) processObjectNames.add(localName)
    } else if (["node:timers", "timers"].includes(moduleName)) {
      if (javaScriptCallbackSchedulerNames.has(importedName)) schedulerNames.add(localName)
      else if (importedName === "*") timerObjectNames.add(localName)
    }
  }

  walkJavaScriptAst(ast, (node) => {
    if (node.type === "ImportDeclaration" && typeof node.source?.value === "string") {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.local?.type !== "Identifier") continue
        if (specifier.type === "ImportSpecifier") {
          addImportedBinding(
            node.source.value,
            specifier.imported?.name ?? specifier.imported?.value,
            specifier.local.name
          )
        } else if (specifier.type === "ImportDefaultSpecifier") {
          addImportedBinding(node.source.value, "default", specifier.local.name)
        } else if (specifier.type === "ImportNamespaceSpecifier") {
          addImportedBinding(node.source.value, "*", specifier.local.name)
        }
      }
      return
    }
    if (node.type === "VariableDeclarator") {
      aliases.push({ source: node.init, target: node.id })
    } else if (node.type === "AssignmentExpression" && node.operator === "=") {
      aliases.push({ source: node.right, target: node.left })
    }
  })

  const pathIsGlobalObject = (path) =>
    !path.ambiguous && path.segments.length === 1 && globalObjectNames.has(path.segments[0])
  const pathIsProcessObject = (path) =>
    !path.ambiguous &&
    ((path.segments.length === 1 && processObjectNames.has(path.segments[0])) ||
      (path.segments.length === 2 &&
        globalObjectNames.has(path.segments[0]) &&
        path.segments[1] === "process"))
  const pathIsTimerObject = (path) =>
    !path.ambiguous && path.segments.length === 1 && timerObjectNames.has(path.segments[0])
  const pathIsScheduler = (path) =>
    !path.ambiguous &&
    ((path.segments.length === 1 && schedulerNames.has(path.segments[0])) ||
      (path.segments.length === 2 &&
        globalObjectNames.has(path.segments[0]) &&
        javaScriptCallbackSchedulerNames.has(path.segments[1])) ||
      (path.segments.length === 2 &&
        processObjectNames.has(path.segments[0]) &&
        path.segments[1] === "nextTick") ||
      (path.segments.length === 2 &&
        timerObjectNames.has(path.segments[0]) &&
        javaScriptCallbackSchedulerNames.has(path.segments[1])) ||
      (path.segments.length === 3 &&
        globalObjectNames.has(path.segments[0]) &&
        path.segments[1] === "process" &&
        path.segments[2] === "nextTick"))

  const addPatternBindings = (pattern, destination) => {
    const names = new Set()
    collectJavaScriptAssignedBindings(pattern, names)
    let changed = false
    for (const name of names) {
      if (!destination.has(name)) {
        destination.add(name)
        changed = true
      }
    }
    return changed
  }

  let changed = true
  while (changed) {
    changed = false
    for (const { source, target } of aliases) {
      const requiredModule = staticJavaScriptRequiredModule(source)
      if (requiredModule !== null) {
        if (target?.type === "Identifier") {
          if (
            ["node:process", "process"].includes(requiredModule) &&
            !processObjectNames.has(target.name)
          ) {
            processObjectNames.add(target.name)
            changed = true
          } else if (
            ["node:timers", "timers"].includes(requiredModule) &&
            !timerObjectNames.has(target.name)
          ) {
            timerObjectNames.add(target.name)
            changed = true
          }
        }
        if (target?.type === "ObjectPattern") {
          for (const property of target.properties ?? []) {
            if (property?.type === "RestElement") continue
            const key = staticJavaScriptObjectPropertyKey(property)
            if (!key.known) continue
            if (
              (["node:process", "process"].includes(requiredModule) && key.value === "nextTick") ||
              (["node:timers", "timers"].includes(requiredModule) &&
                javaScriptCallbackSchedulerNames.has(key.value))
            ) {
              changed = addPatternBindings(property.value, schedulerNames) || changed
            }
          }
        }
        continue
      }

      const sourcePath = javaScriptMemberPath(source)
      if (target?.type === "Identifier") {
        if (pathIsGlobalObject(sourcePath) && !globalObjectNames.has(target.name)) {
          globalObjectNames.add(target.name)
          changed = true
        }
        if (pathIsProcessObject(sourcePath) && !processObjectNames.has(target.name)) {
          processObjectNames.add(target.name)
          changed = true
        }
        if (pathIsTimerObject(sourcePath) && !timerObjectNames.has(target.name)) {
          timerObjectNames.add(target.name)
          changed = true
        }
        if (pathIsScheduler(sourcePath) && !schedulerNames.has(target.name)) {
          schedulerNames.add(target.name)
          changed = true
        }
        continue
      }
      if (target?.type !== "ObjectPattern") continue
      for (const property of target.properties ?? []) {
        if (property?.type === "RestElement") {
          if (pathIsGlobalObject(sourcePath)) {
            changed = addPatternBindings(property.argument, globalObjectNames) || changed
          } else if (pathIsProcessObject(sourcePath)) {
            changed = addPatternBindings(property.argument, processObjectNames) || changed
          } else if (pathIsTimerObject(sourcePath)) {
            changed = addPatternBindings(property.argument, timerObjectNames) || changed
          }
          continue
        }
        const key = staticJavaScriptObjectPropertyKey(property)
        if (!key.known) continue
        if (
          (pathIsGlobalObject(sourcePath) && javaScriptCallbackSchedulerNames.has(key.value)) ||
          (pathIsProcessObject(sourcePath) && key.value === "nextTick") ||
          (pathIsTimerObject(sourcePath) && javaScriptCallbackSchedulerNames.has(key.value))
        ) {
          changed = addPatternBindings(property.value, schedulerNames) || changed
        } else if (pathIsGlobalObject(sourcePath) && key.value === "process") {
          changed = addPatternBindings(property.value, processObjectNames) || changed
        }
      }
    }
  }

  return { pathIsScheduler }
}

function hasScheduledJavaScriptProcessExit(ast, bindings, playwrightDisableNames) {
  const terminatorNames = javaScriptProcessExitTerminatorNames(ast)
  const schedulers = javaScriptCallbackSchedulers(ast)
  let scheduledExit = false
  walkJavaScriptAst(ast, (node, ancestors) => {
    if (scheduledExit || node.type !== "CallExpression" || node.optional === true) return
    const callee = javaScriptMemberPath(node.callee)
    if (callee.ambiguous) return
    const schedulesCallback = schedulers.pathIsScheduler(callee)
    if (
      !schedulesCallback ||
      !hasPotentialNodeTestHookRegistration(ancestors, bindings, playwrightDisableNames)
    ) {
      return
    }
    const callback = normalizeJavaScriptExpression(node.arguments?.[0]).expression
    if (callback?.type === "Identifier" && terminatorNames.has(callback.name)) {
      scheduledExit = true
      return
    }
    scheduledExit =
      hasJavaScriptProcessExit(callback, { includeFunctions: true }) ||
      javaScriptCallsTerminator(callback, terminatorNames, { includeFunctions: true })
  })
  return scheduledExit
}

function hasLaterJavaScriptProcessExit(parent, child) {
  const expressions = parent?.type === "SequenceExpression" ? parent.expressions : null
  const statements = ["BlockStatement", "Program", "StaticBlock"].includes(parent?.type)
    ? parent.body
    : expressions
  const childIndex = statements?.indexOf(child) ?? -1
  const terminatorNames = javaScriptProcessExitTerminatorNames(statements)
  return (
    childIndex >= 0 &&
    statements
      .slice(childIndex + 1)
      .some(
        (statement) =>
          hasJavaScriptProcessExit(statement) ||
          hasInvokedJavaScriptProcessExit(statement, terminatorNames) ||
          javaScriptCallsTerminator(statement, terminatorNames)
      )
  )
}

function canBypassLaterJavaScriptStatement(statement, { breakBypasses = true } = {}) {
  if (hasJavaScriptProcessExit(statement)) return true
  if (["ContinueStatement", "ReturnStatement", "ThrowStatement"].includes(statement?.type)) {
    return true
  }
  if (statement?.type === "BreakStatement") return breakBypasses || statement.label !== null
  if (statement?.type === "LabeledStatement") {
    return canBypassLaterJavaScriptStatement(statement.body, { breakBypasses })
  }
  if (statement?.type === "BlockStatement") {
    return (statement.body ?? []).some((child) =>
      canBypassLaterJavaScriptStatement(child, { breakBypasses })
    )
  }
  if (statement?.type === "IfStatement") {
    return (
      canBypassLaterJavaScriptStatement(statement.consequent, { breakBypasses }) ||
      canBypassLaterJavaScriptStatement(statement.alternate, { breakBypasses })
    )
  }
  if (statement?.type === "TryStatement") {
    return (
      canBypassLaterJavaScriptStatement(statement.block, { breakBypasses }) ||
      canBypassLaterJavaScriptStatement(statement.handler?.body, { breakBypasses }) ||
      canBypassLaterJavaScriptStatement(statement.finalizer, { breakBypasses })
    )
  }
  if (statement?.type === "SwitchStatement") {
    return (statement.cases ?? []).some((switchCase) =>
      (switchCase.consequent ?? []).some((child) =>
        canBypassLaterJavaScriptStatement(child, { breakBypasses: false })
      )
    )
  }
  return false
}

function hasPriorAbruptJavaScriptCompletion(parent, child) {
  const statements = ["BlockStatement", "Program", "StaticBlock"].includes(parent?.type)
    ? parent.body
    : null
  const childIndex = statements?.indexOf(child) ?? -1
  return (
    childIndex > 0 &&
    statements
      .slice(0, childIndex)
      .some((statement) => canBypassLaterJavaScriptStatement(statement))
  )
}

function hasConditionalJavaScriptRegistration(node, ancestors) {
  let child = node
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const parent = ancestors[index]
    if (
      (parent.type === "IfStatement" &&
        (parent.consequent === child || parent.alternate === child)) ||
      (parent.type === "ConditionalExpression" &&
        (parent.consequent === child || parent.alternate === child)) ||
      (parent.type === "LogicalExpression" && parent.right === child) ||
      (parent.type === "AssignmentExpression" &&
        ["&&=", "||=", "??="].includes(parent.operator) &&
        parent.right === child) ||
      (parent.type === "CallExpression" &&
        parent.arguments?.includes(child) &&
        (parent.optional === true || javaScriptMemberPath(parent.callee).ambiguous)) ||
      (parent.type === "MemberExpression" &&
        parent.computed === true &&
        parent.property === child &&
        (parent.optional === true || javaScriptMemberPath(parent.object).ambiguous)) ||
      (parent.type === "SwitchCase" &&
        (parent.test === child || parent.consequent?.includes(child))) ||
      (parent.type === "ForStatement" && (parent.body === child || parent.update === child)) ||
      (parent.type === "WhileStatement" && parent.body === child) ||
      (parent.type === "ForInStatement" && parent.body === child) ||
      (parent.type === "ForOfStatement" &&
        parent.body === child &&
        !isProvablyNonemptyJavaScriptForOf(parent)) ||
      (parent.type === "CatchClause" && parent.body === child) ||
      hasPriorAbruptJavaScriptCompletion(parent, child) ||
      hasLaterJavaScriptProcessExit(parent, child)
    ) {
      return true
    }
    child = parent
  }
  return false
}

function hasDeferredClassFieldRegistration(node, ancestors) {
  let child = node
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const parent = ancestors[index]
    if (parent.type === "PropertyDefinition" && parent.static !== true && parent.value === child) {
      return true
    }
    child = parent
  }
  return false
}

function isJavaScriptIdentifierReference(node, ancestors) {
  if (node?.type !== "Identifier") return false
  const parent = ancestors.at(-1)
  return !(
    (parent?.type === "MemberExpression" && parent.property === node && parent.computed !== true) ||
    (parent?.type === "Property" &&
      parent.key === node &&
      parent.computed !== true &&
      parent.shorthand !== true)
  )
}

function javaScriptExpressionReferencesIdentifier(expression, identifier) {
  let referenced = false
  walkJavaScriptAst(expression, (node, ancestors) => {
    if (isJavaScriptIdentifierReference(node, ancestors) && node.name === identifier) {
      referenced = true
    }
  })
  return referenced
}

function javaScriptExpressionReferencesBinding(expression, bindings, role) {
  let referenced = false
  walkJavaScriptAst(expression, (node, ancestors) => {
    if (
      isJavaScriptIdentifierReference(node, ancestors) &&
      bindings.get(node.name, node)?.role === role
    ) {
      referenced = true
    }
  })
  return referenced
}

function hasNodeTestContextDisable(callbackNode) {
  const normalized = normalizeJavaScriptExpression(callbackNode)
  const callback = normalized.expression
  if (normalized.ambiguous || !javaScriptFunctionTypes.has(callback?.type)) return true
  if ((callback.params?.length ?? 0) === 0) return false
  if (callback.params[0]?.type !== "Identifier") return true
  const contextName = callback.params[0].name

  let disabled = false
  walkJavaScriptAst(callback.body, (node) => {
    if (disabled) return
    if (
      node.type === "CallExpression" &&
      node.arguments?.some((argument) =>
        javaScriptExpressionReferencesIdentifier(argument, contextName)
      )
    ) {
      disabled = true
      return
    }
    const aliasSource =
      node.type === "VariableDeclarator"
        ? node.init
        : node.type === "AssignmentExpression"
          ? node.right
          : null
    if (javaScriptExpressionReferencesIdentifier(aliasSource, contextName)) {
      disabled = true
      return
    }
    if (node.type !== "MemberExpression") return
    const memberPath = javaScriptMemberPath(node)
    if (memberPath.segments[0] !== contextName) return
    if (memberPath.ambiguous || ["skip", "todo"].includes(memberPath.segments[1])) {
      disabled = true
    }
  })
  return disabled
}

const playwrightDisableMembers = new Set(["fail", "fixme", "skip"])

function javaScriptCallsPlaywrightDisable(expression, bindings, disableNames) {
  let disables = false
  walkJavaScriptAst(expression, (node) => {
    if (disables || node.type !== "CallExpression") return
    const memberPath = javaScriptMemberPath(node.callee)
    if (disableNames.has(memberPath.segments[0])) {
      disables = true
      return
    }
    const binding = bindings.get(memberPath.segments[0], node)
    if (
      binding?.role === "playwright-test" &&
      (memberPath.ambiguous || playwrightDisableMembers.has(memberPath.segments[1]))
    ) {
      disables = true
    }
  })
  return disables
}

function javaScriptPlaywrightDisableNames(ast, bindings) {
  const functionBodies = new Map()
  const aliases = []
  const disableNames = new Set()
  walkJavaScriptAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
      functionBodies.set(node.id.name, node.body)
      return
    }
    if (node.type === "VariableDeclarator") {
      const initializer = normalizeJavaScriptExpression(node.init)
      if (
        node.id?.type === "Identifier" &&
        !initializer.ambiguous &&
        javaScriptFunctionTypes.has(initializer.expression?.type)
      ) {
        functionBodies.set(node.id.name, initializer.expression.body)
      } else {
        aliases.push({ target: node.id, source: node.init })
      }
      return
    }
    if (node.type === "AssignmentExpression" && node.operator === "=") {
      aliases.push({ target: node.left, source: node.right })
    }
  })

  let changed = true
  while (changed) {
    changed = false
    for (const { target, source } of aliases) {
      const normalizedSource = normalizeJavaScriptExpression(source)
      const sourcePath = javaScriptMemberPath(source)
      const binding = bindings.get(sourcePath.segments[0], source)
      const sourceDisables =
        (binding?.role === "playwright-test" &&
          (sourcePath.ambiguous || playwrightDisableMembers.has(sourcePath.segments[1]))) ||
        (!normalizedSource.ambiguous &&
          normalizedSource.expression?.type === "Identifier" &&
          disableNames.has(normalizedSource.expression.name))
      if (target?.type === "Identifier" && sourceDisables && !disableNames.has(target.name)) {
        disableNames.add(target.name)
        changed = true
      }
      if (
        target?.type === "ObjectPattern" &&
        binding?.role === "playwright-test" &&
        sourcePath.segments.length === 1
      ) {
        for (const property of target.properties ?? []) {
          const key = staticJavaScriptObjectPropertyKey(property)
          const alias = property?.value
          if (
            key.known &&
            playwrightDisableMembers.has(key.value) &&
            alias?.type === "Identifier" &&
            !disableNames.has(alias.name)
          ) {
            disableNames.add(alias.name)
            changed = true
          }
        }
      }
    }
    for (const [name, body] of functionBodies) {
      if (
        !disableNames.has(name) &&
        javaScriptCallsPlaywrightDisable(body, bindings, disableNames)
      ) {
        disableNames.add(name)
        changed = true
      }
    }
  }
  return disableNames
}

function hasPlaywrightTestDisable(callbackNode, bindings, disableNames = new Set()) {
  const normalized = normalizeJavaScriptExpression(callbackNode)
  const callback = normalized.expression
  if (normalized.ambiguous || !javaScriptFunctionTypes.has(callback?.type)) return false
  if ((callback.params?.length ?? 0) > 1 && callback.params[1]?.type !== "Identifier") return true
  const testInfoName = callback.params?.[1]?.name ?? null

  let disabled = false
  walkJavaScriptAst(callback.body, (node) => {
    if (disabled) return
    if (node.type === "CallExpression") {
      const calleePath = javaScriptMemberPath(node.callee)
      if (disableNames.has(calleePath.segments[0])) {
        disabled = true
        return
      }
    }
    if (
      node.type === "CallExpression" &&
      node.arguments?.some(
        (argument) =>
          (testInfoName !== null &&
            javaScriptExpressionReferencesIdentifier(argument, testInfoName)) ||
          javaScriptExpressionReferencesBinding(argument, bindings, "playwright-test")
      )
    ) {
      disabled = true
      return
    }
    const aliasSource =
      node.type === "VariableDeclarator"
        ? node.init
        : node.type === "AssignmentExpression"
          ? node.right
          : null
    if (
      javaScriptExpressionReferencesBinding(aliasSource, bindings, "playwright-test") ||
      (testInfoName !== null && javaScriptExpressionReferencesIdentifier(aliasSource, testInfoName))
    ) {
      disabled = true
      return
    }
    if (node.type !== "MemberExpression") return
    const memberPath = javaScriptMemberPath(node)
    if (
      testInfoName !== null &&
      memberPath.segments[0] === testInfoName &&
      (memberPath.ambiguous || playwrightDisableMembers.has(memberPath.segments[1]))
    ) {
      disabled = true
      return
    }
    const binding = bindings.get(memberPath.segments[0], node)
    if (
      binding?.role !== "playwright-test" ||
      (!memberPath.ambiguous && !playwrightDisableMembers.has(memberPath.segments[1]))
    ) {
      return
    }
    disabled = true
  })
  return disabled
}

function hasAttributableJavaScriptRegistration(node, ancestors, bindings, playwrightDisableNames) {
  if (
    hasConditionalJavaScriptRegistration(node, ancestors) ||
    hasDeferredClassFieldRegistration(node, ancestors)
  ) {
    return false
  }
  for (let index = 0; index < ancestors.length; index += 1) {
    if (!javaScriptFunctionTypes.has(ancestors[index]?.type)) continue
    if (
      javaScriptFunctionRegistration(index, ancestors, bindings, playwrightDisableNames) !==
      "active"
    ) {
      return false
    }
  }
  return true
}

function hasExecutableJavaScriptProofAnchor(text, selector, proofPath) {
  const targetOffset = text.indexOf(selector)
  if (targetOffset === -1) return false

  let ast
  try {
    ast = typescriptPlugin.parsers.typescript.parse(text, { filepath: proofPath })
  } catch {
    return false
  }
  if (
    ast?.type !== "Program" ||
    typeof ast?.then === "function" ||
    !hasBoundedJavaScriptRange(ast, text.length)
  ) {
    return false
  }

  const matches = []
  let bindings
  let playwrightDisableNames
  try {
    bindings = attributableJavaScriptBindings(ast)
    playwrightDisableNames = javaScriptPlaywrightDisableNames(ast, bindings)
    if (
      hasEscapedNodeTestLifecycleHook(ast, bindings) ||
      hasUnsafeNodeTestHook(ast, bindings, playwrightDisableNames) ||
      hasScheduledJavaScriptProcessExit(ast, bindings, playwrightDisableNames)
    ) {
      return false
    }
    walkJavaScriptAst(ast, (node, ancestors) => {
      if (
        javaScriptProofCall(
          node,
          targetOffset,
          selector,
          text.length,
          bindings,
          ast,
          playwrightDisableNames
        )
      ) {
        matches.push({ ancestors, node })
      }
    })
  } catch {
    return false
  }
  return (
    matches.length === 1 &&
    hasAttributableJavaScriptRegistration(
      matches[0].node,
      matches[0].ancestors,
      bindings,
      playwrightDisableNames
    )
  )
}

const javaJUnitProofAnnotations = [
  ["Test", "org.junit.jupiter.api.Test", "void"],
  ["ParameterizedTest", "org.junit.jupiter.params.ParameterizedTest", "void"],
  ["RepeatedTest", "org.junit.jupiter.api.RepeatedTest", "void"]
]

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function translateJavaUnicodeEscapes(text) {
  let translated = ""
  let translatedBackslashRun = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === "\\" && translatedBackslashRun % 2 === 0 && text[index + 1] === "u") {
      const unicodeEscape = text.slice(index).match(/^\\u+([0-9a-fA-F]{4})/)
      if (unicodeEscape === null) return null
      const decoded = String.fromCharCode(Number.parseInt(unicodeEscape[1], 16))
      translated += decoded
      translatedBackslashRun = decoded === "\\" ? translatedBackslashRun + 1 : 0
      index += unicodeEscape[0].length - 1
      continue
    }
    translated += character
    translatedBackslashRun = character === "\\" ? translatedBackslashRun + 1 : 0
  }
  return translated
}

function maskJavaCommentsAndLiterals(text) {
  const characters = text.split("")
  let state = "code"
  const mask = (index) => {
    if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " "
  }
  const isEscaped = (offset) => {
    let backslashes = 0
    for (let index = offset - 1; index >= 0 && text[index] === "\\"; index -= 1) {
      backslashes += 1
    }
    return backslashes % 2 === 1
  }

  for (let index = 0; index < characters.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    const third = text[index + 2]
    if (state === "line-comment") {
      if (character === "\n") state = "code"
      else mask(index)
      continue
    }
    if (state === "block-comment") {
      mask(index)
      if (character === "*" && next === "/") {
        mask(index + 1)
        index += 1
        state = "code"
      }
      continue
    }
    if (state === "string" || state === "character") {
      const delimiter = state === "string" ? '"' : "'"
      mask(index)
      if (character === "\\") {
        mask(index + 1)
        index += 1
      } else if (character === delimiter) {
        state = "code"
      }
      continue
    }
    if (state === "text-block") {
      mask(index)
      if (character === '"' && next === '"' && third === '"' && !isEscaped(index)) {
        mask(index + 1)
        mask(index + 2)
        index += 2
        state = "code"
      }
      continue
    }
    if (character === "/" && next === "/") {
      mask(index)
      mask(index + 1)
      index += 1
      state = "line-comment"
    } else if (character === "/" && next === "*") {
      mask(index)
      mask(index + 1)
      index += 1
      state = "block-comment"
    } else if (character === '"' && next === '"' && third === '"') {
      mask(index)
      mask(index + 1)
      mask(index + 2)
      index += 2
      state = "text-block"
    } else if (character === '"') {
      mask(index)
      state = "string"
    } else if (character === "'") {
      mask(index)
      state = "character"
    }
  }
  return characters.join("")
}

function javaAnnotationResolves(maskedText, context, simpleName, qualifiedName) {
  const escapedSimpleName = escapeRegularExpression(simpleName)
  const escapedQualifiedName = escapeRegularExpression(qualifiedName)
  if (new RegExp(`@${escapedQualifiedName}\\b`).test(context)) return true
  if (!new RegExp(`@${escapedSimpleName}\\b`).test(context)) return false
  if (
    new RegExp(
      `\\b(?:class|enum|interface|record)\\s+${escapedSimpleName}\\b|@interface\\s+${escapedSimpleName}\\b`
    ).test(maskedText)
  ) {
    return false
  }
  const packageName = qualifiedName.slice(0, qualifiedName.lastIndexOf("."))
  return (
    new RegExp(`^\\s*import\\s+${escapedQualifiedName}\\s*;`, "m").test(maskedText) ||
    new RegExp(`^\\s*import\\s+${escapeRegularExpression(packageName)}\\.\\*\\s*;`, "m").test(
      maskedText
    )
  )
}

function javaResolvedProofAnnotation(maskedText, context) {
  const matches = javaJUnitProofAnnotations.filter(([simpleName, qualifiedName]) =>
    javaAnnotationResolves(maskedText, context, simpleName, qualifiedName)
  )
  return matches.length === 1 ? matches[0] : null
}

function javaClassRanges(maskedText, targetOffset) {
  const ranges = []
  const declaration = /\bclass\s+([A-Za-z_$][\w$]*)[^;{}]*\{/g
  for (const match of maskedText.matchAll(declaration)) {
    const open = match.index + match[0].lastIndexOf("{")
    let depth = 1
    let close = -1
    for (let index = open + 1; index < maskedText.length; index += 1) {
      if (maskedText[index] === "{") depth += 1
      else if (maskedText[index] === "}") depth -= 1
      if (depth === 0) {
        close = index
        break
      }
    }
    if (open < targetOffset && targetOffset < close) {
      ranges.push({ close, declarationOffset: match.index, name: match[1], open })
    }
  }
  return ranges.sort((left, right) => left.open - right.open)
}

function javaBraceDepthAt(maskedText, targetOffset) {
  let depth = 0
  for (let index = 0; index < targetOffset; index += 1) {
    if (maskedText[index] === "{") depth += 1
    else if (maskedText[index] === "}") depth -= 1
  }
  return depth
}

function javaDeclarationContext(sourceLines, declarationLineIndex) {
  let start = declarationLineIndex
  while (start > 0) {
    const previous = sourceLines[start - 1].trim()
    if (
      /[;{}]\s*$/.test(previous) ||
      /\b(?:class|enum|interface|record)\s+[A-Za-z_$].*\{\s*$/.test(previous)
    ) {
      break
    }
    start -= 1
  }
  return sourceLines.slice(start, declarationLineIndex + 1).join("\n")
}

function javaSourceTexts(root) {
  const sourceRoot = path.resolve(root, "apps/api/src")
  if (!fs.existsSync(sourceRoot)) return []
  const rootPath = path.resolve(root)
  if (!sourceRoot.startsWith(`${rootPath}${path.sep}`)) return null
  const texts = []
  const pending = [sourceRoot]
  try {
    while (pending.length > 0) {
      const directory = pending.pop()
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isSymbolicLink()) return null
        const absolutePath = path.join(directory, entry.name)
        if (entry.isDirectory()) pending.push(absolutePath)
        else if (entry.isFile() && entry.name.endsWith(".java")) {
          texts.push(fs.readFileSync(absolutePath, "utf8"))
        }
      }
    }
  } catch {
    return null
  }
  return texts
}

function javaComposedNonExecutableAnnotations(root, nonExecutableAnnotation) {
  const sourceTexts = javaSourceTexts(root)
  if (sourceTexts === null) return null
  const declarations = []
  for (const sourceText of sourceTexts) {
    const translatedText = translateJavaUnicodeEscapes(sourceText)
    if (translatedText === null) return null
    const maskedText = maskJavaCommentsAndLiterals(translatedText)
    const maskedLines = maskedText.split(/\r?\n/)
    for (const match of maskedText.matchAll(/@interface\s+([A-Za-z_$][\w$]*)[^;{}]*\{/g)) {
      const lineIndex = translatedText.slice(0, match.index).split(/\r?\n/).length - 1
      declarations.push({
        context: javaDeclarationContext(maskedLines, lineIndex),
        name: match[1]
      })
    }
  }

  const composed = new Set()
  let changed = true
  while (changed) {
    changed = false
    for (const declaration of declarations) {
      if (composed.has(declaration.name)) continue
      const composesKnownDisabled = [...composed].some((name) =>
        new RegExp(`@(?:[A-Za-z_$][\\w$]*\\.)*${escapeRegularExpression(name)}\\b`).test(
          declaration.context
        )
      )
      if (nonExecutableAnnotation.test(declaration.context) || composesKnownDisabled) {
        composed.add(declaration.name)
        changed = true
      }
    }
  }
  return composed
}

function javaClassHasNonExecutableAncestor(
  root,
  classContext,
  nonExecutableAnnotation,
  composedNonExecutableAnnotations,
  registeredExecutionExtension
) {
  const sourceTexts = javaSourceTexts(root)
  if (sourceTexts === null) return true
  const parentName = (context) =>
    context.match(
      /\bclass\s+[A-Za-z_$][\w$]*(?:\s*<[^;{}]*>)?[^;{}]*?\bextends\s+(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\b/
    )?.[1] ?? null
  const hasComposedAnnotation = (context) =>
    [...composedNonExecutableAnnotations].some((name) =>
      new RegExp("@(?:[A-Za-z_$][\\w$]*\\.)*" + escapeRegularExpression(name) + "\\b").test(context)
    )
  const records = new Map()
  for (const sourceText of sourceTexts) {
    const translatedText = translateJavaUnicodeEscapes(sourceText)
    if (translatedText === null) return true
    const maskedText = maskJavaCommentsAndLiterals(translatedText)
    const maskedLines = maskedText.split(/\r?\n/)
    for (const match of maskedText.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)[^;{}]*\{/g)) {
      const open = match.index + match[0].lastIndexOf("{")
      let depth = 1
      let close = -1
      for (let index = open + 1; index < maskedText.length; index += 1) {
        if (maskedText[index] === "{") depth += 1
        else if (maskedText[index] === "}") depth -= 1
        if (depth === 0) {
          close = index
          break
        }
      }
      if (close === -1) return true
      const lineIndex = translatedText.slice(0, match.index).split(/\r?\n/).length - 1
      const declarationContext = javaDeclarationContext(maskedLines, lineIndex)
      const record = {
        directlyNonExecutable:
          nonExecutableAnnotation.test(declarationContext) ||
          hasComposedAnnotation(declarationContext) ||
          registeredExecutionExtension.test(maskedText.slice(open + 1, close)),
        parent: parentName(declarationContext)
      }
      if (records.has(match[1])) records.set(match[1], null)
      else records.set(match[1], record)
    }
  }

  const firstParent = parentName(classContext)
  if (firstParent === null) return false
  const visited = new Set()
  let current = firstParent
  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)
    const record = records.get(current)
    if (record === undefined || record === null || record.directlyNonExecutable) return true
    current = record.parent
  }
  return false
}

function javaMethodBody(maskedText, targetOffset) {
  const parametersOpen = maskedText.indexOf("(", targetOffset)
  if (parametersOpen === -1) return null
  let parameterDepth = 1
  let parametersClose = -1
  for (let index = parametersOpen + 1; index < maskedText.length; index += 1) {
    if (maskedText[index] === "(") parameterDepth += 1
    else if (maskedText[index] === ")") parameterDepth -= 1
    if (parameterDepth === 0) {
      parametersClose = index
      break
    }
  }
  if (parametersClose === -1) return null
  const bodyOpen = maskedText.indexOf("{", parametersClose + 1)
  const declarationEnd = maskedText.indexOf(";", parametersClose + 1)
  if (bodyOpen === -1 || (declarationEnd !== -1 && declarationEnd < bodyOpen)) return null
  let bodyDepth = 1
  for (let index = bodyOpen + 1; index < maskedText.length; index += 1) {
    if (maskedText[index] === "{") bodyDepth += 1
    else if (maskedText[index] === "}") bodyDepth -= 1
    if (bodyDepth === 0) return maskedText.slice(bodyOpen + 1, index)
  }
  return null
}

function javaMethodUsesAbortingAssumption(maskedText, methodBody) {
  if (methodBody === null) return true
  const assumptionMethod = "(?:assume[A-Za-z0-9_$]*|assumingThat|abort)"
  const qualifiedAssumption = new RegExp(
    `\\b(?:(?:org\\.junit\\.(?:jupiter\\.api\\.Assumptions|Assume))|Assumptions|Assume)\\s*\\.\\s*${assumptionMethod}\\s*\\(`
  )
  if (qualifiedAssumption.test(maskedText)) return true
  const staticAssumptionImport = new RegExp(
    `^\\s*import\\s+static\\s+org\\.junit\\.(?:jupiter\\.api\\.Assumptions|Assume)\\.(?:\\*|${assumptionMethod})\\s*;`,
    "m"
  )
  return (
    (staticAssumptionImport.test(maskedText) &&
      new RegExp(`(?:^|[^.\\w$])${assumptionMethod}\\s*\\(`).test(maskedText)) ||
    /\bthrow\s+new\s+(?:[A-Za-z_$][\w$]*\.)*(?:TestAbortedException|AssumptionViolatedException)\b/.test(
      maskedText
    )
  )
}

function javaAbortingHelperClasses(root) {
  const sourceTexts = javaSourceTexts(root)
  if (sourceTexts === null) return null
  const records = []
  for (const sourceText of sourceTexts) {
    const translatedText = translateJavaUnicodeEscapes(sourceText)
    if (translatedText === null) return null
    const maskedText = maskJavaCommentsAndLiterals(translatedText)
    const classNames = new Set()
    for (const match of maskedText.matchAll(
      /\b(?:class|enum|interface|record)\s+([A-Za-z_$][\w$]*)/g
    )) {
      classNames.add(match[1])
    }
    for (const match of maskedText.matchAll(/@interface\s+([A-Za-z_$][\w$]*)/g)) {
      classNames.add(match[1])
    }
    records.push({
      aborting: javaMethodUsesAbortingAssumption(maskedText, maskedText),
      classNames,
      maskedText
    })
  }

  const classOwners = new Map()
  for (const record of records) {
    for (const className of record.classNames) {
      if (classOwners.has(className)) classOwners.set(className, null)
      else classOwners.set(className, record)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const record of records) {
      if (record.aborting) continue
      const referencesAbortingClass = [...classOwners].some(([className, owner]) => {
        if (owner === null || !owner.aborting) return false
        return new RegExp(`\\b${escapeRegularExpression(className)}\\b`).test(record.maskedText)
      })
      if (referencesAbortingClass) {
        record.aborting = true
        changed = true
      }
    }
  }

  const abortingClasses = new Set()
  for (const record of records) {
    if (!record.aborting) continue
    for (const className of record.classNames) abortingClasses.add(className)
  }
  return abortingClasses
}

function javaMethodUsesExternalAbortingHelper(root, maskedText, methodBody) {
  if (methodBody === null) return true
  const abortingClasses = javaAbortingHelperClasses(root)
  if (abortingClasses === null) return true
  for (const className of abortingClasses) {
    const escapedClass = escapeRegularExpression(className)
    if (new RegExp(`\\b(?:class|enum|interface|record)\\s+${escapedClass}\\b`).test(maskedText)) {
      return true
    }
    if (new RegExp(`\\b${escapedClass}\\b`).test(methodBody)) return true

    for (const staticImport of maskedText.matchAll(
      new RegExp(
        `^\\s*import\\s+static\\s+(?:[A-Za-z_$][\\w$]*\\.)*${escapedClass}\\s*\\.\\s*(\\*|[A-Za-z_$][\\w$]*)\\s*;`,
        "gm"
      )
    )) {
      const importedMethod = staticImport[1]
      if (
        importedMethod === "*" ||
        new RegExp(`(?:^|[^.\\w$])${escapeRegularExpression(importedMethod)}\\s*\\(`).test(
          methodBody
        )
      ) {
        return true
      }
    }

    const bindingPattern = new RegExp(
      `\\b${escapedClass}(?:\\s*<[^;{}()]*>)?\\s+([A-Za-z_$][\\w$]*)\\b`,
      "g"
    )
    for (const binding of maskedText.matchAll(bindingPattern)) {
      if (new RegExp(`\\b${escapeRegularExpression(binding[1])}\\s*\\.`).test(methodBody)) {
        return true
      }
    }
  }
  return false
}

function shellStatusIsNonzero(rawStatus) {
  const status = Number(rawStatus)
  return Number.isSafeInteger(status) && ((status % 256) + 256) % 256 !== 0
}

function shellFunctionDefinitions(text) {
  const definitions = []
  const pattern = /(?:^|[;\n])\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?\s*\{/g
  for (const match of text.matchAll(pattern)) {
    const open = match.index + match[0].lastIndexOf("{")
    let close = -1
    let depth = 1
    let escaped = false
    let quote = null
    let comment = false
    for (let index = open + 1; index < text.length; index += 1) {
      const character = text[index]
      if (comment) {
        if (character === "\n") comment = false
        continue
      }
      if (escaped) {
        escaped = false
        continue
      }
      if (quote === "'") {
        if (character === "'") quote = null
        continue
      }
      if (quote === '"') {
        if (character === '"') quote = null
        else if (character === "\\") escaped = true
        continue
      }
      if (character === "\\") {
        escaped = true
      } else if (["'", '"'].includes(character)) {
        quote = character
      } else if (character === "#" && (index === 0 || /[\s;]/.test(text[index - 1]))) {
        comment = true
      } else if (character === "{") {
        depth += 1
      } else if (character === "}") {
        depth -= 1
        if (depth === 0) {
          close = index
          break
        }
      }
    }
    if (close !== -1) {
      definitions.push({
        body: text.slice(open + 1, close),
        close,
        name: match[1],
        open
      })
    }
  }
  return definitions
}

function shellSelectorInsideFunctionDefinition(text, selector) {
  const targetOffset = text.indexOf(selector)
  return (
    targetOffset !== -1 &&
    shellFunctionDefinitions(text).some(
      ({ close, open }) => targetOffset > open && targetOffset < close
    )
  )
}

function shellFailureFunctions(text) {
  const exiting = new Set()
  const returning = new Set()
  for (const match of text.matchAll(
    /(?:^|\n)\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/g
  )) {
    if (
      /(?:^|[;\n])\s*(?:case|do|done|elif|else|esac|fi|for|if|select|then|until|while)\b/.test(
        match[2]
      ) ||
      match[2].includes("||") ||
      match[2].includes("&&") ||
      shellLineControlOperators(match[2])?.some((operator) => ["|", "&"].includes(operator))
    ) {
      continue
    }
    const commands = shellCommandSegments(match[2])
    let terminal = null
    for (const words of commands) {
      let index = 0
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
      if (!["exit", "return"].includes(words[index])) continue
      terminal = { command: words[index], status: words[index + 1] }
      break
    }
    if (terminal === null || !shellStatusIsNonzero(terminal.status)) continue
    if (terminal.command === "exit") exiting.add(match[1])
    else returning.add(match[1])
  }
  return { exiting, returning }
}

function shellLineControlOperators(line) {
  const operators = []
  let quote = null
  let escaped = false
  let wordStarted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (escaped) {
      escaped = false
      wordStarted = true
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = null
      continue
    }
    if (quote === '"') {
      if (character === '"') quote = null
      else if (character === "\\") escaped = true
      continue
    }
    if (character === "\\") {
      escaped = true
      wordStarted = true
    } else if (character === "'" || character === '"') {
      quote = character
      wordStarted = true
    } else if (character === "#" && !wordStarted) {
      break
    } else if (/\s/.test(character)) {
      wordStarted = false
    } else if (character === ";") {
      operators.push(";")
      wordStarted = false
    } else if (character === "|") {
      const operator = line[index + 1] === "|" ? "||" : "|"
      operators.push(operator)
      if (operator === "||") index += 1
      wordStarted = false
    } else if (character === "&" && ![">", "<"].includes(line[index - 1])) {
      const operator = line[index + 1] === "&" ? "&&" : "&"
      operators.push(operator)
      if (operator === "&&") index += 1
      wordStarted = false
    } else {
      wordStarted = true
    }
  }
  return quote === null && !escaped ? operators : null
}

function shellErrexitEnabledBeforeLine(text, targetLineIndex) {
  let enabled = false
  const lines = text.split(/\r?\n/).slice(0, targetLineIndex + 1)
  for (const line of lines) {
    for (const words of shellCommandSegments(line)) {
      enabled = shellSetNamedOptionState(words, "errexit", enabled)
    }
  }
  return enabled
}

function shellSelectorInsideCompoundCommand(text, selector) {
  const targetOffset = text.indexOf(selector)
  if (targetOffset === -1) return false
  const compoundStack = []
  const openingCommands = new Set(["case", "for", "if", "select", "until", "while"])
  const closingCommands = new Map([
    ["done", new Set(["for", "select", "until", "while"])],
    ["esac", new Set(["case"])],
    ["fi", new Set(["if"])]
  ])
  for (const words of shellCommandSegments(text.slice(0, targetOffset + selector.length))) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    const command = words[index]
    if (openingCommands.has(command)) {
      compoundStack.push(command)
      continue
    }
    const matchingOpeners = closingCommands.get(command)
    if (matchingOpeners === undefined) continue
    const opener = compoundStack.at(-1)
    if (opener === undefined || !matchingOpeners.has(opener)) return true
    compoundStack.pop()
  }
  return compoundStack.length > 0
}

function shellHasLaterExecutableLine(text, targetLineIndex) {
  return text
    .split(/\r?\n/)
    .slice(targetLineIndex + 1)
    .some((line) => shellCommandSegments(line).length > 0)
}

function shellPythonHereDocumentContainsLine(text, targetLineIndex) {
  const lines = text.split(/\r?\n/)
  let activeHereDocument = null
  for (let lineIndex = 0; lineIndex <= targetLineIndex; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    if (activeHereDocument !== null) {
      const candidate = activeHereDocument.stripTabs ? line.replace(/^\t+/, "") : line
      if (candidate === activeHereDocument.delimiter) {
        activeHereDocument = null
      } else if (lineIndex === targetLineIndex) {
        return true
      }
      continue
    }
    if (lineIndex === targetLineIndex) return false
    for (const words of shellCommandSegments(line)) {
      let delimiter = null
      let stripTabs = false
      let delimiterIndex = -1
      for (let index = 0; index < words.length; index += 1) {
        const inline = words[index].match(/^<<(-?)([A-Za-z_][A-Za-z0-9_]*)$/)
        if (inline !== null) {
          stripTabs = inline[1] === "-"
          delimiter = inline[2]
          delimiterIndex = index
          break
        }
        if (["<<", "<<-"].includes(words[index])) {
          const next = words[index + 1]
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(next ?? "")) {
            stripTabs = words[index] === "<<-"
            delimiter = next
            delimiterIndex = index
          }
          break
        }
      }
      if (delimiter === null) continue
      let commandIndex = 0
      while (
        commandIndex < delimiterIndex &&
        /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[commandIndex] ?? "")
      ) {
        commandIndex += 1
      }
      while (["builtin", "command"].includes(words[commandIndex])) commandIndex += 1
      if (words[commandIndex] === "env") {
        commandIndex += 1
        while (commandIndex < delimiterIndex && (words[commandIndex] ?? "").startsWith("-")) {
          commandIndex += 1
        }
        while (
          commandIndex < delimiterIndex &&
          /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[commandIndex] ?? "")
        ) {
          commandIndex += 1
        }
      }
      const invokesPython = /(?:^|\/)python(?:3(?:\.\d+)*)?$/.test(words[commandIndex] ?? "")
      const pythonArguments = words.slice(commandIndex + 1, delimiterIndex)
      const readsHereDocument = pythonArguments.length === 0 || pythonArguments[0] === "-"
      if (invokesPython && readsHereDocument) activeHereDocument = { delimiter, stripTabs }
    }
  }
  return false
}

function shellExitTrapActionOverridesStatus(action, sourceText = action, resolving = new Set()) {
  const commands = shellCommandSegments(action)
  for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
    const words = commands[commandIndex]
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    while (["builtin", "command"].includes(words[index])) index += 1
    const command = words[index]
    if ([".", "eval", "source"].includes(command) || /[$`]/.test(command ?? "")) return true
    if (command !== "exit") {
      const definitions = shellFunctionDefinitions(sourceText).filter(
        ({ name }) => name === command
      )
      if (definitions.length > 1) return true
      if (definitions.length === 1) {
        if (resolving.has(command)) return true
        const nestedResolving = new Set(resolving)
        nestedResolving.add(command)
        if (shellExitTrapActionOverridesStatus(definitions[0].body, sourceText, nestedResolving)) {
          return true
        }
      }
      continue
    }
    const status = words[index + 1]
    if (status === undefined || status === "$?" || status === "${?}") {
      return commandIndex !== 0
    }
    if (/^[+-]?\d+$/.test(status)) return !shellStatusIsNonzero(status)
    return true
  }
  return false
}

function shellHasStatusOverridingExitTrapBeforeLine(text, targetLineIndex) {
  let overridesStatus = false
  const lines = text.split(/\r?\n/).slice(0, targetLineIndex)
  for (const line of lines) {
    for (const words of shellCommandSegments(line)) {
      let index = 0
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
      while (["builtin", "command"].includes(words[index])) index += 1
      if (words[index] !== "trap") continue
      const action = words[index + 1]
      const signals = words.slice(index + 2)
      if (!signals.some((signal) => ["0", "EXIT"].includes(signal))) continue
      if (action === "-p") continue
      overridesStatus =
        ![undefined, "", "-"].includes(action) && shellExitTrapActionOverridesStatus(action, text)
    }
  }
  return overridesStatus
}

function shellLineHasExecutableFailureAnchor(text, line, selector, lineIndex) {
  const segments = shellCommandSegments(line)
  const operators = shellLineControlOperators(line)
  if (operators === null || segments.length !== operators.length + 1) return false
  const selectorIsExecutable = segments.some((words) =>
    words.some((word) => word.includes(selector))
  )
  if (!selectorIsExecutable) return false
  if (shellSelectorInsideFunctionDefinition(text, selector)) return false
  if (shellSelectorInsideCompoundCommand(text, selector)) return false
  if (shellHasStatusOverridingExitTrapBeforeLine(text, lineIndex)) return false

  const failureFunctions = shellFailureFunctions(text)
  const hasPipelineOrBackground = operators.some((operator) => ["|", "&"].includes(operator))
  const hasUnconditionalShellExit = segments.some((words, segmentIndex) => {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    const exitsShell =
      (words[index] === "exit" && shellStatusIsNonzero(words[index + 1])) ||
      failureFunctions.exiting.has(words[index])
    return exitsShell && operators.slice(0, segmentIndex).every((operator) => operator === ";")
  })
  if (hasUnconditionalShellExit && !hasPipelineOrBackground) return true
  if (operators.length > 0) return false
  const failurePropagates =
    shellErrexitEnabledBeforeLine(text, lineIndex) || !shellHasLaterExecutableLine(text, lineIndex)

  const isPythonAssertion = /^\s*raise\s+(?:[A-Za-z_$][\w$]*\.)*AssertionError\s*\(/.test(line)
  const systemExit = line.match(
    /^\s*raise\s+(?:[A-Za-z_$][\w$]*\.)*SystemExit\s*\(\s*([+-]?\d+)\s*\)/
  )
  const isMessageSystemExit =
    /^\s*raise\s+(?:[A-Za-z_$][\w$]*\.)*SystemExit\s*\(\s*(["'])(?:\\.|(?!\1).)*\1\s*\)/.test(line)
  if (
    (isPythonAssertion || systemExit !== null || isMessageSystemExit) &&
    !shellPythonHereDocumentContainsLine(text, lineIndex)
  ) {
    return false
  }
  if (isPythonAssertion) {
    return failurePropagates
  }
  if (systemExit !== null) {
    return shellStatusIsNonzero(systemExit[1]) && failurePropagates
  }
  if (isMessageSystemExit) {
    return failurePropagates
  }
  for (const words of segments) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1
    if (words[index] === "!") return false
    if (["exit", "return"].includes(words[index]) && shellStatusIsNonzero(words[index + 1])) {
      return words[index] === "exit" || failurePropagates
    }
    if (words[index] === "false") return failurePropagates
    if (failureFunctions.exiting.has(words[index])) return true
    if (failureFunctions.returning.has(words[index])) return failurePropagates
  }
  return false
}

function hasExecutableProofAnchor(root, proof) {
  const text = fs.readFileSync(path.resolve(root, proof.path), "utf8")
  const lines = text.split(/\r?\n/)
  const lineIndex = lines.findIndex((line) => line.includes(proof.selector))
  if (lineIndex === -1) return false
  const line = lines[lineIndex].trim()

  if (gradleJavaTestInclude(proof.path) !== null) {
    const escapedSelector = escapeRegularExpression(proof.selector)
    const translatedText = translateJavaUnicodeEscapes(text)
    if (translatedText === null || literalOccurrenceCount(translatedText, proof.selector) !== 1) {
      return false
    }
    const maskedText = maskJavaCommentsAndLiterals(translatedText)
    const maskedLines = maskedText.split(/\r?\n/)
    const targetOffset = translatedText.indexOf(proof.selector)
    const translatedLineIndex = translatedText.slice(0, targetOffset).split(/\r?\n/).length - 1
    const nonExecutableAnnotation =
      /@(?:[A-Za-z_$][\w$]*\.)*(?:(?:Disabled|Enabled)[A-Za-z0-9_$]*|Ignore|ExtendWith)\b/
    const registeredExecutionExtension = /@(?:[A-Za-z_$][\w$]*\.)*RegisterExtension\b/
    const composedNonExecutableAnnotations = javaComposedNonExecutableAnnotations(
      root,
      nonExecutableAnnotation
    )
    if (composedNonExecutableAnnotations === null) return false
    const hasComposedNonExecutableAnnotation = (context) =>
      [...composedNonExecutableAnnotations].some((name) =>
        new RegExp(`@(?:[A-Za-z_$][\\w$]*\\.)*${escapeRegularExpression(name)}\\b`).test(context)
      )
    const methodDeclarationContext = javaDeclarationContext(maskedLines, translatedLineIndex)
    const methodBody = javaMethodBody(maskedText, targetOffset)
    const proofAnnotation = javaResolvedProofAnnotation(maskedText, methodDeclarationContext)
    const classRanges = javaClassRanges(maskedText, targetOffset)
    const classContexts = classRanges.map(({ declarationOffset }) => {
      const classLineIndex = translatedText.slice(0, declarationOffset).split(/\r?\n/).length - 1
      return javaDeclarationContext(maskedLines, classLineIndex)
    })
    const enclosingClassHasRegisteredExtension = classRanges.some(({ open, close }) =>
      registeredExecutionExtension.test(maskedText.slice(open + 1, close))
    )
    const configuredClassInclude = gradleJavaTestIncludeForClassName(classRanges[0]?.name ?? "")
    const buildText = readRunnerConfiguration(root, "apps/api/build.gradle.kts")
    const topLevelClassSelected =
      configuredClassInclude !== null &&
      buildText !== null &&
      gradleBuildSelectsTestPattern(buildText, configuredClassInclude)
    const nestedClassesDiscoverable = classRanges
      .slice(1)
      .every((_, index) =>
        javaAnnotationResolves(
          maskedText,
          classContexts[index + 1],
          "Nested",
          "org.junit.jupiter.api.Nested"
        )
      )
    const signatureExecutable =
      proofAnnotation?.[2] === "void" &&
      new RegExp(`\\bvoid\\s+${escapedSelector}\\s*\\(`).test(methodDeclarationContext)
    const methodModifiersExecutable = !/\b(?:abstract|native|private|static)\b/.test(
      methodDeclarationContext
    )
    const classModifiersExecutable = classContexts.every(
      (context, index) =>
        !/\babstract\b/.test(context) && (index === 0 || !/\b(?:private|static)\b/.test(context))
    )
    return (
      classRanges.length > 0 &&
      javaBraceDepthAt(maskedText, targetOffset) === classRanges.length &&
      topLevelClassSelected &&
      nestedClassesDiscoverable &&
      proofAnnotation !== null &&
      !nonExecutableAnnotation.test(methodDeclarationContext) &&
      classContexts.every((context) => !nonExecutableAnnotation.test(context)) &&
      !hasComposedNonExecutableAnnotation(methodDeclarationContext) &&
      classContexts.every((context) => !hasComposedNonExecutableAnnotation(context)) &&
      !enclosingClassHasRegisteredExtension &&
      classContexts.every(
        (context) =>
          !javaClassHasNonExecutableAncestor(
            root,
            context,
            nonExecutableAnnotation,
            composedNonExecutableAnnotations,
            registeredExecutionExtension
          )
      ) &&
      classModifiersExecutable &&
      methodModifiersExecutable &&
      !javaMethodUsesAbortingAssumption(maskedText, methodBody) &&
      !javaMethodUsesExternalAbortingHelper(root, maskedText, methodBody) &&
      signatureExecutable
    )
  }
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(proof.path)) {
    return hasExecutableJavaScriptProofAnchor(text, proof.selector, proof.path)
  }
  if (proof.path.startsWith("scripts/test/") && proof.path.endsWith(".sh")) {
    return shellLineHasExecutableFailureAnchor(text, line, proof.selector, lineIndex)
  }
  if (proof.path.startsWith(".github/workflows/")) {
    return line === proof.selector
  }
  if (proof.path.startsWith(".loop/evidence/") && proof.path.endsWith(".json")) {
    return line.replace(/,$/, "") === proof.selector
  }
  return false
}

export function extractContract(markdown) {
  const start = markdown.indexOf(CONTRACT_START)
  const end = markdown.indexOf(CONTRACT_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("traceability contract markers are missing or out of order")
  }
  if (markdown.indexOf(CONTRACT_START, start + CONTRACT_START.length) !== -1) {
    throw new Error("traceability contract start marker must appear exactly once")
  }
  if (markdown.indexOf(CONTRACT_END, end + CONTRACT_END.length) !== -1) {
    throw new Error("traceability contract end marker must appear exactly once")
  }

  const fenced = markdown
    .slice(start + CONTRACT_START.length, end)
    .trim()
    .match(/^```json\s*\n([\s\S]*?)\n```$/)
  if (!fenced) throw new Error("traceability contract must be one fenced JSON document")
  return JSON.parse(fenced[1])
}

function validateRepositoryEvidenceReceipt(root, proof, requirementId, label, errors) {
  if (!proof.path.startsWith(".loop/evidence/") || !proof.path.endsWith(".json")) return

  let receipt
  try {
    const receiptText = fs.readFileSync(path.resolve(root, proof.path), "utf8")
    assertUniqueJsonObjectKeys(receiptText)
    receipt = JSON.parse(receiptText)
  } catch (error) {
    errors.push(`${label} is not a valid repository proof receipt: ${error.message}`)
    return
  }

  if (
    proof.path !== t085RepositoryReviewReceipt.path ||
    receipt?.schema_version !== t085RepositoryReviewReceipt.schema_version
  ) {
    errors.push(`${label} must use a recognized repository proof receipt schema`)
    return
  }

  const historical = receipt.historical_acceptance_readback
  const expected = t085RepositoryReviewReceipt
  if (
    receipt.task !== expected.task ||
    receipt.repository !== expected.repository ||
    receipt.issue !== expected.issue ||
    historical?.requirement_id !== requirementId ||
    historical?.requirement_id !== expected.requirement_id ||
    historical?.task !== expected.historical_task
  ) {
    errors.push(`${label} repository proof receipt identity must bind SC-010 in this repository`)
  }
  if (
    historical?.artifact_id !== expected.artifact_id ||
    historical?.artifact_name !== expected.artifact_name ||
    historical?.artifact_digest !== expected.artifact_digest ||
    historical?.artifact_downloaded !== true ||
    historical?.source_head_sha !== expected.source_head_sha ||
    historical?.workflow !== expected.workflow ||
    historical?.workflow_run_id !== expected.workflow_run_id ||
    historical?.workflow_run_number !== expected.workflow_run_number ||
    historical?.exact_head_manifest_sha256 !== expected.exact_head_manifest_sha256
  ) {
    errors.push(`${label} repository proof receipt must bind the accepted exact-head artifact`)
  }
  if (
    historical?.restore_receipt_sha256 !== expected.restore_receipt_sha256 ||
    !isDeepStrictEqual(historical?.restore_receipt, expected.restore_receipt)
  ) {
    errors.push(`${label} repository proof receipt must contain a passing bounded restore receipt`)
  }
  if (
    !isDeepStrictEqual(
      receipt.current_base_reconciliation_review?.scope_review,
      expected.scope_review
    ) ||
    !isDeepStrictEqual(receipt.post_merge_scope_correction, expected.post_merge_scope_correction)
  ) {
    errors.push(`${label} repository proof receipt must bind the accepted 13-path scope correction`)
  }
  const expectedSelector = `"restore_receipt_sha256": "${expected.restore_receipt_sha256}"`
  if (proof.selector !== expectedSelector) {
    errors.push(`${label}.selector must bind the accepted restore receipt digest`)
  }
}

function validateReceiptProof(root, proof, requirementId, label, errors) {
  if (!proof.path.startsWith(".loop/evidence/") || !proof.path.endsWith(".json")) {
    errors.push(`${label}.path must identify a tracked JSON receipt under .loop/evidence`)
    return
  }

  let receipt
  try {
    receipt = JSON.parse(fs.readFileSync(path.resolve(root, proof.path), "utf8"))
  } catch (error) {
    errors.push(`${label} is not a valid JSON receipt: ${error.message}`)
    return
  }

  if (receipt.schema_version !== receiptProofSchemas.get(proof.kind)) {
    errors.push(`${label} receipt schema does not match ${proof.kind}`)
  }
  if (receipt.requirement_id !== requirementId) {
    errors.push(`${label} receipt requirement_id must equal ${requirementId}`)
  }
  if (receipt.decision !== "PASS") errors.push(`${label} receipt decision must be PASS`)
  if (!isIsoTimestamp(receipt.recorded_at)) {
    errors.push(`${label} receipt recorded_at must be an ISO-8601 UTC timestamp`)
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.source_head_sha ?? "")) {
    errors.push(`${label} receipt source_head_sha must be a full lowercase commit SHA`)
  }
  if (proof.source_head !== receipt.source_head_sha) {
    errors.push(`${label}.source_head must equal the receipt source_head_sha`)
  }

  if (proof.kind === "HUMAN_RECEIPT") {
    if (receipt.actor_type !== "HUMAN")
      errors.push(`${label} HUMAN_RECEIPT actor_type must be HUMAN`)
    requireString(receipt.accepted_by, `${label} receipt accepted_by`, errors)
    if (!Array.isArray(receipt.human_evidence_ids) || receipt.human_evidence_ids.length === 0) {
      errors.push(`${label} HUMAN_RECEIPT requires human_evidence_ids`)
    }
  }
  if (proof.kind === "EXTERNAL_METRIC_RECEIPT") {
    requireString(receipt.source_system, `${label} receipt source_system`, errors)
    requireString(receipt.metric_name, `${label} receipt metric_name`, errors)
    if (!isIsoTimestamp(receipt.window_start) || !isIsoTimestamp(receipt.window_end)) {
      errors.push(`${label} EXTERNAL_METRIC_RECEIPT requires an ISO-8601 measurement window`)
    }
  }
  if (proof.kind === "CI_STABILITY_RECEIPT") {
    if (!Number.isInteger(receipt.consecutive_green_runs) || receipt.consecutive_green_runs < 20) {
      errors.push(`${label} CI_STABILITY_RECEIPT requires at least 20 consecutive green runs`)
    }
    if (
      !Array.isArray(receipt.workflow_run_ids) ||
      receipt.workflow_run_ids.length < 20 ||
      new Set(receipt.workflow_run_ids).size !== receipt.workflow_run_ids.length
    ) {
      errors.push(`${label} CI_STABILITY_RECEIPT requires 20 unique workflow_run_ids`)
    }
  }
}

function validateProof(root, proof, requirementId, label, errors) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    errors.push(`${label} must be an object`)
    return
  }
  if (!requireString(proof.kind, `${label}.kind`, errors)) return
  if (!proofKinds.has(proof.kind)) {
    errors.push(`${label}.kind is not an allowed proof kind`)
    return
  }
  if (forbiddenProofPaths.has(proof.path)) {
    errors.push(`${label}.path cannot use the traceability artifact as its own proof`)
    return
  }
  const absolutePath = safeProofPath(root, proof.path, errors, label)
  if (!requireString(proof.selector, `${label}.selector`, errors) || !absolutePath) return
  if (proof.selector.length < 6) errors.push(`${label}.selector must contain at least 6 characters`)
  const text = fs.readFileSync(absolutePath, "utf8")
  const occurrenceCount = literalOccurrenceCount(text, proof.selector)
  if (occurrenceCount === 0) {
    errors.push(`${label}.selector was not found literally in ${proof.path}: ${proof.selector}`)
  } else if (occurrenceCount !== 1) {
    errors.push(
      `${label}.selector must occur exactly once in ${proof.path}; found ${occurrenceCount}: ${proof.selector}`
    )
  }
  if (proof.source_head !== undefined && !/^[0-9a-f]{40}$/.test(proof.source_head)) {
    errors.push(`${label}.source_head must be a full lowercase commit SHA when present`)
  }
  if (receiptProofSchemas.has(proof.kind) && absolutePath) {
    validateReceiptProof(root, proof, requirementId, label, errors)
  }
  if (proof.kind === "REPOSITORY_PROOF" && absolutePath) {
    validateRepositoryEvidenceReceipt(root, proof, requirementId, label, errors)
  }
}

function validateCompletionGate(receipt, name, jobs, acceptedRunId, errors) {
  const gate = receipt?.gates?.[name]
  const gateLabel = name === "ci" ? "CI" : "security"
  const runLabel = name === "ci" ? "CI" : "Security"
  if (
    gate?.result !== "PASS" ||
    gate?.jobs !== jobs ||
    gate?.source_head_sha !== receipt?.implementation_head_sha ||
    !Number.isInteger(gate?.run_id) ||
    gate.run_id <= 0
  ) {
    errors.push(`completion receipt ${gateLabel} gate must be exact-head PASS ${jobs}`)
  }
  if (gate?.run_id !== acceptedRunId) {
    errors.push(
      `completion receipt ${runLabel} run must equal the accepted PR149 run ${acceptedRunId}`
    )
  }
}

function validateCompletionReceipt({
  receipt,
  state,
  evaluatedHeadCommittedAt,
  changeBaseSha,
  changeBaseTasksText,
  changeBaseTraceabilityText,
  tasksText,
  traceabilityText,
  implementationMergeAncestorOfChangeBase,
  acceptedTraceabilitySha256,
  acceptedPendingTasksSha256,
  deviations,
  lifecycle,
  errors
}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("checked T085 requires a structured completion receipt")
    return
  }
  if (receipt.schema_version !== COMPLETION_RECEIPT_SCHEMA) {
    errors.push(`completion receipt schema_version must be ${COMPLETION_RECEIPT_SCHEMA}`)
  }
  if (receipt.task !== "T085") errors.push("completion receipt task must be T085")
  if (receipt.decision !== "ACCEPTED") {
    errors.push("completion receipt decision must be ACCEPTED")
  }
  if (receipt.actor_type !== "HUMAN") {
    errors.push("completion receipt actor_type must be HUMAN")
  }
  requireString(receipt.accepted_by, "completion receipt accepted_by", errors)
  requireString(receipt.authorization_ref, "completion receipt authorization_ref", errors)
  if (receipt.accepted_by !== ACCEPTED_RECEIPT_OWNER) {
    errors.push("completion receipt accepted_by must equal the authorized repository owner")
  }
  if (receipt.authorization_ref !== ACCEPTED_RECEIPT_AUTHORIZATION_REF) {
    errors.push("completion receipt authorization_ref must equal the pinned owner authorization")
  }
  if (!isIsoTimestamp(receipt.recorded_at)) {
    errors.push("completion receipt recorded_at must be an ISO-8601 UTC timestamp")
  }
  if (!isIsoTimestamp(evaluatedHeadCommittedAt)) {
    errors.push("completion receipt requires a trusted evaluated head commit timestamp")
  }
  if (
    isIsoTimestamp(receipt.recorded_at) &&
    Date.parse(receipt.recorded_at) < Date.parse(ACCEPTED_RECEIPT_AUTHORIZATION_RECORDED_AT)
  ) {
    errors.push("completion receipt recorded_at must not predate the pinned owner authorization")
  }
  if (
    isIsoTimestamp(receipt.recorded_at) &&
    isIsoTimestamp(evaluatedHeadCommittedAt) &&
    Date.parse(receipt.recorded_at) > Date.parse(evaluatedHeadCommittedAt)
  ) {
    errors.push("completion receipt recorded_at must not postdate the evaluated head commit")
  }
  if (receipt.repository !== "bynanci/courtside-tw") {
    errors.push("completion receipt repository must be bynanci/courtside-tw")
  }
  if (receipt.issue !== "https://github.com/bynanci/courtside-tw/issues/145") {
    errors.push("completion receipt issue must identify issue 145")
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.implementation_head_sha ?? "")) {
    errors.push("completion receipt implementation_head_sha must be a full lowercase commit SHA")
  }
  if (receipt.implementation_head_sha !== ACCEPTED_IMPLEMENTATION_HEAD_SHA) {
    errors.push("completion receipt implementation_head_sha must equal the accepted PR149 head")
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.implementation_merge_sha ?? "")) {
    errors.push("completion receipt implementation_merge_sha must be a full lowercase commit SHA")
  }
  if (receipt.implementation_merge_sha !== ACCEPTED_IMPLEMENTATION_MERGE_SHA) {
    errors.push("completion receipt implementation_merge_sha must equal the accepted PR149 merge")
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.receipt_base_sha ?? "")) {
    errors.push("completion receipt receipt_base_sha must be a full lowercase commit SHA")
  }
  if (receipt.protected_main_sha !== undefined) {
    errors.push("completion receipt must not use the deprecated protected_main_sha field")
  }
  if (receipt.implementation_merge_sha === receipt.receipt_base_sha) {
    errors.push(
      "completion receipt must not conflate implementation_merge_sha with receipt_base_sha"
    )
  }
  if (state === t085States.RECEIPT_CANDIDATE) {
    if (receipt.receipt_base_sha !== changeBaseSha) {
      errors.push("completion receipt receipt_base_sha must equal the audited change base")
    }
    if (implementationMergeAncestorOfChangeBase !== true) {
      errors.push(
        "completion receipt implementation_merge_sha must be an ancestor of receipt_base_sha"
      )
    }
  }

  if (
    receipt.implementation_scope?.changed_files !== ACCEPTED_IMPLEMENTATION_CHANGED_PATHS.length
  ) {
    errors.push(
      `completion receipt implementation_scope.changed_files must be ${ACCEPTED_IMPLEMENTATION_CHANGED_PATHS.length}`
    )
  }
  if (
    !Array.isArray(receipt.implementation_scope?.changed_paths) ||
    !sameValues(receipt.implementation_scope.changed_paths, ACCEPTED_IMPLEMENTATION_CHANGED_PATHS)
  ) {
    errors.push("completion receipt implementation_scope must bind the exact accepted PR149 paths")
  }
  if (receipt.implementation_scope?.required_checks !== "14/14") {
    errors.push("completion receipt implementation_scope.required_checks must be 14/14")
  }

  validateCompletionGate(receipt, "ci", "5/5", ACCEPTED_CI_RUN_ID, errors)
  validateCompletionGate(receipt, "security", "8/8", ACCEPTED_SECURITY_RUN_ID, errors)
  const artifacts = receipt.gates?.exact_head_artifacts
  if (
    artifacts?.result !== "PASS" ||
    artifacts?.source_head_sha !== receipt.implementation_head_sha ||
    artifacts?.expected_source_head !== receipt.implementation_head_sha
  ) {
    errors.push("completion receipt exact-head artifacts must bind the implementation head")
  }
  if (artifacts?.artifact_id !== ACCEPTED_FRONTEND_ARTIFACT_ID) {
    errors.push(
      `completion receipt exact-head artifacts must bind accepted PR149 artifact ${ACCEPTED_FRONTEND_ARTIFACT_ID}`
    )
  }
  if (
    artifacts?.github_archive_sha256 !== ACCEPTED_FRONTEND_ARCHIVE_SHA256 ||
    artifacts?.exact_head_sha256 !== ACCEPTED_EXACT_HEAD_ARTIFACT_SHA256 ||
    artifacts?.traceability_report_sha256 !== ACCEPTED_TRACEABILITY_REPORT_SHA256
  ) {
    errors.push("completion receipt exact-head artifact digests must match accepted PR149 evidence")
  }
  if (
    artifacts?.run_id !== ACCEPTED_CI_RUN_ID ||
    artifacts?.run_number !== 982 ||
    artifacts?.run_attempt !== 1
  ) {
    errors.push("completion receipt exact-head artifact run must be PR149 CI run 982 attempt 1")
  }
  if (receipt.gates?.review_threads?.unresolved !== 0) {
    errors.push("completion receipt requires zero unresolved review threads")
  }
  if (receipt.gates?.mergeability !== "PASS") {
    errors.push("completion receipt mergeability must be PASS")
  }
  if (
    receipt.gates?.protected_merge?.result !== "PASS" ||
    receipt.gates?.protected_merge?.expected_head_sha !== receipt.implementation_head_sha ||
    receipt.gates?.protected_merge?.merge_commit_sha !== receipt.implementation_merge_sha
  ) {
    errors.push(
      "completion receipt protected merge must bind the implementation head and merge SHAs"
    )
  }

  if (
    receipt.traceability_sha256 !== acceptedTraceabilitySha256 ||
    receipt.traceability_sha256 !== sha256(traceabilityText)
  ) {
    errors.push("completion receipt must bind the frozen traceability contract")
  }
  if (receipt.tasks_before_sha256 !== acceptedPendingTasksSha256) {
    errors.push("completion receipt tasks_before_sha256 must bind the audited change base")
  }
  if (state === t085States.RECEIPT_CANDIDATE) {
    if (
      typeof changeBaseTraceabilityText !== "string" ||
      changeBaseTraceabilityText !== traceabilityText
    ) {
      errors.push("completion receipt must bind the frozen traceability contract")
    }
    if (
      typeof changeBaseTasksText !== "string" ||
      receipt.tasks_before_sha256 !== sha256(changeBaseTasksText)
    ) {
      errors.push("completion receipt tasks_before_sha256 must bind the audited change base")
    }
  }
  if (state === t085States.RECEIPT_CANDIDATE && typeof changeBaseTasksText === "string") {
    const uncheckedT085Rows = [...changeBaseTasksText.matchAll(/^- \[ \] T085\b/gm)]
    const expectedTasksText = changeBaseTasksText.replace(/^- \[ \] T085\b/m, "- [x] T085")
    if (uncheckedT085Rows.length !== 1 || tasksText !== expectedTasksText) {
      errors.push("receipt candidate tasks.md change must be exactly the T085 checkbox")
    }
  }

  const open = deviations.filter((deviation) => deviation?.state === "OPEN")
  const accepted = deviations.filter((deviation) => deviation?.state === "ACCEPTED")
  const resolved = deviations.filter((deviation) => deviation?.state === "RESOLVED")
  const snapshotOpenIds = Array.isArray(receipt.deviation_snapshot?.open_ids)
    ? receipt.deviation_snapshot.open_ids
    : []
  if (
    receipt.deviation_snapshot?.total !== deviations.length ||
    receipt.deviation_snapshot?.open !== open.length ||
    receipt.deviation_snapshot?.accepted !== accepted.length ||
    receipt.deviation_snapshot?.resolved !== resolved.length ||
    snapshotOpenIds.length !== open.length ||
    !sameValues(
      snapshotOpenIds,
      open.map((deviation) => deviation.id)
    )
  ) {
    errors.push("completion receipt deviation snapshot must exactly preserve the contract")
  }

  for (const flag of [
    "t086_dispatched",
    "participant_research_executed",
    "web3_activated",
    "production_activated",
    "provider_configured",
    "secrets_changed"
  ]) {
    if (receipt.scope_boundaries?.[flag] !== false || lifecycle?.[flag] !== false) {
      errors.push(`completion receipt scope_boundaries.${flag} must remain false`)
    }
  }
}

function validateAcceptedSnapshots({
  state,
  tasksText,
  traceabilityText,
  changeBaseTasksText,
  changeBaseTraceabilityText,
  acceptedTraceabilitySha256,
  preRemediationTraceabilitySha256,
  acceptedPendingTasksSha256,
  acceptedCompletedTasksSha256,
  postT085RemediationScopeActive,
  requireAuditedScope,
  errors
}) {
  if (
    state === t085States.PENDING &&
    !requireAuditedScope &&
    typeof changeBaseTasksText !== "string" &&
    typeof changeBaseTraceabilityText !== "string"
  ) {
    return
  }
  const expectedBaseTraceabilitySha256 = postT085RemediationScopeActive
    ? preRemediationTraceabilitySha256
    : acceptedTraceabilitySha256
  if (
    sha256(traceabilityText) !== acceptedTraceabilitySha256 ||
    (typeof changeBaseTraceabilityText === "string" &&
      sha256(changeBaseTraceabilityText) !== expectedBaseTraceabilitySha256)
  ) {
    errors.push("traceability must match the accepted implementation snapshot")
  }

  const expectedCurrentTasksSha =
    state === t085States.PENDING ? acceptedPendingTasksSha256 : acceptedCompletedTasksSha256
  const expectedBaseTasksSha =
    state === t085States.PENDING || state === t085States.RECEIPT_CANDIDATE
      ? acceptedPendingTasksSha256
      : acceptedCompletedTasksSha256
  if (
    sha256(tasksText) !== expectedCurrentTasksSha ||
    (typeof changeBaseTasksText === "string" &&
      sha256(changeBaseTasksText) !== expectedBaseTasksSha)
  ) {
    errors.push("tasks must match the accepted implementation snapshot")
  }
  if (
    (requireAuditedScope ||
      state === t085States.RECEIPT_CANDIDATE ||
      state === t085States.COMPLETE_STEADY ||
      state === t085States.ROLLBACK) &&
    (typeof changeBaseTasksText !== "string" || typeof changeBaseTraceabilityText !== "string")
  ) {
    errors.push("audited change base must provide the frozen tasks and traceability snapshots")
  }
}

function validateScope(contract, taskStatus, state, completionReceiptPresent, errors) {
  const lifecycle = contract.lifecycle
  if (!lifecycle || lifecycle.phase !== "T085_IMPLEMENTATION") {
    errors.push("this bounded validator only accepts lifecycle.phase T085_IMPLEMENTATION")
  }
  if (lifecycle?.task !== "T085") errors.push("lifecycle.task must be T085")
  if (lifecycle?.t085_complete !== false) {
    errors.push("the frozen traceability contract must keep lifecycle.t085_complete false")
  }
  if (lifecycle?.receipt !== undefined) {
    errors.push("T085_IMPLEMENTATION must not carry a completion receipt")
  }
  for (const flag of [
    "t086_dispatched",
    "participant_research_executed",
    "web3_activated",
    "production_activated",
    "provider_configured",
    "secrets_changed"
  ]) {
    if (lifecycle?.[flag] !== false) errors.push(`lifecycle.${flag} must remain false`)
  }

  if (state === t085States.RECEIPT_CANDIDATE && !completionReceiptPresent) {
    errors.push("checked T085 requires a structured completion receipt")
  }
  if (state === t085States.PENDING && completionReceiptPresent) {
    errors.push("unchecked T085 must not stage a completion receipt")
  }
  if (state === t085States.ROLLBACK) {
    errors.push("T085 checkbox cannot roll back after completion")
  }
  if (state === t085States.UNKNOWN) {
    errors.push("T085 base/current checkbox state could not be classified")
  }

  for (const [taskId, checked] of taskStatus) {
    const expectedChecked =
      implementationCheckedTasks.has(taskId) ||
      ([t085States.RECEIPT_CANDIDATE, t085States.COMPLETE_STEADY].includes(state) &&
        taskId === "T085")
    if (checked !== expectedChecked) {
      errors.push(`${taskId} checkbox is outside the authorized T085 frontier`)
    }
  }
}

export function validateTraceability({
  root,
  currentHead = null,
  evaluatedHeadCommittedAt = null,
  gitBinding = null,
  changedPaths = null,
  changeBaseSha = REVIEW_BASE_SHA,
  changeBaseTasksText = null,
  changeBaseTraceabilityText = null,
  changeBaseCompletionReceiptText = null,
  implementationMergeAncestorOfChangeBase = null,
  acceptedTraceabilitySha256 = ACCEPTED_TRACEABILITY_SHA256,
  preRemediationTraceabilitySha256 = PRE_REMEDIATION_TRACEABILITY_SHA256,
  acceptedPendingTasksSha256 = ACCEPTED_PENDING_TASKS_SHA256,
  acceptedCompletedTasksSha256 = ACCEPTED_COMPLETED_TASKS_SHA256,
  boundedScopeActive = changeBaseSha === REVIEW_BASE_SHA,
  reviewBaseSha = REVIEW_BASE_SHA,
  requireExactHeadEvidence = false,
  requireAuditedScope = false,
  githubActionsContext = null
}) {
  const errors = []
  const warnings = []
  let requirementRows = []
  let taskLedgerRows = []
  let deviationRows = []
  let approvedOrphanIds = []
  const paths = {
    spec: "specs/001-taiwan-basketball-magazine-ebook/spec.md",
    plan: "specs/001-taiwan-basketball-magazine-ebook/plan.md",
    tasks: "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
    traceability: "specs/001-taiwan-basketball-magazine-ebook/traceability.md",
    dispatch: ".loop/evidence/t085-dispatch.json",
    completionReceipt: COMPLETION_RECEIPT_PATH
  }

  const specText = readText(root, paths.spec, errors, "spec source")
  const planText = readText(root, paths.plan, errors, "plan source")
  const tasksText = readText(root, paths.tasks, errors, "tasks source")
  const traceabilityText = readText(root, paths.traceability, errors, "T085 traceability artifact")
  const dispatchText = readText(root, paths.dispatch, errors, "T085 dispatch receipt")
  const completionReceiptPresent = fs.existsSync(path.resolve(root, paths.completionReceipt))
  const completionReceiptText = completionReceiptPresent
    ? readText(root, paths.completionReceipt, errors, "T085 completion receipt")
    : null
  const state = classifyT085State(changeBaseTasksText, tasksText)
  const postT085RemediationScopeActive = isExactPostT085RemediationScope({
    state,
    changeBaseSha,
    boundedScopeActive,
    changedPaths
  })

  if (!/^[0-9a-f]{40}$/.test(currentHead ?? "")) {
    errors.push("currentHead must be a full lowercase commit SHA")
  }
  if (reviewBaseSha !== REVIEW_BASE_SHA) {
    errors.push(`reviewBaseSha must equal the current protected review base ${REVIEW_BASE_SHA}`)
  }
  if (gitBinding && gitBinding.status !== "CLEAN") {
    errors.push(`working tree is not bound to the evaluated head (${gitBinding.status})`)
  }
  if (gitBinding?.head && gitBinding.head !== currentHead) {
    errors.push("git binding head must equal currentHead")
  }
  if (
    gitBinding?.head_committed_at !== undefined &&
    evaluatedHeadCommittedAt !== null &&
    gitBinding.head_committed_at !== evaluatedHeadCommittedAt
  ) {
    errors.push("git binding head commit timestamp must equal evaluatedHeadCommittedAt")
  }
  if (gitBinding?.change_base_sha !== undefined && gitBinding.change_base_sha !== changeBaseSha) {
    errors.push("git binding change base must equal changeBaseSha")
  }
  if (
    gitBinding?.bounded_scope_active !== undefined &&
    gitBinding.bounded_scope_active !== boundedScopeActive
  ) {
    errors.push("git binding bounded scope state must equal boundedScopeActive")
  }
  if (
    gitBinding?.implementation_merge_ancestor_of_change_base !== undefined &&
    gitBinding.implementation_merge_ancestor_of_change_base !==
      implementationMergeAncestorOfChangeBase
  ) {
    errors.push("git binding implementation-merge ancestry must match the audited value")
  }
  if (gitBinding?.authorized_base_ancestor === false) {
    errors.push("immutable dispatch base is not an ancestor of the evaluated head")
  }
  if (gitBinding?.review_base_ancestor === false) {
    errors.push("current protected review base is not an ancestor of the evaluated head")
  }
  if (gitBinding?.change_base_ancestor === false) {
    errors.push("audited change base is not an ancestor of the evaluated head")
  }
  if (state === t085States.RECEIPT_CANDIDATE) {
    if (
      gitBinding?.status !== "CLEAN" ||
      gitBinding?.head !== currentHead ||
      typeof gitBinding?.change_base_ref !== "string" ||
      gitBinding.change_base_sha !== changeBaseSha ||
      gitBinding.change_base_ancestor !== true
    ) {
      errors.push("receipt candidate requires trusted audited Git binding")
    }
    if (gitBinding?.head_parent_sha !== changeBaseSha) {
      errors.push("receipt candidate head parent must equal receipt_base_sha")
    }
    if (gitBinding?.head_parent_count !== 1) {
      errors.push("receipt candidate head must have exactly one parent")
    }
    if (changeBaseCompletionReceiptText !== null) {
      errors.push("receipt candidate base must not already contain a completion receipt")
    }
    if (
      !Array.isArray(changedPaths) ||
      changedPaths.length !== receiptChangedPaths.length ||
      !sameValues(changedPaths, receiptChangedPaths)
    ) {
      errors.push("receipt candidate may change only tasks.md and its completion receipt")
    }
  } else if (state === t085States.PENDING && Array.isArray(changedPaths)) {
    const pendingAllowedPaths =
      boundedScopeActive === false
        ? postT085RemediationScopeActive
          ? postT085RemediationChangedPaths
          : receiptSupportChangedPaths
        : authorizedChangedPaths
    for (const changedPath of changedPaths) {
      if (!pendingAllowedPaths.has(changedPath)) {
        const scopeLabel =
          boundedScopeActive === false
            ? "authorized T085 receipt-support scope"
            : "authorized T085 scope"
        errors.push(`changed path is outside the ${scopeLabel}: ${changedPath}`)
      }
    }
  }
  if (state === t085States.COMPLETE_STEADY) {
    for (const changedPath of changedPaths ?? []) {
      if (!isPostT085ResearchDocumentationPath(changedPath)) {
        errors.push(
          `changed path is outside the authorized post-T085 research-documentation scope: ${changedPath}`
        )
      }
      if (isT086LockedPath(changedPath)) {
        errors.push(
          `changed path requires separately authorized T086 validator evolution: ${changedPath}`
        )
      }
    }
    if (typeof changeBaseCompletionReceiptText !== "string") {
      errors.push("completed T085 requires a readable completion receipt at the audited base")
    }
    if (completionReceiptText !== changeBaseCompletionReceiptText) {
      errors.push("completed T085 must preserve the base completion receipt byte-for-byte")
    }
    if (tasksText !== changeBaseTasksText) {
      errors.push("completed T085 must preserve base tasks.md byte-for-byte")
    }
    if (traceabilityText !== changeBaseTraceabilityText) {
      errors.push("completed T085 must preserve the frozen traceability contract byte-for-byte")
    }
  }
  if (
    (state === t085States.PENDING || state === t085States.RECEIPT_CANDIDATE) &&
    (changeBaseSha === null || boundedScopeActive === null || !Array.isArray(changedPaths))
  ) {
    warnings.push(
      "review-base path diff was not available; authoritative GitHub PR scope read-back remains required"
    )
  } else if (
    state === t085States.COMPLETE_STEADY &&
    (changeBaseSha === null || !Array.isArray(changedPaths))
  ) {
    warnings.push(
      "completed-state diff was not available; authoritative GitHub PR scope read-back remains required"
    )
  }
  if (
    requireAuditedScope &&
    (changeBaseSha === null ||
      boundedScopeActive === null ||
      !Array.isArray(changedPaths) ||
      gitBinding?.change_base_ancestor !== true)
  ) {
    errors.push("CI validation requires an audited current-change diff")
  }

  let contract = null
  let dispatch = null
  let completionReceipt = null
  if (traceabilityText !== null) {
    try {
      contract = extractContract(traceabilityText)
    } catch (error) {
      errors.push(`invalid T085 traceability contract: ${error.message}`)
    }
  }
  if (dispatchText !== null) {
    try {
      dispatch = JSON.parse(dispatchText)
    } catch (error) {
      errors.push(`invalid T085 dispatch receipt: ${error.message}`)
    }
  }
  if (completionReceiptText !== null) {
    try {
      assertUniqueJsonObjectKeys(completionReceiptText)
      completionReceipt = JSON.parse(completionReceiptText)
    } catch (error) {
      errors.push(`invalid T085 completion receipt: ${error.message}`)
    }
  }

  const specIds = specText === null ? [] : idsFrom(specText, requirementPattern)
  const frIds = specIds.filter((id) => id.startsWith("FR-"))
  const scIds = specIds.filter((id) => id.startsWith("SC-"))
  const taskMatches = tasksText === null ? [] : [...tasksText.matchAll(taskPattern)]
  const taskIds = taskMatches.map((match) => match[2])
  const taskStatus = new Map(taskMatches.map((match) => [match[2], match[1].toLowerCase() === "x"]))
  const contractTaskStatus = new Map(taskStatus)
  if ([t085States.RECEIPT_CANDIDATE, t085States.COMPLETE_STEADY].includes(state)) {
    contractTaskStatus.set("T085", false)
  }

  validateAcceptedSnapshots({
    state,
    tasksText,
    traceabilityText,
    changeBaseTasksText,
    changeBaseTraceabilityText,
    acceptedTraceabilitySha256,
    preRemediationTraceabilitySha256,
    acceptedPendingTasksSha256,
    acceptedCompletedTasksSha256,
    postT085RemediationScopeActive,
    requireAuditedScope,
    errors
  })

  const expectedRequirements = [...expectedIds("FR", 74), ...expectedIds("SC", 23)]
  const expectedTasks = Array.from(
    { length: 112 },
    (_, index) => `T${String(index + 1).padStart(3, "0")}`
  )
  if (
    JSON.stringify(frIds) !== JSON.stringify(expectedIds("FR", 74)) ||
    JSON.stringify(scIds) !== JSON.stringify(expectedIds("SC", 23)) ||
    specIds.length !== 97
  ) {
    errors.push("spec must define exactly contiguous FR-001..FR-074 and SC-001..SC-023")
  }
  if (duplicates(specIds).length > 0) {
    errors.push(`spec contains duplicate requirement IDs: ${duplicates(specIds).join(", ")}`)
  }
  if (JSON.stringify(taskIds) !== JSON.stringify(expectedTasks)) {
    errors.push("tasks must define exactly contiguous T001..T112")
  }
  if (duplicates(taskIds).length > 0) {
    errors.push(`tasks contains duplicate IDs: ${duplicates(taskIds).join(", ")}`)
  }

  if (contract) {
    if (contract.schema_version !== TRACEABILITY_SCHEMA) {
      errors.push(`schema_version must be ${TRACEABILITY_SCHEMA}`)
    }
    if (
      contract.repository !== "bynanci/courtside-tw" ||
      contract.repository !== dispatch?.repository
    ) {
      errors.push("contract repository must equal bynanci/courtside-tw and the immutable dispatch")
    }
    if (
      contract.authorized_base_sha !== AUTHORIZED_BASE_SHA ||
      dispatch?.base?.sha !== AUTHORIZED_BASE_SHA
    ) {
      errors.push(`contract and dispatch base must equal ${AUTHORIZED_BASE_SHA}`)
    }
    if (
      dispatch?.schema_version !== "courtside-t085-dispatch/v1" ||
      dispatch?.repository !== "bynanci/courtside-tw" ||
      dispatch?.issue !== "https://github.com/bynanci/courtside-tw/issues/145" ||
      dispatch?.branch !== "task/t085-cross-artifact-traceability" ||
      dispatch?.base?.branch !== "main"
    ) {
      errors.push("dispatch identity must remain bound to issue 145, the T085 branch and main")
    }
    if (!isDeepStrictEqual(dispatch, expectedDispatch)) {
      errors.push("dispatch authority must match the immutable T085 receipt")
    }
    if (
      contract.source_inventory?.spec !== paths.spec ||
      contract.source_inventory?.plan !== paths.plan ||
      contract.source_inventory?.tasks !== paths.tasks ||
      contract.source_inventory?.functional_requirements !== 74 ||
      contract.source_inventory?.success_criteria !== 23 ||
      contract.source_inventory?.tasks_total !== 112 ||
      contract.source_inventory?.tasks_checked !==
        [...contractTaskStatus.values()].filter(Boolean).length ||
      contract.source_inventory?.tasks_unchecked !==
        [...contractTaskStatus.values()].filter((value) => !value).length
    ) {
      errors.push("source_inventory must match the frozen implementation snapshot")
    }
    validateScope(contract, taskStatus, state, completionReceiptPresent, errors)

    if (!Array.isArray(contract.requirements)) errors.push("requirements must be an array")
    if (!Array.isArray(contract.task_ledger)) errors.push("task_ledger must be an array")
    if (!Array.isArray(contract.deviations)) errors.push("deviations must be an array")

    const requirements = Array.isArray(contract.requirements) ? contract.requirements : []
    requirementRows = requirements
    const requirementIds = requirements.map((row) => row?.id)
    if (JSON.stringify(requirementIds) !== JSON.stringify(expectedRequirements)) {
      errors.push("requirements must contain every FR/SC exactly once")
    }
    if (duplicates(requirementIds).length > 0) {
      errors.push(`requirements contains duplicate IDs: ${duplicates(requirementIds).join(", ")}`)
    }

    const humanRows = humanRequirementRows(traceabilityText)
    if (JSON.stringify(humanRows.map((row) => row.id)) !== JSON.stringify(expectedRequirements)) {
      errors.push(
        "human-readable tables must contain every FR/SC exactly once and in canonical order"
      )
    }
    const humanById = new Map(humanRows.map((row) => [row.id, row]))
    for (const row of requirements) {
      const human = humanById.get(row.id)
      if (!human) continue
      const expectedProofIds = (row.proofs ?? []).map((proof) => proof.id).filter(Boolean)
      if (
        human.story_slice !== `${row.story} / ${row.slice}` ||
        !sameValues(human.task_ids, row.task_ids ?? []) ||
        human.implementation_state !== row.implementation_state ||
        human.evidence_state !== row.evidence_state ||
        !sameValues(human.proof_ids, expectedProofIds) ||
        !sameValues(human.deviation_ids, row.deviation_ids ?? []) ||
        human.release_impact !== row.release_impact
      ) {
        errors.push(`human-readable row ${row.id} must match the machine contract`)
      }
    }

    const deviations = Array.isArray(contract.deviations) ? contract.deviations : []
    deviationRows = deviations
    const deviationIds = deviations.map((deviation) => deviation?.id)
    if (duplicates(deviationIds).length > 0) {
      errors.push(`deviations contains duplicate IDs: ${duplicates(deviationIds).join(", ")}`)
    }
    const humanDeviations = humanDeviationRows(traceabilityText)
    if (
      JSON.stringify(humanDeviations.map((deviation) => deviation.id)) !==
      JSON.stringify(deviationIds)
    ) {
      errors.push(
        "human-readable deviation register must contain every machine deviation exactly once and in canonical order"
      )
    }
    const humanDeviationById = new Map(
      humanDeviations.map((deviation) => [deviation.id, deviation])
    )
    for (const deviation of deviations) {
      const human = humanDeviationById.get(deviation.id)
      if (!human) continue
      if (
        human.type !== deviation.type ||
        human.severity !== deviation.severity ||
        human.state !== deviation.state ||
        !sameValues(human.affected_ids, deviation.affected_ids ?? []) ||
        human.disposition_target !== `${deviation.disposition} Target: ${deviation.target}.` ||
        human.release_impact !== deviation.release_impact
      ) {
        errors.push(`human-readable deviation ${deviation.id} must match the machine contract`)
      }
    }
    const deviationById = new Map(deviations.map((deviation) => [deviation?.id, deviation]))
    for (const [index, deviation] of deviations.entries()) {
      const label = `deviations[${index}]`
      requireString(deviation?.id, `${label}.id`, errors)
      requireString(deviation?.type, `${label}.type`, errors)
      requireString(deviation?.severity, `${label}.severity`, errors)
      requireString(deviation?.expected, `${label}.expected`, errors)
      requireString(deviation?.observed, `${label}.observed`, errors)
      requireString(deviation?.disposition, `${label}.disposition`, errors)
      requireString(deviation?.owner, `${label}.owner`, errors)
      requireString(deviation?.target, `${label}.target`, errors)
      requireString(deviation?.release_impact, `${label}.release_impact`, errors)
      if (!Array.isArray(deviation?.affected_ids) || deviation.affected_ids.length === 0) {
        errors.push(`${label}.affected_ids must be a non-empty array`)
      }
      for (const affectedId of deviation?.affected_ids ?? []) {
        if (!expectedRequirements.includes(affectedId) && !expectedTasks.includes(affectedId)) {
          errors.push(`${label}.affected_ids references unknown ID ${affectedId}`)
        }
        if (expectedRequirements.includes(affectedId)) {
          const requirement = requirements.find((row) => row?.id === affectedId)
          if (!requirement?.deviation_ids?.includes(deviation.id)) {
            errors.push(
              `${deviation.id} affects ${affectedId}, but the requirement does not reference it`
            )
          }
        }
      }
      if (!deviationStates.has(deviation?.state)) {
        errors.push(`${label}.state must be OPEN, ACCEPTED or RESOLVED`)
      }
    }

    const forward = new Map(expectedTasks.map((id) => [id, new Set()]))
    for (const [index, row] of requirements.entries()) {
      const label = `requirements[${index}]${row?.id ? ` (${row.id})` : ""}`
      requireString(row?.id, `${label}.id`, errors)
      requireString(row?.story, `${label}.story`, errors)
      requireString(row?.priority, `${label}.priority`, errors)
      requireString(row?.slice, `${label}.slice`, errors)
      requireString(row?.release_impact, `${label}.release_impact`, errors)
      if (!implementationStates.has(row?.implementation_state)) {
        errors.push(`${label}.implementation_state is invalid`)
      }
      if (!evidenceStates.has(row?.evidence_state)) {
        errors.push(`${label}.evidence_state is invalid`)
      }
      if (!Array.isArray(row?.task_ids) || row.task_ids.length === 0) {
        errors.push(`${label}.task_ids must be a non-empty array`)
      }
      if (duplicates(row?.task_ids ?? []).length > 0) {
        errors.push(`${label}.task_ids contains duplicates`)
      }
      for (const taskId of row?.task_ids ?? []) {
        if (!taskStatus.has(taskId)) errors.push(`${label} references unknown task ${taskId}`)
        else forward.get(taskId)?.add(row.id)
      }

      const proofs = Array.isArray(row?.proofs) ? row.proofs : []
      for (const [proofIndex, proof] of proofs.entries()) {
        validateProof(root, proof, row.id, `${label}.proofs[${proofIndex}]`, errors)
      }
      const rowDeviationIds = Array.isArray(row?.deviation_ids) ? row.deviation_ids : []
      for (const deviationId of rowDeviationIds) {
        const deviation = deviationById.get(deviationId)
        if (!deviation) errors.push(`${label} references unknown deviation ${deviationId}`)
        else if (!deviation.affected_ids?.includes(row.id)) {
          errors.push(
            `${label} references ${deviationId}, but the deviation does not affect ${row.id}`
          )
        }
      }

      if (row?.evidence_state === "VERIFIED") {
        if (proofs.length === 0) errors.push(`${label} VERIFIED rows require at least one proof`)
        if (!proofs.some((proof) => proofKinds.has(proof?.kind))) {
          errors.push(`${label} VERIFIED rows require an allowed proof kind`)
        }
        for (const proof of proofs.filter((proof) => proof?.kind === "REPOSITORY_PROOF")) {
          if (!isExecutableProofPath(root, proof.path)) {
            errors.push(
              `${label} VERIFIED repository proof must be an executable check or durable receipt`
            )
          } else if (!hasExecutableProofAnchor(root, proof)) {
            errors.push(
              `${label}.selector must identify an executable test anchor in ${proof.path}`
            )
          }
        }
        const unchecked = (row?.task_ids ?? []).filter((taskId) => taskStatus.get(taskId) === false)
        if (unchecked.length > 0) {
          errors.push(`${label} cannot be VERIFIED with unchecked tasks: ${unchecked.join(", ")}`)
        }
        if (row?.implementation_state !== "COMPLETE") {
          errors.push(`${label} VERIFIED rows must have implementation_state COMPLETE`)
        }
        const openDeviationIds = rowDeviationIds.filter(
          (deviationId) => deviationById.get(deviationId)?.state === "OPEN"
        )
        if (openDeviationIds.length > 0) {
          errors.push(
            `${label} VERIFIED rows cannot retain OPEN deviation ${openDeviationIds.join(", ")}`
          )
        }
      } else if (rowDeviationIds.length === 0) {
        errors.push(`${label} non-VERIFIED rows require an explicit deviation`)
      }

      if (["SC-001", "SC-004", "SC-007"].includes(row?.id) && row?.evidence_state === "VERIFIED") {
        if (contract.lifecycle?.participant_research_executed !== true) {
          errors.push(`${label} cannot be VERIFIED while participant research remains unexecuted`)
        }
        if (!proofs.some((proof) => proof?.kind === "HUMAN_RECEIPT")) {
          errors.push(`${label} requires a HUMAN_RECEIPT before VERIFIED`)
        }
      }
      if (["SC-002", "SC-011"].includes(row?.id) && row?.evidence_state === "VERIFIED") {
        if (contract.lifecycle?.production_activated !== true) {
          errors.push(`${label} cannot be VERIFIED while production activation remains false`)
        }
        if (!proofs.some((proof) => proof?.kind === "EXTERNAL_METRIC_RECEIPT")) {
          errors.push(`${label} requires an EXTERNAL_METRIC_RECEIPT before VERIFIED`)
        }
      }
      if (row?.id === "SC-012" && row?.evidence_state === "VERIFIED") {
        if (contract.lifecycle?.t086_dispatched !== true) {
          errors.push(`${label} cannot be VERIFIED before T086 is dispatched`)
        }
        if (!proofs.some((proof) => proof?.kind === "CI_STABILITY_RECEIPT")) {
          errors.push(`${label} requires a CI_STABILITY_RECEIPT before VERIFIED`)
        }
      }
    }

    const ledger = Array.isArray(contract.task_ledger) ? contract.task_ledger : []
    taskLedgerRows = ledger
    const ledgerIds = ledger.map((row) => row?.id)
    if (JSON.stringify(ledgerIds) !== JSON.stringify(expectedTasks)) {
      errors.push("task_ledger must classify every T001..T112 exactly once")
    }
    if (duplicates(ledgerIds).length > 0) {
      errors.push(`task_ledger contains duplicate IDs: ${duplicates(ledgerIds).join(", ")}`)
    }
    for (const [index, row] of ledger.entries()) {
      const label = `task_ledger[${index}]${row?.id ? ` (${row.id})` : ""}`
      if (!taskStatus.has(row?.id)) errors.push(`${label} references unknown task`)
      if (!taskClassifications.has(row?.classification)) {
        errors.push(`${label}.classification is invalid`)
      }
      if (row?.classification !== expectedTaskClassification(row?.id ?? "")) {
        errors.push(`${label}.classification does not match the authorized task taxonomy`)
      }
      const expectedStatus = contractTaskStatus.get(row?.id) ? "COMPLETE" : "OPEN"
      if (row?.status !== expectedStatus) {
        errors.push(`${label}.status must match tasks.md (${expectedStatus})`)
      }
      const reverse = Array.isArray(row?.requirement_ids) ? row.requirement_ids : []
      const expectedReverse = [...(forward.get(row?.id) ?? [])]
      if (!sameValues(reverse, expectedReverse) || reverse.length !== expectedReverse.length) {
        errors.push(`${label}.requirement_ids must exactly match the forward requirement mapping`)
      }
      const approvedOrphans = new Set(["T001", "T005", "T007", "T082", "T085"])
      if (reverse.length === 0 && !approvedOrphans.has(row?.id)) {
        errors.push(`${label} is not an approved orphan and must map to a requirement`)
      }
      if (reverse.length === 0) requireString(row?.orphan_reason, `${label}.orphan_reason`, errors)
      if (reverse.length > 0 && row?.orphan_reason !== undefined) {
        errors.push(`${label}.orphan_reason is only allowed for an approved orphan`)
      }
    }
    approvedOrphanIds = ledger
      .filter((row) => (row.requirement_ids ?? []).length === 0)
      .map((row) => row.id)

    for (const claim of taskRangeClaims(tasksText)) {
      const mapped = forward.get(claim.task_id) ?? new Set()
      const missing = claim.requirement_ids.filter((requirementId) => !mapped.has(requirementId))
      const hasDriftDeviation = deviations.some(
        (deviation) =>
          deviation?.type === "TASK_SOURCE_DRIFT" &&
          deviation?.state === "OPEN" &&
          deviation?.affected_ids?.includes(claim.task_id)
      )
      if (missing.length > 0 && !hasDriftDeviation) {
        errors.push(
          `${claim.task_id} source range omits ${missing.join(", ")} without TASK_SOURCE_DRIFT`
        )
      }
    }

    for (const deviation of deviations) {
      const affectsRequirement = (deviation?.affected_ids ?? []).some((id) =>
        expectedRequirements.includes(id)
      )
      if (deviation?.state === "OPEN" && !affectsRequirement) {
        warnings.push(
          `open deviation ${deviation.id} is task/structure-only, not requirement-linked`
        )
      }
    }

    if (
      [t085States.RECEIPT_CANDIDATE, t085States.COMPLETE_STEADY].includes(state) &&
      completionReceiptText !== null
    ) {
      validateCompletionReceipt({
        receipt: completionReceipt,
        state,
        evaluatedHeadCommittedAt,
        changeBaseSha,
        changeBaseTasksText,
        changeBaseTraceabilityText,
        tasksText,
        traceabilityText,
        implementationMergeAncestorOfChangeBase,
        acceptedTraceabilitySha256,
        acceptedPendingTasksSha256,
        deviations,
        lifecycle: contract.lifecycle,
        errors
      })
    }
  }

  let exactHeadEvidence = null
  const exactHeadPath = path.join(root, "artifacts/exact-head.json")
  if (fs.existsSync(exactHeadPath)) {
    try {
      exactHeadEvidence = JSON.parse(fs.readFileSync(exactHeadPath, "utf8"))
      if (exactHeadEvidence.source_head_sha !== currentHead) {
        errors.push("artifacts/exact-head.json source_head_sha must equal the evaluated Git head")
      }
      if (exactHeadEvidence.expected_source_head !== currentHead) {
        errors.push(
          "artifacts/exact-head.json expected_source_head must equal the evaluated Git head"
        )
      }
    } catch (error) {
      errors.push(`invalid artifacts/exact-head.json: ${error.message}`)
    }
  }
  if (requireExactHeadEvidence && exactHeadEvidence === null) {
    errors.push("CI validation requires artifacts/exact-head.json")
  }
  const authenticatedGitHubActions = isAuthenticatedGitHubActionsContext(githubActionsContext)
  if (
    state === t085States.RECEIPT_CANDIDATE &&
    requireExactHeadEvidence &&
    !authenticatedGitHubActions
  ) {
    errors.push("authoritative receipt validation requires authenticated GitHub Actions context")
  }
  if (
    exactHeadEvidence !== null &&
    authenticatedGitHubActions &&
    !exactHeadMatchesGitHubActionsContext(exactHeadEvidence, githubActionsContext)
  ) {
    errors.push(
      "artifacts/exact-head.json metadata must match the authenticated GitHub Actions context"
    )
  }
  if (state === t085States.RECEIPT_CANDIDATE && exactHeadEvidence === null) {
    warnings.push(
      "receipt candidate requires current-head exact-head evidence before it is eligible"
    )
  }
  if (
    state === t085States.RECEIPT_CANDIDATE &&
    exactHeadEvidence !== null &&
    !requireExactHeadEvidence
  ) {
    warnings.push(
      "receipt candidate exact-head evidence is not authoritative outside the required CI mode"
    )
  }

  const analysisValid = errors.length === 0
  const receiptEligible = false
  const externalReadbackRequired = state === t085States.RECEIPT_CANDIDATE && analysisValid
  const checkedTasks = [...taskStatus.values()].filter(Boolean).length
  const openDeviations = deviationRows.filter((deviation) => deviation?.state === "OPEN")

  return {
    schema_version: "courtside-traceability-report/v1",
    task: "T085",
    status: analysisValid ? "PASS" : "FAIL",
    mode: state,
    analysis_valid: analysisValid,
    receipt_eligible: receiptEligible,
    external_readback_required: externalReadbackRequired,
    source: {
      repository: contract?.repository ?? "bynanci/courtside-tw",
      authorized_base_sha: contract?.authorized_base_sha ?? dispatch?.base?.sha ?? null,
      review_base_sha: reviewBaseSha,
      evaluated_head_sha: currentHead,
      evaluated_head_committed_at: evaluatedHeadCommittedAt,
      exact_head_evidence: exactHeadEvidence,
      github_actions_context: githubActionsContext
        ? {
            status: githubActionsContext.status ?? "UNTRUSTED",
            authority: githubActionsContext.authority ?? null,
            event_name: githubActionsContext.event_name ?? null,
            repository: githubActionsContext.repository ?? null,
            workflow: githubActionsContext.workflow ?? null,
            job: githubActionsContext.job ?? null,
            run_id: githubActionsContext.run_id ?? null,
            run_number: githubActionsContext.run_number ?? null,
            run_attempt: githubActionsContext.run_attempt ?? null,
            errors: githubActionsContext.errors ?? []
          }
        : null,
      inputs: {
        spec: { path: paths.spec, sha256: sha256(specText) },
        plan: { path: paths.plan, sha256: sha256(planText) },
        tasks: { path: paths.tasks, sha256: sha256(tasksText) },
        traceability: {
          path: paths.traceability,
          sha256: sha256(traceabilityText)
        }
      }
    },
    counts: {
      requirements_in_spec: specIds.length,
      tasks_in_plan: taskIds.length,
      checked_tasks: checkedTasks,
      unchecked_tasks: taskIds.length - checkedTasks,
      mapped_requirements: contract?.requirements?.length ?? 0,
      classified_tasks: contract?.task_ledger?.length ?? 0,
      mapped_tasks: taskLedgerRows.filter((row) => (row?.requirement_ids ?? []).length > 0).length,
      approved_orphans: approvedOrphanIds.length,
      deviations: contract?.deviations?.length ?? 0
    },
    evidence_distribution: distribution(requirementRows, "evidence_state"),
    implementation_distribution: distribution(requirementRows, "implementation_state"),
    deviation_summary: {
      total: deviationRows.length,
      open: openDeviations.length,
      resolved: deviationRows.filter((deviation) => deviation?.state === "RESOLVED").length,
      accepted: deviationRows.filter((deviation) => deviation?.state === "ACCEPTED").length,
      open_ids: openDeviations.map((deviation) => deviation.id)
    },
    scope_boundaries: {
      t086_dispatched: contract?.lifecycle?.t086_dispatched ?? false,
      participant_research_executed: contract?.lifecycle?.participant_research_executed ?? false,
      web3_activated: contract?.lifecycle?.web3_activated ?? false,
      production_activated: contract?.lifecycle?.production_activated ?? false,
      provider_configured: contract?.lifecycle?.provider_configured ?? false,
      secrets_changed: contract?.lifecycle?.secrets_changed ?? false
    },
    completion_receipt: completionReceipt
      ? {
          path: paths.completionReceipt,
          schema_version: completionReceipt.schema_version ?? null,
          decision: completionReceipt.decision ?? null,
          implementation_head_sha: completionReceipt.implementation_head_sha ?? null,
          implementation_merge_sha: completionReceipt.implementation_merge_sha ?? null,
          receipt_base_sha: completionReceipt.receipt_base_sha ?? null,
          file_sha256: sha256(completionReceiptText)
        }
      : null,
    scope_validation: {
      authorized_base_sha: AUTHORIZED_BASE_SHA,
      review_base_sha: reviewBaseSha,
      change_base_sha: changeBaseSha,
      bounded_scope_active: boundedScopeActive,
      status:
        state === t085States.RECEIPT_CANDIDATE
          ? Array.isArray(changedPaths) &&
            sameValues(changedPaths, receiptChangedPaths) &&
            gitBinding?.change_base_ancestor === true &&
            gitBinding?.head_parent_sha === changeBaseSha &&
            gitBinding?.head_parent_count === 1
            ? "T085_RECEIPT_AUDITED"
            : "EXTERNAL_READBACK_REQUIRED"
          : state === t085States.COMPLETE_STEADY && Array.isArray(changedPaths)
            ? "T085_COMPLETE_STEADY_AUDITED"
            : state === t085States.PENDING && Array.isArray(changedPaths)
              ? "AUDITED"
              : "EXTERNAL_READBACK_REQUIRED",
      git_diff_audited: Array.isArray(changedPaths),
      changed_paths: changedPaths,
      unauthorized_paths:
        state === t085States.RECEIPT_CANDIDATE && Array.isArray(changedPaths)
          ? changedPaths.filter((changedPath) => !receiptChangedPaths.includes(changedPath))
          : state === t085States.RECEIPT_CANDIDATE
            ? null
            : state === t085States.PENDING && Array.isArray(changedPaths)
              ? changedPaths.filter(
                  (changedPath) =>
                    !(
                      boundedScopeActive === false
                        ? postT085RemediationScopeActive
                          ? postT085RemediationChangedPaths
                          : receiptSupportChangedPaths
                        : authorizedChangedPaths
                    ).has(changedPath)
                )
              : state === t085States.PENDING
                ? null
                : state === t085States.COMPLETE_STEADY && Array.isArray(changedPaths)
                  ? changedPaths.filter(
                      (changedPath) => !isPostT085ResearchDocumentationPath(changedPath)
                    )
                  : state === t085States.COMPLETE_STEADY
                    ? null
                    : null
    },
    head_binding: gitBinding ?? {
      status: "UNVERIFIED_FIXTURE",
      head: currentHead
    },
    requirement_results: requirementRows.map((row) => ({
      id: row.id,
      implementation_state: row.implementation_state,
      evidence_state: row.evidence_state,
      task_ids: row.task_ids,
      proof_ids: (row.proofs ?? []).map((proof) => proof.id ?? null),
      proofs: (row.proofs ?? []).map((proof) => ({
        id: proof.id ?? null,
        kind: proof.kind,
        path: proof.path,
        selector: proof.selector,
        source_head: proof.source_head ?? null,
        file_sha256: proofFileSha256(root, proof.path)
      })),
      deviation_ids: row.deviation_ids,
      release_impact: row.release_impact
    })),
    task_results: taskLedgerRows.map((row) => ({
      id: row.id,
      status: row.status,
      classification: row.classification,
      requirement_ids: row.requirement_ids
    })),
    errors,
    warnings
  }
}

function inspectAncestor(root, baseSha, head) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseSha, head], {
      cwd: root,
      stdio: "ignore"
    })
    return true
  } catch (error) {
    return error?.status === 1 ? false : null
  }
}

function eventChangeBaseCandidates(environment) {
  const candidates = []
  let constrained = environment.GITHUB_ACTIONS === "true" && Boolean(environment.GITHUB_EVENT_PATH)
  if (environment.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, "utf8"))
      const pullRequestBase = event?.pull_request?.base?.sha
      const pushBefore = event?.before
      constrained = event?.pull_request !== undefined || event?.before !== undefined
      if (/^[0-9a-f]{40}$/.test(pullRequestBase ?? "")) {
        candidates.push({ ref: pullRequestBase, source: "github-event:pull_request.base.sha" })
      } else if (/^[0-9a-f]{40}$/.test(pushBefore ?? "") && !/^0{40}$/.test(pushBefore)) {
        candidates.push({ ref: pushBefore, source: "github-event:before" })
      }
    } catch {
      // A GitHub event that cannot be read stays constrained and fails closed below.
    }
  }
  if (environment.GITHUB_BASE_REF && candidates.length === 0) {
    constrained = true
    candidates.push({
      ref: `refs/remotes/origin/${environment.GITHUB_BASE_REF}`,
      source: "github-env:GITHUB_BASE_REF"
    })
  }
  return { candidates, constrained }
}

function resolveChangeBase(root, head, environment) {
  const eventCandidates = eventChangeBaseCandidates(environment)
  const candidates = eventCandidates.constrained
    ? eventCandidates.candidates
    : [
        { ref: "refs/remotes/origin/HEAD", source: "git:origin/HEAD" },
        { ref: "refs/remotes/origin/main", source: "git:origin/main" },
        { ref: "refs/heads/main", source: "git:main" }
      ]
  for (const candidate of candidates) {
    try {
      const baseCommit = execFileSync(
        "git",
        ["rev-parse", "--verify", `${candidate.ref}^{commit}`],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        }
      ).trim()
      if (/^[0-9a-f]{40}$/.test(baseCommit)) {
        return {
          ref: candidate.source,
          sha: baseCommit,
          ancestor: inspectAncestor(root, baseCommit, head)
        }
      }
    } catch {
      // Try the next trusted base candidate.
    }
  }
  return { ref: null, sha: null, ancestor: null }
}

function inspectPathAtCommit(root, commit, relativePath) {
  if (commit === null) return null
  try {
    const result = execFileSync("git", ["ls-tree", "--name-only", commit, "--", relativePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
    return result === relativePath
  } catch {
    return null
  }
}

function readTextAtCommit(root, commit, relativePath) {
  if (commit === null) return null
  try {
    return execFileSync("git", ["show", `${commit}:${relativePath}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
  } catch {
    return null
  }
}

function inspectHeadTopology(root, head) {
  try {
    const parentLine = execFileSync("git", ["show", "-s", "--format=%P", head], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
    const parents = parentLine.split(/\s+/).filter((parent) => /^[0-9a-f]{40}$/.test(parent))
    return { first: parents[0] ?? null, count: parents.length }
  } catch {
    return { first: null, count: null }
  }
}

function inspectImplementationMergeAncestor(root, changeBaseSha) {
  if (!/^[0-9a-f]{40}$/.test(changeBaseSha ?? "")) return null
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(root, COMPLETION_RECEIPT_PATH), "utf8"))
    if (!/^[0-9a-f]{40}$/.test(receipt?.implementation_merge_sha ?? "")) return null
    return inspectAncestor(root, receipt.implementation_merge_sha, changeBaseSha)
  } catch {
    return null
  }
}

export function inspectGit(root, { environment = process.env } = {}) {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
    const headCommittedAt = new Date(
      execFileSync("git", ["show", "-s", "--format=%cI", head], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim()
    ).toISOString()
    const porcelain = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
    const status = porcelain
      ? porcelain.split("\n").some((line) => line.startsWith("??"))
        ? "UNTRACKED_OR_DIRTY"
        : "DIRTY"
      : "CLEAN"
    const authorizedBaseAncestor = inspectAncestor(root, AUTHORIZED_BASE_SHA, head)
    const reviewBaseAncestor = inspectAncestor(root, REVIEW_BASE_SHA, head)
    const changeBase = resolveChangeBase(root, head, environment)
    const headTopology = inspectHeadTopology(root, head)
    const implementationMergeAncestorOfChangeBase = inspectImplementationMergeAncestor(
      root,
      changeBase.sha
    )
    const baseHasTraceability = inspectPathAtCommit(
      root,
      changeBase.sha,
      "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
    )
    const boundedScopeActive = baseHasTraceability === null ? null : baseHasTraceability === false
    const changeBaseTasksText = readTextAtCommit(
      root,
      changeBase.sha,
      "specs/001-taiwan-basketball-magazine-ebook/tasks.md"
    )
    const changeBaseTraceabilityText = readTextAtCommit(
      root,
      changeBase.sha,
      "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
    )
    const changeBaseCompletionReceiptText = readTextAtCommit(
      root,
      changeBase.sha,
      COMPLETION_RECEIPT_PATH
    )
    let changedPaths = null
    if (changeBase.sha !== null) {
      changedPaths = execFileSync(
        "git",
        ["diff", "--no-renames", "--name-only", changeBase.sha, head],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        }
      )
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort()
    }
    return {
      head,
      head_committed_at: headCommittedAt,
      status,
      authorized_base_ancestor: authorizedBaseAncestor,
      review_base_ancestor: reviewBaseAncestor,
      change_base_ref: changeBase.ref,
      change_base_sha: changeBase.sha,
      change_base_ancestor: changeBase.ancestor,
      head_parent_sha: headTopology.first,
      head_parent_count: headTopology.count,
      implementation_merge_ancestor_of_change_base: implementationMergeAncestorOfChangeBase,
      change_base_tasks_text: changeBaseTasksText,
      change_base_traceability_text: changeBaseTraceabilityText,
      change_base_completion_receipt_text: changeBaseCompletionReceiptText,
      bounded_scope_active: boundedScopeActive,
      changedPaths
    }
  } catch {
    return {
      head: null,
      head_committed_at: null,
      status: "UNAVAILABLE",
      authorized_base_ancestor: null,
      review_base_ancestor: null,
      change_base_ref: null,
      change_base_sha: null,
      change_base_ancestor: null,
      head_parent_sha: null,
      head_parent_count: null,
      implementation_merge_ancestor_of_change_base: null,
      change_base_tasks_text: null,
      change_base_traceability_text: null,
      change_base_completion_receipt_text: null,
      bounded_scope_active: null,
      changedPaths: null
    }
  }
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function runCli(root = repositoryRoot, { environment = process.env } = {}) {
  const inspection = inspectGit(root, { environment })
  const githubActionsContext = inspectGitHubActionsContext({ environment, gitBinding: inspection })
  const isGitHubActions = environment.GITHUB_ACTIONS === "true"
  const report = validateTraceability({
    root,
    currentHead: inspection.head,
    evaluatedHeadCommittedAt: inspection.head_committed_at,
    gitBinding: {
      status: inspection.status,
      head: inspection.head,
      head_committed_at: inspection.head_committed_at,
      authorized_base_ancestor: inspection.authorized_base_ancestor,
      review_base_ancestor: inspection.review_base_ancestor,
      change_base_ref: inspection.change_base_ref,
      change_base_sha: inspection.change_base_sha,
      change_base_ancestor: inspection.change_base_ancestor,
      head_parent_sha: inspection.head_parent_sha,
      head_parent_count: inspection.head_parent_count,
      implementation_merge_ancestor_of_change_base:
        inspection.implementation_merge_ancestor_of_change_base,
      bounded_scope_active: inspection.bounded_scope_active
    },
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    changeBaseTasksText: inspection.change_base_tasks_text,
    changeBaseTraceabilityText: inspection.change_base_traceability_text,
    changeBaseCompletionReceiptText: inspection.change_base_completion_receipt_text,
    implementationMergeAncestorOfChangeBase:
      inspection.implementation_merge_ancestor_of_change_base,
    boundedScopeActive: inspection.bounded_scope_active,
    reviewBaseSha: REVIEW_BASE_SHA,
    requireExactHeadEvidence: isGitHubActions,
    requireAuditedScope: isGitHubActions,
    githubActionsContext
  })
  const outputPath = path.join(root, "artifacts/frontend/t085-traceability-report.json")
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.renameSync(temporaryPath, outputPath)
  if (report.status === "PASS") {
    console.log(
      `T085 traceability: PASS (${report.counts.mapped_requirements} requirements, ${report.counts.classified_tasks} tasks, ${report.counts.deviations} deviations)`
    )
    return 0
  }
  console.error("T085 traceability: FAIL")
  for (const error of report.errors) console.error(`- ${error}`)
  return 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) process.exitCode = runCli()
