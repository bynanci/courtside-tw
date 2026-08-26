/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const TRACEABILITY_SCHEMA = "courtside-traceability/v1"
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
const implementationCheckedTasks = new Set([
  ...Array.from({ length: 84 }, (_, index) => `T${String(index + 1).padStart(3, "0")}`),
  "T097"
])
const authorizedChangedPaths = new Set([
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
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
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
    return /\b(?:test|it)(?:\.\w+)*\s*\(/.test(line)
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
}

function validateScope(contract, taskStatus, errors) {
  const lifecycle = contract.lifecycle
  if (!lifecycle || lifecycle.phase !== "T085_IMPLEMENTATION") {
    errors.push("this bounded validator only accepts lifecycle.phase T085_IMPLEMENTATION")
  }
  if (lifecycle?.task !== "T085") errors.push("lifecycle.task must be T085")
  if (lifecycle?.t085_complete !== false || taskStatus.get("T085") !== false) {
    errors.push("T085_IMPLEMENTATION must keep T085 unchecked and incomplete")
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

  for (const [taskId, checked] of taskStatus) {
    const expectedChecked = implementationCheckedTasks.has(taskId)
    if (checked !== expectedChecked) {
      errors.push(`${taskId} checkbox is outside the authorized T085 frontier`)
    }
  }
}

export function validateTraceability({
  root,
  currentHead = null,
  gitBinding = null,
  changedPaths = null,
  reviewBaseSha = REVIEW_BASE_SHA,
  requireExactHeadEvidence = false
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
    dispatch: ".loop/evidence/t085-dispatch.json"
  }

  const specText = readText(root, paths.spec, errors, "spec source")
  const planText = readText(root, paths.plan, errors, "plan source")
  const tasksText = readText(root, paths.tasks, errors, "tasks source")
  const traceabilityText = readText(root, paths.traceability, errors, "T085 traceability artifact")
  const dispatchText = readText(root, paths.dispatch, errors, "T085 dispatch receipt")

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
  if (gitBinding?.authorized_base_ancestor === false) {
    errors.push("immutable dispatch base is not an ancestor of the evaluated head")
  }
  if (gitBinding?.review_base_ancestor === false) {
    errors.push("current protected review base is not an ancestor of the evaluated head")
  }
  if (Array.isArray(changedPaths)) {
    for (const changedPath of changedPaths) {
      if (!authorizedChangedPaths.has(changedPath)) {
        errors.push(`changed path is outside the authorized T085 scope: ${changedPath}`)
      }
    }
  } else {
    warnings.push(
      "review-base path diff was not available; authoritative GitHub PR scope read-back remains required"
    )
  }

  let contract = null
  let dispatch = null
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

  const specIds = specText === null ? [] : idsFrom(specText, requirementPattern)
  const frIds = specIds.filter((id) => id.startsWith("FR-"))
  const scIds = specIds.filter((id) => id.startsWith("SC-"))
  const taskMatches = tasksText === null ? [] : [...tasksText.matchAll(taskPattern)]
  const taskIds = taskMatches.map((match) => match[2])
  const taskStatus = new Map(taskMatches.map((match) => [match[2], match[1].toLowerCase() === "x"]))

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
    if (
      contract.source_inventory?.spec !== paths.spec ||
      contract.source_inventory?.plan !== paths.plan ||
      contract.source_inventory?.tasks !== paths.tasks ||
      contract.source_inventory?.functional_requirements !== 74 ||
      contract.source_inventory?.success_criteria !== 23 ||
      contract.source_inventory?.tasks_total !== 112 ||
      contract.source_inventory?.tasks_checked !==
        [...taskStatus.values()].filter(Boolean).length ||
      contract.source_inventory?.tasks_unchecked !==
        [...taskStatus.values()].filter((value) => !value).length
    ) {
      errors.push("source_inventory must match the canonical source paths and live counts")
    }
    validateScope(contract, taskStatus, errors)

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
      const expectedStatus = taskStatus.get(row?.id) ? "COMPLETE" : "OPEN"
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

    const referencedDeviations = new Set(
      requirements.flatMap((row) => (Array.isArray(row?.deviation_ids) ? row.deviation_ids : []))
    )
    for (const deviation of deviations) {
      if (deviation?.state === "OPEN" && !referencedDeviations.has(deviation.id)) {
        warnings.push(
          `open deviation ${deviation.id} is task/structure-only, not requirement-linked`
        )
      }
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

  const analysisValid = errors.length === 0
  const receiptEligible = false
  const checkedTasks = [...taskStatus.values()].filter(Boolean).length
  const openDeviations = deviationRows.filter((deviation) => deviation?.state === "OPEN")

  return {
    schema_version: "courtside-traceability-report/v1",
    task: "T085",
    status: analysisValid ? "PASS" : "FAIL",
    analysis_valid: analysisValid,
    receipt_eligible: receiptEligible,
    source: {
      repository: contract?.repository ?? "bynanci/courtside-tw",
      authorized_base_sha: contract?.authorized_base_sha ?? dispatch?.base?.sha ?? null,
      review_base_sha: reviewBaseSha,
      evaluated_head_sha: currentHead,
      exact_head_evidence: exactHeadEvidence,
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
    scope_validation: {
      authorized_base_sha: AUTHORIZED_BASE_SHA,
      review_base_sha: reviewBaseSha,
      status: Array.isArray(changedPaths) ? "AUDITED" : "EXTERNAL_READBACK_REQUIRED",
      git_diff_audited: Array.isArray(changedPaths),
      changed_paths: changedPaths,
      unauthorized_paths: Array.isArray(changedPaths)
        ? changedPaths.filter((changedPath) => !authorizedChangedPaths.has(changedPath))
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

function inspectGit(root) {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
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
    let changedPaths = null
    if (reviewBaseAncestor === true) {
      changedPaths = execFileSync("git", ["diff", "--name-only", REVIEW_BASE_SHA, head], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      })
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort()
    }
    return {
      head,
      status,
      authorized_base_ancestor: authorizedBaseAncestor,
      review_base_ancestor: reviewBaseAncestor,
      changedPaths
    }
  } catch {
    return {
      head: null,
      status: "UNAVAILABLE",
      authorized_base_ancestor: null,
      review_base_ancestor: null,
      changedPaths: null
    }
  }
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function runCli(root = repositoryRoot) {
  const inspection = inspectGit(root)
  const report = validateTraceability({
    root,
    currentHead: inspection.head,
    gitBinding: {
      status: inspection.status,
      head: inspection.head,
      authorized_base_ancestor: inspection.authorized_base_ancestor,
      review_base_ancestor: inspection.review_base_ancestor
    },
    changedPaths: inspection.changedPaths,
    reviewBaseSha: REVIEW_BASE_SHA,
    requireExactHeadEvidence: process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"
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
