/* eslint-disable no-console */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const TRACEABILITY_SCHEMA = "courtside-traceability/v1"
export const CONTRACT_START = "<!-- t085:contract:start -->"
export const CONTRACT_END = "<!-- t085:contract:end -->"

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
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`)
}

function sameValues(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function requireString(value, label, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} must be a non-empty string`)
    return false
  }
  return true
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

function validateProof(root, proof, label, errors) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    errors.push(`${label} must be an object`)
    return
  }
  requireString(proof.kind, `${label}.kind`, errors)
  if (forbiddenProofPaths.has(proof.path)) {
    errors.push(`${label}.path cannot use the traceability artifact as its own proof`)
    return
  }
  const absolutePath = safeProofPath(root, proof.path, errors, label)
  if (!requireString(proof.selector, `${label}.selector`, errors) || !absolutePath) return
  const text = fs.readFileSync(absolutePath, "utf8")
  if (!text.includes(proof.selector)) {
    errors.push(`${label}.selector was not found literally in ${proof.path}: ${proof.selector}`)
  }
  if (proof.source_head !== undefined && !/^[0-9a-f]{40}$/.test(proof.source_head)) {
    errors.push(`${label}.source_head must be a full lowercase commit SHA when present`)
  }
}

function validateScope(contract, taskStatus, errors) {
  const lifecycle = contract.lifecycle
  if (!lifecycle || !["T085_IMPLEMENTATION", "T085_ACCEPTED"].includes(lifecycle.phase)) {
    errors.push("lifecycle.phase must be T085_IMPLEMENTATION or T085_ACCEPTED")
  }
  if (lifecycle?.task !== "T085") errors.push("lifecycle.task must be T085")
  if (lifecycle?.phase === "T085_IMPLEMENTATION") {
    if (lifecycle.t085_complete !== false || taskStatus.get("T085") !== false) {
      errors.push("T085_IMPLEMENTATION must keep T085 unchecked and incomplete")
    }
  }
  if (lifecycle?.phase === "T085_ACCEPTED") {
    if (lifecycle.t085_complete !== true || taskStatus.get("T085") !== true) {
      errors.push("T085_ACCEPTED requires the protected T085 checkbox receipt")
    }
    if (!/^[0-9a-f]{40}$/.test(lifecycle?.receipt?.implementation_merge_sha ?? "")) {
      errors.push("T085_ACCEPTED requires receipt.implementation_merge_sha")
    }
    requireString(lifecycle?.receipt?.release_owner_decision, "lifecycle.receipt.release_owner_decision", errors)
    requireString(lifecycle?.receipt?.protected_main_readback, "lifecycle.receipt.protected_main_readback", errors)
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
}

export function validateTraceability({ root, currentHead = null }) {
  const errors = []
  const warnings = []
  const paths = {
    spec: "specs/001-taiwan-basketball-magazine-ebook/spec.md",
    plan: "specs/001-taiwan-basketball-magazine-ebook/plan.md",
    tasks: "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
    traceability: "specs/001-taiwan-basketball-magazine-ebook/traceability.md",
    dispatch: ".loop/evidence/t085-dispatch.json"
  }

  const specText = readText(root, paths.spec, errors, "spec source")
  readText(root, paths.plan, errors, "plan source")
  const tasksText = readText(root, paths.tasks, errors, "tasks source")
  const traceabilityText = readText(root, paths.traceability, errors, "T085 traceability artifact")
  const dispatchText = readText(root, paths.dispatch, errors, "T085 dispatch receipt")

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
  const taskMatches = tasksText === null ? [] : [...tasksText.matchAll(taskPattern)]
  const taskIds = taskMatches.map((match) => match[2])
  const taskStatus = new Map(taskMatches.map((match) => [match[2], match[1].toLowerCase() === "x"]))

  const expectedRequirements = [...expectedIds("FR", 74), ...expectedIds("SC", 23)]
  const expectedTasks = Array.from(
    { length: 112 },
    (_, index) => `T${String(index + 1).padStart(3, "0")}`
  )
  if (!sameValues(specIds, expectedRequirements) || specIds.length !== 97) {
    errors.push("spec must define exactly contiguous FR-001..FR-074 and SC-001..SC-023")
  }
  if (duplicates(specIds).length > 0) {
    errors.push(`spec contains duplicate requirement IDs: ${duplicates(specIds).join(", ")}`)
  }
  if (!sameValues(taskIds, expectedTasks) || taskIds.length !== 112) {
    errors.push("tasks must define exactly contiguous T001..T112")
  }
  if (duplicates(taskIds).length > 0) {
    errors.push(`tasks contains duplicate IDs: ${duplicates(taskIds).join(", ")}`)
  }

  if (contract) {
    if (contract.schema_version !== TRACEABILITY_SCHEMA) {
      errors.push(`schema_version must be ${TRACEABILITY_SCHEMA}`)
    }
    if (contract.authorized_base_sha !== dispatch?.base?.sha) {
      errors.push("authorized_base_sha must equal the T085 dispatch base SHA")
    }
    if (!/^[0-9a-f]{40}$/.test(contract.authorized_base_sha ?? "")) {
      errors.push("authorized_base_sha must be a full lowercase commit SHA")
    }
    validateScope(contract, taskStatus, errors)

    if (!Array.isArray(contract.requirements)) errors.push("requirements must be an array")
    if (!Array.isArray(contract.task_ledger)) errors.push("task_ledger must be an array")
    if (!Array.isArray(contract.deviations)) errors.push("deviations must be an array")

    const requirements = Array.isArray(contract.requirements) ? contract.requirements : []
    const requirementIds = requirements.map((row) => row?.id)
    if (!sameValues(requirementIds, expectedRequirements) || requirementIds.length !== 97) {
      errors.push("requirements must contain every FR/SC exactly once")
    }
    if (duplicates(requirementIds).length > 0) {
      errors.push(`requirements contains duplicate IDs: ${duplicates(requirementIds).join(", ")}`)
    }

    const deviations = Array.isArray(contract.deviations) ? contract.deviations : []
    const deviationIds = deviations.map((deviation) => deviation?.id)
    if (duplicates(deviationIds).length > 0) {
      errors.push(`deviations contains duplicate IDs: ${duplicates(deviationIds).join(", ")}`)
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
        validateProof(root, proof, `${label}.proofs[${proofIndex}]`, errors)
      }
      const rowDeviationIds = Array.isArray(row?.deviation_ids) ? row.deviation_ids : []
      for (const deviationId of rowDeviationIds) {
        const deviation = deviationById.get(deviationId)
        if (!deviation) errors.push(`${label} references unknown deviation ${deviationId}`)
        else if (!deviation.affected_ids?.includes(row.id)) {
          errors.push(`${label} references ${deviationId}, but the deviation does not affect ${row.id}`)
        }
      }

      if (row?.evidence_state === "VERIFIED") {
        if (proofs.length === 0) errors.push(`${label} VERIFIED rows require at least one proof`)
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
    }

    const ledger = Array.isArray(contract.task_ledger) ? contract.task_ledger : []
    const ledgerIds = ledger.map((row) => row?.id)
    if (!sameValues(ledgerIds, expectedTasks) || ledgerIds.length !== 112) {
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
      const expectedStatus = taskStatus.get(row?.id) ? "COMPLETE" : "OPEN"
      if (row?.status !== expectedStatus) {
        errors.push(`${label}.status must match tasks.md (${expectedStatus})`)
      }
      const reverse = Array.isArray(row?.requirement_ids) ? row.requirement_ids : []
      const expectedReverse = [...(forward.get(row?.id) ?? [])]
      if (!sameValues(reverse, expectedReverse) || reverse.length !== expectedReverse.length) {
        errors.push(`${label}.requirement_ids must exactly match the forward requirement mapping`)
      }
    }

    const referencedDeviations = new Set(
      requirements.flatMap((row) => (Array.isArray(row?.deviation_ids) ? row.deviation_ids : []))
    )
    for (const deviation of deviations) {
      if (deviation?.state === "OPEN" && !referencedDeviations.has(deviation.id)) {
        warnings.push(`open deviation ${deviation.id} is task/structure-only, not requirement-linked`)
      }
    }
  }

  return {
    schema_version: "courtside-traceability-report/v1",
    task: "T085",
    status: errors.length === 0 ? "PASS" : "FAIL",
    current_head: currentHead,
    counts: {
      requirements_in_spec: specIds.length,
      tasks_in_plan: taskIds.length,
      mapped_requirements: contract?.requirements?.length ?? 0,
      classified_tasks: contract?.task_ledger?.length ?? 0,
      deviations: contract?.deviations?.length ?? 0
    },
    scope_boundaries: {
      t086_dispatched: contract?.lifecycle?.t086_dispatched ?? false,
      participant_research_executed: contract?.lifecycle?.participant_research_executed ?? false,
      web3_activated: contract?.lifecycle?.web3_activated ?? false,
      production_activated: contract?.lifecycle?.production_activated ?? false,
      provider_configured: contract?.lifecycle?.provider_configured ?? false,
      secrets_changed: contract?.lifecycle?.secrets_changed ?? false
    },
    errors,
    warnings
  }
}

function gitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function runCli(root = repositoryRoot) {
  const report = validateTraceability({ root, currentHead: gitHead(root) })
  const outputPath = path.join(root, "artifacts/frontend/t085-traceability-report.json")
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
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
