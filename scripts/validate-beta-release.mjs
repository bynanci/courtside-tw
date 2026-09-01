/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

export const T086_SCHEMA = "courtside-t086-beta-release/v1"
export const T086_DISPATCH_SCHEMA = "courtside-t086-dispatch/v1"
export const T086_OWNER_AUTHORIZATION_SCHEMA = "courtside-t086-owner-authorization/v1"
export const T086_AUTHORIZED_BASE_SHA = "92773201398306b89cca7fc0b7852cb06dd4d4c7"
export const FROZEN_T085_TRACEABILITY_SHA256 =
  "204662214eada892332d1ddbeab8d0b8037cfc5477d9152d6fb3a61e56832b79"
export const T086_AUTHORIZATION_REF =
  "https://github.com/bynanci/courtside-tw/issues/160#issuecomment-5488168546"
export const T086_AUTHORIZATION_CREATED_AT = "2026-09-01T02:50:47Z"
export const T086_DISPATCH_PATH = ".loop/evidence/t086-dispatch.json"
export const T086_CHECKLIST_PATH = "docs/release/beta-checklist.md"
export const T086_WORKFLOW_PATH = ".github/workflows/release.yml"
export const T086_TRACEABILITY_PATH = "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
export const T086_TASKS_PATH = "specs/001-taiwan-basketball-magazine-ebook/tasks.md"

export const REQUIRED_RELEASE_SURFACES = Object.freeze([
  "public-read",
  "two-role-publish",
  "retry",
  "revision",
  "withdrawal",
  "backup-restore",
  "rollback"
])

export const STABILITY_RELEASE_SURFACES = Object.freeze([
  "public-read",
  "two-role-publish",
  "retry",
  "revision",
  "withdrawal"
])

export const T086_AUTHORIZED_CHANGED_PATHS = Object.freeze([
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".loop/evidence/t086-dispatch.json",
  ".loop/evidence/t086-local.json",
  ".loop/evidence/t086-red.json",
  ".loop/t086-beta-release-graph.yaml",
  "Makefile",
  "docs/release/beta-checklist.md",
  "package.json",
  "scripts/test/validate-beta-release.test.mjs",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-beta-release.mjs",
  "scripts/validate-traceability.mjs"
])

export const EXPECTED_OWNER_AUTHORIZATION = Object.freeze({
  schema_version: T086_OWNER_AUTHORIZATION_SCHEMA,
  decision: "DISPATCH_ACCEPTED",
  accepted_by: "bynanci",
  repository: "bynanci/courtside-tw",
  task: "T086",
  issue: "https://github.com/bynanci/courtside-tw/issues/160",
  branch: "agent/t086-beta-release-gate",
  authorization_base: {
    branch: "main",
    sha: T086_AUTHORIZED_BASE_SHA,
    protected: true
  },
  frozen_t085_traceability_sha256: FROZEN_T085_TRACEABILITY_SHA256,
  authorized_paths: [
    ".github/workflows/release.yml",
    "docs/release/beta-checklist.md",
    "scripts/validate-beta-release.mjs",
    "scripts/test/validate-beta-release.test.mjs",
    "scripts/validate-traceability.mjs",
    "scripts/test/validate-traceability.test.mjs",
    ".github/workflows/ci.yml",
    "package.json",
    "Makefile",
    ".loop/evidence/t086-*",
    ".loop/t086-*"
  ],
  authorized_actions: [
    "create dedicated branch and draft pull request",
    "write and test only authorized paths",
    "run non-deploying read-only CI security and release validation",
    "append exact-SHA evidence and graph deltas"
  ],
  completion_requires: [
    "seven release surfaces PASS with truthful evidence",
    "20 consecutive clean runs bound to one candidate SHA",
    "all T086 blocking deviations resolved or explicitly adjudicated",
    "owner read-back before beta removal or merge"
  ],
  forbidden_without_separate_authorization: [
    "participant research execution or synthetic human evidence",
    "Web3 activation",
    "production or provider mutation",
    "deployment",
    "credential or secret access or mutation",
    "external product writes",
    "T087 or later work",
    "T085 frozen evidence rewrite",
    "T086 checkbox change",
    "beta flag removal",
    "merge while any required gate is HOLD FAIL or UNKNOWN"
  ],
  scope_boundaries: {
    participant_research_executed: false,
    web3_activated: false,
    production_activated: false,
    provider_configured: false,
    credentials_or_secrets_accessed_or_changed: false,
    external_product_writes: false,
    t087_or_later_dispatched: false,
    t086_task_state_changed: false,
    beta_flag_removed: false
  }
})

export const EXPECTED_CHECKLIST_CONTRACT = Object.freeze({
  schema_version: "courtside-t086-beta-checklist/v1",
  task: "T086",
  repository: "bynanci/courtside-tw",
  authorization_ref: T086_AUTHORIZATION_REF,
  authorized_base_sha: T086_AUTHORIZED_BASE_SHA,
  frozen_t085_traceability_sha256: FROZEN_T085_TRACEABILITY_SHA256,
  required_surfaces: [...REQUIRED_RELEASE_SURFACES],
  surface_policy: {
    exact_candidate_sha: true,
    attributable_receipt: true,
    any_fail_unknown_or_missing_is_hold: true
  },
  stability_gate: {
    required_consecutive_runs: 20,
    ordered_runs: "1..20",
    same_candidate_sha: true,
    any_failure_resets_sequence: true,
    surfaces: [...STABILITY_RELEASE_SURFACES]
  },
  protected_transitions: {
    merge_requires_release_pass: true,
    task_checkbox_requires_release_pass: true,
    beta_flag_removal_requires_release_pass: true,
    owner_readback_required: true
  },
  scope_boundaries: {
    participant_research_executed: false,
    web3_activated: false,
    production_activated: false,
    provider_configured: false,
    credentials_or_secrets_accessed_or_changed: false,
    external_product_writes: false,
    t087_or_later_dispatched: false,
    t086_task_state_changed: false,
    beta_flag_removed: false
  }
})

const EXPECTED_DISPATCH = Object.freeze({
  schema_version: T086_DISPATCH_SCHEMA,
  recorded_at: T086_AUTHORIZATION_CREATED_AT,
  repository: "bynanci/courtside-tw",
  task: "T086",
  issue: "https://github.com/bynanci/courtside-tw/issues/160",
  authorization_ref: T086_AUTHORIZATION_REF,
  branch: "agent/t086-beta-release-gate",
  base: { branch: "main", sha: T086_AUTHORIZED_BASE_SHA, protected: true },
  frozen_t085_traceability_sha256: FROZEN_T085_TRACEABILITY_SHA256,
  owner: { login: "bynanci", author_association: "OWNER" },
  task_state_at_dispatch: { t085: "COMPLETE", t086: "OPEN" },
  scope_boundaries: {
    participant_research_executed: false,
    web3_activated: false,
    production_activated: false,
    provider_configured: false,
    credentials_or_secrets_accessed_or_changed: false,
    external_product_writes: false,
    t087_or_later_dispatched: false,
    t086_task_state_changed: false,
    beta_flag_removed: false
  }
})

const authorizationStart = "<!-- t086:owner-authorization:start -->"
const authorizationEnd = "<!-- t086:owner-authorization:end -->"
const checklistStart = "<!-- t086:checklist-contract:start -->"
const checklistEnd = "<!-- t086:checklist-contract:end -->"

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function readText(root, relativePath, errors, label) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8")
  } catch {
    errors.push("missing " + label + ": " + relativePath)
    return null
  }
}

function parseJsonFile(root, relativePath, errors, label) {
  const text = readText(root, relativePath, errors, label)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    errors.push("invalid " + label + ": " + error.message)
    return null
  }
}

function embeddedJson(text, start, end, errors, label) {
  if (typeof text !== "string") return null
  const firstStart = text.indexOf(start)
  const firstEnd = text.indexOf(end)
  if (
    firstStart === -1 ||
    firstEnd === -1 ||
    firstEnd <= firstStart ||
    text.indexOf(start, firstStart + start.length) !== -1 ||
    text.indexOf(end, firstEnd + end.length) !== -1
  ) {
    errors.push(label + " must contain exactly one bounded JSON contract")
    return null
  }
  const bounded = text.slice(firstStart + start.length, firstEnd).trim()
  const match = bounded.match(/^```json\s*\n([\s\S]*?)\n```$/u)
  if (match === null) {
    errors.push(label + " must wrap its contract in one json code fence")
    return null
  }
  try {
    return JSON.parse(match[1])
  } catch (error) {
    errors.push("invalid " + label + " JSON: " + error.message)
    return null
  }
}

function traceabilityContract(text, errors) {
  return embeddedJson(
    text,
    "<!-- t085:contract:start -->",
    "<!-- t085:contract:end -->",
    errors,
    "frozen T085 traceability contract"
  )
}

export function isT086AuthorizedPath(relativePath) {
  return (
    T086_AUTHORIZED_CHANGED_PATHS.includes(relativePath) ||
    relativePath.startsWith(".loop/evidence/t086-") ||
    relativePath.startsWith(".loop/t086-")
  )
}

function validateOwnerAuthorization(readback, errors, required) {
  if (readback === null || readback === undefined) {
    if (required) errors.push("owner authorization read-back is required")
    return { status: required ? "UNAVAILABLE" : "NOT_REQUESTED" }
  }
  if (readback.status !== "VERIFIED") {
    errors.push("owner authorization read-back is not VERIFIED")
  }
  if (
    readback.html_url !== T086_AUTHORIZATION_REF ||
    readback.issue_url !== "https://api.github.com/repos/bynanci/courtside-tw/issues/160"
  ) {
    errors.push("owner authorization source is not the pinned issue 160 comment")
  }
  if (readback.user_login !== "bynanci" || readback.author_association !== "OWNER") {
    errors.push("owner authorization must be authored by repository OWNER bynanci")
  }
  if (
    readback.created_at !== T086_AUTHORIZATION_CREATED_AT ||
    readback.updated_at !== T086_AUTHORIZATION_CREATED_AT
  ) {
    errors.push("owner authorization must be the pinned unedited comment")
  }
  const contractErrors = []
  const contract = embeddedJson(
    readback.body,
    authorizationStart,
    authorizationEnd,
    contractErrors,
    "owner authorization"
  )
  const contractValid =
    contractErrors.length === 0 && isDeepStrictEqual(contract, EXPECTED_OWNER_AUTHORIZATION)
  if (!contractValid)
    errors.push("owner authorization contract does not match the bounded dispatch")
  return {
    status:
      readback.status === "VERIFIED" &&
      readback.user_login === "bynanci" &&
      readback.author_association === "OWNER" &&
      readback.created_at === T086_AUTHORIZATION_CREATED_AT &&
      readback.updated_at === T086_AUTHORIZATION_CREATED_AT &&
      contractValid
        ? "VERIFIED"
        : "INVALID",
    html_url: readback.html_url ?? null,
    user_login: readback.user_login ?? null,
    author_association: readback.author_association ?? null,
    created_at: readback.created_at ?? null,
    updated_at: readback.updated_at ?? null,
    body_sha256: typeof readback.body === "string" ? sha256(readback.body) : null
  }
}

function taskState(tasksText, taskId) {
  const match = tasksText?.match(new RegExp("^- \\[([ xX])\\] " + taskId + "\\b", "mu"))
  return match ? (match[1].toLowerCase() === "x" ? "COMPLETE" : "OPEN") : null
}

function validateDispatchAndFrozenState(root, errors) {
  const dispatch = parseJsonFile(root, T086_DISPATCH_PATH, errors, "T086 dispatch receipt")
  if (dispatch !== null && !isDeepStrictEqual(dispatch, EXPECTED_DISPATCH)) {
    errors.push(
      dispatch?.base?.sha !== T086_AUTHORIZED_BASE_SHA
        ? "T086 dispatch base must equal the owner-authorized protected base"
        : "T086 dispatch receipt must match the immutable owner dispatch"
    )
  }
  const traceabilityText = readText(
    root,
    T086_TRACEABILITY_PATH,
    errors,
    "frozen T085 traceability"
  )
  const traceabilitySha = traceabilityText === null ? null : sha256(traceabilityText)
  if (traceabilitySha !== FROZEN_T085_TRACEABILITY_SHA256) {
    errors.push("frozen T085 traceability SHA-256 drifted")
  }
  const tasksText = readText(root, T086_TASKS_PATH, errors, "task ledger")
  const t085 = taskState(tasksText, "T085")
  const t086 = taskState(tasksText, "T086")
  if (t085 !== "COMPLETE") errors.push("T085 must remain complete")
  if (t086 !== "OPEN") errors.push("T086 must remain open until a separate completion receipt")
  return { dispatch, traceabilityText, traceabilitySha, t085, t086 }
}

export function validateT086DispatchScope({
  root,
  changeBaseSha,
  changedPaths,
  ownerAuthorizationReadback = null,
  requireOwnerReadback = true
}) {
  const errors = []
  if (changeBaseSha !== T086_AUTHORIZED_BASE_SHA) {
    errors.push("T086 audited change base must equal " + T086_AUTHORIZED_BASE_SHA)
  }
  const unauthorizedPaths = Array.isArray(changedPaths)
    ? changedPaths.filter((relativePath) => !isT086AuthorizedPath(relativePath))
    : []
  if (!Array.isArray(changedPaths)) errors.push("T086 changed paths require an audited Git diff")
  for (const relativePath of unauthorizedPaths) {
    errors.push("changed path is outside the owner-authorized T086 scope: " + relativePath)
  }
  const frozen = validateDispatchAndFrozenState(root, errors)
  const authorization = validateOwnerAuthorization(
    ownerAuthorizationReadback,
    errors,
    requireOwnerReadback
  )
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    errors,
    authorization,
    dispatch: frozen.dispatch,
    frozen_t085_traceability_sha256: frozen.traceabilitySha,
    task_state: { t085: frozen.t085, t086: frozen.t086 },
    unauthorized_paths: unauthorizedPaths
  }
}

function validateChecklist(root, errors) {
  const text = readText(root, T086_CHECKLIST_PATH, errors, "T086 beta checklist")
  const contract = embeddedJson(text, checklistStart, checklistEnd, errors, "T086 beta checklist")
  if (contract !== null && !isDeepStrictEqual(contract, EXPECTED_CHECKLIST_CONTRACT)) {
    if (!isDeepStrictEqual(contract?.required_surfaces, REQUIRED_RELEASE_SURFACES)) {
      errors.push("T086 checklist must preserve all seven required release surfaces")
    } else {
      errors.push("T086 checklist contract does not match the fail-closed release policy")
    }
  }
}

function validateWorkflow(root, errors) {
  const text = readText(root, T086_WORKFLOW_PATH, errors, "T086 release workflow")
  if (text === null) return
  const permissionBlock = text.match(/^permissions:\s*\n((?: {2}[^\n]+\n?)+)/mu)?.[1] ?? ""
  for (const permission of ["actions: read", "contents: read", "issues: read"]) {
    if (!permissionBlock.includes(permission)) {
      errors.push(
        "T086 release workflow must declare read-only permissions including " + permission
      )
    }
  }
  if (/^\s+[A-Za-z-]+:\s*write\s*$/mu.test(permissionBlock)) {
    errors.push("T086 release workflow must use read-only permissions")
  }
  if (
    !text.includes("pull_request:") ||
    !text.includes("workflow_dispatch:") ||
    /^\s*push:\s*$/mu.test(text)
  ) {
    errors.push("T086 release workflow must be PR/manual only")
  }
  if (!text.includes("cancel-in-progress: false")) {
    errors.push("T086 release workflow must not cancel a consecutive stability sequence")
  }
  if (
    !text.includes("github.event.pull_request.head.sha || github.sha") ||
    !text.includes("EXPECTED_SOURCE_HEAD:") ||
    !text.includes("bash scripts/ci/verify-source-head.sh") ||
    !text.includes("persist-credentials: false")
  ) {
    errors.push("T086 release workflow must bind checkout and proofs to the exact candidate head")
  }
  if (
    /[$][{][{]\s*secrets\./u.test(text) ||
    /^\s*environment\s*:/mu.test(text) ||
    /\b(?:kubectl|helm|pulumi)\b/u.test(text) ||
    /\bterraform\s+(?:apply|destroy)\b/u.test(text) ||
    /\bdocker\s+(?:login|push)\b/u.test(text) ||
    /\b(?:aws|gcloud|az)\s+/u.test(text) ||
    /\b(?:vercel|netlify)\s+(?:deploy|--prod)\b/u.test(text)
  ) {
    errors.push("T086 release workflow cannot access credentials, secrets or deployment surfaces")
  }
  for (const surface of REQUIRED_RELEASE_SURFACES) {
    if (!text.includes("# t086-surface:" + surface)) {
      errors.push("T086 release workflow is missing surface marker " + surface)
    }
  }
  if (
    !text.includes("for run in $(seq 1 20)") ||
    !text.includes("--mode record-run") ||
    !text.includes("--mode aggregate")
  ) {
    errors.push("T086 release workflow must implement an ordered 20-run receipt gate")
  }
  if (
    !text.includes("surface_result=PASS") ||
    !text.includes("stability_result=PASS") ||
    !text.includes('--surface-result "$surface_result"') ||
    !text.includes('--stability-result "$stability_result"')
  ) {
    errors.push("T086 release workflow must map successful prerequisite jobs to PASS")
  }
}

function blockingDeviations(traceabilityText, errors) {
  const contract = traceabilityContract(traceabilityText, errors)
  const rows = Array.isArray(contract?.deviations) ? contract.deviations : []
  return rows
    .filter(
      (row) => row?.state === "OPEN" && row?.release_impact === "BLOCKS_T086_UNLESS_ADJUDICATED"
    )
    .map((row) => ({
      id: row.id,
      severity: row.severity ?? null,
      kind: row.kind ?? null,
      requirement_ids: row.requirement_ids ?? [],
      disposition: row.disposition ?? null
    }))
}

export function validateStabilityReceipts(receipts, { candidateSha }) {
  const errors = []
  const rows = Array.isArray(receipts) ? receipts : []
  if (!/^[0-9a-f]{40}$/u.test(candidateSha ?? "")) {
    errors.push("candidate SHA must be a full lowercase commit SHA")
  }
  if (rows.length !== 20) errors.push("stability gate requires exactly 20 receipts")
  if (
    !isDeepStrictEqual(
      rows.map((row) => row?.run),
      Array.from({ length: 20 }, (_, i) => i + 1)
    )
  ) {
    errors.push("stability receipts must be ordered 1 through 20")
  }
  if (rows.some((row) => row?.candidate_sha !== candidateSha)) {
    errors.push("all stability receipts must bind the same candidate SHA")
  }
  if (rows.some((row) => row?.result !== "PASS")) errors.push("all 20 runs must PASS")
  rows.forEach((row, index) => {
    if (
      row?.schema_version !== "courtside-t086-stability-run/v1" ||
      row?.task !== "T086" ||
      !isDeepStrictEqual(row?.surfaces, STABILITY_RELEASE_SURFACES)
    ) {
      errors.push("stability receipt " + (index + 1) + " does not match the bounded schema")
    }
  })
  return {
    schema_version: "courtside-t086-stability-report/v1",
    status: errors.length === 0 ? "PASS" : "FAIL",
    candidate_sha: candidateSha,
    required_consecutive_runs: 20,
    consecutive_clean_runs:
      errors.length === 0 ? 20 : rows.filter((row) => row?.result === "PASS").length,
    surfaces: [...STABILITY_RELEASE_SURFACES],
    errors
  }
}

export function validateBetaRelease({
  root,
  currentHead,
  changeBaseSha,
  changedPaths,
  ownerAuthorizationReadback = null,
  requireOwnerReadback = true,
  surfaceResult = "NOT_RUN",
  stabilityResult = "NOT_RUN"
}) {
  const errors = []
  if (!/^[0-9a-f]{40}$/u.test(currentHead ?? "")) {
    errors.push("current head must be a full lowercase commit SHA")
  }
  const scope = validateT086DispatchScope({
    root,
    changeBaseSha,
    changedPaths,
    ownerAuthorizationReadback,
    requireOwnerReadback
  })
  errors.push(...scope.errors)
  validateChecklist(root, errors)
  validateWorkflow(root, errors)
  const blockers = blockingDeviations(
    readText(root, T086_TRACEABILITY_PATH, errors, "frozen T085 traceability"),
    errors
  )
  const reasons = []
  if (blockers.length > 0) {
    reasons.push(blockers.length + " traceability deviations require separate adjudication")
  }
  if (surfaceResult !== "PASS") reasons.push("seven-surface preflight is " + surfaceResult)
  if (stabilityResult !== "PASS") reasons.push("20-run stability gate is " + stabilityResult)
  if (errors.length > 0) reasons.push("release control-plane validation failed")
  return {
    schema_version: T086_SCHEMA,
    task: "T086",
    status: errors.length === 0 ? "PASS" : "FAIL",
    release_decision: reasons.length === 0 ? "PASS" : "HOLD",
    release_decision_reasons: reasons,
    candidate_sha: currentHead,
    base: { branch: "main", sha: changeBaseSha, authorized_sha: T086_AUTHORIZED_BASE_SHA },
    authorization: scope.authorization,
    frozen_t085_traceability: {
      path: T086_TRACEABILITY_PATH,
      sha256: scope.frozen_t085_traceability_sha256,
      expected_sha256: FROZEN_T085_TRACEABILITY_SHA256
    },
    task_state: scope.task_state,
    scope: {
      authorized_paths: [...T086_AUTHORIZED_CHANGED_PATHS],
      changed_paths: changedPaths,
      unauthorized_paths: scope.unauthorized_paths
    },
    scope_boundaries: scope.dispatch?.scope_boundaries ?? null,
    surfaces: { required: [...REQUIRED_RELEASE_SURFACES], result: surfaceResult },
    stability: { required_consecutive_runs: 20, same_candidate_sha: true, result: stabilityResult },
    blockers: { traceability: blockers, count: blockers.length },
    protected_transitions: {
      merge: reasons.length === 0 ? "ELIGIBLE_FOR_OWNER_READBACK" : "BLOCKED",
      task_checkbox: reasons.length === 0 ? "ELIGIBLE_FOR_OWNER_READBACK" : "BLOCKED",
      beta_flag_removal: reasons.length === 0 ? "ELIGIBLE_FOR_OWNER_READBACK" : "BLOCKED"
    },
    errors
  }
}

const githubCommentFetchScript = [
  "const url = process.argv[1]",
  "const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'courtside-t086-release-validator', 'X-GitHub-Api-Version': '2022-11-28' }",
  "const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) })",
  "if (!response.ok) throw new Error('GitHub owner authorization returned HTTP ' + response.status)",
  "const body = await response.text()",
  "if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('GitHub owner authorization exceeded 1 MiB')",
  "process.stdout.write(body)"
].join("\n")

export function inspectT086OwnerAuthorization() {
  const apiUrl = "https://api.github.com/repos/bynanci/courtside-tw/issues/comments/5488168546"
  try {
    const raw = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", githubCommentFetchScript, apiUrl],
      {
        encoding: "utf8",
        env: {},
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000
      }
    )
    const comment = JSON.parse(raw)
    return {
      status: "VERIFIED",
      source: "github-api",
      html_url: comment?.html_url ?? null,
      issue_url: comment?.issue_url ?? null,
      user_login: comment?.user?.login ?? null,
      author_association: comment?.author_association ?? null,
      created_at: comment?.created_at ?? null,
      updated_at: comment?.updated_at ?? null,
      body: comment?.body ?? null,
      errors: []
    }
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      source: "github-api",
      html_url: T086_AUTHORIZATION_REF,
      errors: ["GitHub owner authorization read-back failed: " + error.message]
    }
  }
}

function gitInspection(root, environment) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  const refs = environment.GITHUB_BASE_REF
    ? ["refs/remotes/origin/" + environment.GITHUB_BASE_REF]
    : ["refs/remotes/origin/main", "refs/heads/main"]
  let changeBaseSha = null
  for (const ref of refs) {
    try {
      changeBaseSha = execFileSync("git", ["rev-parse", "--verify", ref + "^{commit}"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim()
      break
    } catch {
      // Try the next trusted main ref.
    }
  }
  const changedPaths =
    changeBaseSha === null
      ? null
      : execFileSync("git", ["diff", "--no-renames", "--name-only", changeBaseSha, head], {
          cwd: root,
          encoding: "utf8"
        })
          .trim()
          .split("\n")
          .filter(Boolean)
          .sort()
  return { head, changeBaseSha, changedPaths }
}

function argumentValue(argumentsList, name) {
  const index = argumentsList.indexOf(name)
  return index === -1 ? null : (argumentsList[index + 1] ?? null)
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(value, null, 2) + "\n")
}

function recordRun(argumentsList, root) {
  const run = Number(argumentValue(argumentsList, "--run"))
  const candidateSha = argumentValue(argumentsList, "--candidate-sha")
  const output = argumentValue(argumentsList, "--output")
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  if (!Number.isInteger(run) || run < 1 || run > 20) throw new Error("--run must be 1 through 20")
  if (candidateSha !== head) throw new Error("candidate SHA does not equal checked-out HEAD")
  if (output === null) throw new Error("--output is required")
  writeJson(path.resolve(root, output), {
    schema_version: "courtside-t086-stability-run/v1",
    task: "T086",
    run,
    candidate_sha: candidateSha,
    result: "PASS",
    surfaces: [...STABILITY_RELEASE_SURFACES]
  })
  console.log("T086 stability run " + run + ": PASS (" + candidateSha + ")")
}

function aggregateRuns(argumentsList, root) {
  const candidateSha = argumentValue(argumentsList, "--candidate-sha")
  const runsDirectory = argumentValue(argumentsList, "--runs-dir")
  const output = argumentValue(argumentsList, "--output")
  if (runsDirectory === null || output === null)
    throw new Error("--runs-dir and --output are required")
  const receipts = fs
    .readdirSync(path.resolve(root, runsDirectory))
    .filter((entry) => /^run-\d{2}\.json$/u.test(entry))
    .sort()
    .map((entry) => JSON.parse(fs.readFileSync(path.resolve(root, runsDirectory, entry), "utf8")))
  const report = validateStabilityReceipts(receipts, { candidateSha })
  writeJson(path.resolve(root, output), report)
  if (report.status !== "PASS") {
    report.errors.forEach((error) => console.error("- " + error))
    process.exitCode = 1
  } else {
    console.log("T086 stability: PASS (20/20 consecutive runs at " + candidateSha + ")")
  }
}

export function runCli(
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  { argumentsList = process.argv.slice(2), environment = process.env } = {}
) {
  const mode = argumentValue(argumentsList, "--mode") ?? "control"
  if (mode === "record-run") return recordRun(argumentsList, root)
  if (mode === "aggregate") return aggregateRuns(argumentsList, root)
  const inspection = gitInspection(root, environment)
  const report = validateBetaRelease({
    root,
    currentHead: inspection.head,
    changeBaseSha: inspection.changeBaseSha,
    changedPaths: inspection.changedPaths,
    ownerAuthorizationReadback: inspectT086OwnerAuthorization(),
    surfaceResult: argumentValue(argumentsList, "--surface-result") ?? "NOT_RUN",
    stabilityResult: argumentValue(argumentsList, "--stability-result") ?? "NOT_RUN"
  })
  const output = argumentValue(argumentsList, "--output") ?? "artifacts/t086/control-plane.json"
  writeJson(path.resolve(root, output), report)
  if (report.status !== "PASS") {
    console.error("T086 release control plane: FAIL")
    report.errors.forEach((error) => console.error("- " + error))
    process.exitCode = 1
  } else {
    console.log(
      "T086 release control plane: PASS; release decision " +
        report.release_decision +
        " (" +
        report.blockers.count +
        " traceability blockers)"
    )
  }
  if (argumentsList.includes("--require-release-pass") && report.release_decision !== "PASS") {
    report.release_decision_reasons.forEach((reason) => console.error("- " + reason))
    process.exitCode = 1
  }
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
