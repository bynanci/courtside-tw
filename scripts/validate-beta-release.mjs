/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import YAML from "yaml"

export const T086_SCHEMA = "courtside-t086-beta-release/v1"
export const T086_DISPATCH_SCHEMA = "courtside-t086-dispatch/v1"
export const T086_OWNER_AUTHORIZATION_SCHEMA = "courtside-t086-owner-authorization/v1"
export const T086_OWNER_ADJUDICATION_SCHEMA = "courtside-t086-owner-adjudication/v1"
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
  adjudication_gate: {
    source: "unedited-github-owner-comment",
    issue: "https://github.com/bynanci/courtside-tw/issues/160",
    exact_candidate_sha: true,
    frozen_source_unchanged: true,
    exact_blocker_set_required: true,
    allowed_outcomes: ["RESOLVED_BY_EVIDENCE", "RISK_ACCEPTED_FOR_BETA"],
    any_missing_invalid_or_unavailable_is_hold: true
  },
  decision_scope: "T086_GATE_ONLY",
  repo_wide_checks: {
    ci_required: true,
    security_required: true,
    not_claimed_by_gate_pass: true
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
const adjudicationStart = "<!-- t086:owner-adjudication:start -->"
const adjudicationEnd = "<!-- t086:owner-adjudication:end -->"
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
  if (dispatch === null || typeof dispatch !== "object" || Array.isArray(dispatch)) {
    errors.push("T086 dispatch receipt must match the immutable owner dispatch")
  } else if (!isDeepStrictEqual(dispatch, EXPECTED_DISPATCH)) {
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
  let workflow = null
  try {
    workflow = YAML.parse(text)
  } catch (error) {
    errors.push("T086 release workflow must be valid YAML: " + error.message)
  }
  const permissionBlocks = []
  const visitPermissionBlocks = (value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return
    if (Object.hasOwn(value, "permissions")) permissionBlocks.push(value.permissions)
    Object.values(value).forEach(visitPermissionBlocks)
  }
  visitPermissionBlocks(workflow)
  const readOnlyPermissions = (permissions) => {
    if (permissions === "read-all") return true
    if (permissions === "write-all" || permissions === "write") return false
    return (
      permissions !== null &&
      typeof permissions === "object" &&
      !Array.isArray(permissions) &&
      Object.values(permissions).every((value) => value === "read" || value === "none")
    )
  }
  if (permissionBlocks.some((permissions) => !readOnlyPermissions(permissions))) {
    errors.push("T086 release workflow must use read-only permissions")
  }
  const surfacePreflightSteps = workflow?.jobs?.["surface-preflight"]?.steps
  const dependencyStep = Array.isArray(surfacePreflightSteps)
    ? surfacePreflightSteps.find((step) => step?.name === "Start isolated repository dependencies")
    : null
  if (
    typeof dependencyStep?.run !== "string" ||
    !/^\s*set -o pipefail\s*$/mu.test(dependencyStep.run)
  ) {
    errors.push("T086 dependency startup pipeline must enable pipefail")
  }
  const decisionSteps = workflow?.jobs?.decision?.steps
  const decisionInstallsDependencies =
    Array.isArray(decisionSteps) &&
    decisionSteps.some(
      (step) =>
        step?.name === "Set up pnpm and Node.js" &&
        step?.with?.runtime === "node@${{ env.NODE_VERSION }}"
    ) &&
    decisionSteps.some(
      (step) =>
        step?.name === "Install JavaScript dependencies" &&
        typeof step?.run === "string" &&
        step.run.includes("pnpm install --frozen-lockfile --ignore-scripts")
    )
  if (!decisionInstallsDependencies) {
    errors.push("T086 decision job must install JavaScript dependencies before running validator")
  }
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
      type: row.type ?? null,
      affected_ids: Array.isArray(row.affected_ids) ? row.affected_ids : [],
      expected: row.expected ?? null,
      observed: row.observed ?? null,
      disposition: row.disposition ?? null
    }))
}

const adjudicationContractKeys = Object.freeze([
  "accepted_by",
  "adjudications",
  "candidate_sha",
  "decision",
  "frozen_t085_traceability_sha256",
  "issue",
  "protected_base_sha",
  "repository",
  "schema_version",
  "scope_boundaries",
  "task"
])

const adjudicationEntryKeys = Object.freeze([
  "affected_ids",
  "evidence_refs",
  "follow_up_issue",
  "id",
  "outcome",
  "rationale",
  "severity",
  "type"
])

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...expectedKeys].sort())
  )
}

function isRepositoryEvidenceRef(value) {
  return (
    typeof value === "string" &&
    /^https:\/\/github[.]com\/bynanci\/courtside-tw\/(?:actions\/runs|issues|pull|commit)\//u.test(
      value
    )
  )
}

function validateOwnerAdjudication(readback, blockers, currentHead, errors) {
  if (readback === null || readback === undefined || readback.status === "NOT_FOUND") {
    return {
      status: "NOT_FOUND",
      html_url: null,
      body_sha256: null,
      adjudicated: [],
      unadjudicated: blockers
    }
  }

  const adjudicationErrors = []
  if (readback.status !== "VERIFIED") {
    adjudicationErrors.push("owner adjudication read-back is not VERIFIED")
  }
  if (
    readback.issue_url !== "https://api.github.com/repos/bynanci/courtside-tw/issues/160" ||
    !/^https:\/\/github[.]com\/bynanci\/courtside-tw\/issues\/160#issuecomment-\d+$/u.test(
      readback.html_url ?? ""
    )
  ) {
    adjudicationErrors.push("owner adjudication source is not an issue 160 comment")
  }
  if (readback.user_login !== "bynanci" || readback.author_association !== "OWNER") {
    adjudicationErrors.push("owner adjudication must be authored by repository OWNER bynanci")
  }
  if (
    typeof readback.created_at !== "string" ||
    readback.created_at.length === 0 ||
    readback.updated_at !== readback.created_at
  ) {
    adjudicationErrors.push("owner adjudication must be an unedited GitHub comment")
  }

  const contract = embeddedJson(
    readback.body,
    adjudicationStart,
    adjudicationEnd,
    adjudicationErrors,
    "owner adjudication"
  )
  if (!hasExactKeys(contract, adjudicationContractKeys)) {
    adjudicationErrors.push("owner adjudication contract has unexpected or missing fields")
  }
  if (
    contract?.schema_version !== T086_OWNER_ADJUDICATION_SCHEMA ||
    contract?.decision !== "ADJUDICATION_ACCEPTED" ||
    contract?.accepted_by !== "bynanci" ||
    contract?.repository !== "bynanci/courtside-tw" ||
    contract?.issue !== "https://github.com/bynanci/courtside-tw/issues/160" ||
    contract?.task !== "T086" ||
    contract?.candidate_sha !== currentHead ||
    contract?.protected_base_sha !== T086_AUTHORIZED_BASE_SHA ||
    contract?.frozen_t085_traceability_sha256 !== FROZEN_T085_TRACEABILITY_SHA256 ||
    !isDeepStrictEqual(contract?.scope_boundaries, EXPECTED_OWNER_AUTHORIZATION.scope_boundaries)
  ) {
    adjudicationErrors.push(
      "owner adjudication must bind the exact candidate, base, frozen hash and scope boundaries"
    )
  }

  const entries = Array.isArray(contract?.adjudications) ? contract.adjudications : []
  if (
    entries.length !== blockers.length ||
    !isDeepStrictEqual(
      entries.map((entry) => entry?.id),
      blockers.map((blocker) => blocker.id)
    )
  ) {
    adjudicationErrors.push("owner adjudication must cover the exact blocker set in frozen order")
  }

  entries.forEach((entry, index) => {
    const blocker = blockers[index]
    if (!hasExactKeys(entry, adjudicationEntryKeys)) {
      adjudicationErrors.push("owner adjudication entry " + (index + 1) + " has invalid fields")
      return
    }
    if (
      blocker === undefined ||
      entry.id !== blocker.id ||
      entry.severity !== blocker.severity ||
      entry.type !== blocker.type ||
      !isDeepStrictEqual(entry.affected_ids, blocker.affected_ids)
    ) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " does not match the frozen blocker"
      )
    }
    if (!["RESOLVED_BY_EVIDENCE", "RISK_ACCEPTED_FOR_BETA"].includes(entry.outcome)) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " has an unsupported outcome"
      )
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 24) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " requires a specific rationale"
      )
    }
    if (
      !Array.isArray(entry.evidence_refs) ||
      entry.evidence_refs.some((reference) => !isRepositoryEvidenceRef(reference))
    ) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " has invalid evidence refs"
      )
    }
    if (entry.outcome === "RESOLVED_BY_EVIDENCE" && entry.evidence_refs.length === 0) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " requires resolution evidence"
      )
    }
    if (
      entry.outcome === "RISK_ACCEPTED_FOR_BETA" &&
      !/^https:\/\/github[.]com\/bynanci\/courtside-tw\/issues\/\d+$/u.test(
        entry.follow_up_issue ?? ""
      )
    ) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " requires a follow-up issue"
      )
    }
    if (
      entry.outcome === "RESOLVED_BY_EVIDENCE" &&
      entry.follow_up_issue !== null &&
      !/^https:\/\/github[.]com\/bynanci\/courtside-tw\/issues\/\d+$/u.test(
        entry.follow_up_issue ?? ""
      )
    ) {
      adjudicationErrors.push(
        "owner adjudication entry " + (index + 1) + " has an invalid follow-up issue"
      )
    }
  })

  const valid = adjudicationErrors.length === 0
  if (!valid) errors.push(...adjudicationErrors)
  return {
    status: valid ? "VERIFIED" : "INVALID",
    html_url: readback.html_url ?? null,
    user_login: readback.user_login ?? null,
    author_association: readback.author_association ?? null,
    created_at: readback.created_at ?? null,
    updated_at: readback.updated_at ?? null,
    candidate_sha: contract?.candidate_sha ?? null,
    body_sha256: typeof readback.body === "string" ? sha256(readback.body) : null,
    adjudicated: valid ? entries : [],
    unadjudicated: valid ? [] : blockers
  }
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
  ownerAdjudicationReadback = null,
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
  const sourceBlockers = blockingDeviations(
    readText(root, T086_TRACEABILITY_PATH, errors, "frozen T085 traceability"),
    errors
  )
  const adjudication = validateOwnerAdjudication(
    ownerAdjudicationReadback,
    sourceBlockers,
    currentHead,
    errors
  )
  const blockers = adjudication.unadjudicated
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
    decision_scope: "T086_GATE_ONLY",
    status: errors.length === 0 ? "PASS" : "FAIL",
    release_decision: reasons.length === 0 ? "PASS" : "HOLD",
    release_decision_reasons: reasons,
    candidate_sha: currentHead,
    base: { branch: "main", sha: changeBaseSha, authorized_sha: T086_AUTHORIZED_BASE_SHA },
    authorization: scope.authorization,
    adjudication,
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
    blockers: {
      traceability: sourceBlockers,
      source: sourceBlockers,
      source_count: sourceBlockers.length,
      adjudicated: adjudication.adjudicated,
      unadjudicated: blockers,
      count: blockers.length
    },
    external_required_checks: {
      ci: "REQUIRES_GITHUB_READBACK",
      security: "REQUIRES_GITHUB_READBACK",
      included_in_gate_decision: false
    },
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

const adjudicationIssueApiUrl = "https://api.github.com/repos/bynanci/courtside-tw/issues/160"
const githubIssueCommentsMaxPages = 10
const githubIssueCommentsMaxBytes = 4 * 1024 * 1024

function unavailableOwnerAdjudicationReadback(reason) {
  return {
    status: "UNAVAILABLE",
    source: "github-api",
    issue_url: adjudicationIssueApiUrl,
    errors: ["GitHub owner adjudication read-back failed: " + reason]
  }
}

export function ownerAdjudicationReadbackFromPages(pageReadback) {
  try {
    if (pageReadback === null || typeof pageReadback !== "object" || Array.isArray(pageReadback)) {
      throw new Error("pagination read-back is malformed")
    }
    if (pageReadback.status !== "COMPLETE" || pageReadback.complete !== true) {
      throw new Error("pagination read-back is incomplete, unavailable, or exceeded its limit")
    }
    if (pageReadback.max_pages !== githubIssueCommentsMaxPages) {
      throw new Error("pagination read-back has an invalid page limit")
    }
    if (
      !Array.isArray(pageReadback.pages) ||
      !Number.isSafeInteger(pageReadback.pages_fetched) ||
      pageReadback.pages_fetched !== pageReadback.pages.length ||
      pageReadback.pages.length === 0 ||
      pageReadback.pages.length > githubIssueCommentsMaxPages
    ) {
      throw new Error("pagination read-back has malformed page metadata")
    }

    for (const [index, page] of pageReadback.pages.entries()) {
      if (!Array.isArray(page) || page.length > 100) {
        throw new Error("pagination read-back contains a malformed page")
      }
      if (index < pageReadback.pages.length - 1 && page.length !== 100) {
        throw new Error("pagination read-back is incomplete before the final page")
      }
    }

    const ownerComments = pageReadback.pages
      .flat()
      .filter(
        (comment) =>
          typeof comment?.body === "string" &&
          comment.body.includes(adjudicationStart) &&
          comment?.user?.login === "bynanci" &&
          comment?.author_association === "OWNER"
      )
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
    const comment = ownerComments.at(-1)
    if (comment === undefined) {
      return {
        status: "NOT_FOUND",
        source: "github-api",
        issue_url: adjudicationIssueApiUrl,
        errors: []
      }
    }
    return {
      status: "VERIFIED",
      source: "github-api",
      html_url: comment.html_url ?? null,
      issue_url: comment.issue_url ?? null,
      user_login: comment?.user?.login ?? null,
      author_association: comment.author_association ?? null,
      created_at: comment.created_at ?? null,
      updated_at: comment.updated_at ?? null,
      body: comment.body,
      errors: []
    }
  } catch (error) {
    return unavailableOwnerAdjudicationReadback(error.message)
  }
}

const githubIssueCommentsFetchScript = [
  "const initialUrl = new URL(process.argv[1])",
  "const maxPages = Number(process.argv[2])",
  "const maxBytes = Number(process.argv[3])",
  "const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'courtside-t086-release-validator', 'X-GitHub-Api-Version': '2022-11-28' }",
  "function nextPageUrl(linkHeader, currentUrl) {",
  "  if (linkHeader === null) return null",
  "  if (typeof linkHeader !== 'string' || linkHeader.trim() === '') throw new Error('GitHub owner adjudication pagination Link is malformed')",
  "  const links = new Map()",
  "  for (const part of linkHeader.split(',')) {",
  '    const match = part.trim().match(/^<([^>]+)>;\\s*rel="([^"]+)"$/u)',
  "    if (match === null) throw new Error('GitHub owner adjudication pagination Link is malformed')",
  "    const candidate = new URL(match[1], currentUrl)",
  "    if (candidate.origin !== initialUrl.origin || candidate.pathname !== initialUrl.pathname) throw new Error('GitHub owner adjudication pagination escaped the issue comments endpoint')",
  "    if (candidate.searchParams.getAll('per_page').length !== 1 || candidate.searchParams.get('per_page') !== '100' || candidate.searchParams.getAll('page').length !== 1) throw new Error('GitHub owner adjudication pagination query is malformed')",
  "    if ([...candidate.searchParams.keys()].some((name) => name !== 'per_page' && name !== 'page')) throw new Error('GitHub owner adjudication pagination query is malformed')",
  "    const candidatePage = Number(candidate.searchParams.get('page'))",
  "    if (!Number.isSafeInteger(candidatePage) || candidatePage < 1) throw new Error('GitHub owner adjudication pagination page is malformed')",
  "    for (const rel of match[2].split(' ')) {",
  "      if (!['next', 'last', 'first', 'prev'].includes(rel) || links.has(rel)) throw new Error('GitHub owner adjudication pagination relation is malformed')",
  "      links.set(rel, candidate)",
  "    }",
  "  }",
  "  const next = links.get('next') ?? null",
  "  if (next !== null && Number(next.searchParams.get('page')) !== Number(currentUrl.searchParams.get('page')) + 1) throw new Error('GitHub owner adjudication pagination is not contiguous')",
  "  return next",
  "}",
  "const pages = []",
  "let totalBytes = 0",
  "let url = initialUrl",
  "for (let pageNumber = 1; ; pageNumber += 1) {",
  "  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) })",
  "  if (!response.ok) throw new Error('GitHub owner adjudication returned HTTP ' + response.status)",
  "  const body = await response.text()",
  "  totalBytes += Buffer.byteLength(body)",
  "  if (totalBytes > maxBytes) throw new Error('GitHub owner adjudication pagination exceeded its byte limit')",
  "  const comments = JSON.parse(body)",
  "  if (!Array.isArray(comments) || comments.length > 100) throw new Error('GitHub issue comments page is malformed')",
  "  pages.push(comments)",
  "  const next = nextPageUrl(response.headers.get('link'), url)",
  "  if (next === null) break",
  "  if (comments.length !== 100) throw new Error('GitHub owner adjudication pagination is incomplete')",
  "  if (pageNumber >= maxPages) throw new Error('GitHub owner adjudication pagination exceeded its page limit')",
  "  url = next",
  "}",
  "process.stdout.write(JSON.stringify({ status: 'COMPLETE', complete: true, max_pages: maxPages, pages_fetched: pages.length, pages }))"
].join("\n")

export function inspectT086OwnerAdjudication() {
  const apiUrl = adjudicationIssueApiUrl + "/comments?per_page=100&page=1"
  try {
    const raw = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        githubIssueCommentsFetchScript,
        apiUrl,
        String(githubIssueCommentsMaxPages),
        String(githubIssueCommentsMaxBytes)
      ],
      {
        encoding: "utf8",
        env: {},
        maxBuffer: 5 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000
      }
    )
    return ownerAdjudicationReadbackFromPages(JSON.parse(raw))
  } catch (error) {
    return unavailableOwnerAdjudicationReadback(error.message)
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
    ownerAdjudicationReadback: inspectT086OwnerAdjudication(),
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
