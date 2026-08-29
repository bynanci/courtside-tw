/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"
import typescriptPlugin from "prettier/plugins/typescript"

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

function isExecutableProofPath(relativePath) {
  return (
    relativePath?.startsWith(".github/workflows/") ||
    relativePath?.startsWith(".loop/evidence/") ||
    relativePath?.startsWith("scripts/test/") ||
    /(?:^|\/)(?:test|tests)\//.test(relativePath ?? "") ||
    /(?:IT|Test)\.java$/.test(relativePath ?? "") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath ?? "")
  )
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

function isInlineJavaScriptFunction(node) {
  const normalized = normalizeJavaScriptExpression(node)
  return normalized.ambiguous === false && javaScriptFunctionTypes.has(normalized.expression?.type)
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

function classifyJavaScriptSuiteCall(node, bindings) {
  const normalized = normalizeJavaScriptExpression(node)
  const expression = normalized.expression
  if (expression?.type !== "CallExpression") return "unknown"
  const memberPath = javaScriptMemberPath(expression.callee)
  if (["xcontext", "xdescribe", "xsuite"].includes(memberPath.segments[0])) {
    return "disabled"
  }

  const binding = bindings.get(memberPath.segments[0])
  const modifierStart =
    binding?.role === "playwright-test" && memberPath.segments[1] === "describe"
      ? 2
      : binding?.role === "node-suite"
        ? 1
        : null
  if (modifierStart === null) return "unknown"
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
    if (specifier.type === "ImportDefaultSpecifier") return "node-test"
    if (specifier.type !== "ImportSpecifier") return null
    const importedName = javaScriptImportedName(specifier)
    if (["it", "test"].includes(importedName)) return "node-test"
    if (["describe", "suite"].includes(importedName)) return "node-suite"
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

function attributableJavaScriptBindings(ast) {
  const authorizedImports = new Map()
  const declarationCounts = new Map()
  const writtenBindings = new Set()
  const declare = (name) => declarationCounts.set(name, (declarationCounts.get(name) ?? 0) + 1)
  const declarePattern = (pattern) => {
    const names = new Set()
    collectJavaScriptPatternBindings(pattern, names)
    for (const name of names) declare(name)
  }

  walkJavaScriptAst(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers ?? []) {
        const localName = specifier.local?.name
        if (typeof localName !== "string") continue
        declare(localName)
        const role = authorizedJavaScriptImportRole(node, specifier)
        if (role !== null) {
          const candidates = authorizedImports.get(localName) ?? []
          candidates.push({ role })
          authorizedImports.set(localName, candidates)
        }
      }
    } else if (node.type === "VariableDeclarator") {
      declarePattern(node.id)
    } else if (
      ["FunctionDeclaration", "FunctionExpression", "TSDeclareFunction"].includes(node.type)
    ) {
      declarePattern(node.id)
      for (const parameter of node.params ?? []) declarePattern(parameter)
    } else if (node.type === "ArrowFunctionExpression") {
      for (const parameter of node.params ?? []) declarePattern(parameter)
    } else if (["ClassDeclaration", "ClassExpression", "TSEnumDeclaration"].includes(node.type)) {
      declarePattern(node.id)
    } else if (node.type === "CatchClause") {
      declarePattern(node.param)
    } else if (node.type === "TSImportEqualsDeclaration") {
      declarePattern(node.id)
    } else if (
      ["ForInStatement", "ForOfStatement"].includes(node.type) &&
      node.left?.type !== "VariableDeclaration"
    ) {
      collectJavaScriptAssignedBindings(node.left, writtenBindings)
    } else if (node.type === "AssignmentExpression") {
      collectJavaScriptAssignedBindings(node.left, writtenBindings)
    } else if (node.type === "UpdateExpression") {
      collectJavaScriptAssignedBindings(node.argument, writtenBindings)
    } else if (node.type === "UnaryExpression" && node.operator === "delete") {
      collectJavaScriptAssignedBindings(node.argument, writtenBindings)
    }
  })

  const bindings = new Map()
  for (const [localName, candidates] of authorizedImports) {
    if (
      candidates.length === 1 &&
      declarationCounts.get(localName) === 1 &&
      !writtenBindings.has(localName)
    ) {
      bindings.set(localName, candidates[0])
    }
  }
  return bindings
}

function javaScriptProofCall(node, targetOffset, selector, textLength, bindings) {
  if (node?.type !== "CallExpression" || node.optional === true) return false
  const expression = node

  const memberPath = javaScriptMemberPath(expression.callee)
  const binding = bindings.get(memberPath.segments[0])
  if (memberPath.ambiguous || !javaScriptProofBindingRoles.has(binding?.role)) return false
  if (binding.role === "playwright-test" && memberPath.segments[1] === "describe") return false
  const modifiers = memberPath.segments.slice(1)
  const activeModifierChains = activeJavaScriptTestModifierChains.get(binding.role)
  if (
    modifiers.some((modifier) => nonExecutableTestModifiers.has(modifier)) ||
    !activeModifierChains?.has(javaScriptModifierChainKey(modifiers))
  ) {
    return false
  }
  if (binding.role === "node-test") {
    const args = expression.arguments ?? []
    if (args.length > 3 || args.some((argument) => argument?.type === "SpreadElement")) {
      return false
    }
    const options = args.length >= 2 && !isInlineJavaScriptFunction(args[1]) ? args[1] : null
    if (classifyNodeTestOptions(options) !== "active") return false
  }

  const title = expression.arguments?.[0]
  return javaScriptTitleContainsSelector(title, targetOffset, selector, textLength)
}

function javaScriptFunctionRegistration(functionIndex, ancestors, bindings) {
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
  const binding = bindings.get(memberPath.segments[0])
  const overload = javaScriptSuiteCallOverload(parent, binding)
  if (overload?.callback !== child) return "unknown"
  return classifyJavaScriptSuiteCall(parent, bindings)
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

function isAlwaysAbruptJavaScriptStatement(statement) {
  if (
    ["BreakStatement", "ContinueStatement", "ReturnStatement", "ThrowStatement"].includes(
      statement?.type
    )
  ) {
    return true
  }
  if (statement?.type === "LabeledStatement") {
    return isAlwaysAbruptJavaScriptStatement(statement.body)
  }
  if (statement?.type === "BlockStatement") {
    return (statement.body ?? []).some((child) => isAlwaysAbruptJavaScriptStatement(child))
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
      .some((statement) => isAlwaysAbruptJavaScriptStatement(statement))
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
      hasPriorAbruptJavaScriptCompletion(parent, child)
    ) {
      return true
    }
    child = parent
  }
  return false
}

function hasAttributableJavaScriptRegistration(node, ancestors, bindings) {
  if (hasConditionalJavaScriptRegistration(node, ancestors)) return false
  for (let index = 0; index < ancestors.length; index += 1) {
    if (!javaScriptFunctionTypes.has(ancestors[index]?.type)) continue
    if (javaScriptFunctionRegistration(index, ancestors, bindings) !== "active") return false
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
  try {
    bindings = attributableJavaScriptBindings(ast)
    walkJavaScriptAst(ast, (node, ancestors) => {
      if (javaScriptProofCall(node, targetOffset, selector, text.length, bindings)) {
        matches.push({ ancestors, node })
      }
    })
  } catch {
    return false
  }
  return (
    matches.length === 1 &&
    hasAttributableJavaScriptRegistration(matches[0].node, matches[0].ancestors, bindings)
  )
}

function hasExecutableProofAnchor(root, proof) {
  const text = fs.readFileSync(path.resolve(root, proof.path), "utf8")
  const lines = text.split(/\r?\n/)
  const lineIndex = lines.findIndex((line) => line.includes(proof.selector))
  if (lineIndex === -1) return false
  const line = lines[lineIndex].trim()

  if (/(?:IT|Test)\.java$/.test(proof.path)) {
    const escapedSelector = proof.selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const annotationContext = lines.slice(Math.max(0, lineIndex - 5), lineIndex + 1).join("\n")
    return (
      /@(Test|ParameterizedTest|RepeatedTest|TestFactory)\b/.test(annotationContext) &&
      new RegExp(`\\bvoid\\s+${escapedSelector}\\s*\\(`).test(line)
    )
  }
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(proof.path)) {
    return hasExecutableJavaScriptProofAnchor(text, proof.selector, proof.path)
  }
  if (proof.path.startsWith("scripts/test/") && proof.path.endsWith(".sh")) {
    return /\b(?:raise|assert|fail|exit|SystemExit)\b/.test(line)
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
          if (!isExecutableProofPath(proof.path)) {
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
