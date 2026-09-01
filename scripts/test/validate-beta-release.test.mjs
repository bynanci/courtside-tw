import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  EXPECTED_OWNER_AUTHORIZATION,
  FROZEN_T085_TRACEABILITY_SHA256,
  REQUIRED_RELEASE_SURFACES,
  T086_AUTHORIZATION_REF,
  T086_AUTHORIZED_BASE_SHA,
  T086_AUTHORIZED_CHANGED_PATHS,
  validateBetaRelease,
  validateStabilityReceipts
} from "../validate-beta-release.mjs"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const candidateSha = "a".repeat(40)
const canonicalFiles = [
  ".github/workflows/release.yml",
  ".loop/evidence/t086-dispatch.json",
  "docs/release/beta-checklist.md",
  "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
  "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
]

function copyCanonicalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "courtside-t086-"))
  for (const relativePath of canonicalFiles) {
    const destination = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(repositoryRoot, relativePath), destination)
  }
  return root
}

function authorizationReadback(overrides = {}) {
  const contract = structuredClone(EXPECTED_OWNER_AUTHORIZATION)
  const body = [
    "<!-- t086:owner-authorization:start -->",
    "```json",
    JSON.stringify(contract, null, 2),
    "```",
    "<!-- t086:owner-authorization:end -->"
  ].join("\n")
  return {
    status: "VERIFIED",
    source: "github-api",
    html_url: T086_AUTHORIZATION_REF,
    issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/160",
    user_login: "bynanci",
    author_association: "OWNER",
    created_at: "2026-09-01T02:50:47Z",
    updated_at: "2026-09-01T02:50:47Z",
    body,
    errors: [],
    ...overrides
  }
}

function runFixture(root, overrides = {}) {
  return validateBetaRelease({
    root,
    currentHead: candidateSha,
    changeBaseSha: T086_AUTHORIZED_BASE_SHA,
    changedPaths: [...T086_AUTHORIZED_CHANGED_PATHS],
    ownerAuthorizationReadback: authorizationReadback(),
    ...overrides
  })
}

test("canonical T086 control plane passes while truthful release blockers remain HOLD", () => {
  const root = copyCanonicalFixture()
  const report = runFixture(root)

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.release_decision, "HOLD")
  assert.equal(report.authorization.status, "VERIFIED")
  assert.equal(report.base.sha, T086_AUTHORIZED_BASE_SHA)
  assert.equal(report.frozen_t085_traceability.sha256, FROZEN_T085_TRACEABILITY_SHA256)
  assert.deepEqual(report.surfaces.required, REQUIRED_RELEASE_SURFACES)
  assert.equal(report.stability.required_consecutive_runs, 20)
  assert.equal(report.blockers.traceability.length, 18)
  assert.equal(report.scope_boundaries.beta_flag_removed, false)
  assert.equal(report.scope_boundaries.t086_task_state_changed, false)
})

test("owner authorization must be an unedited GitHub OWNER comment", () => {
  const root = copyCanonicalFixture()
  for (const ownerAuthorizationReadback of [
    authorizationReadback({ author_association: "CONTRIBUTOR" }),
    authorizationReadback({ user_login: "not-bynanci" }),
    authorizationReadback({ updated_at: "2026-09-01T02:51:00Z" }),
    authorizationReadback({ status: "UNAVAILABLE", errors: ["offline"] })
  ]) {
    const report = runFixture(root, { ownerAuthorizationReadback })
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /owner authorization/u)
  }
})

test("authorization payload mutation is rejected", () => {
  const root = copyCanonicalFixture()
  const readback = authorizationReadback()
  readback.body = readback.body.replace('"beta_flag_removed": false', '"beta_flag_removed": true')
  const report = runFixture(root, { ownerAuthorizationReadback: readback })

  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /authorization contract/u)
})

test("dispatch base, frozen traceability and task frontier cannot drift", () => {
  const root = copyCanonicalFixture()
  const dispatchPath = path.join(root, ".loop/evidence/t086-dispatch.json")
  const dispatch = JSON.parse(fs.readFileSync(dispatchPath, "utf8"))
  dispatch.base.sha = "b".repeat(40)
  fs.writeFileSync(dispatchPath, `${JSON.stringify(dispatch, null, 2)}\n`)

  let report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /dispatch.*base/u)

  fs.copyFileSync(path.join(repositoryRoot, ".loop/evidence/t086-dispatch.json"), dispatchPath)
  fs.appendFileSync(
    path.join(root, "specs/001-taiwan-basketball-magazine-ebook/traceability.md"),
    "\nforged drift\n"
  )
  report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /frozen T085 traceability/u)

  fs.copyFileSync(
    path.join(repositoryRoot, "specs/001-taiwan-basketball-magazine-ebook/traceability.md"),
    path.join(root, "specs/001-taiwan-basketball-magazine-ebook/traceability.md")
  )
  const tasksPath = path.join(root, "specs/001-taiwan-basketball-magazine-ebook/tasks.md")
  fs.writeFileSync(
    tasksPath,
    fs.readFileSync(tasksPath, "utf8").replace(/^- \[ \] T086\b/mu, "- [x] T086")
  )
  report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /T086 must remain open/u)
})

test("a JSON null dispatch receipt fails closed", () => {
  const root = copyCanonicalFixture()
  fs.writeFileSync(path.join(root, ".loop/evidence/t086-dispatch.json"), "null\n")

  const report = runFixture(root)

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /dispatch receipt must match the immutable owner dispatch/u
  )
})

test("the audited diff rejects every path outside the owner allowlist", () => {
  const root = copyCanonicalFixture()
  const report = runFixture(root, {
    changedPaths: [...T086_AUTHORIZED_CHANGED_PATHS, "apps/web/server/secrets.ts"]
  })

  assert.equal(report.status, "FAIL")
  assert.deepEqual(report.scope.unauthorized_paths, ["apps/web/server/secrets.ts"])
})

test("checklist must retain all seven surfaces and protected transitions", () => {
  const root = copyCanonicalFixture()
  const checklistPath = path.join(root, "docs/release/beta-checklist.md")
  fs.writeFileSync(
    checklistPath,
    fs.readFileSync(checklistPath, "utf8").replace('"backup-restore",', "")
  )
  const report = runFixture(root)

  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /seven required release surfaces/u)
})

test("release workflow stays read-only, exact-head-bound and non-deploying", () => {
  const root = copyCanonicalFixture()
  const workflowPath = path.join(root, ".github/workflows/release.yml")
  fs.writeFileSync(
    workflowPath,
    fs.readFileSync(workflowPath, "utf8").replace("contents: read", "contents: write")
  )
  let report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /read-only permissions/u)

  fs.copyFileSync(path.join(repositoryRoot, ".github/workflows/release.yml"), workflowPath)
  fs.appendFileSync(workflowPath, "\n# secrets: ${{ secrets.PRODUCTION_TOKEN }}\n")
  report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /credentials, secrets or deployment/u)

  fs.copyFileSync(path.join(repositoryRoot, ".github/workflows/release.yml"), workflowPath)
  fs.writeFileSync(
    workflowPath,
    fs.readFileSync(workflowPath, "utf8").replace("surface_result=PASS", "surface_result=FAIL")
  )
  report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /prerequisite jobs to PASS/u)

  fs.copyFileSync(path.join(repositoryRoot, ".github/workflows/release.yml"), workflowPath)
  fs.writeFileSync(
    workflowPath,
    fs
      .readFileSync(workflowPath, "utf8")
      .replace("  control-plane:\n", "  control-plane:\n    permissions:\n      contents: write\n")
  )
  report = runFixture(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /read-only permissions/u)

  const validatorSource = fs.readFileSync(
    path.join(repositoryRoot, "scripts/validate-beta-release.mjs"),
    "utf8"
  )
  assert.doesNotMatch(validatorSource, /GITHUB_TOKEN|headers\.Authorization/u)
  assert.match(validatorSource, /env: \{\}/u)
})

test("dependency startup pipeline fails closed when the health check fails", () => {
  const root = copyCanonicalFixture()
  const workflowPath = path.join(root, ".github/workflows/release.yml")
  fs.writeFileSync(
    workflowPath,
    fs
      .readFileSync(workflowPath, "utf8")
      .replace(
        "          set -o pipefail\n          mkdir -p artifacts/t086/surfaces",
        "          mkdir -p artifacts/t086/surfaces"
      )
  )
  const report = runFixture(root)

  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /dependency startup.*pipefail/u)
})

test("decision job installs validator dependencies before execution", () => {
  const root = copyCanonicalFixture()
  const workflowPath = path.join(root, ".github/workflows/release.yml")
  const workflow = fs.readFileSync(workflowPath, "utf8")
  const decisionStart = workflow.indexOf("  decision:\n")
  assert.notEqual(decisionStart, -1)
  const prefix = workflow.slice(0, decisionStart)
  const decision = workflow
    .slice(decisionStart)
    .replace(
      "        run: pnpm install --frozen-lockfile --ignore-scripts",
      "        run: echo missing install"
    )
  fs.writeFileSync(workflowPath, prefix + decision)

  const report = runFixture(root)

  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /decision job must install JavaScript dependencies/u)
})

function stabilityReceipts({ count = 20, head = candidateSha } = {}) {
  return Array.from({ length: count }, (_, offset) => ({
    schema_version: "courtside-t086-stability-run/v1",
    task: "T086",
    run: offset + 1,
    candidate_sha: head,
    result: "PASS",
    surfaces: ["public-read", "two-role-publish", "retry", "revision", "withdrawal"]
  }))
}

test("stability gate accepts exactly 20 ordered clean runs on one candidate SHA", () => {
  const report = validateStabilityReceipts(stabilityReceipts(), { candidateSha })
  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.consecutive_clean_runs, 20)
})

for (const [name, mutate, pattern] of [
  ["nineteen runs", (rows) => rows.slice(0, 19), /exactly 20/u],
  [
    "mixed head",
    (rows) =>
      rows.map((row, index) => (index === 9 ? { ...row, candidate_sha: "b".repeat(40) } : row)),
    /same candidate SHA/u
  ],
  [
    "failed run",
    (rows) => rows.map((row, index) => (index === 9 ? { ...row, result: "FAIL" } : row)),
    /all 20 runs must PASS/u
  ],
  [
    "duplicate index",
    (rows) => rows.map((row, index) => (index === 9 ? { ...row, run: 9 } : row)),
    /ordered 1 through 20/u
  ]
]) {
  test(`stability gate rejects ${name}`, () => {
    const report = validateStabilityReceipts(mutate(stabilityReceipts()), { candidateSha })
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), pattern)
  })
}

const blockingDeviationMetadata = Object.freeze([
  { id: "DEV-T085-016", severity: "HIGH", type: "PARTIAL_ACCEPTANCE", affected_ids: ["FR-030", "SC-006"] },
  { id: "DEV-T085-026", severity: "HIGH", type: "PROXY_ONLY", affected_ids: ["SC-008"] },
  { id: "DEV-T085-027", severity: "MEDIUM", type: "PARTIAL_ACCEPTANCE", affected_ids: ["SC-009"] },
  { id: "DEV-T085-030", severity: "HIGH", type: "EDITORIAL_CAPABILITY_GAP", affected_ids: ["FR-011"] },
  { id: "DEV-T085-031", severity: "HIGH", type: "AUDIT_COVERAGE_GAP", affected_ids: ["FR-019"] },
  { id: "DEV-T085-032", severity: "HIGH", type: "ASSET_REVOCATION_OFFLINE_IMPACT_GAP", affected_ids: ["FR-025"] },
  { id: "DEV-T085-035", severity: "HIGH", type: "RATE_LIMIT_ENFORCEMENT_GAP", affected_ids: ["FR-041"] },
  { id: "DEV-T085-036", severity: "HIGH", type: "NO_JS_ACCEPTANCE_GAP", affected_ids: ["SC-003", "SC-013"] },
  { id: "DEV-T085-037", severity: "HIGH", type: "WRITE_API_CONTRACT_COVERAGE_GAP", affected_ids: ["FR-042"] },
  { id: "DEV-T085-039", severity: "MEDIUM", type: "SEO_PROOF_COVERAGE_GAP", affected_ids: ["FR-009"] },
  { id: "DEV-T085-040", severity: "HIGH", type: "ISSUE_WORKFLOW_COMPLETENESS_GAP", affected_ids: ["FR-013"] },
  { id: "DEV-T085-041", severity: "MEDIUM", type: "PUBLIC_ISSUE_LIST_FIELD_PROOF_GAP", affected_ids: ["FR-001"] },
  { id: "DEV-T085-042", severity: "HIGH", type: "PUBLICATION_ROLE_BOUNDARY_PROOF_GAP", affected_ids: ["FR-014"] },
  { id: "DEV-T085-043", severity: "HIGH", type: "PUBLICATION_IDEMPOTENCY_AND_REVISION_GATE_PROOF_GAP", affected_ids: ["FR-016"] },
  { id: "DEV-T085-044", severity: "HIGH", type: "PUBLICATION_RIGHTS_CLAUSE_PROOF_GAP", affected_ids: ["FR-023"] },
  { id: "DEV-T085-045", severity: "HIGH", type: "OIDC_PASSWORD_STORAGE_PROOF_GAP", affected_ids: ["FR-031"] },
  { id: "DEV-T085-046", severity: "HIGH", type: "CANONICAL_ROLE_MATRIX_PROOF_GAP", affected_ids: ["FR-032"] },
  { id: "DEV-T085-047", severity: "HIGH", type: "CREATIVE_RUNTIME_FAILURE_FALLBACK_PROOF_GAP", affected_ids: ["FR-048"] }
])

function adjudicationReadback({
  entries = blockingDeviationMetadata.map((row) => ({
    ...row,
    outcome: "RISK_ACCEPTED_FOR_BETA",
    rationale: "Owner explicitly accepts this bounded beta risk pending tracked remediation.",
    evidence_refs: [],
    follow_up_issue: "https://github.com/bynanci/courtside-tw/issues/121"
  })),
  contractOverrides = {},
  ...readbackOverrides
} = {}) {
  const contract = {
    schema_version: "courtside-t086-owner-adjudication/v1",
    decision: "ADJUDICATION_ACCEPTED",
    accepted_by: "bynanci",
    repository: "bynanci/courtside-tw",
    issue: "https://github.com/bynanci/courtside-tw/issues/160",
    task: "T086",
    candidate_sha: candidateSha,
    protected_base_sha: T086_AUTHORIZED_BASE_SHA,
    frozen_t085_traceability_sha256: FROZEN_T085_TRACEABILITY_SHA256,
    adjudications: entries,
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
    },
    ...contractOverrides
  }
  const body = [
    "<!-- t086:owner-adjudication:start -->",
    "\`\`\`json",
    JSON.stringify(contract, null, 2),
    "\`\`\`",
    "<!-- t086:owner-adjudication:end -->"
  ].join("\n")
  return {
    status: "VERIFIED",
    source: "github-api",
    html_url: "https://github.com/bynanci/courtside-tw/issues/160#issuecomment-6000000000",
    issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/160",
    user_login: "bynanci",
    author_association: "OWNER",
    created_at: "2026-09-01T11:30:00Z",
    updated_at: "2026-09-01T11:30:00Z",
    body,
    errors: [],
    ...readbackOverrides
  }
}

test("blocking deviation packet preserves frozen type and affected IDs", () => {
  const root = copyCanonicalFixture()
  const report = runFixture(root)
  const deviation = report.blockers.traceability.find((row) => row.id === "DEV-T085-016")

  assert.equal(deviation.type, "PARTIAL_ACCEPTANCE")
  assert.deepEqual(deviation.affected_ids, ["FR-030", "SC-006"])
})

test("complete owner adjudication makes the T086 gate reachable", () => {
  const root = copyCanonicalFixture()
  const report = runFixture(root, {
    ownerAdjudicationReadback: adjudicationReadback(),
    surfaceResult: "PASS",
    stabilityResult: "PASS"
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.decision_scope, "T086_GATE_ONLY")
  assert.equal(report.release_decision, "PASS")
  assert.equal(report.adjudication.status, "VERIFIED")
  assert.equal(report.blockers.source_count, 18)
  assert.equal(report.blockers.count, 0)
  assert.equal(report.protected_transitions.merge, "ELIGIBLE_FOR_OWNER_READBACK")
  assert.equal(report.task_state.t086, "OPEN")
  assert.equal(report.scope_boundaries.beta_flag_removed, false)
})

test("partial owner adjudication fails closed", () => {
  const root = copyCanonicalFixture()
  const report = runFixture(root, {
    ownerAdjudicationReadback: adjudicationReadback({
      entries: blockingDeviationMetadata.slice(0, -1).map((row) => ({
        ...row,
        outcome: "RISK_ACCEPTED_FOR_BETA",
        rationale: "Owner explicitly accepts this bounded beta risk pending tracked remediation.",
        evidence_refs: [],
        follow_up_issue: "https://github.com/bynanci/courtside-tw/issues/121"
      }))
    }),
    surfaceResult: "PASS",
    stabilityResult: "PASS"
  })

  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /adjudication.*exact blocker set/u)
  assert.equal(report.release_decision, "HOLD")
})

test("owner adjudication must be an unedited GitHub OWNER comment", () => {
  const root = copyCanonicalFixture()
  for (const ownerAdjudicationReadback of [
    adjudicationReadback({ author_association: "CONTRIBUTOR" }),
    adjudicationReadback({ user_login: "not-bynanci" }),
    adjudicationReadback({ updated_at: "2026-09-01T11:31:00Z" }),
    adjudicationReadback({ status: "UNAVAILABLE", errors: ["offline"] })
  ]) {
    const report = runFixture(root, {
      ownerAdjudicationReadback,
      surfaceResult: "PASS",
      stabilityResult: "PASS"
    })
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /owner adjudication/u)
    assert.equal(report.release_decision, "HOLD")
  }
}

