import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import * as traceabilityValidator from "../validate-traceability.mjs"

const {
  ACCEPTED_CI_RUN_ID,
  ACCEPTED_COMPLETED_TASKS_SHA256,
  ACCEPTED_EXACT_HEAD_ARTIFACT_SHA256,
  ACCEPTED_FRONTEND_ARCHIVE_SHA256,
  ACCEPTED_FRONTEND_ARTIFACT_ID,
  ACCEPTED_IMPLEMENTATION_CHANGED_PATHS,
  ACCEPTED_IMPLEMENTATION_HEAD_SHA,
  ACCEPTED_IMPLEMENTATION_MERGE_SHA,
  ACCEPTED_PENDING_TASKS_SHA256,
  ACCEPTED_SECURITY_RUN_ID,
  ACCEPTED_TRACEABILITY_REPORT_SHA256,
  ACCEPTED_TRACEABILITY_SHA256,
  AUTHORIZED_BASE_SHA,
  CONTRACT_END,
  CONTRACT_START,
  TRACEABILITY_SCHEMA,
  extractContract,
  validateTraceability
} = traceabilityValidator

const baseSha = AUTHORIZED_BASE_SHA
const featurePath = "specs/001-taiwan-basketball-magazine-ebook"
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const completionReceiptPath = ".loop/evidence/t085-completion-receipt.json"
const completionReceiptSchema = "courtside-t085-completion-receipt/v1"
const fixtureReceiptHead = "1111111111111111111111111111111111111111"
const fixtureReceiptBase = "2222222222222222222222222222222222222222"
const fixtureActionsMergeSha = "3333333333333333333333333333333333333333"
const fixtureActionsRunId = "33229999999"
const fixtureActionsRunNumber = "999"
const fixtureActionsRunAttempt = "1"
const fixtureActionsHeadRef = "codex/t085-completion-receipt"
const fixtureImplementationHead = "27b955581a909e292ae4fe6c1fb05de0e94753da"
const fixtureImplementationMerge = "a2491b81066ac225a0b5d2dab93be79fb6dfbe65"
const fixtureCompletedBase = "5555555555555555555555555555555555555555"
const fixtureCiRunId = 33226451857
const fixtureSecurityRunId = 33226451860
const fixtureReceiptOwner = "bynanci"
const fixtureReceiptAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/145#issuecomment-5459765126"
const fixtureFrontendArtifactId = 9707044002
const fixtureFrontendArchiveSha256 =
  "88baa1d7bd1e3ef08193b7d65799484d16363677c7c446001fa531efb6a8706f"
const fixtureExactHeadArtifactSha256 =
  "8126aebe79e1cacbbdcac5136373cc2cfa889b9c09264e1ce75cbf06d506e803"
const fixtureTraceabilityReportSha256 =
  "5e6201ee0b646e0d9c619b440cccf0dd6928bede6869032fa81d06d05bd9a440"
const fixtureImplementationChangedPaths = [
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
]

function sha256(text) {
  return createHash("sha256").update(text).digest("hex")
}

function ids(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`
  )
}

function taskIds() {
  return Array.from({ length: 112 }, (_, index) => `T${String(index + 1).padStart(3, "0")}`)
}

function isCheckedTask(id) {
  const number = Number(id.slice(1))
  return number <= 84 || number === 97
}

function classification(id) {
  const number = Number(id.slice(1))
  if (number <= 23) return "FOUNDATION"
  if ([24, 25, 32, 33, 42, 43, 44, 57, 64, 71].includes(number)) return "TEST"
  if (number <= 76) return "IMPLEMENTATION"
  if (number <= 84) return "QUALITY_GATE"
  if (number === 85) return "TRACEABILITY"
  if (number === 86) return "RELEASE_GATE"
  if (number <= 96 || number >= 98) return "FUTURE"
  return "ALIGNMENT"
}

function canonicalContract() {
  const requirementIds = [...ids("FR", 74), ...ids("SC", 23)]
  const assignedTasks = new Map(requirementIds.map((id) => [id, []]))
  const approvedOrphans = new Set(["T001", "T005", "T007", "T082"])
  const checked = taskIds().filter((id) => isCheckedTask(id) && !approvedOrphans.has(id))
  const open = taskIds().filter((id) => !isCheckedTask(id))
  checked.forEach((taskId, index) => assignedTasks.get(requirementIds[index % 70]).push(taskId))
  open.forEach((taskId, index) => assignedTasks.get(requirementIds[70 + (index % 27)]).push(taskId))

  const plannedIds = new Set(requirementIds.slice(70))
  const requirements = requirementIds.map((id) => {
    const planned = plannedIds.has(id)
    return {
      id,
      story: "CROSS_CUT",
      priority: "P1",
      slice: "fixture",
      task_ids: assignedTasks.get(id),
      implementation_state: planned ? "PLANNED" : "COMPLETE",
      evidence_state: planned ? "PARTIAL" : "VERIFIED",
      proofs: [
        {
          id: "P_FIXTURE",
          kind: "REPOSITORY_PROOF",
          path: "tests/fixture-proof.test.js",
          selector: "fixture-proof"
        }
      ],
      deviation_ids: planned ? ["DEV-T085-999"] : [],
      release_impact: planned ? "BLOCKED_FIXTURE" : "NONE"
    }
  })
  return {
    schema_version: TRACEABILITY_SCHEMA,
    authorized_base_sha: baseSha,
    source_inventory: {
      spec: `${featurePath}/spec.md`,
      plan: `${featurePath}/plan.md`,
      tasks: `${featurePath}/tasks.md`,
      functional_requirements: 74,
      success_criteria: 23,
      tasks_total: 112,
      tasks_checked: 85,
      tasks_unchecked: 27
    },
    lifecycle: {
      phase: "T085_IMPLEMENTATION",
      task: "T085",
      t085_complete: false,
      t086_dispatched: false,
      participant_research_executed: false,
      web3_activated: false,
      production_activated: false,
      provider_configured: false,
      secrets_changed: false
    },
    requirements,
    task_ledger: taskIds().map((id) => {
      const reverse = requirements.filter((row) => row.task_ids.includes(id)).map((row) => row.id)
      return {
        id,
        status: isCheckedTask(id) ? "COMPLETE" : "OPEN",
        classification: classification(id),
        requirement_ids: reverse,
        ...(reverse.length === 0 ? { orphan_reason: "fixture enabling task" } : {})
      }
    }),
    deviations: [
      {
        id: "DEV-T085-999",
        type: "PLANNED_FIXTURE",
        severity: "LOW",
        affected_ids: [...plannedIds],
        expected: "fixture completion",
        observed: "fixture remains planned",
        disposition: "keep the fixture bounded",
        owner: "fixture owner",
        target: "fixture follow-up",
        release_impact: "BLOCKED_FIXTURE",
        state: "OPEN"
      }
    ]
  }
}

function canonicalDispatch() {
  return {
    schema_version: "courtside-t085-dispatch/v1",
    recorded_at: "2026-08-25T12:42:58Z",
    repository: "bynanci/courtside-tw",
    issue: "https://github.com/bynanci/courtside-tw/issues/145",
    branch: "task/t085-cross-artifact-traceability",
    base: {
      branch: "main",
      sha: baseSha,
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
}

function markdown(contract) {
  const table = contract.requirements
    .map((row) => {
      const proofIds = row.proofs.map((proof) => `\`${proof.id}\``).join(", ")
      const deviationIds = row.deviation_ids.map((id) => `\`${id}\``).join(", ") || "—"
      return `| ${row.id} | fixture | ${row.task_ids.join(", ")} | ${row.implementation_state} | ${row.evidence_state} | ${proofIds} | ${deviationIds} | ${row.release_impact} |`
    })
    .join("\n")
  const deviationTable = contract.deviations
    .map(
      (deviation) =>
        `| ${deviation.id} | ${deviation.type} | ${deviation.severity} | ${deviation.state} | ${deviation.affected_ids.join(", ")} | ${deviation.disposition} Target: ${deviation.target}. | ${deviation.release_impact} |`
    )
    .join("\n")
  return `# Traceability\n\n${table}\n\n## Deviation register\n\n| ID | Type | Severity | State | Affected | Disposition / target | Release impact |\n| --- | --- | --- | --- | --- | --- | --- |\n${deviationTable}\n\n${CONTRACT_START}\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n${CONTRACT_END}\n`
}

function makeFixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-t085-"))
  const spec = [
    ...ids("FR", 74).map((id) => `- **${id}**: fixture`),
    ...ids("SC", 23).map((id) => `- **${id}**: fixture`)
  ].join("\n")
  const tasks = taskIds()
    .map((id) => `- [${isCheckedTask(id) ? "x" : " "}] ${id} fixture`)
    .join("\n")
  const contract = canonicalContract()
  const files = {
    [`${featurePath}/spec.md`]: spec,
    [`${featurePath}/plan.md`]: "# Plan\n",
    [`${featurePath}/tasks.md`]: tasks,
    [`${featurePath}/traceability.md`]: markdown(contract),
    ".loop/evidence/t085-dispatch.json": JSON.stringify(canonicalDispatch()),
    "tests/fixture-proof.test.js": 'test("fixture-proof", () => {})\n'
  }
  mutate({ contract, files })
  if (files[`${featurePath}/traceability.md`] !== undefined) {
    files[`${featurePath}/traceability.md`] = markdown(contract)
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content)
  }
  return root
}

function makeReceiptFixture(mutate = () => {}) {
  let receiptContext
  const root = makeFixture(({ contract, files }) => {
    const baseTasksText = files[`${featurePath}/tasks.md`]
    const baseTraceabilityText = markdown(contract)
    const openDeviations = contract.deviations.filter(({ state }) => state === "OPEN")
    const receipt = {
      schema_version: completionReceiptSchema,
      task: "T085",
      decision: "ACCEPTED",
      actor_type: "HUMAN",
      accepted_by: fixtureReceiptOwner,
      authorization_ref: fixtureReceiptAuthorizationRef,
      recorded_at: "2026-08-29T00:00:00Z",
      repository: "bynanci/courtside-tw",
      issue: "https://github.com/bynanci/courtside-tw/issues/145",
      implementation_head_sha: fixtureImplementationHead,
      implementation_merge_sha: fixtureImplementationMerge,
      receipt_base_sha: fixtureReceiptBase,
      implementation_scope: {
        changed_files: fixtureImplementationChangedPaths.length,
        changed_paths: [...fixtureImplementationChangedPaths],
        required_checks: "14/14"
      },
      traceability_sha256: sha256(baseTraceabilityText),
      tasks_before_sha256: sha256(baseTasksText),
      gates: {
        ci: {
          result: "PASS",
          jobs: "5/5",
          run_id: fixtureCiRunId,
          source_head_sha: fixtureImplementationHead
        },
        security: {
          result: "PASS",
          jobs: "8/8",
          run_id: fixtureSecurityRunId,
          source_head_sha: fixtureImplementationHead
        },
        exact_head_artifacts: {
          result: "PASS",
          source_head_sha: fixtureImplementationHead,
          expected_source_head: fixtureImplementationHead,
          artifact_id: fixtureFrontendArtifactId,
          github_archive_sha256: fixtureFrontendArchiveSha256,
          exact_head_sha256: fixtureExactHeadArtifactSha256,
          traceability_report_sha256: fixtureTraceabilityReportSha256,
          run_id: fixtureCiRunId,
          run_number: 982,
          run_attempt: 1
        },
        review_threads: { unresolved: 0 },
        mergeability: "PASS",
        protected_merge: {
          result: "PASS",
          expected_head_sha: fixtureImplementationHead,
          merge_commit_sha: fixtureImplementationMerge
        }
      },
      deviation_snapshot: {
        total: contract.deviations.length,
        open: openDeviations.length,
        accepted: contract.deviations.filter(({ state }) => state === "ACCEPTED").length,
        resolved: contract.deviations.filter(({ state }) => state === "RESOLVED").length,
        open_ids: openDeviations.map(({ id }) => id)
      },
      scope_boundaries: {
        t086_dispatched: false,
        participant_research_executed: false,
        web3_activated: false,
        production_activated: false,
        provider_configured: false,
        secrets_changed: false
      }
    }
    files[`${featurePath}/tasks.md`] = baseTasksText.replace(/^- \[ \] T085\b/m, "- [x] T085")
    files["artifacts/exact-head.json"] = JSON.stringify({
      source_head_sha: fixtureReceiptHead,
      expected_source_head: fixtureReceiptHead,
      source_event: "pull_request",
      source_ref: fixtureActionsHeadRef,
      github_sha: fixtureActionsMergeSha,
      github_repository: "bynanci/courtside-tw",
      github_workflow: "CI",
      github_job: "frontend-contract",
      github_run_id: fixtureActionsRunId,
      github_run_number: fixtureActionsRunNumber,
      github_run_attempt: fixtureActionsRunAttempt,
      github_ref: "refs/pull/151/merge",
      github_base_ref: "main"
    })
    receiptContext = {
      receipt,
      changedPaths: [completionReceiptPath, `${featurePath}/tasks.md`],
      changeBaseTasksText: baseTasksText,
      changeBaseTraceabilityText: baseTraceabilityText,
      acceptedTraceabilitySha256: sha256(baseTraceabilityText),
      acceptedPendingTasksSha256: sha256(baseTasksText),
      acceptedCompletedTasksSha256: sha256(baseTasksText.replace(/^- \[ \] T085\b/m, "- [x] T085"))
    }
    mutate({ contract, files, ...receiptContext })
    files[completionReceiptPath] = JSON.stringify(receipt)
  })
  return { root, ...receiptContext }
}

function run(root, overrides = {}) {
  const traceabilityPath = path.join(root, featurePath, "traceability.md")
  const tasksPath = path.join(root, featurePath, "tasks.md")
  const traceabilityText = fs.existsSync(traceabilityPath)
    ? fs.readFileSync(traceabilityPath, "utf8")
    : ""
  const tasksText = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, "utf8") : ""
  const pendingTasksText = tasksText.replace(/^- \[[xX]\] T085\b/m, "- [ ] T085")
  return validateTraceability({
    root,
    currentHead: fixtureReceiptHead,
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead
    },
    changedPaths: [],
    acceptedTraceabilitySha256: sha256(traceabilityText),
    acceptedPendingTasksSha256: sha256(pendingTasksText),
    acceptedCompletedTasksSha256: sha256(
      pendingTasksText.replace(/^- \[ \] T085\b/m, "- [x] T085")
    ),
    ...overrides
  })
}

function makeFixtureActionsContext(root, environmentOverrides = {}) {
  if (typeof traceabilityValidator.inspectGitHubActionsContext !== "function") return null
  const eventPath = path.join(root, "github-pull-request-event.json")
  fs.writeFileSync(
    eventPath,
    JSON.stringify({
      repository: { full_name: "bynanci/courtside-tw" },
      pull_request: {
        head: { sha: fixtureReceiptHead, ref: fixtureActionsHeadRef },
        base: { sha: fixtureReceiptBase, ref: "main" }
      }
    })
  )
  return traceabilityValidator.inspectGitHubActionsContext({
    environment: {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "bynanci/courtside-tw",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SHA: fixtureActionsMergeSha,
      GITHUB_WORKFLOW: "CI",
      GITHUB_JOB: "frontend-contract",
      GITHUB_RUN_ID: fixtureActionsRunId,
      GITHUB_RUN_NUMBER: fixtureActionsRunNumber,
      GITHUB_RUN_ATTEMPT: fixtureActionsRunAttempt,
      GITHUB_REF: "refs/pull/151/merge",
      GITHUB_BASE_REF: "main",
      GITHUB_HEAD_REF: fixtureActionsHeadRef,
      ...environmentOverrides
    },
    gitBinding: {
      head: fixtureReceiptHead,
      change_base_sha: fixtureReceiptBase,
      change_base_ancestor: true
    }
  })
}

function runReceiptFixture(fixture, overrides = {}) {
  return run(fixture.root, {
    changedPaths: fixture.changedPaths,
    changeBaseSha: fixtureReceiptBase,
    implementationMergeAncestorOfChangeBase: true,
    boundedScopeActive: false,
    changeBaseTasksText: fixture.changeBaseTasksText,
    changeBaseTraceabilityText: fixture.changeBaseTraceabilityText,
    requireExactHeadEvidence: true,
    githubActionsContext: makeFixtureActionsContext(fixture.root),
    acceptedTraceabilitySha256: fixture.acceptedTraceabilitySha256,
    acceptedPendingTasksSha256: fixture.acceptedPendingTasksSha256,
    acceptedCompletedTasksSha256: fixture.acceptedCompletedTasksSha256,
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_ref: "fixture:trusted-base",
      change_base_sha: fixtureReceiptBase,
      change_base_ancestor: true,
      head_parent_sha: fixtureReceiptBase,
      head_parent_count: 1
    },
    ...overrides
  })
}

function makeCompletedFixture(mutate = () => {}) {
  const fixture = makeReceiptFixture()
  const tasksPath = path.join(fixture.root, featurePath, "tasks.md")
  const traceabilityPath = path.join(fixture.root, featurePath, "traceability.md")
  const receiptPath = path.join(fixture.root, completionReceiptPath)
  const completed = {
    ...fixture,
    changedPaths: ["docs/research/post-receipt.md"],
    changeBaseTasksText: fs.readFileSync(tasksPath, "utf8"),
    changeBaseTraceabilityText: fs.readFileSync(traceabilityPath, "utf8"),
    changeBaseCompletionReceiptText: fs.readFileSync(receiptPath, "utf8")
  }
  const docsPath = path.join(fixture.root, "docs/research/post-receipt.md")
  fs.mkdirSync(path.dirname(docsPath), { recursive: true })
  fs.writeFileSync(docsPath, "post-receipt work\n")
  mutate({ ...completed, tasksPath, traceabilityPath, receiptPath })
  return completed
}

function runCompletedFixture(fixture, overrides = {}) {
  return run(fixture.root, {
    changedPaths: fixture.changedPaths,
    changeBaseSha: fixtureCompletedBase,
    boundedScopeActive: false,
    changeBaseTasksText: fixture.changeBaseTasksText,
    changeBaseTraceabilityText: fixture.changeBaseTraceabilityText,
    changeBaseCompletionReceiptText: fixture.changeBaseCompletionReceiptText,
    acceptedTraceabilitySha256: fixture.acceptedTraceabilitySha256,
    acceptedPendingTasksSha256: fixture.acceptedPendingTasksSha256,
    acceptedCompletedTasksSha256: fixture.acceptedCompletedTasksSha256,
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_ref: "fixture:trusted-base",
      change_base_sha: fixtureCompletedBase,
      change_base_ancestor: true,
      head_parent_sha: fixtureCompletedBase,
      head_parent_count: 1
    },
    ...overrides
  })
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim()
}

function initializeGitFixture(root) {
  git(root, "init", "-b", "main")
  git(root, "config", "user.name", "Traceability Test")
  git(root, "config", "user.email", "traceability@example.invalid")
  git(root, "add", ".")
  git(root, "commit", "-m", "merge T085 implementation")
  return git(root, "rev-parse", "HEAD")
}

test("canonical inventory, forward mapping, reverse ledger and proof pass", () => {
  const report = run(makeFixture())
  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.counts.requirements_in_spec, 97)
  assert.equal(report.counts.tasks_in_plan, 112)
})

test("receipt authority is pinned to the protected PR149 implementation snapshot", () => {
  const traceabilityText = fs.readFileSync(
    path.join(repositoryRoot, featurePath, "traceability.md"),
    "utf8"
  )
  const pendingTasksText = fs.readFileSync(
    path.join(repositoryRoot, featurePath, "tasks.md"),
    "utf8"
  )
  const completedTasksText = pendingTasksText.replace(/^- \[ \] T085\b/m, "- [x] T085")

  assert.equal(ACCEPTED_IMPLEMENTATION_HEAD_SHA, fixtureImplementationHead)
  assert.equal(ACCEPTED_IMPLEMENTATION_MERGE_SHA, fixtureImplementationMerge)
  assert.equal(ACCEPTED_CI_RUN_ID, fixtureCiRunId)
  assert.equal(ACCEPTED_SECURITY_RUN_ID, fixtureSecurityRunId)
  assert.equal(ACCEPTED_FRONTEND_ARTIFACT_ID, fixtureFrontendArtifactId)
  assert.equal(ACCEPTED_FRONTEND_ARCHIVE_SHA256, fixtureFrontendArchiveSha256)
  assert.equal(ACCEPTED_EXACT_HEAD_ARTIFACT_SHA256, fixtureExactHeadArtifactSha256)
  assert.equal(ACCEPTED_TRACEABILITY_REPORT_SHA256, fixtureTraceabilityReportSha256)
  assert.equal(ACCEPTED_TRACEABILITY_SHA256, sha256(traceabilityText))
  assert.equal(ACCEPTED_PENDING_TASKS_SHA256, sha256(pendingTasksText))
  assert.equal(ACCEPTED_COMPLETED_TASKS_SHA256, sha256(completedTasksText))
  assert.deepEqual(ACCEPTED_IMPLEMENTATION_CHANGED_PATHS, fixtureImplementationChangedPaths)

  const contract = extractContract(traceabilityText)
  const openDeviations = contract.deviations.filter(({ state }) => state === "OPEN")
  const resolvedDeviations = contract.deviations.filter(({ state }) => state === "RESOLVED")
  assert.equal(contract.deviations.length, 47)
  assert.equal(openDeviations.length, 43)
  assert.equal(resolvedDeviations.length, 4)
  for (const number of [41, 42, 43, 44, 45, 46, 47]) {
    const id = `DEV-T085-${String(number).padStart(3, "0")}`
    const deviation = contract.deviations.find((row) => row.id === id)
    assert.equal(deviation?.state, "OPEN", id)
    assert.equal(deviation?.release_impact, "BLOCKS_T086_UNLESS_ADJUDICATED", id)
  }
})

test("missing traceability artifact is an attributable failure", () => {
  const root = makeFixture(({ files }) => {
    delete files[`${featurePath}/traceability.md`]
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /missing T085 traceability artifact/)
})

test("missing or duplicate requirement IDs fail the canonical inventory", () => {
  const root = makeFixture(({ files }) => {
    files[`${featurePath}/spec.md`] = files[`${featurePath}/spec.md`]
      .replace("- **FR-074**: fixture\n", "")
      .replace("- **FR-073**: fixture", "- **FR-073**: fixture\n- **FR-073**: duplicate")
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /spec must define exactly contiguous/)
  assert.match(report.errors.join("\n"), /duplicate requirement IDs: FR-073/)
})

test("unknown tasks and reverse mapping drift both fail", () => {
  const root = makeFixture(({ contract }) => {
    contract.requirements[0].task_ids = ["T113"]
    contract.task_ledger[0].requirement_ids = []
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /references unknown task T113/)
  assert.match(report.errors.join("\n"), /must exactly match the forward requirement mapping/)
})

test("missing proof paths, path escape and missing selectors fail closed", () => {
  for (const proof of [
    {
      kind: "REPOSITORY_PROOF",
      path: "missing.txt",
      selector: "fixture-proof"
    },
    {
      kind: "REPOSITORY_PROOF",
      path: "../outside.txt",
      selector: "fixture-proof"
    },
    { kind: "REPOSITORY_PROOF", path: "proof.txt", selector: "not-present" }
  ]) {
    const report = run(
      makeFixture(({ contract }) => {
        contract.requirements[0].proofs = [proof]
      })
    )
    assert.equal(report.status, "FAIL")
  }
})

test("unchecked future tasks cannot be claimed as VERIFIED", () => {
  const root = makeFixture(({ contract }) => {
    contract.requirements[0].task_ids = ["T085"]
    contract.task_ledger[0].requirement_ids = []
    contract.task_ledger[84].requirement_ids = ["FR-001"]
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /cannot be VERIFIED with unchecked tasks: T085/)
})

test("non-VERIFIED evidence requires a dispositioned deviation", () => {
  const root = makeFixture(({ contract }) => {
    contract.requirements[0].evidence_state = "HUMAN_OPEN"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /non-VERIFIED rows require an explicit deviation/)
})

test("scope authority declarations remain false", () => {
  const root = makeFixture(({ contract }) => {
    contract.lifecycle.provider_configured = true
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /lifecycle.provider_configured must remain false/)
})

test("automated repository proof cannot upgrade a human success criterion", () => {
  const root = makeFixture(({ contract }) => {
    const row = contract.requirements.find(({ id }) => id === "SC-001")
    const oldTaskId = row.task_ids[0]
    row.task_ids = ["T002"]
    row.implementation_state = "COMPLETE"
    row.evidence_state = "VERIFIED"
    row.deviation_ids = []
    contract.task_ledger.find(({ id }) => id === oldTaskId).requirement_ids = contract.task_ledger
      .find(({ id }) => id === oldTaskId)
      .requirement_ids.filter((id) => id !== "SC-001")
    contract.task_ledger.find(({ id }) => id === "T002").requirement_ids.push("SC-001")
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /SC-001.*requires a HUMAN_RECEIPT/)
})

test("delivery tasks cannot be silently orphaned from the reverse ledger", () => {
  const root = makeFixture(({ contract }) => {
    for (const row of contract.requirements) {
      row.task_ids = row.task_ids.filter((id) => id !== "T026")
    }
    contract.task_ledger.find(({ id }) => id === "T026").requirement_ids = []
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /T026.*not an approved orphan/)
})

test("exact-head artifact must bind the evaluated Git head", () => {
  const root = makeFixture(({ files }) => {
    files["artifacts/exact-head.json"] = JSON.stringify({
      expected_source_head: "2222222222222222222222222222222222222222",
      source_head_sha: "2222222222222222222222222222222222222222"
    })
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /source_head_sha must equal the evaluated Git head/)
})

test("truthful open evidence remains analysis-valid but not receipt-eligible", () => {
  const root = makeFixture(({ contract }) => {
    contract.requirements[0].evidence_state = "PARTIAL"
    contract.requirements[0].deviation_ids = ["DEV-T085-998"]
    contract.deviations.push({
      id: "DEV-T085-998",
      type: "PARTIAL_ACCEPTANCE",
      severity: "HIGH",
      affected_ids: ["FR-001"],
      expected: "complete acceptance",
      observed: "bounded proof only",
      disposition: "hold the later release gate",
      owner: "fixture owner",
      target: "fixture follow-up",
      release_impact: "BLOCKS_LATER_GATE",
      state: "OPEN"
    })
  })
  const report = run(root)
  assert.equal(report.analysis_valid, true, report.errors.join("\n"))
  assert.equal(report.receipt_eligible, false)
})

test("contract and dispatch cannot rewrite the fixed authorized base together", () => {
  const root = makeFixture(({ contract, files }) => {
    const forged = "2222222222222222222222222222222222222222"
    contract.authorized_base_sha = forged
    const dispatch = JSON.parse(files[".loop/evidence/t085-dispatch.json"])
    dispatch.base.sha = forged
    files[".loop/evidence/t085-dispatch.json"] = JSON.stringify(dispatch)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /contract and dispatch base must equal/)
})

test("current review base advances without rewriting the fixed dispatch authorization", () => {
  const currentHead = "1111111111111111111111111111111111111111"
  const reviewBaseSha = "84db3db95aa596eb317b71c4eea0926fc1fc15ce"
  const report = validateTraceability({
    root: makeFixture(),
    currentHead,
    gitBinding: {
      status: "CLEAN",
      head: currentHead,
      authorized_base_ancestor: true,
      review_base_ancestor: true
    },
    changedPaths: ["scripts/validate-traceability.mjs"],
    reviewBaseSha
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.source.authorized_base_sha, baseSha)
  assert.equal(report.source.review_base_sha, reviewBaseSha)
  assert.equal(report.scope_validation.authorized_base_sha, baseSha)
  assert.equal(report.scope_validation.review_base_sha, reviewBaseSha)
})

test("unavailable review-base diff requires authoritative PR scope readback", () => {
  const currentHead = "1111111111111111111111111111111111111111"
  const report = validateTraceability({
    root: makeFixture(),
    currentHead,
    gitBinding: {
      status: "CLEAN",
      head: currentHead,
      authorized_base_ancestor: null,
      review_base_ancestor: null
    },
    changedPaths: null,
    reviewBaseSha: "84db3db95aa596eb317b71c4eea0926fc1fc15ce"
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.receipt_eligible, false)
  assert.equal(report.scope_validation.git_diff_audited, false)
  assert.equal(report.scope_validation.status, "EXTERNAL_READBACK_REQUIRED")
  assert.match(report.warnings.join("\n"), /review-base path diff was not available/)
})

for (const taskId of ["T086", "T098", "T097"]) {
  test(`${taskId} checkbox cannot move outside the authorized T085 frontier`, () => {
    const root = makeFixture(({ contract, files }) => {
      const shouldCheck = taskId !== "T097"
      files[`${featurePath}/tasks.md`] = files[`${featurePath}/tasks.md`].replace(
        new RegExp(`^- \\[[ x]\\] ${taskId} fixture$`, "m"),
        `- [${shouldCheck ? "x" : " "}] ${taskId} fixture`
      )
      contract.task_ledger.find(({ id }) => id === taskId).status = shouldCheck
        ? "COMPLETE"
        : "OPEN"
      contract.source_inventory.tasks_checked += shouldCheck ? 1 : -1
      contract.source_inventory.tasks_unchecked += shouldCheck ? -1 : 1
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), new RegExp(`${taskId} checkbox is outside`))
  })
}

test("receipt labels cannot turn repository prose into human acceptance", () => {
  const root = makeFixture(({ contract }) => {
    const row = contract.requirements.find(({ id }) => id === "SC-001")
    row.proofs[0] = {
      id: "P_FAKE_HUMAN",
      kind: "HUMAN_RECEIPT",
      path: `${featurePath}/spec.md`,
      selector: "SC-001",
      source_head: "1111111111111111111111111111111111111111"
    }
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /tracked JSON receipt under \.loop\/evidence/)
})

test("all requirements cannot be vacuously mapped only to T001", () => {
  const root = makeFixture(({ contract }) => {
    for (const row of contract.requirements) row.task_ids = ["T001"]
    for (const row of contract.task_ledger) {
      row.requirement_ids = row.id === "T001" ? contract.requirements.map(({ id }) => id) : []
      if (row.requirement_ids.length === 0) row.orphan_reason = "forged orphan"
    }
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /T002.*not an approved orphan/)
})

test("dirty head binding cannot produce an attributable PASS", () => {
  const root = makeFixture()
  const report = validateTraceability({
    root,
    currentHead: "1111111111111111111111111111111111111111",
    gitBinding: {
      status: "UNTRACKED_OR_DIRTY",
      head: "1111111111111111111111111111111111111111"
    },
    changedPaths: []
  })
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /working tree is not bound/)
})

test("missing head and missing CI exact-head evidence fail closed", () => {
  const root = makeFixture()
  const missingHead = validateTraceability({
    root,
    currentHead: null,
    gitBinding: { status: "CLEAN", head: null },
    changedPaths: []
  })
  assert.equal(missingHead.status, "FAIL")
  assert.match(missingHead.errors.join("\n"), /currentHead must be a full lowercase commit SHA/)

  const missingArtifact = validateTraceability({
    root,
    currentHead: "1111111111111111111111111111111111111111",
    gitBinding: {
      status: "CLEAN",
      head: "1111111111111111111111111111111111111111"
    },
    changedPaths: [],
    requireExactHeadEvidence: true
  })
  assert.equal(missingArtifact.status, "FAIL")
  assert.match(missingArtifact.errors.join("\n"), /requires artifacts\/exact-head\.json/)
})

test("exact-base changed paths reject files outside bounded T085 scope", () => {
  const root = makeFixture()
  const report = validateTraceability({
    root,
    currentHead: "1111111111111111111111111111111111111111",
    gitBinding: {
      status: "CLEAN",
      head: "1111111111111111111111111111111111111111"
    },
    changedPaths: [".github/workflows/release.yml"]
  })
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /outside the authorized T085 scope/)
})

test("completion phase is rejected until a separately authorized receipt verifier exists", () => {
  const root = makeFixture(({ contract }) => {
    contract.lifecycle.phase = "T085_ACCEPTED"
    contract.lifecycle.t085_complete = true
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /only accepts lifecycle\.phase T085_IMPLEMENTATION/)
})

test("a frozen contract accepts only a receipt-bound one-line T085 checkbox transition", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture)

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.mode, "T085_RECEIPT_CANDIDATE")
  assert.equal(report.receipt_eligible, true)
  assert.equal(report.scope_boundaries.t086_dispatched, false)
  assert.equal(report.completion_receipt.implementation_head_sha, fixtureImplementationHead)
  assert.equal(report.completion_receipt.implementation_merge_sha, fixtureImplementationMerge)
  assert.equal(report.completion_receipt.receipt_base_sha, fixtureReceiptBase)
})

test("completed T085 permits unrelated post-receipt work without replaying the transition", () => {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = ["docs/research/post-receipt.md"]
  const report = runCompletedFixture(fixture)

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.mode, "T085_COMPLETE_STEADY")
  assert.equal(report.receipt_eligible, false)
  assert.deepEqual(report.scope_validation.changed_paths, ["docs/research/post-receipt.md"])
  assert.equal(report.scope_boundaries.t086_dispatched, false)
})

for (const changedPath of [
  "android/app/src/main/java/com/courtside/tw/Runtime.kt",
  ".github/workflows/deploy.yml",
  "backend/src/main/java/com/courtside/tw/ProviderConfig.java",
  "web3/activate.ts"
]) {
  test(`completed T085 rejects non-research activation path ${changedPath}`, () => {
    const fixture = makeCompletedFixture()
    fixture.changedPaths = [changedPath]
    const report = runCompletedFixture(fixture)

    assert.equal(report.status, "FAIL")
    assert.equal(report.receipt_eligible, false)
    assert.match(
      report.errors.join("\n"),
      /changed path is outside the authorized post-T085 research-documentation scope/
    )
  })
}

test("completed T085 keeps T086 dispatch paths blocked until validator evolution", () => {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = [".loop/evidence/t086-dispatch.json"]
  const report = runCompletedFixture(fixture)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /changed path requires separately authorized T086 validator evolution/
  )
})

for (const [name, mutate, expected] of [
  [
    "completion receipt drift",
    ({ receiptPath }) => {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"))
      receipt.accepted_by = "different-fixture-release-owner"
      fs.writeFileSync(receiptPath, JSON.stringify(receipt))
    },
    /completed T085 must preserve the base completion receipt byte-for-byte/
  ],
  [
    "completion receipt removal",
    ({ receiptPath }) => {
      fs.unlinkSync(receiptPath)
    },
    /completed T085 must preserve the base completion receipt byte-for-byte/
  ],
  [
    "tasks drift",
    ({ tasksPath }) => {
      fs.appendFileSync(tasksPath, "\nunauthorized completed-state prose\n")
    },
    /completed T085 must preserve base tasks\.md byte-for-byte/
  ],
  [
    "traceability drift",
    ({ traceabilityPath }) => {
      fs.appendFileSync(traceabilityPath, "\nunauthorized completed-state prose\n")
    },
    /completed T085 must preserve the frozen traceability contract byte-for-byte/
  ]
]) {
  test(`completed T085 rejects ${name}`, () => {
    const fixture = makeCompletedFixture(mutate)
    const report = runCompletedFixture(fixture)

    assert.equal(report.status, "FAIL")
    assert.equal(report.receipt_eligible, false)
    assert.match(report.errors.join("\n"), expected)
  })
}

test("completed T085 rejects a checked-to-unchecked checkbox rollback", () => {
  const fixture = makeCompletedFixture(({ tasksPath }) => {
    const tasks = fs.readFileSync(tasksPath, "utf8")
    fs.writeFileSync(tasksPath, tasks.replace(/^- \[x\] T085\b/m, "- [ ] T085"))
  })
  const report = runCompletedFixture(fixture)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /T085 checkbox cannot roll back after completion/)
})

test("completed T085 fails closed when its base receipt cannot be read", () => {
  const fixture = makeCompletedFixture()
  const report = runCompletedFixture(fixture, { changeBaseCompletionReceiptText: null })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /completed T085 requires a readable completion receipt at the audited base/
  )
})

test("receipt mode rejects a deviation-resolution drift blessed by a self-declared digest", () => {
  const fixture = makeReceiptFixture()
  const traceabilityPath = path.join(fixture.root, featurePath, "traceability.md")
  const receiptPath = path.join(fixture.root, completionReceiptPath)
  const contract = extractContract(fs.readFileSync(traceabilityPath, "utf8"))
  contract.deviations[0].state = "RESOLVED"
  const driftedTraceability = markdown(contract)
  fixture.changeBaseTraceabilityText = driftedTraceability
  fs.writeFileSync(traceabilityPath, driftedTraceability)
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"))
  receipt.traceability_sha256 = sha256(driftedTraceability)
  receipt.deviation_snapshot = {
    total: 1,
    open: 0,
    accepted: 0,
    resolved: 1,
    open_ids: []
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt))

  const report = runReceiptFixture(fixture)
  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /traceability must match the accepted implementation snapshot/
  )
})

test("receipt mode rejects pre-receipt tasks drift blessed by a self-declared digest", () => {
  const fixture = makeReceiptFixture()
  const tasksPath = path.join(fixture.root, featurePath, "tasks.md")
  const receiptPath = path.join(fixture.root, completionReceiptPath)
  const driftedPendingTasks = `${fixture.changeBaseTasksText}\nunauthorized base prose\n`
  const driftedCompletedTasks = driftedPendingTasks.replace(/^- \[ \] T085\b/m, "- [x] T085")
  fixture.changeBaseTasksText = driftedPendingTasks
  fs.writeFileSync(tasksPath, driftedCompletedTasks)
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"))
  receipt.tasks_before_sha256 = sha256(driftedPendingTasks)
  fs.writeFileSync(receiptPath, JSON.stringify(receipt))

  const report = runReceiptFixture(fixture)
  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /tasks must match the accepted implementation snapshot/)
})

for (const ancestry of [false, null]) {
  test(`receipt mode fails closed when implementation-merge ancestry is ${ancestry}`, () => {
    const fixture = makeReceiptFixture()
    const report = runReceiptFixture(fixture, {
      implementationMergeAncestorOfChangeBase: ancestry
    })

    assert.equal(report.status, "FAIL")
    assert.equal(report.receipt_eligible, false)
    assert.match(
      report.errors.join("\n"),
      /completion receipt implementation_merge_sha must be an ancestor of receipt_base_sha/
    )
  })
}

test("receipt mode rejects a multi-commit candidate even when its net diff is exact", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, {
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_ref: "fixture:trusted-base",
      change_base_sha: fixtureReceiptBase,
      change_base_ancestor: true,
      head_parent_sha: "6".repeat(40),
      head_parent_count: 1
    }
  })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /receipt candidate head parent must equal receipt_base_sha/
  )
})

test("receipt mode rejects a merge-commit candidate even when first parent and net diff are exact", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, {
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_ref: "fixture:trusted-base",
      change_base_sha: fixtureReceiptBase,
      change_base_ancestor: true,
      head_parent_sha: fixtureReceiptBase,
      head_parent_count: 2
    }
  })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /receipt candidate head must have exactly one parent/)
})

test("receipt mode cannot become eligible without trusted Git binding", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, { gitBinding: null })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /receipt candidate requires trusted audited Git binding/)
})

test("receipt candidate is not eligible without current-head exact-head evidence", () => {
  const fixture = makeReceiptFixture()
  fs.unlinkSync(path.join(fixture.root, "artifacts/exact-head.json"))
  const report = runReceiptFixture(fixture, { requireExactHeadEvidence: false })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.mode, "T085_RECEIPT_CANDIDATE")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.warnings.join("\n"),
    /receipt candidate requires current-head exact-head evidence before it is eligible/
  )
})

test("local structural exact-head evidence cannot make a receipt candidate authoritative", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, { requireExactHeadEvidence: false })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.warnings.join("\n"),
    /receipt candidate exact-head evidence is not authoritative outside the required CI mode/
  )
})

test("generic CI context cannot make a receipt candidate authoritative", () => {
  const fixture = makeReceiptFixture()
  const githubActionsContext =
    typeof traceabilityValidator.inspectGitHubActionsContext === "function"
      ? traceabilityValidator.inspectGitHubActionsContext({
          environment: { CI: "true" },
          gitBinding: {
            head: fixtureReceiptHead,
            change_base_sha: fixtureReceiptBase,
            change_base_ancestor: true
          }
        })
      : null
  const report = runReceiptFixture(fixture, { githubActionsContext })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /authoritative receipt validation requires authenticated GitHub Actions context/
  )
})

test("receipt candidate rejects self-supplied Actions artifact metadata", () => {
  const fixture = makeReceiptFixture()
  const exactHeadPath = path.join(fixture.root, "artifacts/exact-head.json")
  const exactHead = JSON.parse(fs.readFileSync(exactHeadPath, "utf8"))
  exactHead.github_run_id = "99999999999"
  fs.writeFileSync(exactHeadPath, JSON.stringify(exactHead))
  const report = runReceiptFixture(fixture)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /artifacts\/exact-head\.json metadata must match the authenticated GitHub Actions context/
  )
})

test("receipt candidate rejects a receipt that was already present at its audited base", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, {
    changeBaseCompletionReceiptText: JSON.stringify({ staged: true })
  })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /receipt candidate base must not already contain a completion receipt/
  )
})

test("a checked T085 without its structured completion receipt fails closed", () => {
  const root = makeFixture(({ files }) => {
    files[`${featurePath}/tasks.md`] = files[`${featurePath}/tasks.md`].replace(
      /^- \[ \] T085\b/m,
      "- [x] T085"
    )
  })
  const report = run(root)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /checked T085 requires a structured completion receipt/)
})

test("implementation mode rejects a staged completion receipt", () => {
  const root = makeFixture(({ files }) => {
    files[completionReceiptPath] = JSON.stringify({
      schema_version: completionReceiptSchema,
      task: "T085"
    })
  })
  const report = run(root)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /unchecked T085 must not stage a completion receipt/)
})

for (const [name, mutate, expected] of [
  [
    "an unknown receipt schema",
    ({ receipt }) => {
      receipt.schema_version = "courtside-t085-completion-receipt/v0"
    },
    /completion receipt schema_version must be courtside-t085-completion-receipt\/v1/
  ],
  [
    "an automated actor",
    ({ receipt }) => {
      receipt.actor_type = "AGENT"
    },
    /completion receipt actor_type must be HUMAN/
  ],
  [
    "an impossible calendar timestamp",
    ({ receipt }) => {
      receipt.recorded_at = "2026-02-30T00:00:00Z"
    },
    /completion receipt recorded_at must be an ISO-8601 UTC timestamp/
  ],
  [
    "an untrusted receipt owner",
    ({ receipt }) => {
      receipt.accepted_by = "branch-author"
    },
    /completion receipt accepted_by must equal the authorized repository owner/
  ],
  [
    "an unpinned receipt authorization",
    ({ receipt }) => {
      receipt.authorization_ref = "self-declared-authorization"
    },
    /completion receipt authorization_ref must equal the pinned owner authorization/
  ],
  ...[
    ["implementation_head_sha", "missing", undefined],
    ["implementation_head_sha", "invalid", "A".repeat(40)],
    ["implementation_merge_sha", "missing", undefined],
    ["implementation_merge_sha", "invalid", "A".repeat(40)],
    ["receipt_base_sha", "missing", undefined],
    ["receipt_base_sha", "invalid", "A".repeat(40)]
  ].map(([field, condition, value]) => [
    `a ${condition} ${field}`,
    ({ receipt }) => {
      if (condition === "missing") delete receipt[field]
      else receipt[field] = value
    },
    new RegExp(`completion receipt ${field} must be a full lowercase commit SHA`)
  ]),
  [
    "a self-consistent unaccepted implementation head",
    ({ receipt }) => {
      receipt.implementation_head_sha = "6".repeat(40)
      receipt.gates.ci.source_head_sha = receipt.implementation_head_sha
      receipt.gates.security.source_head_sha = receipt.implementation_head_sha
      receipt.gates.exact_head_artifacts.source_head_sha = receipt.implementation_head_sha
      receipt.gates.exact_head_artifacts.expected_source_head = receipt.implementation_head_sha
      receipt.gates.protected_merge.expected_head_sha = receipt.implementation_head_sha
    },
    /completion receipt implementation_head_sha must equal the accepted PR149 head/
  ],
  [
    "a self-consistent unaccepted implementation merge",
    ({ receipt }) => {
      receipt.implementation_merge_sha = "7".repeat(40)
      receipt.gates.protected_merge.merge_commit_sha = receipt.implementation_merge_sha
    },
    /completion receipt implementation_merge_sha must equal the accepted PR149 merge/
  ],
  [
    "a self-consistent fabricated CI run",
    ({ receipt }) => {
      receipt.gates.ci.run_id = 1
    },
    /completion receipt CI run must equal the accepted PR149 run 33226451857/
  ],
  [
    "a self-consistent fabricated Security run",
    ({ receipt }) => {
      receipt.gates.security.run_id = 1
    },
    /completion receipt Security run must equal the accepted PR149 run 33226451860/
  ],
  [
    "an implementation scope with a dropped path",
    ({ receipt }) => {
      receipt.implementation_scope.changed_paths.pop()
      receipt.implementation_scope.changed_files -= 1
    },
    /completion receipt implementation_scope must bind the exact accepted PR149 paths/
  ],
  [
    "an implementation scope with an extra path",
    ({ receipt }) => {
      receipt.implementation_scope.changed_paths.push("forged.txt")
      receipt.implementation_scope.changed_files += 1
    },
    /completion receipt implementation_scope must bind the exact accepted PR149 paths/
  ],
  [
    "an implementation scope with a false path count",
    ({ receipt }) => {
      receipt.implementation_scope.changed_files = 12
    },
    /completion receipt implementation_scope.changed_files must be 13/
  ],
  [
    "an implementation scope with a false check topology",
    ({ receipt }) => {
      receipt.implementation_scope.required_checks = "13/14"
    },
    /completion receipt implementation_scope.required_checks must be 14\/14/
  ],
  [
    "an unaccepted frontend artifact ID",
    ({ receipt }) => {
      receipt.gates.exact_head_artifacts.artifact_id = 1
    },
    /completion receipt exact-head artifacts must bind accepted PR149 artifact 9707044002/
  ],
  ...[
    ["github_archive_sha256", fixtureFrontendArchiveSha256],
    ["exact_head_sha256", fixtureExactHeadArtifactSha256],
    ["traceability_report_sha256", fixtureTraceabilityReportSha256]
  ].map(([field]) => [
    `an unaccepted exact-head artifact ${field}`,
    ({ receipt }) => {
      receipt.gates.exact_head_artifacts[field] = "0".repeat(64)
    },
    /completion receipt exact-head artifact digests must match accepted PR149 evidence/
  ]),
  [
    "an unaccepted exact-head artifact run topology",
    ({ receipt }) => {
      receipt.gates.exact_head_artifacts.run_number = 981
      receipt.gates.exact_head_artifacts.run_attempt = 2
    },
    /completion receipt exact-head artifact run must be PR149 CI run 982 attempt 1/
  ],
  [
    "a non-green Security gate",
    ({ receipt }) => {
      receipt.gates.security.result = "FAIL"
    },
    /completion receipt security gate must be exact-head PASS 8\/8/
  ],
  [
    "CI evidence from another head",
    ({ receipt }) => {
      receipt.gates.ci.source_head_sha = "4".repeat(40)
    },
    /completion receipt CI gate must be exact-head PASS 5\/5/
  ],
  [
    "an unresolved review thread",
    ({ receipt }) => {
      receipt.gates.review_threads.unresolved = 1
    },
    /completion receipt requires zero unresolved review threads/
  ],
  [
    "a forged traceability digest",
    ({ receipt }) => {
      receipt.traceability_sha256 = "0".repeat(64)
    },
    /completion receipt must bind the frozen traceability contract/
  ],
  [
    "a drifted deviation snapshot",
    ({ receipt }) => {
      receipt.deviation_snapshot.open_ids = []
    },
    /completion receipt deviation snapshot must exactly preserve the contract/
  ],
  [
    "a T086 dispatch claim",
    ({ receipt }) => {
      receipt.scope_boundaries.t086_dispatched = true
    },
    /completion receipt scope_boundaries\.t086_dispatched must remain false/
  ],
  [
    "a different receipt base",
    ({ receipt }) => {
      receipt.receipt_base_sha = "5".repeat(40)
    },
    /completion receipt receipt_base_sha must equal the audited change base/
  ],
  [
    "a conflated implementation merge and receipt base",
    ({ receipt }) => {
      receipt.implementation_merge_sha = receipt.receipt_base_sha
      receipt.gates.protected_merge.merge_commit_sha = receipt.implementation_merge_sha
    },
    /completion receipt must not conflate implementation_merge_sha with receipt_base_sha/
  ],
  [
    "a protected-merge gate bound to the receipt base",
    ({ receipt }) => {
      receipt.gates.protected_merge.merge_commit_sha = receipt.receipt_base_sha
    },
    /completion receipt protected merge must bind the implementation head and merge SHAs/
  ],
  [
    "an unrelated changed path",
    ({ changedPaths }) => {
      changedPaths.push(`${featurePath}/spec.md`)
    },
    /receipt candidate may change only tasks\.md and its completion receipt/
  ],
  [
    "an extra tasks prose edit",
    ({ files }) => {
      files[`${featurePath}/tasks.md`] = files[`${featurePath}/tasks.md`].replace(
        "T085 fixture",
        "T085 forged prose"
      )
    },
    /receipt candidate tasks\.md change must be exactly the T085 checkbox/
  ]
]) {
  test(`receipt mode rejects ${name}`, () => {
    const fixture = makeReceiptFixture(mutate)
    const report = runReceiptFixture(fixture)

    assert.equal(report.status, "FAIL")
    assert.equal(report.receipt_eligible, false)
    assert.match(report.errors.join("\n"), expected)
  })
}

test("repository proof selectors must resolve to one unambiguous literal location", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/generic-proof.test.js"
    contract.requirements[0].proofs[0].selector = "import "
    files["tests/generic-proof.test.js"] = "import first\nimport second\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must occur exactly once/)
})

test("repository proof selectors must identify an executable test anchor", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/generic-proof.test.js"
    contract.requirements[0].proofs[0].selector = "node:test"
    files["tests/generic-proof.test.js"] = 'import test from "node:test"\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [modifier, source] of [
  ["skip", 'test.skip("fixture-proof", () => {})\n'],
  ["todo", 'it.todo("fixture-proof")\n'],
  ["failing", 'test.failing("fixture-proof", () => {})\n']
]) {
  test(`${modifier} JavaScript tests cannot serve as executable proof anchors`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/disabled-proof.test.js"
      files["tests/disabled-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("parameterized JavaScript tests remain executable proof anchors", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/parameterized-proof.test.js"
    files["tests/parameterized-proof.test.js"] = 'test.each([[1]])("fixture-proof %s", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [commentStyle, source] of [
  ["line-commented", '// test("fixture-proof", () => {})\n'],
  ["block-commented", '/* test("fixture-proof", () => {}) */\n'],
  ["multiline-block-commented", '/*\ntest("fixture-proof", () => {})\n*/\n']
]) {
  test(`${commentStyle} JavaScript anchors cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/commented-proof.test.js"
      files["tests/commented-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("overlapping selector locations are rejected as ambiguous", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/overlapping-proof.test.js"
    contract.requirements[0].proofs[0].selector = "aaaaaa"
    files["tests/overlapping-proof.test.js"] = 'test("aaaaaaa", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must occur exactly once/)
})

test("human deviation register cannot drift from the machine contract", () => {
  const root = makeFixture()
  const traceabilityPath = path.join(root, featurePath, "traceability.md")
  const traceability = fs.readFileSync(traceabilityPath, "utf8")
  fs.writeFileSync(
    traceabilityPath,
    traceability.replace("| DEV-T085-999 | PLANNED_FIXTURE", "| DEV-T085-998 | PLANNED_FIXTURE")
  )

  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /human-readable deviation register/)
})

test("human deviation disposition and target must match the machine contract", () => {
  const root = makeFixture()
  const traceabilityPath = path.join(root, featurePath, "traceability.md")
  const traceability = fs.readFileSync(traceabilityPath, "utf8")
  fs.writeFileSync(
    traceabilityPath,
    traceability.replace(
      "keep the fixture bounded Target: fixture follow-up.",
      "silently broaden fixture scope. Target: immediate release."
    )
  )

  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /human-readable deviation DEV-T085-999/)
})

test("deviation affected FR and SC IDs require reciprocal requirement links", () => {
  const root = makeFixture(({ contract }) => {
    contract.deviations[0].affected_ids.push("FR-001")
    contract.requirements.find(({ id }) => id === "SC-001").deviation_ids = []
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /DEV-T085-999 affects FR-001/)
  assert.match(report.errors.join("\n"), /DEV-T085-999 affects SC-001/)
})

for (const [boundary, mutate] of [
  ["authorized scope", (dispatch) => dispatch.authorized.push("unbounded runtime work")],
  ["forbidden scope", (dispatch) => dispatch.forbidden.pop()],
  ["task frontier", (dispatch) => (dispatch.base.t086_complete = true)],
  ["source inventory", (dispatch) => (dispatch.inventory.checked_tasks = 86)],
  ["tests-first claim", (dispatch) => (dispatch.tests_first.red_claim = "forged")],
  ["terminal policy", (dispatch) => (dispatch.terminal_policy = "auto-merge")]
]) {
  test(`dispatch ${boundary} remains immutable`, () => {
    const root = makeFixture(({ files }) => {
      const dispatch = JSON.parse(files[".loop/evidence/t085-dispatch.json"])
      mutate(dispatch)
      files[".loop/evidence/t085-dispatch.json"] = JSON.stringify(dispatch)
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /dispatch authority must match the immutable T085 receipt/
    )
  })
}

test("pending T085 rejects a T086 dispatch even after traceability reaches main", () => {
  const root = makeFixture()
  const currentMain = initializeGitFixture(root)
  git(root, "update-ref", "refs/remotes/origin/main", currentMain)
  git(root, "switch", "-c", "forbidden-t086-dispatch")
  const t086DispatchPath = path.join(root, ".loop/evidence/t086-dispatch.json")
  fs.writeFileSync(t086DispatchPath, "{}\n")
  git(root, "add", ".loop/evidence/t086-dispatch.json")
  git(root, "commit", "-m", "attempt T086 dispatch")

  assert.equal(typeof traceabilityValidator.inspectGit, "function")
  const inspection = traceabilityValidator.inspectGit(root, { environment: {} })
  assert.equal(inspection.change_base_sha, currentMain)
  assert.equal(inspection.bounded_scope_active, false)
  assert.deepEqual(inspection.changedPaths, [".loop/evidence/t086-dispatch.json"])

  const report = run(root, {
    currentHead: inspection.head,
    gitBinding: inspection,
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    changeBaseTasksText: inspection.change_base_tasks_text,
    changeBaseTraceabilityText: inspection.change_base_traceability_text,
    boundedScopeActive: inspection.bounded_scope_active
  })
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /outside the authorized T085 receipt-support scope: \.loop\/evidence\/t086-dispatch\.json/
  )
  assert.equal(report.scope_validation.bounded_scope_active, false)
})

test("pending T085 permits a support change from the frozen implementation allowlist", () => {
  const root = makeFixture()
  const currentMain = initializeGitFixture(root)
  git(root, "update-ref", "refs/remotes/origin/main", currentMain)
  git(root, "switch", "-c", "receipt-validator-support")
  const validatorPath = path.join(root, "scripts/validate-traceability.mjs")
  fs.mkdirSync(path.dirname(validatorPath), { recursive: true })
  fs.writeFileSync(validatorPath, "// receipt support fixture\n")
  git(root, "add", "scripts/validate-traceability.mjs")
  git(root, "commit", "-m", "add receipt validator support")

  const inspection = traceabilityValidator.inspectGit(root, { environment: {} })
  const report = run(root, {
    currentHead: inspection.head,
    gitBinding: inspection,
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    changeBaseTasksText: inspection.change_base_tasks_text,
    changeBaseTraceabilityText: inspection.change_base_traceability_text,
    boundedScopeActive: inspection.bounded_scope_active
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.deepEqual(inspection.changedPaths, ["scripts/validate-traceability.mjs"])
})

for (const changedPath of [
  ".github/workflows/ci.yml",
  ".loop/evidence/t085-review.json",
  "package.json",
  `${featurePath}/plan.md`
]) {
  test(`post-implementation pending mode rejects non-support path ${changedPath}`, () => {
    const root = makeFixture()
    const report = run(root, {
      changedPaths: [changedPath],
      changeBaseSha: fixtureReceiptBase,
      changeBaseTasksText: fs.readFileSync(path.join(root, featurePath, "tasks.md"), "utf8"),
      changeBaseTraceabilityText: fs.readFileSync(
        path.join(root, featurePath, "traceability.md"),
        "utf8"
      ),
      boundedScopeActive: false
    })

    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /outside the authorized T085 receipt-support scope/)
  })
}

test("legacy pre-implementation pending mode retains the original 13-path allowlist", () => {
  const root = makeFixture()
  const report = run(root, {
    changedPaths: [".github/workflows/ci.yml"],
    changeBaseSha: fixtureReceiptBase,
    changeBaseTasksText: fs.readFileSync(path.join(root, featurePath, "tasks.md"), "utf8"),
    changeBaseTraceabilityText: null,
    boundedScopeActive: true
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("an advanced base without the T085 artifact keeps the bounded scope active", () => {
  const root = makeFixture()
  const traceabilityPath = path.join(root, featurePath, "traceability.md")
  const traceability = fs.readFileSync(traceabilityPath, "utf8")
  fs.unlinkSync(traceabilityPath)
  const advancedBase = initializeGitFixture(root)
  git(root, "update-ref", "refs/remotes/origin/main", advancedBase)
  git(root, "switch", "-c", "t085-rebased")
  fs.writeFileSync(traceabilityPath, traceability)
  fs.writeFileSync(path.join(root, "future.txt"), "unbounded work\n")
  git(root, "add", ".")
  git(root, "commit", "-m", "implement T085 with scope drift")

  const inspection = traceabilityValidator.inspectGit(root, { environment: {} })
  assert.equal(inspection.change_base_sha, advancedBase)
  assert.equal(inspection.bounded_scope_active, true)
  const report = validateTraceability({
    root,
    currentHead: inspection.head,
    gitBinding: inspection,
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    boundedScopeActive: inspection.bounded_scope_active
  })
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /outside the authorized T085 scope: future\.txt/)
})

test("shallow pull-request inspection fails closed when the event base object is absent", () => {
  const root = makeFixture()
  const currentMain = initializeGitFixture(root)
  git(root, "update-ref", "refs/remotes/origin/main", currentMain)
  git(root, "switch", "-c", "pull-request")
  fs.writeFileSync(path.join(root, "future.txt"), "future work\n")
  git(root, "add", "future.txt")
  git(root, "commit", "-m", "future work")
  const eventRoot = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-event-"))
  const eventPath = path.join(eventRoot, "event.json")
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: "f".repeat(40) } } }))

  const inspection = traceabilityValidator.inspectGit(root, {
    environment: { GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: eventPath }
  })
  assert.equal(inspection.change_base_sha, null)
  assert.equal(inspection.changedPaths, null)
  const report = validateTraceability({
    root,
    currentHead: inspection.head,
    gitBinding: inspection,
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    boundedScopeActive: inspection.bounded_scope_active,
    requireAuditedScope: true
  })
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /CI validation requires an audited current-change diff/)
})

test("pull-request inspection rejects a head that does not contain the exact event base", () => {
  const root = makeFixture()
  initializeGitFixture(root)
  git(root, "switch", "-c", "stale-receipt-support")
  const validatorPath = path.join(root, "scripts/validate-traceability.mjs")
  fs.mkdirSync(path.dirname(validatorPath), { recursive: true })
  fs.writeFileSync(validatorPath, "// stale receipt support\n")
  git(root, "add", "scripts/validate-traceability.mjs")
  git(root, "commit", "-m", "stale receipt support")
  git(root, "switch", "main")
  fs.writeFileSync(path.join(root, "protected-main-advance.txt"), "protected main advanced\n")
  git(root, "add", "protected-main-advance.txt")
  git(root, "commit", "-m", "advance protected main")
  const liveEventBase = git(root, "rev-parse", "HEAD")
  git(root, "switch", "stale-receipt-support")

  const eventRoot = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-event-"))
  const eventPath = path.join(eventRoot, "event.json")
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: liveEventBase } } }))
  const inspection = traceabilityValidator.inspectGit(root, {
    environment: { GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: eventPath }
  })

  assert.equal(inspection.change_base_sha, liveEventBase)
  assert.equal(inspection.change_base_ancestor, false)
  const report = run(root, {
    currentHead: inspection.head,
    gitBinding: inspection,
    changedPaths: inspection.changedPaths,
    changeBaseSha: inspection.change_base_sha,
    changeBaseTasksText: inspection.change_base_tasks_text,
    changeBaseTraceabilityText: inspection.change_base_traceability_text,
    boundedScopeActive: inspection.bounded_scope_active,
    requireAuditedScope: true
  })
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /audited change base is not an ancestor/)
})

test("push inspection uses event.before when origin main already points at HEAD", () => {
  const root = makeFixture()
  const before = initializeGitFixture(root)
  fs.writeFileSync(path.join(root, "future.txt"), "future work\n")
  git(root, "add", "future.txt")
  git(root, "commit", "-m", "future work")
  const head = git(root, "rev-parse", "HEAD")
  git(root, "update-ref", "refs/remotes/origin/main", head)
  const eventRoot = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-event-"))
  const eventPath = path.join(eventRoot, "event.json")
  fs.writeFileSync(eventPath, JSON.stringify({ before }))

  const inspection = traceabilityValidator.inspectGit(root, {
    environment: { GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: eventPath }
  })
  assert.equal(inspection.change_base_sha, before)
  assert.equal(inspection.change_base_ancestor, true)
  assert.deepEqual(inspection.changedPaths, ["future.txt"])
})

test("composite VERIFIED rows retain clause-complete semantic proof", () => {
  const contract = extractContract(
    fs.readFileSync(path.join(repositoryRoot, featurePath, "traceability.md"), "utf8")
  )
  const byId = new Map(contract.requirements.map((row) => [row.id, row]))
  const selectors = (id) => byId.get(id).proofs.map((proof) => proof.selector)

  assert.deepEqual(selectors("FR-003"), [
    "returnsSafeProblemDetailsForUnknownWithdrawnAndInvalidPublicRequests",
    "listsOnlyPublishedRightsValidIssuesWithBoundedOpaqueKeysetPaginationAndEtags",
    "returnsVisibleSectionsAndArticlesInEditorOrderWithoutDraftMetadata",
    "rejectsAFuturePublishedIssueInsteadOfLeakingScheduledMetadata",
    "deniesDraftWithdrawnHistoricalAndPrivateRightsContent"
  ])
  assert.equal(byId.get("FR-009").evidence_state, "PARTIAL")
  assert.deepEqual(byId.get("FR-009").deviation_ids, ["DEV-T085-039"])
  assert.deepEqual(selectors("FR-013"), [
    "editorSubmitsAndPublisherApprovesOnlyAfterRightsAreReady",
    "publisherCanScheduleThenPublishOnlyWhenDue",
    "publishedCanArchiveDirectly",
    "publisherCanScheduleAndPublishAnApprovedIssue"
  ])
  assert.equal(byId.get("FR-013").implementation_state, "PLANNED")
  assert.equal(byId.get("FR-013").evidence_state, "PARTIAL")
  assert.deepEqual(byId.get("FR-013").deviation_ids, ["DEV-T085-040"])
})

test("reviewed multi-clause rows remain partial until every MUST clause has attributable proof", () => {
  const contract = extractContract(
    fs.readFileSync(path.join(repositoryRoot, featurePath, "traceability.md"), "utf8")
  )
  const byId = new Map(contract.requirements.map((row) => [row.id, row]))

  for (const [id, deviationId] of [
    ["FR-001", "DEV-T085-041"],
    ["FR-014", "DEV-T085-042"],
    ["FR-016", "DEV-T085-043"],
    ["FR-023", "DEV-T085-044"],
    ["FR-031", "DEV-T085-045"],
    ["FR-032", "DEV-T085-046"],
    ["FR-048", "DEV-T085-047"]
  ]) {
    assert.equal(byId.get(id).evidence_state, "PARTIAL", `${id} must not remain VERIFIED`)
    assert.deepEqual(byId.get(id).deviation_ids, [deviationId])
    assert.equal(
      byId.get(id).release_impact,
      "BLOCKS_T086_UNLESS_ADJUDICATED",
      `${id} must preserve the later-gate impact`
    )
  }

  assert.deepEqual(
    byId.get("FR-015").proofs.map((proof) => proof.selector),
    [
      "publisherSchedulePersistsAsiaTaipeiLocalTimeAsUtc",
      "publisherCanWithdrawThenArchiveWithoutDeletingThePublishedEvidence"
    ]
  )
  assert.deepEqual(
    byId.get("FR-014").proofs.map((proof) => proof.selector),
    [
      "roleBoundariesRejectEditorApprovalAndPublisherSubmission",
      "publisherCanWithdrawThenArchiveWithoutDeletingThePublishedEvidence"
    ]
  )
  assert.deepEqual(
    byId.get("FR-016").proofs.map((proof) => proof.selector),
    [
      "scheduledCommandIsAcknowledgedIdempotentlyByTheWorker",
      "publisherCanScheduleAndPublishAnApprovedIssue"
    ]
  )
  assert.deepEqual(
    byId.get("FR-023").proofs.map((proof) => proof.selector),
    [
      "missingRecordBlocksWithStableCode",
      "expiredRecordBlocksBeforeItCanBeUsed",
      "revokedRecordWinsOverOtherRecords",
      "activeRecordForAnotherChannelBlocksWithWrongChannel",
      "missingRightsBlocksSubmitWithoutAdvancingVersionAndKeepsAssetId",
      "dueWorkerRechecksRightsAndBlocksWithoutPublishingOrCreatingSnapshot",
      "expiredRightsAtExecutionBlocksWithoutPublishing"
    ]
  )
  assert.deepEqual(
    byId.get("FR-037").proofs.map((proof) => proof.selector),
    [
      "does not install a partially downloaded issue after interruption",
      "returnsABoundedVersionedManifestForAPublishedIssue",
      "shows storage, progress and expiry before removing an issue locally"
    ]
  )
  assert.deepEqual(
    byId.get("FR-040").proofs.map((proof) => proof.selector),
    [
      "rejectsEveryCanonicalInvalidFixture",
      "text rendering keeps Vue escaping and admits only bounded HTTPS or mailto links",
      "article SEO serializes hostile projection text without terminating JSON-LD"
    ]
  )
  assert.deepEqual(
    byId.get("FR-043").proofs.map((proof) => proof.selector),
    [
      "make verify 2>&1 | tee artifacts/frontend/make-verify.log",
      "pnpm --filter @courtside/web run test:e2e 2>&1 | tee artifacts/web-e2e/playwright-combined.log",
      "pnpm --filter @courtside/web run test:performance 2>&1 | tee artifacts/web-e2e/performance.log",
      "pnpm --filter @courtside/web run test:lighthouse 2>&1 | tee artifacts/web-e2e/lighthouse.log",
      "gradle --no-daemon --console=plain -p apps/api checkstyleMain spotbugsMain test 2>&1 | tee artifacts/api/gradle-quality.log"
    ]
  )
  assert.deepEqual(
    byId.get("FR-047").proofs.map((proof) => proof.selector),
    [
      "rejectsForbiddenGenerativeCanvasCapabilitiesAtRuntime",
      "acceptsAValidGenerativeCanvasPayload",
      "rejectsEveryCanonicalInvalidFixture",
      "unknown creative presets render only a dimensioned attributed fallback"
    ]
  )
})

test("ready-for-review remains an explicit release-owner gate", () => {
  const graph = fs.readFileSync(path.join(repositoryRoot, ".loop/t085-traceability.yaml"), "utf8")
  const traceability = fs.readFileSync(
    path.join(repositoryRoot, featurePath, "traceability.md"),
    "utf8"
  )

  assert.match(
    graph,
    /out:\n(?:.*\n)*?\s+- Ready-for-review, protected merge or T085 completion receipt\./
  )
  assert.doesNotMatch(graph, /a-ready-transition-v2|p-ready-readback-v2/)
  assert.doesNotMatch(graph, /current release-owner instruction authorizes ready-for-review/)
  assert.match(
    graph,
    /budgets: \{max_iterations: 9, max_minutes: 1440, max_same_failure: 2, max_graph_changes: 56, max_tokens: 220000\}/
  )
  assert.match(traceability, /does not authorize ready-for-review/)
  assert.doesNotMatch(traceability, /conditionally authorizes ready-for-review/)
  assert.match(
    traceability,
    /Dispatch authority remains fixed at `3fc14dd29b216ce46e4d364ceaec79a971dcef44`/
  )
  assert.match(traceability, /protected `main@84db3db95aa596eb317b71c4eea0926fc1fc15ce`/)
  assert.match(traceability, /`EXTERNAL_READBACK_REQUIRED`/)
})
