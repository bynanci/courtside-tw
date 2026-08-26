import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  AUTHORIZED_BASE_SHA,
  CONTRACT_END,
  CONTRACT_START,
  TRACEABILITY_SCHEMA,
  extractContract,
  validateTraceability
} from "../validate-traceability.mjs"

const baseSha = AUTHORIZED_BASE_SHA
const featurePath = "specs/001-taiwan-basketball-magazine-ebook"
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

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
        `| ${deviation.id} | ${deviation.type} | ${deviation.severity} | ${deviation.state} | ${deviation.affected_ids.join(", ")} | ${deviation.disposition} | ${deviation.release_impact} |`
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
    ".loop/evidence/t085-dispatch.json": JSON.stringify({
      schema_version: "courtside-t085-dispatch/v1",
      repository: "bynanci/courtside-tw",
      issue: "https://github.com/bynanci/courtside-tw/issues/145",
      branch: "task/t085-cross-artifact-traceability",
      base: { branch: "main", sha: baseSha }
    }),
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

function run(root) {
  return validateTraceability({
    root,
    currentHead: "1111111111111111111111111111111111111111",
    gitBinding: {
      status: "CLEAN",
      head: "1111111111111111111111111111111111111111"
    },
    changedPaths: []
  })
}

test("canonical inventory, forward mapping, reverse ledger and proof pass", () => {
  const report = run(makeFixture())
  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.counts.requirements_in_spec, 97)
  assert.equal(report.counts.tasks_in_plan, 112)
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
})
