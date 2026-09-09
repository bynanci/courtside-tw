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
const requiredGateBase = "c79b5ace6b6d5adce5fc20fba9f93db1f65c72c5"
const requiredGateBranch = "agent/t086-required-gate-c79b5ac"
const requiredGateAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/164#issuecomment-5587906233"
const requiredGatePaths = [
  ".github/workflows/t086-required-gate.yml",
  "scripts/validate-traceability.mjs",
  "scripts/test/validate-traceability.test.mjs"
]
// Verbatim immutable OWNER receipt, including its implementation-only boundaries.
const requiredGateAuthorizationBody = [
  "<!-- t086-required-gate:owner-exact-path-dispatch:v5:start -->",
  "## Fresh OWNER exact-path dispatch â€” #164 implementation only",
  "",
  "**Decision:** `DISPATCH_ACCEPTED / IMPLEMENTATION_ONLY / NO REBASE / NO MERGE`.",
  "",
  "This dispatch refreshes and narrows the historical #164 authority against the newly certified protected base. It does **not** refresh #160 or authorize any change to PR #161.",
  "",
  "```json",
  "{",
  "  \"schema_version\": \"courtside-t086-required-gate-owner-exact-path-dispatch/v3\",",
  "  \"decision\": \"DISPATCH_ACCEPTED\",",
  "  \"accepted_by\": \"bynanci\",",
  "  \"repository\": \"bynanci/courtside-tw\",",
  "  \"tracker_issue\": 164,",
  "  \"purpose\": \"implement the trusted producer for one fresh fail-closed T086 final-release-decision context before any PR 161 refresh\",",
  "  \"authorization_base\": {",
  "    \"branch\": \"main\",",
  "    \"sha\": \"c79b5ace6b6d5adce5fc20fba9f93db1f65c72c5\",",
  "    \"parent_sha\": \"d79daefec49b0f5d059a2a6c349c0be107afd2d4\",",
  "    \"tree_sha\": \"e00c433cc79ff4f2a2902699746000798879251e\",",
  "    \"protected\": true,",
  "    \"push_ci\": {",
  "      \"run_id\": 34238197337,",
  "      \"result\": \"PASS\",",
  "      \"jobs\": \"5/5\"",
  "    },",
  "    \"push_security\": {",
  "      \"run_id\": 34238197220,",
  "      \"result\": \"PASS\",",
  "      \"jobs\": \"8/8\"",
  "    }",
  "  },",
  "  \"prior_authority\": {",
  "    \"broad_dispatch_comment_id\": 5494344283,",
  "    \"stale_owner_ready_addendum_comment_id\": 5495020765,",
  "    \"effect\": \"historical only where head/base-bound; this dispatch is the sole current exact-base executable subset\"",
  "  },",
  "  \"ruleset_prerequisite\": {",
  "    \"issue\": 164,",
  "    \"ruleset_id\": 20822671,",
  "    \"ruleset_name\": \"main-protected-release-gate\",",
  "    \"current_enforcement\": \"active\",",
  "    \"strict_required_status_checks_policy\": true,",
  "    \"current_required_context_count\": 12,",
  "    \"required_approving_reviews\": 0,",
  "    \"stable_t086_final_decision_context\": \"ABSENT\",",
  "    \"trusted_workflow_on_main\": \"ABSENT\",",
  "    \"required_context\": {",
  "      \"context\": \"T086 final release decision\",",
  "      \"integration_id\": 15368",
  "    }",
  "  },",
  "  \"repository_mutation\": {",
  "    \"branch\": \"agent/t086-required-gate-c79b5ac\",",
  "    \"draft_pull_request_only\": true,",
  "    \"authorized_paths\": [",
  "      \".github/workflows/t086-required-gate.yml\",",
  "      \"scripts/validate-traceability.mjs\",",
  "      \"scripts/test/validate-traceability.test.mjs\"",
  "    ],",
  "    \"authorized_actions\": [",
  "      \"create the dedicated branch from exactly main@c79b5ace6b6d5adce5fc20fba9f93db1f65c72c5\",",
  "      \"record deterministic RED before the bounded implementation\",",
  "      \"implement and test only the three exact authorized paths\",",
  "      \"run non-deploying CI, Security, authenticated read-back, review, and negative-gate tests\",",
  "      \"record exact-head evidence without changing PR 161\"",
  "    ],",
  "    \"required_design\": [",
  "      \"use one-time authenticated issue-164 path authorization; do not add a generic workflow-path bypass\",",
  "      \"run trusted evaluation only from protected-main code; never check out or execute pull-request-head code with write authority\",",
  "      \"never forward a write-capable token to untrusted code\",",
  "      \"emit one unique non-matrix context named T086 final release decision from GitHub Actions integration 15368\",",
  "      \"recompute on canonical OWNER adjudication comment creation, edit, and deletion and on candidate-head or relevant workflow completion changes\",",
  "      \"bind the result to current PR head, protected base, frozen T085 traceability hash, canonical OWNER comment identity and revision, and current evidence\",",
  "      \"allow success only for a fresh exact-head PASS; HOLD, FAIL, UNKNOWN, missing, stale, ambiguous, or unavailable evidence remains blocking\",",
  "      \"classify non-T086 pull requests as NOT_APPLICABLE only in trusted server-side code; missing or ambiguous classification remains blocking\"",
  "    ]",
  "  },",
  "  \"acceptance_before_any_later_merge_gate\": [",
  "    \"the implementation diff contains exactly the three authorized paths\",",
  "    \"deterministic RED-to-GREEN proof is bound to one exact candidate head\",",
  "    \"CI and Security pass on that exact head\",",
  "    \"review has no unresolved P0, P1, or P2 finding and zero unresolved review threads\",",
  "    \"trusted code and least-privilege boundaries are independently read back\",",
  "    \"negative tests prove HOLD, FAIL, UNKNOWN, missing, stale, spoofed, edited, deleted, and unavailable states cannot produce success\",",
  "    \"rollback is documented and preserves the complete current 12-context ruleset payload\"",
  "  ],",
  "  \"current_stage_forbidden\": [",
  "    \"rebase, merge-main, update-branch, or otherwise mutate PR 161\",",
  "    \"reuse any historical PR 161 exact-head evidence as current proof\",",
  "    \"mark this implementation pull request ready for review\",",
  "    \"merge this implementation pull request\",",
  "    \"mutate ruleset 20822671 or any provider configuration\",",
  "    \"add, remove, rename, or reorder a required context\",",
  "    \"change the T086 checkbox or remove the beta flag\",",
  "    \"adjudicate or accept risk for any frozen T085 deviation\"",
  "  ],",
  "  \"stop_conditions\": [",
  "    \"protected base SHA differs from c79b5ace6b6d5adce5fc20fba9f93db1f65c72c5 before branch creation\",",
  "    \"the changed-path set differs from the three exact authorized paths\",",
  "    \"the ruleset pre-readback differs from the active strict 12-context zero-bypass snapshot\",",
  "    \"the context producer is ambiguous or is not GitHub Actions integration 15368\",",
  "    \"trusted code executes pull-request-head code or exposes write authority\",",
  "    \"any required acceptance or rollback read-back is missing\"",
  "  ],",
  "  \"scope_boundaries\": {",
  "    \"participant_research_executed\": false,",
  "    \"web3_activated\": false,",
  "    \"production_or_product_provider_mutated\": false,",
  "    \"credentials_or_secrets_accessed_or_changed\": false,",
  "    \"external_product_writes\": false,",
  "    \"t087_or_later_dispatched\": false,",
  "    \"t086_task_state_changed\": false,",
  "    \"beta_flag_removed\": false,",
  "    \"t085_deviation_risk_accepted\": false",
  "  }",
  "}",
  "```",
  "",
  "### Ordered gates after this dispatch",
  "",
  "1. Build only the three-path #164 draft remediation from `main@c79b5ace6b6d5adce5fc20fba9f93db1f65c72c5` and obtain fresh exact-head RED â†’ GREEN, CI, Security, and review evidence.",
  "2. Stop for a separate OWNER merge gate. This dispatch does not authorize merge.",
  "3. After an authorized merge, read back the new protected-main SHA and trusted workflow.",
  "4. Stop for a separate OWNER provider-mutation gate; then append exactly the integration-pinned required context while preserving all 12 existing contexts and the complete ruleset payload.",
  "5. Prove the new required context blocks PR #161 while its T086 decision is not a fresh PASS.",
  "6. Only after #164 is fully enforced, freeze the then-current protected-main SHA and issue a separate fresh #160 exact-base/exact-path dispatch before any PR #161 rebase or evidence regeneration.",
  "",
  "PR #161 remains at historical head `b722f29f1412239c2859b1832c455cc40efe0ac1`, draft / HOLD / NO MERGE. Its old exact-head evidence remains historical only.",
  "<!-- t086-required-gate:owner-exact-path-dispatch:v5:end -->"
].join("\n")

function makeRequiredGateReadback(overrides = {}) {
  return {
    status: "VERIFIED",
    source: "github-api",
    html_url: requiredGateAuthorizationRef,
    issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/164",
    user_login: "bynanci",
    author_association: "OWNER",
    created_at: "2026-09-08T15:47:26Z",
    updated_at: "2026-09-08T15:47:26Z",
    body: requiredGateAuthorizationBody,
    errors: [],
    ...overrides
  }
}

function makeRequiredGateActionsContext(root, { eventOverrides = {}, environmentOverrides = {} } = {}) {
  const eventPath = path.join(root, "required-gate-event.json")
  const pullRequest = {
    number: 171,
    state: "open",
    draft: true,
    head: { sha: fixtureReceiptHead, ref: requiredGateBranch, repo: { full_name: "bynanci/courtside-tw" } },
    base: { sha: requiredGateBase, ref: "main", repo: { full_name: "bynanci/courtside-tw" } },
    ...eventOverrides
  }
  fs.writeFileSync(eventPath, JSON.stringify({
    repository: { full_name: "bynanci/courtside-tw" },
    number: pullRequest.number,
    pull_request: pullRequest
  }))
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
      GITHUB_REF: "refs/pull/171/merge",
      GITHUB_BASE_REF: "main",
      GITHUB_HEAD_REF: requiredGateBranch,
      ...environmentOverrides
    },
    gitBinding: { head: fixtureReceiptHead, change_base_sha: requiredGateBase, change_base_ancestor: true }
  })
}

function runRequiredGateFixture(fixture, overrides = {}) {
  const githubActionsContext = overrides.githubActionsContext ?? makeRequiredGateActionsContext(fixture.root)
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return runCompletedFixture(fixture, {
    changeBaseSha: requiredGateBase,
    changedPaths: [...requiredGatePaths],
    evaluatedHeadCommittedAt: "2026-09-09T01:00:00.000Z",
    requireExactHeadEvidence: true,
    githubActionsContext,
    requiredGateAuthorizationReadback: makeRequiredGateReadback(),
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_sha: requiredGateBase,
      change_base_ancestor: true,
      head_parent_count: 1,
      required_gate_commit_count: 1,
      required_gate_merge_commit_count: 0
    },
    ...overrides
  })
}

test("issue 164 authenticates only the immutable OWNER three-path draft from its exact base", () => {
  const fixture = makeCompletedFixture()
  const report = runRequiredGateFixture(fixture)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.deepEqual(report.scope_validation.unauthorized_paths, [])
  assert.equal(report.source.required_gate_authorization_readback.body_sha256,
    "6b788a4f3ec2fbd648556fb51d1d07363d507f12fe682a36bf34dc41565a6314")
  assert.equal(report.scope_boundaries.t086_dispatched, false)
})

test("issue 164 rejects missing, stale, spoofed, edited and widened OWNER authority", () => {
  const fixture = makeCompletedFixture()
  for (const [label, readback] of [
    ["missing", null],
    ["unavailable", makeRequiredGateReadback({ status: "UNAVAILABLE" })],
    ["source", makeRequiredGateReadback({ source: "fixture" })],
    ["actor", makeRequiredGateReadback({ user_login: "attacker" })],
    ["association", makeRequiredGateReadback({ author_association: "MEMBER" })],
    ["comment", makeRequiredGateReadback({ html_url: requiredGateAuthorizationRef + "0" })],
    ["issue", makeRequiredGateReadback({ issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/160" })],
    ["created", makeRequiredGateReadback({ created_at: "2026-09-08T15:47:25Z" })],
    ["edited", makeRequiredGateReadback({ updated_at: "2026-09-08T15:47:27Z" })],
    ["body", makeRequiredGateReadback({ body: requiredGateAuthorizationBody.replace("draft_pull_request_only\": true", "draft_pull_request_only\": false") })],
    ["suffix", makeRequiredGateReadback({ body: requiredGateAuthorizationBody + "\nMerge is now authorized." })],
    ["errors", makeRequiredGateReadback({ errors: ["partial readback"] })]
  ]) {
    const report = runRequiredGateFixture(fixture, { requiredGateAuthorizationReadback: readback })
    assert.equal(report.status, "FAIL", label)
    assert.match(report.errors.join("\n"), /issue 164/, label)
  }
})

test("issue 164 rejects scope, base, exact-head, draft, PR, fork, Actions and topology replays", () => {
  const fixture = makeCompletedFixture()
  const context = makeRequiredGateActionsContext(fixture.root)
  for (const [label, overrides] of [
    ["extra path", { changedPaths: [...requiredGatePaths, "docs/research/unrelated.md"] }],
    ["missing workflow", { changedPaths: requiredGatePaths.slice(1) }],
    ["duplicate path", { changedPaths: [...requiredGatePaths, requiredGatePaths[1]] }],
    ["different workflow", { changedPaths: [".github/workflows/unrelated.yml", ...requiredGatePaths.slice(1)] }],
    ["base", { changeBaseSha: fixtureCompletedBase }],
    ["non-exact", { requireExactHeadEvidence: false }],
    ["untrusted", { githubActionsContext: { ...context } }],
    ["wrong evaluated head", { currentHead: fixturePostT085FinalPrHead }],
    ["pre-dispatch head", { evaluatedHeadCommittedAt: "2026-09-08T15:47:26Z" }],
    ["ready", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { eventOverrides: { draft: false } }) }],
    ["closed", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { eventOverrides: { state: "closed" } }) }],
    ["wrong PR ref", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { environmentOverrides: { GITHUB_REF: "refs/pull/172/merge" } }) }],
    ["historical PR 161", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { eventOverrides: { number: 161 }, environmentOverrides: { GITHUB_REF: "refs/pull/161/merge" } }) }],
    ["fork", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { eventOverrides: { head: { sha: fixtureReceiptHead, ref: requiredGateBranch, repo: { full_name: "attacker/courtside-tw" } } } }) }],
    ["branch", { githubActionsContext: makeRequiredGateActionsContext(fixture.root, { environmentOverrides: { GITHUB_HEAD_REF: "other" } }) }],
    ["push", { githubActionsContext: makeFixturePushActionsContext(fixture.root) }],
    ["dirty", { gitBinding: { status: "DIRTY", head: fixtureReceiptHead, change_base_sha: requiredGateBase, change_base_ancestor: true, required_gate_commit_count: 1, required_gate_merge_commit_count: 0 } }],
    ["merge ancestry", { gitBinding: { status: "CLEAN", head: fixtureReceiptHead, change_base_sha: requiredGateBase, change_base_ancestor: true, required_gate_commit_count: 2, required_gate_merge_commit_count: 1 } }],
    ["unreadable ancestry", { gitBinding: { status: "CLEAN", head: fixtureReceiptHead, change_base_sha: requiredGateBase, change_base_ancestor: null, required_gate_commit_count: null, required_gate_merge_commit_count: null } }]
  ]) {
    const report = runRequiredGateFixture(fixture, overrides)
    assert.equal(report.status, "FAIL", label)
    assert.match(report.errors.join("\n"), /issue 164/, label)
  }
})

test("issue 164 leaves tasks and frozen traceability immutable and descendant maintenance available", () => {
  const fixture = makeCompletedFixture()
  const tasksPath = path.join(fixture.root, featurePath, "tasks.md")
  const original = fs.readFileSync(tasksPath, "utf8")
  fs.writeFileSync(tasksPath, original.replace("- [ ] T086", "- [x] T086"))
  assert.equal(runRequiredGateFixture(fixture).status, "FAIL")
  fs.writeFileSync(tasksPath, original)
  const traceabilityPath = path.join(fixture.root, featurePath, "traceability.md")
  fs.appendFileSync(traceabilityPath, "\nfrozen drift")
  assert.equal(runRequiredGateFixture(fixture).status, "FAIL")
  fs.writeFileSync(traceabilityPath, fixture.changeBaseTraceabilityText)
  assert.equal(runCompletedFixture(fixture, {
    changedPaths: ["scripts/validate-traceability.mjs"],
    changeBaseSha: requiredGateBase,
    gitBinding: { status: "CLEAN", head: fixtureReceiptHead, change_base_sha: requiredGateBase, change_base_ancestor: true }
  }).status, "PASS")
})

test("issue 164 CLI inspection reads only the exact authorized scope and pinned comment", () => {
  assert.equal(typeof traceabilityValidator.inspectRequiredGateAuthorizationForState, "function")
  const fixture = makeCompletedFixture()
  let calls = 0
  const inspect = ({ environment }) => {
    calls += 1
    assert.equal(environment.GITHUB_TOKEN, "read-only-fixture")
    return makeRequiredGateReadback()
  }
  const options = {
    changeBaseTasksText: fixture.changeBaseTasksText,
    changeBaseSha: requiredGateBase,
    boundedScopeActive: false,
    changedPaths: [...requiredGatePaths],
    environment: { GITHUB_TOKEN: "read-only-fixture" },
    inspect
  }
  const report = traceabilityValidator.inspectRequiredGateAuthorizationForState(fixture.root, options)
  assert.equal(report.html_url, requiredGateAuthorizationRef)
  assert.equal(calls, 1)
  for (const overrides of [
    { changedPaths: requiredGatePaths.slice(1) },
    { changedPaths: [...requiredGatePaths, "README.md"] },
    { changeBaseSha: fixtureCompletedBase },
    { boundedScopeActive: true },
    { changeBaseTasksText: null }
  ]) {
    assert.equal(traceabilityValidator.inspectRequiredGateAuthorizationForState(fixture.root, { ...options, ...overrides }), null)
  }
  assert.equal(calls, 1)
})
const featurePath = "specs/001-taiwan-basketball-magazine-ebook"
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const completionReceiptPath = ".loop/evidence/t085-completion-receipt.json"
const completionReceiptSchema = "courtside-t085-completion-receipt/v2"
const ownerAuthorizationSchema = "courtside-t085-owner-authorization/v1"
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
const fixturePostT085FinalPrHead = "7777777777777777777777777777777777777777"
const fixtureCiRunId = 33226451857
const fixtureSecurityRunId = 33226451860
const fixtureReceiptOwner = "bynanci"
const fixtureLegacyReceiptAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/145#issuecomment-5459765126"
const fixtureReceiptAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/145#issuecomment-6000000001"
const fixtureReceiptBaseCommittedAt = "2026-08-31T04:47:24Z"
const fixtureFreshAuthorizationRecordedAt = "2026-08-31T04:50:00Z"
const fixtureReceiptHeadCommittedAt = "2026-08-31T04:55:52Z"
const fixtureOwnerReadbackSupportBase = "483aaffbb884f4d9fbeb92ef6573a6c9111c0e0e"
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
const postT085RemediationBaseSha = "d99df471a08608bb8b6da609e17095d285c11489"
const postT085RemediationChangedPaths = [
  ".loop/evidence/t085-review.json",
  "apps/web/scripts/android-chrome-performance-smoke.mjs",
  "apps/web/tests/unit/android-creative-timeline.test.ts",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs",
  "specs/001-taiwan-basketball-magazine-ebook/traceability.md"
]
const postT085MaintenanceAuthorizationSchema = "courtside-post-t085-maintenance-authorization/v5"
const postT085MaintenanceAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/167#issuecomment-5573190561"
const postT085MaintenanceSupersededAuthorizationRefs = [
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5494383925",
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5494845838",
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5494892447",
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5494952244",
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5495299187",
  "https://github.com/bynanci/courtside-tw/issues/162#issuecomment-5572646990"
]
const postT085MaintenanceAuthorizationBaseSha = "92773201398306b89cca7fc0b7852cb06dd4d4c7"
const postT085MaintenanceSecurityHeadSha = "1cfe608c24b13b95a7365dc362bfd2b8c2e0823d"
const postT085MaintenanceSecurityTreeSha = "c2eec3e6a769c717b72aa186633f21d968713ff2"
const postT085MaintenanceUs6HeadSha = "e5b923b35c37bb9ad34978a1e02b71a52286083e"
const postT085MaintenanceUs6TreeSha = "b59c6b5aa84517a39332834946738d8e8395ff87"
const postT085MaintenancePureMergeSha = "8f59c20327d0d939570921e5aa8f3288fff91ef8"
const postT085MaintenancePureMergeTreeSha = "6d7a39adbaa7c4abe92c2e71236ec6678b9c4c6b"
const postT085MaintenanceAuthorizedHeadSha = "926673069ea1fdff07dc7662fd6f19b5a29996f0"
const postT085MaintenanceAuthorizedHeadTreeSha = "feb6378287994dbc4ed5ec01cfd70dc46bdddddb"
const postT085MaintenanceAuthorizedPaths = [
  "apps/web/tests/e2e/us6-offline-issue.spec.ts",
  "infra/compose/postgres/Dockerfile",
  "infra/compose/s3mock/Dockerfile",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
]
const postT085MaintenanceAuthorizedAmendmentPaths = [
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
]
const postT085MaintenanceComposabilityChangedPaths = ["scripts/test/validate-traceability.test.mjs"]
const postT085MaintenancePreservedPayloadBlobs = [
  {
    path: "apps/web/tests/e2e/us6-offline-issue.spec.ts",
    source_head_sha: postT085MaintenanceUs6HeadSha,
    git_blob_oid: "42a171efa6507dc4440d4afe55d1694950153972"
  },
  {
    path: "infra/compose/postgres/Dockerfile",
    source_head_sha: postT085MaintenanceSecurityHeadSha,
    git_blob_oid: "87ea652090aec4420986ac291542b52ee464ef65"
  },
  {
    path: "infra/compose/s3mock/Dockerfile",
    source_head_sha: postT085MaintenanceSecurityHeadSha,
    git_blob_oid: "bfb235a3ec6af4f3eafbdeb39b7a433ff499f589"
  },
  {
    path: "pnpm-lock.yaml",
    source_head_sha: postT085MaintenanceSecurityHeadSha,
    git_blob_oid: "de0dcec9ff1427e74e1da363f1455a415ab745a1"
  },
  {
    path: "pnpm-workspace.yaml",
    source_head_sha: postT085MaintenanceSecurityHeadSha,
    git_blob_oid: "9474ee61c6c0f276ee9acb3a337533f0de068b78"
  }
]
const postT085MaintenanceExpectedPayloadBlobOids = Object.fromEntries(
  postT085MaintenancePreservedPayloadBlobs.map(({ path: filePath, git_blob_oid }) => [
    filePath,
    git_blob_oid
  ])
)
const postT085MaintenanceAuthorizedHeadCommittedAt = "2026-09-07T16:01:49.000Z"
const postT085MaintenanceAuthorizationRecordedAt = "2026-09-07T16:05:25Z"
const androidNativeSurfaceDispatchRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5580592465"
const androidNativeSurfaceScopeProposalRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5580831466"
const androidNativeSurfaceAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5580939141"
const androidNativeSurfaceAuthorizationBaseSha = "2103adfb9d8d2255fb0fbdcf48f2df7a7e4628c3"
const androidNativeSurfaceSeedHeadSha = "5caa1c933f1e682773d9e3d4e270fee6800f1d3f"
const androidNativeSurfaceBranch = "agent/android-native-surface-deadline"
const androidNativeSurfaceDispatchRecordedAt = "2026-09-08T06:50:38Z"
const androidNativeSurfaceAuthorizationRecordedAt = "2026-09-08T07:18:46Z"
const androidNativeSurfaceForegroundScopeProposalRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5581306844"
const androidNativeSurfaceForegroundAuthorizationRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5581452635"
const androidNativeSurfaceForegroundAuthorizationRecordedAt = "2026-09-08T08:01:23Z"
const androidNativeSurfaceForegroundSeedHeadSha = "8713630e0aece87012ce04c1c65395ba5d55297b"
const androidNativeSurfaceAuthorizedPaths = [
  "apps/web/scripts/android-chrome-performance-smoke.mjs",
  "apps/web/tests/unit/android-creative-timeline.test.ts",
  "scripts/validate-traceability.mjs",
  "scripts/test/validate-traceability.test.mjs"
]
const androidNativeSurfaceAmendmentPaths = [
  "scripts/validate-traceability.mjs",
  "scripts/test/validate-traceability.test.mjs"
]

const androidNativeSurfaceMergedHeadSha = "19f1b983878489ca3838d84696a19fa18ff8bbc5"
const androidNativeSurfaceMergeSha = "d79daefec49b0f5d059a2a6c349c0be107afd2d4"
const androidNativeSurfaceMergeTreeSha = "b5ab5a28d1cbda5e9d0c0779bc4b5cc70b47d606"
const post169GovernanceDispatchRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5582375304"
const post169GovernanceDispatchRecordedAt = "2026-09-08T09:10:03Z"
const post169GovernanceAddendumRef =
  traceabilityValidator.POST169_GOVERNANCE_ADDENDUM_REF ??
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-1"
const post169GovernanceAddendumRecordedAt =
  traceabilityValidator.POST169_GOVERNANCE_ADDENDUM_RECORDED_AT ?? "2026-09-08T09:30:00Z"
const post169GovernanceFormatAddendumRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5583242540"
const post169GovernanceFormatAddendumRecordedAt = "2026-09-08T10:00:15Z"
const post169GovernanceReviewProposalRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5583593931"
const post169GovernanceReviewRemediationRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5585253492"
const post169GovernanceReviewRemediationRecordedAt = "2026-09-08T12:38:15Z"
const post169GovernanceFinalSealRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5585969745"
const post169GovernanceFinalSealRecordedAt = "2026-09-08T13:33:35Z"
const post169GovernanceSquashPushSupersessionRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5586409180"
const post169GovernanceSquashPushSupersessionRecordedAt = "2026-09-08T14:05:15Z"
const post169GovernanceFinalSealV4Ref =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-6000000172"
const post169GovernanceFinalSealV4RecordedAt = "2026-09-08T14:15:00Z"
const post169GovernanceAuthorizationBaseSha = androidNativeSurfaceMergeSha
const post169GovernanceBranch = "fix/post169-governance-reconciliation"
const post169GovernancePullRequest = 170
const post169GovernanceSeedHeadSha =
  traceabilityValidator.POST169_GOVERNANCE_SEED_HEAD_SHA ??
  "4444444444444444444444444444444444444444"
const post169GovernanceBlockedHeadSha = "e06765cd88d8826c67138d76a43e9bcf56b16412"
const post169GovernanceBlockedTreeSha = "ae40b12aabe43415122927da04d5b47eb5bf05bc"
const post169GovernancePriorFinalHeadSha = "5dcffd0c683a13ca3d8b49e9c83b6abaea12086d"
const post169GovernancePriorFinalTreeSha = "3103525786fa157dcdce7d548d436f9f6d047f1b"
const post169GovernancePriorFinalTestBlobSha = "57a6024cbf9f72e66a68978ed65a0ae6cbac31a5"
const post169GovernancePriorFinalValidatorBlobSha = "0e61003a117c0f93a8dad1c29fc3545109b0da43"
const post169GovernanceSupersededFinalHeadSha = "395afae7826bb76a1a79f230270443c51d96f601"
const post169GovernanceSupersededFinalTreeSha = "e29bf7af3ae7645f966820a3739e1914af18c78a"
const post169GovernanceSupersededFinalSealRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5586302989"
const post169GovernanceSeedTestBlobSha = "dc0271965b06af369645cb792045f5d6d1a613f6"
const post169GovernanceFinalTestBlobSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const post169GovernanceFinalValidatorBlobSha = "cccccccccccccccccccccccccccccccccccccccc"
const post169GovernanceBlockedReadmeBlobSha = "321bd716f953232016c7e44feb692ce285af6a85"
const post169GovernanceBlockedTasksBlobSha = "9e477c0ac0ad2c7b38979e20f61564601dd1fcbd"
const post169GovernanceTaskCheckboxSignatureSha256 =
  "7229c5ad498658144e513f7af91a24b121b91817057e5673d3db3cb62aac73b3"
const post169GovernanceAuthorizedPaths = [
  "README.md",
  `${featurePath}/tasks.md`,
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
]
const post169GovernanceAmendmentPaths = [
  "README.md",
  `${featurePath}/tasks.md`,
  "scripts/validate-traceability.mjs"
]
const post169T086StatusSuffix =
  " Current governance state (2026-09-08): #169 maintenance is merged; T086 remains HOLD in draft PR #161 until protected-main CI/Security, #164 required-context enforcement, a fresh exact-base dispatch/rebase, exact-head evidence, and OWNER adjudication of every blocker pass. The beta flag remains unchanged."

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
    repository: "bynanci/courtside-tw",
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
      const deviationIds = row.deviation_ids.map((id) => `\`${id}\``).join(", ") || "â€”"
      return `| ${row.id} | ${row.story} / ${row.slice} | ${row.task_ids.join(", ")} | ${row.implementation_state} | ${row.evidence_state} | ${proofIds} | ${deviationIds} | ${row.release_impact} |`
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
    "package.json": JSON.stringify({
      private: true,
      scripts: {
        test: "node --test tests/*.test.js tests/*.test.mjs tests/*.test.ts"
      }
    }),
    "tests/fixture-proof.test.js": 'import test from "node:test"\ntest("fixture-proof", () => {})\n'
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
      recorded_at: fixtureFreshAuthorizationRecordedAt,
      repository: "bynanci/courtside-tw",
      issue: "https://github.com/bynanci/courtside-tw/issues/145",
      implementation_head_sha: fixtureImplementationHead,
      implementation_merge_sha: fixtureImplementationMerge,
      receipt_base_sha: fixtureReceiptBase,
      authorization_base_sha: fixtureReceiptBase,
      implementation_scope: {
        changed_files: fixtureImplementationChangedPaths.length,
        changed_paths: [...fixtureImplementationChangedPaths],
        required_checks: "14/14"
      },
      traceability_sha256: sha256(baseTraceabilityText),
      authorization_traceability_sha256: sha256(baseTraceabilityText),
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
      statuvÚ±î¸Â¸­yêë¢°k¢G§¦*^3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†V@¢ÒÀ¢6†ævVEF‡3¢µÒÀ¢66WFVEG&6V&–Æ—G•6†#Sc¢6†#Sb‡G&6V&–Æ—G•FW‡B’À¢66WFVEVæF–æuF6·56†#Sc¢6†#Sb‡VæF–æuF6·5FW‡B’À¢66WFVD6ö×ÆWFVEF6·56†#Sc¢6†#Sb€¢VæF–æuF6·5FW‡Bç&WÆ6R‚õâÒÅ²ÅÒCƒUÆ"öÒÂ"Ò·…ÒCƒR"¢’À¢ââæ÷fW'&–FW0¢Ò§Ð ¦gVæ7F–öâÖ¶Tf—‡GW&T7F–öç46öçFW‡B‡&ö÷BÂVçf—&öæÖVçD÷fW'&–FW2Ò·Ò’°¢–b‡G—VöbG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡BÓÒ&gVæ7F–öâ"’&WGW&âçVÆÀ¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"×VÆÂ×&WVW7BÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢VÆÅ÷&WVW7C¢°¢†VC¢²6†¢f—‡GW&U&V6V—D†VBÂ&Vc¢f—‡GW&T7F–öç4†VE&VbÒÀ¢&6S¢²6†¢f—‡GW&U&V6V—D&6RÂ&Vc¢&Ö–â"Ð¢Ð¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢'&Vg2÷VÆÂóSöÖW&vR"À¢t•D…T%ô$4Uõ$Tc¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢f—‡GW&T7F–öç4†VE&VbÀ¢ââæVçf—&öæÖVçD÷fW'&–FW0¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâÖ¶Tf—‡GW&UW6„7F–öç46öçFW‡B‡&ö÷BÂVçf—&öæÖVçD÷fW'&–FW2Ò·Ò’°¢–b‡G—VöbG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡BÓÒ&gVæ7F–öâ"’&WGW&âçVÆÀ¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"ÖÖ–â×W6‚ÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vf÷&S¢f—‡GW&U&V6V—D&6RÀ¢gFW#¢f—‡GW&U&V6V—D†VBÀ¢&Vc¢'&Vg2ö†VG2öÖ–â ¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'W6‚"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&U&V6V—D†VBÀ¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢'&Vg2ö†VG2öÖ–â"À¢t•D…T%õ$TeôäÔS¢&Ö–â"À¢ââæVçf—&öæÖVçD÷fW'&–FW0¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B€¢&ö÷BÀ¢°¢VÆÅ&WVW7BÒc‚À¢WfVçEVÆÅ&WVW7BÒVÆÅ&WVW7BÀ¢†VE&VbÒ&f—‚÷6V7W&—G’Ö&6VÆ–æRÓ##c“r"À¢&6U6†Ò÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢v—F‡V%&VbÒ&Vg2÷VÆÂòG·VÆÅ&WVW7GÒöÖW&vVÀ¢VÆÅ&WVW7DG&gBÒG'VP¢ÒÒ·Ð¢’°¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"×÷7B×CƒRÖÖ–çFVææ6RÖWfVçBæ§6öâ"¢6öç7BVÆÅ&WVW7DWfVçBÒ°¢çVÖ&W#¢WfVçEVÆÅ&WVW7BÀ¢†VC¢²6†¢f—‡GW&U&V6V—D†VBÂ&Vc¢†VE&VbÒÀ¢&6S¢²6†¢&6U6†Â&Vc¢&Ö–â"Ð¢Ð¢–b‡VÆÅ&WVW7DG&gBÓÒçVÆÂ’VÆÅ&WVW7DWfVçBæG&gBÒVÆÅ&WVW7DG&g@¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢çVÖ&W#¢WfVçEVÆÅ&WVW7BÀ¢VÆÅ÷&WVW7C¢VÆÅ&WVW7DWfVç@¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢v—F‡V%&VbÀ¢t•D…T%ô$4Uõ$Tc¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢†VE&V`¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâÖ¶TæG&ö–DæF—fU7W&f6T7F–öç46öçFW‡B€¢&ö÷BÀ¢°¢VÆÅ&WVW7BÒc’À¢WfVçEVÆÅ&WVW7BÒVÆÅ&WVW7BÀ¢†VE&VbÒæG&ö–DæF—fU7W&f6T'&æ6‚À¢&6U6†ÒæG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†À¢v—F‡V%&VbÒ&Vg2÷VÆÂòG·VÆÅ&WVW7GÒöÖW&vVÀ¢VÆÅ&WVW7DG&gBÒG'VP¢ÒÒ·Ð¢’°¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"ÖæG&ö–BÖæF—fR×7W&f6RÖWfVçBæ§6öâ"¢6öç7BVÆÅ&WVW7DWfVçBÒ°¢çVÖ&W#¢WfVçEVÆÅ&WVW7BÀ¢†VC¢²6†¢f—‡GW&U&V6V—D†VBÂ&Vc¢†VE&VbÒÀ¢&6S¢²6†¢&6U6†Â&Vc¢&Ö–â"Ð¢Ð¢–b‡VÆÅ&WVW7DG&gBÓÒçVÆÂ’VÆÅ&WVW7DWfVçBæG&gBÒVÆÅ&WVW7DG&g@¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢çVÖ&W#¢WfVçEVÆÅ&WVW7BÀ¢VÆÅ÷&WVW7C¢VÆÅ&WVW7DWfVç@¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢v—F‡V%&VbÀ¢t•D…T%ô$4Uõ$Tc¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢†VE&V`¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâÖ¶TæG&ö–DæF—fU7W&f6UW6„7F–öç46öçFW‡B€¢&ö÷BÀ¢²&Vf÷&RÒæG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†ÂgFW"ÒæG&ö–DæF—fU7W&f6TÖW&vU6†ÒÒ·Ð¢’°¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"ÖæG&ö–BÖæF—fR×7W&f6R×W6‚ÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vf÷&RÀ¢gFW"À¢&Vc¢'&Vg2ö†VG2öÖ–â ¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'W6‚"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢gFW"À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢'&Vg2ö†VG2öÖ–â"À¢t•D…T%õ$TeôäÔS¢&Ö–â ¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢gFW"À¢6†ævUö&6U÷6†¢&Vf÷&RÀ¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâÖ¶U÷7ECƒTÖ–çFVææ6UW6„7F–öç46öçFW‡B‡&ö÷B’°¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"×÷7B×CƒRÖÖ–çFVææ6R×W6‚ÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vf÷&S¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢gFW#¢f—‡GW&U&V6V—D†VBÀ¢&Vc¢'&Vg2ö†VG2öÖ–â ¢Ò¢¢&WGW&âG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'W6‚"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&U&V6V—D†VBÀ¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢'&Vg2ö†VG2öÖ–â"À¢t•D…T%õ$TeôäÔS¢&Ö–â ¢ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò§Ð ¦gVæ7F–öâw&—FTW†7D†VDf÷$7F–öç46öçFW‡B‡&ö÷BÂ6öçFW‡B’°¢g2çw&—FTf–ÆU7–æ2€¢F‚æ¦ö–â‡&ö÷BÂ&'F–f7G2öW†7BÖ†VBæ§6öâ"’À¢¥4ôâç7G&–æv–g’‡°¢6÷W&6Uö†VE÷6†¢6öçFW‡Bç6÷W&6Uö†VE÷6†À¢W‡V7FVE÷6÷W&6Uö†VC¢6öçFW‡Bç6÷W&6Uö†VE÷6†À¢6÷W&6UöWfVçC¢6öçFW‡BæWfVçEöæÖRÀ¢6÷W&6U÷&Vc¢6öçFW‡Bç6÷W&6U÷&VbÀ¢v—F‡V%÷6†¢6öçFW‡Bæv—F‡V%÷6†À¢v—F‡V%÷&W÷6—F÷'“¢6öçFW‡Bç&W÷6—F÷'’À¢v—F‡V%÷v÷&¶fÆ÷s¢6öçFW‡Bçv÷&¶fÆ÷rÀ¢v—F‡V%ö¦ö#¢6öçFW‡Bæ¦ö"À¢v—F‡V%÷'Våö–C¢6öçFW‡Bç'Våö–BÀ¢v—F‡V%÷'VåöçVÖ&W#¢6öçFW‡Bç'VåöçVÖ&W"À¢v—F‡V%÷'VåöGFV×C¢6öçFW‡Bç'VåöGFV×BÀ¢v—F‡V%÷&Vc¢6öçFW‡Bæv—F‡V%÷&VbÀ¢v—F‡V%ö&6U÷&Vc¢6öçFW‡Bæ&6U÷&V`¢Ò¢§Ð ¦gVæ7F–öâÖ¶T÷væW$WF†÷&—¦F–öå&VF&6²‡&V6V—BÂ÷fW'&–FW2Ò·Ò’°¢6öç7BWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢÷væW$WF†÷&—¦F–öå66†VÖÀ¢FV6—6–öã¢$44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&V6V—Eö&6U÷6†¢&V6V—BæWF†÷&—¦F–öåö&6U÷6†À¢G&6V&–Æ—G•÷6†#Sc¢&V6V—BæWF†÷&—¦F–öå÷G&6V&–Æ—G•÷6†#SbÀ¢66÷Uö&÷VæF&–W3¢²ââç&V6V—Bç66÷Uö&÷VæF&–W2Ð¢Ð¢&WGW&â°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢&V6V—BæWF†÷&—¦F–öå÷&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2óCR"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢&V6V—Bç&V6÷&FVEöBÀ¢WFFVEöC¢&V6V—Bç&V6÷&FVEöBÀ¢&öG“¢°¢#ÂÒÒCƒS¦÷væW"ÖWF†÷&—¦F–öã§7F'BÒÓâ"À¢¥4ôâç7G&–æv–g’†WF†÷&—¦F–öâ’À¢#ÂÒÒCƒS¦÷væW"ÖWF†÷&—¦F–öã¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæ÷fW'&–FW0¢Ð§Ð ¦gVæ7F–öâÖ¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢&VF&6´÷fW'&–FW2Ò·Ð§ÒÒ·Ò’°¢6öç7B²66÷Uö&÷VæF&–W3¢66÷T&÷VæF'”÷fW'&–FW2Ò·ÒÂââçF÷ÆWfVÄWF†÷&—¦F–öä÷fW'&–FW2ÒÐ¢WF†÷&—¦F–öä÷fW'&–FW0¢6öç7BWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå66†VÖÀ¢FV6—6–öã¢$4ôÔ$”äTEõ#c…õ4”ätÄUôÔU$tUôUD„õ$•¤TB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ócr"À¢–æ6÷'÷&FVEö—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2óc""À¢VÆÅ÷&WVW7C¢c‚À¢'&æ6ƒ¢&f—‚÷6V7W&—G’Ö&6VÆ–æRÓ##c“r"À¢7WW'6VFW5öWF†÷&—¦F–öå÷&Vg3¢²ââç÷7ECƒTÖ–çFVææ6U7WW'6VFVDWF†÷&—¦F–öå&Vg5ÒÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢g&÷¦Vå÷CƒU÷G&6V&–Æ—G•÷6†#Sc ¢##Ccc##FVFƒ“#33&CFF&V#†C#ƒ3v6f3SCsvC“S&Cff#6cSScƒ3&#s’"À¢6æF–FFUöw&ƒ¢°¢6V7W&—G“¢°¢VÆÅ÷&WVW7C¢c‚À¢†VE÷6†¢÷7ECƒTÖ–çFVææ6U6V7W&—G”†VE6†À¢G&VU÷6†¢÷7ECƒTÖ–çFVææ6U6V7W&—G•G&VU6†¢ÒÀ¢W3eöv÷fW&ææ6S¢°¢VÆÅ÷&WVW7C¢c2À¢†VE÷6†¢÷7ECƒTÖ–çFVææ6UW3d†VE6†À¢G&VU÷6†¢÷7ECƒTÖ–çFVææ6UW3eG&VU6†À¢WF†÷&—¦F–öå÷&Vc ¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2óc"6—77VV6öÖÖVçBÓSSs#cCc““ ¢ÒÀ¢W&UöÖW&vS¢°¢†VE÷6†¢÷7ECƒTÖ–çFVææ6UW&TÖW&vU6†À¢G&VU÷6†¢÷7ECƒTÖ–çFVææ6UW&TÖW&vUG&VU6†À¢&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6U6V7W&—G”†VE6†Â÷7ECƒTÖ–çFVææ6UW3d†VE6†ÒÀ¢&W6öÇWF–öå÷F‡3¢µÐ¢ÒÀ¢6ö×÷6&–Æ—G•ö6†–ÆC¢°¢†VE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†À¢G&VU÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VEG&VU6†À¢&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6UW&TÖW&vU6†ÒÀ¢6†ævVE÷F‡3¢²ââç÷7ECƒTÖ–çFVææ6T6ö×÷6&–Æ—G”6†ævVEF‡5Ð¢Ð¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5ÒÀ¢&W6W'fVE÷–ÆöEö&Æö'3¢÷7ECƒTÖ–çFVææ6U&W6W'fVE–ÆöD&Æö'2æÖ‚†&–æF–ær’Óâ‡°¢ââæ&–æF–æp¢Ò’’À¢WF†÷&—¦VEöf–æÅ÷7W÷'C¢°¢&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†À¢6öÖÖ—Eö6÷VçC¢À¢&VçEö6÷VçC¢À¢6†ævVE÷F‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VDÖVæFÖVçEF‡5Ð¢ÒÀ¢&WV—&VEöÖW&vUöÖWF†öC¢&ÖW&vR"À¢WF†÷&—¦VEö7F–öç3¢°¢&FBW†7FÇ’öæRf–æÂ7W÷'B6öÖÖ—BF—&V7FÇ’gFW"F†R&÷VæB6ö×÷6&–Æ—G’6†–ÆBæB6†ævRöæÇ’F†RGvòfÆ–FF÷"F‡2"À¢''Vâg&W6‚W†7BÖ†VB&WV—&VB4’Â6V7W&—G’Â'&÷w6W"æB&Wf–Wr&VBÖ&6²öâF†Rf–æÂ"c‚†VB"À¢'G&ç6—F–öâ"c‚Fò&VG’öæÇ’gFW"WfW'’&WV—&VB6öçFW‡B76W2æBæò&Wf–WrF‡&VB&VÖ–ç2Vç&W6öÇfVB"À¢&ÖW&vR"c‚W†7FÇ’öæ6R'’&VwVÆ"ÖW&vRv—F‚—G2W‡V7FVBf–æÂ†VBæB&VB&6²&÷FV7FVBÖ–â4’æB6V7W&—G’ ¢ÒÀ¢ÖW&vU÷&V6öæF—F–öç3¢°¢'&÷FV7FVBÖ–â&VÖ–ç2W†7FÇ’BF†RWF†÷&—¦F–öâ&6RæBF†R7F—fR'VÆW6WB—2æV—F†W"6†ævVBæ÷"'—76VB"À¢'F†RW&RÖW&vR†2W†7FÇ’F†R&V6÷&FVBG&VRæB÷&FW&VB&VçG2æB6öçF–ç2æòÖW&vR×&W6öÇWF–öâ6†ævW2"À¢'F†R6ö×÷6&–Æ—G’6†–ÆB†2W†7FÇ’F†R&V6÷&FVBG&VRÂ6öÆR&VçBæB6öÆR6†ævVBF‚"À¢'F†Rf–æÂ"†VB—2F—&V7BöæR×&VçB6†–ÆBöbF†R6ö×÷6&–Æ—G’6†–ÆBæB6†ævW2W†7FÇ’F†RGvòWF†÷&—¦VBf–æÂ×7W÷'BF‡2"À¢'F†RW&RÖW&vRÂ6ö×÷6&–Æ—G’6†–ÆBæBf–æÂ"†VBV6‚F–ffW"g&öÒF†RWF†÷&—¦F–öâ&6R'’W†7FÇ’F†R6WfVâWF†÷&—¦VBF‡2"À¢'F†Rf—fR&W6W'fVB–ÆöB&Æö'2WVÂF†V—"&V6÷&FVB6÷W&6RÖ6æF–FFR&Æö'2BF†RW&RÖW&vRÂ6ö×÷6&–Æ—G’6†–ÆBæBf–æÂ"†VB"À¢'F†Rf–æÂ"†VB†2g&W6‚76–ær7W'&VçB'VÆW6WB×&WV—&VB6öçFW‡G2Â6V7W&—G’‚ó‚ÂÖW&vV&–Æ—G’æB¦W&òVç&W6öÇfVB&Wf–WrF‡&VG2"À¢&ç’&6RÂ6æF–FFRÂG&VRÂ&VçB÷&FW"ÂF‚Â–ÆöBÂ'VÆW6WBÂ6†V6²Â&Wf–Wr×F‡&VB÷"ÖW&vV&–Æ—G’G&–gB6æ6VÇ2F†—2WF†÷&—¦F–öâ ¢ÒÀ¢66WFæ6S¢°¢'F†R6WFVÖ&W"6V7W&—G’–ÆöB—2'—FRÖ–FVçF–6ÂFòF†R&Wf–WvVB"c‚6V7W&—G’6æF–FFR"À¢'F†RU3bFWFW&Ö–æ—7F–2Ö6Æö6²–ÆöB—2'—FRÖ–FVçF–6ÂFòF†R&Wf–WvVB"c26æF–FFR"À¢'F†RöæÇ’÷7BÖÖW&vR6ö×÷6&–Æ—G’6÷'&V7F–öâ—2F†R&V6÷&FVBFW7B76W'F–öâæBF†RöæÇ’7V'6WVVçB7W÷'B6†ævW2&RF†RGvòfÆ–FF÷"F‡2"À¢'F†R&÷FV7FVBÖÖ–âW6‚—266WFVBöæÇ’f÷"Gvò×&VçBÖW&vRv†÷6Rf—'7B&VçB—2F†RWF†÷&—¦F–öâ&6RæBv†÷6R6V6öæB&VçB—2F†Rf–æÂWF†÷&—¦VB"c‚†VB"À¢'F†R&÷FV7FVBÖÖ–âÖW&vRG&VRWVÇ2F†Rf–æÂ"c‚†VBG&VR"À¢%"c2—2–æ6÷'÷&FVB2æ6W7G'’æB—2æ÷B6W&FVÇ’WF†÷&—¦VBFòÖW&vR"À¢&æòvVæW&–2W6‚ÂWFöÖF–2ÖW&vRÂ'VÆW6WB'—72ÂCƒbÂ&öGV7B÷'VçF–ÖRÂ&W6V&6‚Â&÷f–FW"Â&öGV7F–öâÂ7&VFVçF–Â÷"6V7&WBWF†÷&—G’—2–çG&öGV6VB ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôeDU%õ4”ätÄUô4ôÔ$”äTEõ#c…ôÔU$tUôäEõ$õDT5DTEôÔ”åõ$TD$4²"À¢66÷Uö&÷VæF&–W3¢°¢#c…÷&VG•öf÷%÷&Wf–Wu÷G&ç6—F–öåöWF†÷&—¦VC¢G'VRÀ¢6–ævÆUö6öÖ&–æVE÷#c…÷&VwVÆ%öÖW&vUöWF†÷&—¦VC¢G'VRÀ¢6–ævÆUöW†7E÷&÷FV7FVEöÖ–å÷W6…öWF†÷&—¦VC¢G'VRÀ¢6W&FU÷#c5öÖW&vUöWF†÷&—¦VC¢fÇ6RÀ¢WFöÖF–5öÖW&vUöWF†÷&—¦VC¢fÇ6RÀ¢vVæW&–5÷&÷FV7FVEöÖ–å÷W6…öWF†÷&—¦VC¢fÇ6RÀ¢'VÆW6WEö'—75öWF†÷&—¦VC¢fÇ6RÀ¢&öGV7E÷'VçF–ÖUö6†ævVC¢fÇ6RÀ¢Cƒe÷F6µ÷7FFUö6†ævVC¢fÇ6RÀ¢&WFöfÆu÷&VÖ÷fVC¢fÇ6RÀ¢'F–6—çE÷&W6V&6…öW†V7WFVC¢fÇ6RÀ¢vV#5ö7F—fFVC¢fÇ6RÀ¢&öGV7F–öåö÷%÷&÷f–FW%ö×WFFVC¢fÇ6RÀ¢7&VFVçF–Ç5ö÷%÷6V7&WG5ö66W76VEö÷%ö6†ævVC¢fÇ6RÀ¢W‡FW&æÅ÷&öGV7E÷w&—FW3¢fÇ6RÀ¢Cƒuö÷%öÆFW%öF—7F6†VC¢fÇ6RÀ¢ââç66÷T&÷VæF'”÷fW'&–FW0¢ÒÀ¢ââçF÷ÆWfVÄWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢&WGW&â°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ócr"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&V6÷&FVDBÀ¢WFFVEöC¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7B×CƒRÖÖ–çFVææ6S¦÷væW"ÖWF†÷&—¦F–öã§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†WF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7B×CƒRÖÖ–çFVææ6S¦÷væW"ÖWF†÷&—¦F–öã¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââç&VF&6´÷fW'&–FW0¢Ð§Ð ¦gVæ7F–öâÖ¶TæG&ö–DæF—fU7W&f6TWF†÷&—¦F–öå&VF&6²‡°¢F—7F6„WF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢FFVæGVÔWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢f÷&Vw&÷VæDWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢F—7F6…&VF&6´÷fW'&–FW2Ò·ÒÀ¢FFVæGVÕ&VF&6´÷fW'&–FW2Ò·ÒÀ¢f÷&Vw&÷VæE&VF&6´÷fW'&–FW2Ò·Ð§ÒÒ·Ò’°¢6öç7BF—7F6„WF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FRÖæG&ö–BÖæF—fR×7W&f6RÖ÷væW"ÖF—7F6‚÷c"À¢FV6—6–öã¢$D•5D4…ô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†¢ÒÀ¢'&æ6ƒ¢æG&ö–DæF—fU7W&f6T'&æ6‚À¢ö&¦V7F—fS ¢&VÆ–Ö–æFRF†R&WVFVB–æ—F–ÂÖæF—fR×7W&f6Rf–ÇW&R6W6VBv†Vâ¶æ÷vâ×&ö×B†æFÆ–ærÆVfW2ÆFW"T”WFöÖF÷"&ö&Rv—F‚öæÇ’FWÆWFVB6†&VBFVFÆ–æR"À¢WF†÷&—¦VE÷F‡3¢æG&ö–DæF—fU7W&f6TWF†÷&—¦VEF‡2ç6Æ–6RƒÂ"’À¢WF†÷&—¦VEö7F–öç3¢°¢&7&VFRF†R&÷VæFVB'&æ6‚æBG&gBVÆÂ&WVW7B"À¢&6öÖÖ—BFWFW&Ö–æ—7F–2$TB6öçG&7B&Vf÷&R–×ÆVÖVçFF–öâ"À¢&Ç’F†RÖ–æ–×VÒf–ÂÖ6Æ÷6VBu$TTâ6†ævRv—F†–âF†RGvòF‡2"À¢''Vâg&W6‚4’æB6V7W&—G’"À¢&ö'F–âGvò–æFWVæFVçB6ÖRÖ†VBæG&ö–B76W2æBW†7BÖ†VB&Wf–Wr ¢ÒÀ¢66WFæ6S¢°¢&¶æ÷vâ×&ö×B†æFÆ–ær6ææ÷B&VGV6RF†RæW‡BT”WFöÖF÷"&ö&R&VÆ÷r—G2&÷VæFVB6öÖÖæBv–æF÷rv†–ÆRF†RF÷FÂæ÷&ÖÆ—¦F–öâ&VÖ–ç2&÷VæFVB"À¢$6‡&öÖR7F—f—G’–FVçF—G’—2&W6W'fVB7&÷72WfW'’7W&f6R&ö&R"À¢'Væ¶æ÷vâÖöFÇ2Â7F—f—G’G&–gBÂD"÷"T”WFöÖF÷"f–ÇW&RÂæBW‡—&VBF÷FÂ&÷VæG27F–ÆÂf–Â6Æ÷6VB"À¢&f–ÆVBÖ¦ö"&W'VâFöW2æ÷BW&6R&V6÷&FVB&WVFVBf–ÇW&R ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR"À¢'&VG’"c÷"&V&6R"c"À¢&6†ævRCƒb÷"ç’F6²6†V6¶&÷‚"À¢'&VÖ÷fRF†R&WFfÆr"À¢&×WFFRv÷&¶fÆ÷w2Â'VÆW6WG2Â&÷f–FW'2ÂFWÆ÷–ÖVçG2Â7&VFVçF–Ç2Â6V7&WG2Âg&÷¦VâCƒRWf–FVæ6RÂ&W6V&6‚7FFRÂvV#2Â÷"W‡FW&æÂ&öGV7G2 ¢ÒÀ¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæF—7F6„WF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7BFFVæGVÔWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FRÖæG&ö–BÖæF—fR×7W&f6R×G&6V&–Æ—G’ÖFFVæGVÒ÷c"À¢FV6—6–öã¢$U„5EôdõU%õD…õE$4T$”Ä•E•ôDDTäETÕô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢æG&ö–DæF—fU7W&f6TF—7F6…&VbÀ¢66÷U÷&÷÷6Å÷&Vc¢æG&ö–DæF—fU7W&f6U66÷U&÷÷6Å&VbÀ¢VÆÅ÷&WVW7C¢c’À¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢6VVEö†VC¢°¢'&æ6ƒ¢æG&ö–DæF—fU7W&f6T'&æ6‚À¢6†¢æG&ö–DæF—fU7W&f6U6VVD†VE6†¢ÒÀ¢g&÷¦Vå÷CƒU÷G&6V&–Æ—G•÷6†#Sc¢44UDTEõE$4T$”Ä•E•õ4„#SbÀ¢WF†÷&—¦VE÷F‡3¢²ââææG&ö–DæF—fU7W&f6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEöÖVæFÖVçC¢°¢&VçE÷6†¢æG&ö–DæF—fU7W&f6U6VVD†VE6†À¢Ö†–×VÕö6öÖÖ—Eö6÷VçC¢"À¢6†ævVE÷F‡3¢²ââææG&ö–DæF—fU7W&f6TÖVæFÖVçEF‡5ÒÀ¢FW7G5öf—'7C¢G'VP¢ÒÀ¢WF†÷&—¦VEö7F–öç3¢°¢&FBFWFW&Ö–æ—7F–2f–ÂÖ6Æ÷6VBfÆ–FF÷"FW7G2&Vf÷&R–×ÆVÖVçFF–öâ"À¢&Ç’F†RÖ–æ–×VÒ"c’×7V6–f–2WF†÷&—¦F–öâ&V6övæ—F–öâ"À¢''Vâg&W6‚W†7BÖ†VB4’æB6V7W&—G’"À¢&ö'F–âGvò–æFWVæFVçB6ÖRÖ†VBæG&ö–B76W2æBW†7BÖ†VB&Wf–Wr ¢ÒÀ¢66WFæ6S¢°¢'F†R÷&–v–æÂ÷væW"F—7F6‚&VÖ–ç2'—FRÖf÷"Ö'—FR–Ö×WF&ÆRæB÷væW"ÖWF†÷&VB"À¢'F†Rf–æÂ"F–fb—2W†7FÇ’F†RWF†÷&—¦VBf÷W"×F‚6WB"À¢'F†Rg&÷¦VâCƒRG&6V&–Æ—G’6öçG&7B&VÖ–ç2'—FRÖf÷"Ö'—FRVæ6†ævVB"À¢'&W÷6—F÷'’Â÷væW"Â&6RÂ'&æ6‚ÂVÆÂ&WVW7BÂ6VVB†VBÂW†7BÖ†VB7F–öç26öçFW‡BæBG&gB7FFRÆÂÖF6‚"À¢&6öÖÖVçBFVÆWF–öâ÷"×WFF–öâÂ’f–ÇW&RÂ7F÷"Ö—6ÖF6‚Â&6R÷"†VBæ6W7G'’G&–gBÂ'&æ6‚÷"F‚G&–gBÂ&WÆ’'’æ÷F†W"VÆÂ&WVW7BÂ÷"vVæW&–2&öGV7B×F‚WF†÷&—¦F–öâf–Ç26Æ÷6VB ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâ"À¢&vVæW&–2&öGV7B×F‚WF†÷&—¦F–öâ÷"&WW6R'’æ÷F†W"VÆÂ&WVW7B"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WB÷"g&÷¦VâCƒRWf–FVæ6R×WFF–öâ"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢%CƒbÂF6²Ö6†V6¶&÷‚Â&WFÖfÆrÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B6†ævR ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEôtDUõ$T4T•B"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæFFVæGVÔWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7Bf÷&Vw&÷VæDWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FRÖæG&ö–BÖæF—fR×7W&f6RÖf÷&Vw&÷VæBÖFVFÆ–æRÖFFVæGVÒ÷c"À¢FV6—6–öã¢%4ÔUôdõU%õD…ôdõ$Tu$õTäEôDTDÄ”äUôDDTäETÕô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢æG&ö–DæF—fU7W&f6TF—7F6…&VbÀ¢&–÷%öFFVæGVÕ÷&Vc¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öå&VbÀ¢66÷U÷&÷÷6Å÷&Vc¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæE66÷U&÷÷6Å&VbÀ¢VÆÅ÷&WVW7C¢c’À¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢6VVEö†VC¢°¢'&æ6ƒ¢æG&ö–DæF—fU7W&f6T'&æ6‚À¢6†¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæE6VVD†VE6†¢ÒÀ¢g&÷¦Vå÷CƒU÷G&6V&–Æ—G•÷6†#Sc¢44UDTEõE$4T$”Ä•E•õ4„#SbÀ¢WF†÷&—¦VE÷F‡3¢²ââææG&ö–DæF—fU7W&f6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEöÖVæFÖVçC¢°¢&VçE÷6†¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæE6VVD†VE6†À¢Ö†–×VÕö6öÖÖ—Eö6÷VçC¢"À¢6†ævVE÷F‡3¢²ââææG&ö–DæF—fU7W&f6TWF†÷&—¦VEF‡5ÒÀ¢FW7G5öf—'7C¢G'VP¢ÒÀ¢WF†÷&—¦VEö7F–öç3¢°¢&FBFWFW&Ö–æ—7F–2f–ÂÖ6Æ÷6VBFW7G2&Vf÷&R–×ÆVÖVçFF–öâ"À¢&Vç7W&Rf–æÂf÷&Vw&÷VæB7F—f—G’7V—6—F–öâ6ææ÷BFWÆWFRF†RföÆÆ÷v–ærT”WFöÖF÷"&ö&R"À¢'&W6W'fRF†RSÖ–ÆÆ—6V6öæBW"×&ö&R6æB&÷VæFVBF÷FÂf–æÂ×&ööbVçfVÆ÷R"À¢&WF†VçF–6FRF†—2W†7BõtäU"FFVæGVÒf÷""c’"À¢''Vâg&W6‚W†7BÖ†VB4’æB6V7W&—G’"À¢&ö'F–âGvò–æFWVæFVçB6ÖRÖ†VBæG&ö–B76W2æBW†7BÖ†VB&Wf–Wr ¢ÒÀ¢66WFæ6S¢°¢'F†R÷&–v–æÂF—7F6‚æB&–÷"FFVæGVÒ&VÖ–â'—FRÖf÷"Ö'—FR–Ö×WF&ÆRæB÷væW"ÖWF†÷&VB"À¢'F†Rf–æÂ"F–fb&VÖ–ç2W†7FÇ’F†RWF†÷&—¦VBf÷W"×F‚6WB"À¢'F†Rg&÷¦VâCƒRG&6V&–Æ—G’6öçG&7B&VÖ–ç2'—FRÖf÷"Ö'—FRVæ6†ævVB"À¢'&W÷6—F÷'’Â÷væW"Â&6RÂ'&æ6‚ÂVÆÂ&WVW7BÂ6VVBæ6W7G'’ÂW†7BÖ†VB7F–öç26öçFW‡BæBG&gB7FFRÆÂÖF6‚"À¢&f÷&Vw&÷VæB7F—f—G’7V—6—F–öâæBF†RföÆÆ÷v–ærT”WFöÖF÷"&ö&RV6‚&V6V—fRâ–æFWVæFVçBÖ†–×VÒSÖ–ÆÆ—6V6öæBv–æF÷rv—F†–âöæRW‡Æ–6—B&÷VæFVBf–æÂ×&ööbVçfVÆ÷R"À¢&6öÖÖVçBFVÆWF–öâ÷"×WFF–öâÂ’f–ÇW&RÂ7F÷"Ö—6ÖF6‚Â&6R÷"†VBæ6W7G'’G&–gBÂ'&æ6‚÷"F‚G&–gBÂ&WÆ’'’æ÷F†W"VÆÂ&WVW7BÂW†6W76—fR6öÖÖ—G2ÂÖW&vR6öÖÖ—G2÷"vVæW&–2&öGV7B×F‚WF†÷&—¦F–öâf–Ç26Æ÷6VB ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâ"À¢&vVæW&–2&öGV7B×F‚WF†÷&—¦F–öâ÷"&WW6R'’æ÷F†W"VÆÂ&WVW7B"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WB÷"g&÷¦VâCƒRWf–FVæ6R×WFF–öâ"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢%CƒbÂF6²Ö6†V6¶&÷‚Â&WFÖfÆrÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B6†ævR ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDUõ$T4T•B"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæf÷&Vw&÷VæDWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢&WGW&â°¢F—7F6ƒ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢æG&ö–DæF—fU7W&f6TF—7F6…&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢æG&ö–DæF—fU7W&f6TF—7F6…&V6÷&FVDBÀ¢WFFVEöC¢æG&ö–DæF—fU7W&f6TF—7F6…&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†F—7F6„WF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S¦÷væW"ÖF—7F6ƒ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæF—7F6…&VF&6´÷fW'&–FW0¢ÒÀ¢FFVæGVÓ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öå&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öå&V6÷&FVDBÀ¢WFFVEöC¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öå&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S§G&6V&–Æ—G’ÖFFVæGVÓ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†FFVæGVÔWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S§G&6V&–Æ—G’ÖFFVæGVÓ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæFFVæGVÕ&VF&6´÷fW'&–FW0¢ÒÀ¢f÷&Vw&÷VæDFFVæGVÓ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæDWF†÷&—¦F–öå&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæDWF†÷&—¦F–öå&V6÷&FVDBÀ¢WFFVEöC¢æG&ö–DæF—fU7W&f6Tf÷&Vw&÷VæDWF†÷&—¦F–öå&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S¦f÷&Vw&÷VæBÖFVFÆ–æRÖFFVæGVÓ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†f÷&Vw&÷VæDWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒæG&ö–BÖæF—fR×7W&f6S¦f÷&Vw&÷VæBÖFVFÆ–æRÖFFVæGVÓ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæf÷&Vw&÷VæE&VF&6´÷fW'&–FW0¢Ð¢Ð§Ð ¦gVæ7F–öâÖ¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢F—7F6„WF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢FFVæGVÔWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢f÷&ÖDWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢&Wf–Wu&VÖVF–F–öäWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢7V6…W6…7WW'6W76–öäWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢f–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW2Ò·ÒÀ¢F—7F6…&VF&6´÷fW'&–FW2Ò·ÒÀ¢FFVæGVÕ&VF&6´÷fW'&–FW2Ò·ÒÀ¢f÷&ÖE&VF&6´÷fW'&–FW2Ò·ÒÀ¢&Wf–Wu&VÖVF–F–öå&VF&6´÷fW'&–FW2Ò·ÒÀ¢f–æÅ6VÅ&VF&6´÷fW'&–FW2Ò·ÒÀ¢7V6…W6…7WW'6W76–öå&VF&6´÷fW'&–FW2Ò·ÒÀ¢f–æÅ6VÅcE&VF&6´÷fW'&–FW2Ò·ÒÀ¢v—D&–æF–ærÒÖ¶U÷7Cc”v÷fW&ææ6Tv—D&–æF–ær‚§ÒÒ·Ò’°¢6öç7BF—7F6„WF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öâÖ÷væW"ÖF—7F6‚÷c"À¢FV6—6–öã¢$D•5D4…ô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&VçE÷6†¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†À¢ÖW&vVE÷VÆÅ÷&WVW7C¢c’À¢ÖW&vVEö†VE÷6†¢æG&ö–DæF—fU7W&f6TÖW&vVD†VE6†¢ÒÀ¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢ö&¦V7F—fS ¢&Ö¶RF†Rg&÷¦Vâ÷7BÕCƒRfÆ–FF÷"66WBF†RWF†VçF–6FVB"c’7V6‚&W7VÇBöâ&÷FV7FVBÖÖ–âW6‚v†–ÆR&V6öæ6–Æ–ær$TDÔRæBF†RCƒbF6²FW67&—F–öâFòF†R6ÖRÆ—fR„ôÄB7FFR"À¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEö7F–öç3¢°¢&7&VFRF†R&÷VæFVB'&æ6‚æBG&gBVÆÂ&WVW7B"À¢&6öÖÖ—BFWFW&Ö–æ—7F–2FW7G2&Vf÷&R–×ÆVÖVçFF–öâ"À¢&Ç’F†RÖ–æ–×VÒf–ÂÖ6Æ÷6VB÷7BÖÖW&vR&V6övæ—F–öâ"À¢'WFFRöæÇ’7W'&VçB&öw&W72æBCƒb„ôÄBv÷&F–ær–â$TDÔRæÖBæBF6·2æÖB"À¢''Vâg&W6‚W†7BÖ†VB4’æB6V7W&—G’æBö'F–âW†7BÖ†VB&Wf–Wr ¢ÒÀ¢66WFæ6S¢°¢%"c’ÖW&vVBW†7B†VBÂÖW&vR4„Â&÷FV7FVB&6R&VçBÂ&W÷6—F÷'’Â÷væW"æBW†7Bf÷W"×F‚†—7F÷'’&RWF†VçF–6FVB"À¢'VÆÂ×&WVW7BÖ†VBæB&÷FV7FVBÖÖ–â×W6‚6öçFW‡G2&RF—7F–æwV—6†VBv—F†÷WBvVæW&–2Ö–çFVææ6R'—72"À¢&×WFF–öâÂFVÆWF–öâÂ7F÷"Ö—6ÖF6‚Â4„Ö—6ÖF6‚Â'&æ6‚Ö—6ÖF6‚ÂF‚G&–gBÂ&WÆ’÷"’f–ÇW&Rf–Ç26Æ÷6VB"À¢%$TDÔR&W÷'G2ƒb6†V6¶VBF6·3¢CÕCƒRæBC“r"À¢%Cƒb&VÖ–ç2Væ6†V6¶VBæBF†R&WFfÆr&VÖ–ç2Væ6†ævVB"À¢&æò÷F†W"F6²÷"—77VR6†V6¶&÷‚6†ævW2 ¢ÒÀ¢6öÖÖ—Eö'VFvWC¢²Ö†–×VÕö6öÖÖ—G3¢"ÂFW7G5öf—'7C¢G'VRÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâVæFW"F†—2&V6V—B"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢%Cƒb6ö×ÆWF–öâÂF6²Ö6†V6¶&÷‚6†ævR÷"&WFÖfÆr&VÖ÷fÂ"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WBÂg&÷¦VâCƒRWf–FVæ6RÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B×WFF–öâ"À¢'&—6²66WFæ6Rf÷"ç’g&÷¦VâCƒRFWf–F–öâ ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDR"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæF—7F6„WF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7BFFVæGVÔWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öâÖFFVæGVÒ÷c"À¢FV6—6–öã¢$U„5Eô„TEôDDTäETÕô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢÷7Cc”v÷fW&ææ6TF—7F6…&VbÀ¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢6VVEö†VC¢°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEöÖVæFÖVçC¢°¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢6öÖÖ—Eö6÷VçC¢À¢6†ævVE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TÖVæFÖVçEF‡5ÒÀ¢FW7G5öf—'7C¢G'VP¢ÒÀ¢66WFæ6S¢°¢'F†RF—7F6‚æBFFVæGVÒ&VÖ–â–Ö×WF&ÆRæBõtäU"ÖWF†÷&VB"À¢'F†Rf–æÂ"F–fb—2W†7FÇ’F†Rf÷W"WF†÷&—¦VBF‡2"À¢'F†R6VVB—2F†R6öÆR&VçBöböæR–×ÆVÖVçFF–öâ6öÖÖ—BæBæòÖW&vR6öÖÖ—BW†—7G2"À¢%$TDÔRæBF6·2æÖB6''’F†R6ÖR7W'&VçB„ôÄB7FFRv†–ÆRWfW'’F6²6†V6¶&÷‚&VÖ–ç2Væ6†ævVB"À¢%"c’7V6‚&÷fVææ6R—2&÷VæB'’W†7B&6RÂÖW&vVB†VBÂÖW&vR4„æB–FVçF–6ÂG&VR"À¢$’f–ÇW&RÂ7F÷"Ö—6ÖF6‚Â&6RÂ'&æ6‚Â"ÂF‚Âæ6W7G'’Â6öÖÖ—BÖ6÷VçB÷"6öçFVçBG&–gBf–Ç26Æ÷6VB ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâ"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢%Cƒb6ö×ÆWF–öâÂF6²Ö6†V6¶&÷‚6†ævR÷"&WFÖfÆr&VÖ÷fÂ"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WBÂg&÷¦VâCƒRWf–FVæ6RÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B×WFF–öâ ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDR"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæFFVæGVÔWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7Bf÷&ÖDWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öâÖf÷&ÖBÖFFVæGVÒ÷c"À¢FV6—6–öã¢%4ÔUôdõU%õD…ôdõ$ÔEõ$TÔTD”D”ôåô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢÷7Cc”v÷fW&ææ6TF—7F6…&VbÀ¢&–÷%öFFVæGVÕ÷&Vc¢÷7Cc”v÷fW&ææ6TFFVæGVÕ&VbÀ¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢FW7G5öf—'7E÷6VVC¢°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†¢ÒÀ¢f–ÆVEöW†7Eö†VC¢°¢6†¢#scs#6fSsS“–C†3s“Svc†6#sSS3C“c†S#““s"À¢6•÷'Vã¢3C##sC3ƒ‚À¢f–ÆVEö¦ö#¢$g&öçFVæBæB6öçG&7BfW&–f–6F–öâ"À¢f–ÆVE÷7FW¢%'Vâ&W÷6—F÷'’fW&–f–6F–öâ"À¢f–ÇW&S¢%&WGF–W"f÷&ÖBÖ6†V6²&V¦V7FVB67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2 ¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEöÖVæFÖVçC¢°¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢6öÖÖ—Eö6÷VçC¢À¢6†ævVE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢FW7Eöf–ÆUöFVÇF¢'&WGF–W"ÖöæÇ’"À¢FW7G5öf—'7C¢G'VP¢ÒÀ¢66WFæ6S¢°¢'F†Rf–æÂ"&VÖ–ç2W†7FÇ’F†R6ÖRf÷W"WF†÷&—¦VBF‡2æBGvòÖ6öÖÖ—BFW7G2Öf—'7BF÷öÆöw’"À¢'F†RFW7BÖf–ÆRFVÇFg&öÒF†R6VVB—2f÷&ÖGF–ærÖöæÇ’æB6†ævW2æò76W'F–öâÂf—‡GW&RÂWF†÷&—¦F–öâfÇVR÷"W†V7WF&ÆR&V†f–÷""À¢'F†R–Ö×WF&ÆRF—7F6‚Â&–÷"FFVæGVÒæBF†—2f÷&ÖBFFVæGVÒ&RõtäU"ÖWF†÷&VBæB&VB&6²W†7FÇ’"À¢&g&W6‚W†7BÖ†VB4’æB6V7W&—G’72æBW†7BÖ†VB&Wf–Wr&W÷'G2æò&Æö6¶–ærf–æF–ær ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâ"À¢&ç’FW7B6VÖçF–26†ævR÷"F‚v–FVæ–ær"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢%Cƒb6ö×ÆWF–öâÂF6²Ö6†V6¶&÷‚6†ævR÷"&WFÖfÆr&VÖ÷fÂ"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WBÂg&÷¦VâCƒRWf–FVæ6RÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B×WFF–öâ ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDR"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââæf÷&ÖDWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7B&Wf–Wu&VÖVF–F–öäWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öâ×&Wf–Wr×&VÖVF–F–öâÖFFVæGVÒ÷c"À¢FV6—6–öã¢%$Ud”Uuõ$TÔTD”D”ôåô44UDTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢÷7Cc”v÷fW&ææ6TF—7F6…&VbÀ¢&÷÷6Å÷&Vc¢÷7Cc”v÷fW&ææ6U&Wf–Wu&÷÷6Å&VbÀ¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢&Æö6¶VEö†VC¢°¢6†¢÷7Cc”v÷fW&ææ6T&Æö6¶VD†VE6†À¢G&VU÷6†¢÷7Cc”v÷fW&ææ6T&Æö6¶VEG&VU6†¢ÒÀ¢FW7G5öf—'7E÷6VVC¢°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢WF†÷&—¦VEöFVÇF÷F‡3¢°¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2 ¢ÒÀ¢WF†÷&—¦VEö7F–öç3¢°¢&FBFWFW&Ö–æ—7F–2&Vw&W76–öâ6÷fW&vRf÷"F†R&öGV7F–öâÖFVfVÇB"c’&÷FV7FVBÖÖ–âW6‚æBf–ÂÖ6Æ÷6VBæV"Ö—76W2"À¢'6VÆV7BF†Rg&÷¦Vâ6ö×ÆWFVB×F6²F–vW7BöæÇ’f÷"F†RW†7BWF†VçF–6FVB"c’&÷FV7FVBÖÖ–âW6‚"À¢&WF†VçF–6FRöæRÆFW"–Ö×WF&ÆRõtäU"6VÂ&–æF–ærF†RW†7Bf–æÂ"s†VBÂG&VRÂ&VçBÂF÷öÆöw’ÂF‡2æB6öçFVçB&Æö'2"À¢'&V7&VFRF†R6öÆR–×ÆVÖVçFF–öâ6†–ÆBöbF†RW†—7F–ærFW7G2Öf—'7B6VVBv—F†÷WB6†æv–ær$TDÔRæÖB÷"F6·2æÖB'—FW2"À¢''Vâg&W6‚W†7BÖ†VB4’æB6V7W&—G’æBö'F–âW†7BÖ†VB&Wf–Wr ¢ÒÀ¢66WFæ6S¢°¢'F†RW†7BWF†VçF–6FVB"c’&÷FV7FVBÖÖ–âW6‚66WG2g&÷¦Vâ6ö×ÆWFVB×F6²F–vW7B“#“SS3S#&S–CfS–cSvC“&CF#–c†C6fS6#CScCSCV†&&FCscCCf32æBWfW'’æV"Ö—72f–Ç26Æ÷6VB"À¢&Ö—76–ærÂæöâÔõtäU"ÂVF—FVBÂ7FÆRÖ†VBÂw&öær×G&VRÂw&öær×&VçBÂw&öær×F‚Âw&öær×FW7BÖ&Æö"÷"w&öær×fÆ–FF÷"Ö&Æö"f–æÂ6VÂf–Ç26Æ÷6VB"À¢'F†Rf–æÂ"&VÖ–ç2W†7FÇ’f÷W"F‡2æBGvòÆ–æV"6öÖÖ—G2v—F‚6VVBcƒC“ƒSfCcv#Cƒ–S–36FS&#3#C“†f3c"26öÆR&VçBöbF†R–×ÆVÖVçFF–öâ6öÖÖ—B"À¢%$TDÔRæÖBæBF6·2æÖB&VÖ–â'—FRÖ–FVçF–6ÂFò&Æö6¶VB†VBScscV6Cƒ†Cƒƒ#f3cs3†CsfC6S–&6cSf#cC"æBWfW'’F6²6†V6¶&÷‚&VÖ–ç2Væ6†ævVB"À¢&g&W6‚W†7BÖ†VB4’æB6V7W&—G’72æBW†7BÖ†VB&Wf–Wr&W÷'G2æò&Æö6¶–ærf–æF–ær ¢ÒÀ¢f÷&&–FFVã¢°¢&ÖW&vR÷"&VG’Öf÷"×&Wf–WrG&ç6—F–öâ"À¢'F‚v–FVæ–ær÷"$TDÔRæÖBÂF6·2æÖBÂF6²Ö6†V6¶&÷‚ÂCƒb÷"&WFÖfÆr6†ævR"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢'v÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WBÂg&÷¦VâCƒRWf–FVæ6RÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B×WFF–öâ"À¢'&—6²66WFæ6R÷"vVæW&–2Ö–çFVææ6R'—72 ¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDR"À¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6RÀ¢ââç&Wf–Wu&VÖVF–F–öäWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7Bf–æÅ6VÄWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öâÖf–æÂ×6VÂ÷c""À¢FV6—6–öã¢$d”äÅô„TEõ4TÄTB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢F—7F6…÷&Vc¢÷7Cc”v÷fW&ææ6TF—7F6…&VbÀ¢&VÖVF–F–öå÷&Vc¢÷7Cc”v÷fW&ææ6U&Wf–Wu&VÖVF–F–öå&VbÀ¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢f–æÅö†VC¢°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢÷7Cc”v÷fW&ææ6U&–÷$f–æÄ†VE6†À¢G&VU÷6†¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅG&VU6†À¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢&VçEö6÷VçC¢À¢6öÖÖ—Eö6÷VçC¢"À¢ÖW&vUö6öÖÖ—Eö6÷VçC¢ ¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢6öçFVçEö&Æö'3¢°¢%$TDÔRæÖB#¢÷7Cc”v÷fW&ææ6T&Æö6¶VE&VFÖT&Æö%6†À¢¶G¶fVGW&UF‡Ò÷F6·2æÖFÓ¢÷7Cc”v÷fW&ææ6T&Æö6¶VEF6·4&Æö%6†À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2#¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅFW7D&Æö%6†À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅfÆ–FF÷$&Æö%6†¢ÒÀ¢&Æö6¶VEö†VE÷&W6W'fF–öã¢°¢&Æö6¶VEö†VE÷6†¢÷7Cc”v÷fW&ææ6T&Æö6¶VD†VE6†À¢&VFÖUö&Æö%÷6†¢÷7Cc”v÷fW&ææ6T&Æö6¶VE&VFÖT&Æö%6†À¢F6·5ö&Æö%÷6†¢÷7Cc”v÷fW&ææ6T&Æö6¶VEF6·4&Æö%6†À¢F6µö6†V6¶&÷…÷6–væGW&U÷6†#Sc¢÷7Cc”v÷fW&ææ6UF6´6†V6¶&÷…6–væGW&U6†#S`¢ÒÀ¢7FFS¢°¢G&gC¢G'VRÀ¢†öÆC¢G'VRÀ¢&VG•öf÷%÷&Wf–Ws¢fÇ6RÀ¢ÖW&vUöWF†÷&—¦F–öã¢fÇ6P¢ÒÀ¢FW&Ö–æÅ÷öÆ–7“¢%5DõôEôE$eEôU„5Eô„TEõ$Ud”UuôtDR"À¢ââæf–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7B7V6…W6…7WW'6W76–öäWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6R×7V6‚×W6‚Öf–æÂ×7WW'6W76–öâ÷c""À¢FV6—6–öã¢%c5õ4TÅõ$U4U%dTEõõcEôd”äÅõ4TÅôUD„õ$•¤TB"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢&–÷%÷7WW'6W76–öå÷&Vc ¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSSƒc#3""À¢&–÷%öf–æÅö†VC¢°¢6†¢÷7Cc”v÷fW&ææ6U7WW'6VFVDf–æÄ†VE6†À¢G&VU÷6†¢÷7Cc”v÷fW&ææ6U7WW'6VFVDf–æÅG&VU6†À¢f–æÅ÷6VÅ÷&Vc¢÷7Cc”v÷fW&ææ6U7WW'6VFVDf–æÅ6VÅ&V`¢ÒÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢FW7G5öf—'7E÷6VVE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢WF†÷&—¦VEöFVÇF÷F‡3¢°¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2 ¢ÒÀ¢&WV—&VE÷&W7VÇC¢°¢f–æÅ÷6VÅöÖ&¶W#¢'÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦f–æÂ×6VÃ§cB"À¢ÖW&vUöÖWF†öC¢'7V6‚"À¢öæU÷F–ÖS¢G'VRÀ¢'—73¢fÇ6RÀ¢&÷FV7FVEöÖ–å÷W6…÷&VçE÷6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†¢ÒÀ¢66WFæ6S¢°¢'F†Rc26VÂ&VÖ–ç2–Ö×WF&ÆR†—7F÷&–6ÂWf–FVæ6Rf÷"3“VfSsƒ#f&#sfs–c#3#sCC63SC“fcc"À¢'F†RWF†VçF–6FVB"s–FVçF—G’&WV—&W2F†RW†7Bf÷W"×F‚v÷fW&ææ6R66÷RWfVâ–b&÷6RF‡2&R&W7F÷&VB"À¢&öæR–Ö×WF&ÆRõtäU"cB6VÂ&–æG2F†R&WÆ6VÖVçB"†VBÂG&VRÂ6VVB&VçBÂ6öÖÖ—GFVEöBÂW†7Bf÷W"&Æö'2æBVæ6†ævVBF6²Ö6†V6¶&÷‚6–væGW&R"À¢&öæÇ’âWF†VçF–6FVB&÷FV7FVBÖÖ–âW6‚v—F‚6÷W&6R&6RCs–FVfV3C–#cVCS–&f33C–3&SvfC&CBÂöæR&VçBWVÂFòF†B&6RÂæBG&VRæBf÷W"&Æö'2WVÂFòF†RcB×6VÆVB"†VB—266WFVB"À¢&g&W6‚W†7BÖ†VB4’RöbRÂ6V7W&—G’‚öb‚æB7W'&VçBÖ†VB&Wf–Wr†fRæòVç&W6öÇfVB÷"&Vf÷&RF†RöæR×F–ÖR7V6‚ÖW&vR ¢ÒÀ¢f÷&&–FFVã¢°¢%$TDÔRÂF6·2ÂF6²Ö6†V6¶&÷‚ÂCƒb÷"&WFÖfÆr6†ævR"À¢%"c&V&6RÂ&VG’G&ç6—F–öâ÷"ÖW&vR"À¢'F‚v–FVæ–ærÂv÷&¶fÆ÷rÂ'VÆW6WBÂ&÷f–FW"ÂFWÆ÷–ÖVçBÂ7&VFVçF–ÂÂ6V7&WBÂ&W6V&6‚ÂvV#2÷"W‡FW&æÂ×&öGV7B×WFF–öâ"À¢&ÖW&vR&Vf÷&RWfW'’vFR76W2÷"ç’ÖW&vRÖÖWF†öB÷"'VÆW6WB'—72 ¢ÒÀ¢ââç7V6…W6…7WW'6W76–öäWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢6öç7Bf–æÅ6VÅcDWF†÷&—¦F–öâÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×÷7Cc’Öv÷fW&ææ6RÖf–æÂ×6VÂ÷cB"À¢FV6—6–öã¢$d”äÅô„TEõ4TÄTEõô4ôäD•D”ôäÅõ5T4…ôÔU$tR"À¢66WFVEö'“¢f—‡GW&U&V6V—D÷væW"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢7WW'6W76–öå÷&Vc¢÷7Cc”v÷fW&ææ6U7V6…W6…7WW'6W76–öå&VbÀ¢VÆÅ÷&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7BÀ¢WF†÷&—¦F–öåö&6S¢°¢'&æ6ƒ¢&Ö–â"À¢6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢&÷FV7FVC¢G'VP¢ÒÀ¢f–æÅö†VC¢°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢v—D&–æF–æræ†VBÀ¢G&VU÷6†¢v—D&–æF–æræ†VE÷G&VU÷6†À¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢6öÖÖ—GFVEöC¢v—D&–æF–æræ†VEö6öÖÖ—GFVEö@¢ÒÀ¢F÷öÆöw“¢²F÷FÅö6öÖÖ—G3¢"Â–×ÆVÖVçFF–öåö6öÖÖ—G3¢ÂÖW&vUö6öÖÖ—G3¢ÒÀ¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5ÒÀ¢6öçFVçEö&Æö'3¢°¢%$TDÔRæÖB#¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷&VFÖUö&Æö%÷6†À¢¶G¶fVGW&UF‡Ò÷F6·2æÖFÓ¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷F6·5ö&Æö%÷6†À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2# ¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷FW7Eö&Æö%÷6†À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷fÆ–FF÷%ö&Æö%÷6†¢ÒÀ¢F6µö6†V6¶&÷…÷6–væGW&U÷6†#Sc¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6U÷F6µö6†V6¶&÷…÷6–væGW&U÷6†#SbÀ¢ÖW&vUöWF†÷&—¦F–öã¢²ÖWF†öC¢'7V6‚"ÂöæU÷F–ÖS¢G'VRÂ'—73¢fÇ6RÒÀ¢66÷Uö&÷VæF&–W3¢°¢Cƒeö6†V6¶&÷…ö6†ævVC¢fÇ6RÀ¢&WFöfÆu÷&VÖ÷fVC¢fÇ6RÀ¢#c÷&V&6VEö÷%÷&VF–VC¢fÇ6RÀ¢'VÆW6WEö÷%÷&÷f–FW%ö×WFFVC¢fÇ6RÀ¢&W6V&6…÷vV#5÷&öGV7F–öåö÷%÷6V7&WG5öW‡æFVC¢fÇ6P¢ÒÀ¢ââæf–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW0¢Ð¢&WGW&â°¢F—7F6ƒ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7Cc”v÷fW&ææ6TF—7F6…&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7Cc”v÷fW&ææ6TF—7F6…&V6÷&FVDBÀ¢WFFVEöC¢÷7Cc”v÷fW&ææ6TF—7F6…&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†F—7F6„WF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦÷væW"ÖF—7F6ƒ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæF—7F6…&VF&6´÷fW'&–FW0¢ÒÀ¢FFVæGVÓ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7Cc”v÷fW&ææ6TFFVæGVÕ&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7Cc”v÷fW&ææ6TFFVæGVÕ&V6÷&FVDBÀ¢WFFVEöC¢÷7Cc”v÷fW&ææ6TFFVæGVÕ&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦FFVæGVÓ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†FFVæGVÔWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦FFVæGVÓ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæFFVæGVÕ&VF&6´÷fW'&–FW0¢ÒÀ¢f÷&ÖDFFVæGVÓ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7Cc”v÷fW&ææ6Tf÷&ÖDFFVæGVÕ&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7Cc”v÷fW&ææ6Tf÷&ÖDFFVæGVÕ&V6÷&FVDBÀ¢WFFVEöC¢÷7Cc”v÷fW&ææ6Tf÷&ÖDFFVæGVÕ&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦f÷&ÖBÖFFVæGVÓ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†f÷&ÖDWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦f÷&ÖBÖFFVæGVÓ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæf÷&ÖE&VF&6´÷fW'&–FW0¢ÒÀ¢&Wf–Wu&VÖVF–F–öã¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7Cc”v÷fW&ææ6U&Wf–Wu&VÖVF–F–öå&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7Cc”v÷fW&ææ6U&Wf–Wu&VÖVF–F–öå&V6÷&FVDBÀ¢WFFVEöC¢÷7Cc”v÷fW&ææ6U&Wf–Wu&VÖVF–F–öå&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã§&Wf–Wr×&VÖVF–F–öâÖFFVæGVÓ§c§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’‡&Wf–Wu&VÖVF–F–öäWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã§&Wf–Wr×&VÖVF–F–öâÖFFVæGVÓ§c¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââç&Wf–Wu&VÖVF–F–öå&VF&6´÷fW'&–FW0¢ÒÀ¢f–æÅ6VÃ¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"Ö’"À¢‡FÖÅ÷W&Ã¢÷7Cc”v÷fW&ææ6Tf–æÅ6VÅ&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢W6W%öÆöv–ã¢f—‡GW&U&V6V—D÷væW"À¢WF†÷%ö76ö6–F–öã¢$õtäU""À¢7&VFVEöC¢÷7Cc”v÷fW&ææ6Tf–æÅ6VÅ&V6÷&FVDBÀ¢WFFVEöC¢÷7Cc”v÷fW&ææ6Tf–æÅ6VÅ&V6÷&FVDBÀ¢&öG“¢°¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦f–æÂ×6VÃ§c#§7F'BÒÓâ"À¢&§6öâ"À¢¥4ôâç7G&–æv–g’†f–æÅ6VÄWF†÷&—¦F–öâ’À¢&"À¢#ÂÒÒ÷7Cc’Öv÷fW&ææ6R×&V6öæ6–Æ–F–öã¦f–æÂ×6VÃ§c#¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"’À¢W'&÷'3¢µÒÀ¢ââæf–æÅ6VÅ&VF&6´÷fW'&–FW0¢ÒÀ¢7V6…W6…7WW'6W76–öã¢°¢7FGW3¢%dU$”d”TB"À¢6÷W&6S¢&v—F‡V"ÖÚ±î¸Â¸­yêë¢°k¢G§¦*^api",
      html_url: post169GovernanceSquashPushSupersessionRef,
      issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/121",
      user_login: fixtureReceiptOwner,
      author_association: "OWNER",
      created_at: post169GovernanceSquashPushSupersessionRecordedAt,
      updated_at: post169GovernanceSquashPushSupersessionRecordedAt,
      body: [
        "<!-- post169-governance-reconciliation:squash-push-final-supersession:v2:start -->",
        "```json",
        JSON.stringify(squashPushSupersessionAuthorization),
        "```",
        "<!-- post169-governance-reconciliation:squash-push-final-supersession:v2:end -->"
      ].join("\n"),
      errors: [],
      ...squashPushSupersessionReadbackOverrides
    },
    finalSealV4: {
      status: "VERIFIED",
      source: "github-api",
      html_url: post169GovernanceFinalSealV4Ref,
      issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/121",
      user_login: fixtureReceiptOwner,
      author_association: "OWNER",
      created_at: post169GovernanceFinalSealV4RecordedAt,
      updated_at: post169GovernanceFinalSealV4RecordedAt,
      body: [
        "<!-- post169-governance-reconciliation:final-seal:v4:start -->",
        "```json",
        JSON.stringify(finalSealV4Authorization),
        "```",
        "<!-- post169-governance-reconciliation:final-seal:v4:end -->"
      ].join("\n"),
      errors: [],
      ...finalSealV4ReadbackOverrides
    }
  }
}

function writeFixturePushExactHead(root) {
  fs.writeFileSync(
    path.join(root, "artifacts/exact-head.json"),
    JSON.stringify({
      source_head_sha: fixtureReceiptHead,
      expected_source_head: fixtureReceiptHead,
      source_event: "push",
      source_ref: "main",
      github_sha: fixtureReceiptHead,
      github_repository: "bynanci/courtside-tw",
      github_workflow: "CI",
      github_job: "frontend-contract",
      github_run_id: fixtureActionsRunId,
      github_run_number: fixtureActionsRunNumber,
      github_run_attempt: fixtureActionsRunAttempt,
      github_ref: "refs/heads/main",
      github_base_ref: ""
    })
  )
}

function runReceiptFixture(fixture, overrides = {}) {
  return run(fixture.root, {
    changedPaths: fixture.changedPaths,
    changeBaseSha: fixtureReceiptBase,
    changeBaseCommittedAt: fixtureReceiptBaseCommittedAt,
    implementationMergeAncestorOfChangeBase: true,
    boundedScopeActive: false,
    changeBaseTasksText: fixture.changeBaseTasksText,
    changeBaseTraceabilityText: fixture.changeBaseTraceabilityText,
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt,
    requireExactHeadEvidence: true,
    githubActionsContext: makeFixtureActionsContext(fixture.root),
    ownerAuthorizationReadback: makeOwnerAuthorizationReadback(fixture.receipt),
    acceptedTraceabilitySha256: fixture.acceptedTraceabilitySha256,
    acceptedPendingTasksSha256: fixture.acceptedPendingTasksSha256,
    acceptedCompletedTasksSha256: fixture.acceptedCompletedTasksSha256,
    gitBinding: {
      status: "CLEAN",
      head: fixtureReceiptHead,
      change_base_ref: "fixture:trusted-base",
      change_base_sha: fixtureReceiptBase,
      change_base_committed_at: fixtureReceiptBaseCommittedAt,
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
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt,
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

function makePostT085MaintenanceGitBinding(overrides = {}) {
  return {
    status: "CLEAN",
    head: fixtureReceiptHead,
    change_base_ref: "fixture:post-t085-maintenance-base",
    change_base_sha: postT085MaintenanceAuthorizationBaseSha,
    change_base_ancestor: true,
    head_parent_sha: postT085MaintenanceAuthorizedHeadSha,
    head_second_parent_sha: null,
    head_parent_shas: [postT085MaintenanceAuthorizedHeadSha],
    head_parent_count: 1,
    head_tree_sha: "a".repeat(40),
    second_parent_tree_sha: null,
    post_t085_maintenance_authorized_head_ancestor: true,
    post_t085_maintenance_authorized_head_committed_at:
      postT085MaintenanceAuthorizedHeadCommittedAt,
    post_t085_maintenance_e2e_matches_authorized_head: true,
    post_t085_maintenance_candidate_graph_matches: true,
    post_t085_maintenance_final_pr_head_sha: fixtureReceiptHead,
    post_t085_maintenance_final_pr_head_parent_shas: [postT085MaintenanceAuthorizedHeadSha],
    post_t085_maintenance_final_pr_head_parent_count: 1,
    post_t085_maintenance_final_pr_head_tree_sha: "a".repeat(40),
    post_t085_maintenance_candidate_amendment_paths: [
      ...postT085MaintenanceAuthorizedAmendmentPaths
    ],
    post_t085_maintenance_preserved_payload_blob_oids: {
      pure_merge: { ...postT085MaintenanceExpectedPayloadBlobOids },
      composability_child: { ...postT085MaintenanceExpectedPayloadBlobOids },
      final_pr_head: { ...postT085MaintenanceExpectedPayloadBlobOids }
    },
    ...overrides
  }
}

function runPostT085MaintenanceFixture(fixture, overrides = {}) {
  const githubActionsContext =
    overrides.githubActionsContext ?? makePostT085MaintenanceActionsContext(fixture.root)
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return runCompletedFixture(fixture, {
    changeBaseSha: postT085MaintenanceAuthorizationBaseSha,
    postT085MaintenanceAuthorizationReadback: makePostT085MaintenanceAuthorizationReadback(),
    requireExactHeadEvidence: true,
    githubActionsContext,
    gitBinding: makePostT085MaintenanceGitBinding(),
    ...overrides
  })
}

function makeAndroidNativeSurfaceGitBinding(overrides = {}) {
  return {
    status: "CLEAN",
    head: fixtureReceiptHead,
    change_base_ref: "fixture:android-native-surface-base",
    change_base_sha: androidNativeSurfaceAuthorizationBaseSha,
    change_base_ancestor: true,
    android_native_surface_seed_ancestor: true,
    android_native_surface_seed_committed_at: "2026-09-08T07:01:09.000Z",
    android_native_surface_amendment_commit_count: 2,
    android_native_surface_amendment_merge_commit_count: 0,
    android_native_surface_amendment_paths: [...androidNativeSurfaceAmendmentPaths],
    android_native_surface_foreground_seed_ancestor: true,
    android_native_surface_foreground_seed_committed_at: "2026-09-08T07:49:14.000Z",
    android_native_surface_foreground_amendment_commit_count: 2,
    android_native_surface_foreground_amendment_merge_commit_count: 0,
    android_native_surface_foreground_amendment_paths: [...androidNativeSurfaceAuthorizedPaths],
    ...overrides
  }
}

function runAndroidNativeSurfaceFixture(fixture, overrides = {}) {
  const githubActionsContext =
    overrides.githubActionsContext ?? makeAndroidNativeSurfaceActionsContext(fixture.root)
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return runCompletedFixture(fixture, {
    changeBaseSha: androidNativeSurfaceAuthorizationBaseSha,
    androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback(),
    requireExactHeadEvidence: true,
    githubActionsContext,
    gitBinding: makeAndroidNativeSurfaceGitBinding(),
    ...overrides
  })
}

function makePost169GovernanceGitBinding(overrides = {}) {
  return {
    status: "CLEAN",
    head: fixtureReceiptHead,
    head_committed_at: "2026-09-08T14:10:00.000Z",
    head_tree_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    change_base_ref: "fixture:post169-governance-base",
    change_base_sha: post169GovernanceAuthorizationBaseSha,
    change_base_ancestor: true,
    head_parent_sha: post169GovernanceSeedHeadSha,
    head_parent_shas: [post169GovernanceSeedHeadSha],
    head_parent_count: 1,
    post169_governance_seed_ancestor: true,
    post169_governance_seed_committed_at: "2026-09-08T09:20:00.000Z",
    post169_governance_amendment_commit_count: 1,
    post169_governance_amendment_merge_commit_count: 0,
    post169_governance_amendment_paths: [...post169GovernanceAmendmentPaths],
    post169_governance_seed_test_blob_sha: post169GovernanceSeedTestBlobSha,
    post169_governance_final_test_blob_sha: post169GovernanceFinalTestBlobSha,
    post169_governance_final_validator_blob_sha: post169GovernanceFinalValidatorBlobSha,
    post169_governance_final_readme_blob_sha: post169GovernanceBlockedReadmeBlobSha,
    post169_governance_final_tasks_blob_sha: post169GovernanceBlockedTasksBlobSha,
    post169_governance_task_checkbox_signature_sha256: post169GovernanceTaskCheckboxSignatureSha256,
    android_native_surface_merged_head_tree_sha: androidNativeSurfaceMergeTreeSha,
    android_native_surface_merge_tree_sha: androidNativeSurfaceMergeTreeSha,
    android_native_surface_merge_parent_shas: [androidNativeSurfaceAuthorizationBaseSha],
    ...overrides
  }
}

function runPost169GovernanceFixture(fixture, overrides = {}) {
  const githubActionsContext =
    overrides.githubActionsContext ??
    makeAndroidNativeSurfaceActionsContext(fixture.root, {
      pullRequest: post169GovernancePullRequest,
      headRef: post169GovernanceBranch,
      baseSha: post169GovernanceAuthorizationBaseSha
    })
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return runCompletedFixture(fixture, {
    changeBaseSha: post169GovernanceAuthorizationBaseSha,
    evaluatedHeadCommittedAt: "2026-09-08T14:10:00.000Z",
    post169GovernanceAuthorizationReadback: makePost169GovernanceAuthorizationReadback(),
    requireExactHeadEvidence: true,
    githubActionsContext,
    gitBinding: makePost169GovernanceGitBinding(),
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

test("media-rights authorization binds the exact owner-dispatched scope", () => {
  const gate = traceabilityValidator.createMediaRightsAuthorizationGate()
  const errors = []
  const changedPaths = [...traceabilityValidator.MEDIA_RIGHTS_PATHS]

  assert.equal(gate.isBound(), true)
  assert.equal(
    gate.requested(
      changedPaths,
      null,
      null,
      traceabilityValidator.MEDIA_RIGHTS_AUTHORIZATION.base_sha
    ),
    true
  )
  assert.equal(
    gate.validate({
      changedPaths,
      changeBaseSha: traceabilityValidator.MEDIA_RIGHTS_AUTHORIZATION.base_sha,
      errors
    }),
    false
  )
  assert.match(errors.join("\n"), /OWNER comment/u)
  assert.equal(gate.allowsPath(changedPaths[0]), true)
})

test("media-rights authorization rejects base drift and path expansion", () => {
  const gate = traceabilityValidator.createMediaRightsAuthorizationGate()
  const errors = []
  const changedPaths = [...traceabilityValidator.MEDIA_RIGHTS_PATHS, "README.md"]

  assert.equal(
    gate.validate({
      changedPaths,
      changeBaseSha: "0000000000000000000000000000000000000000",
      errors
    }),
    false
  )
  assert.match(errors.join("\n"), /exact four-path scope and base/u)
  assert.equal(gate.allowsPath("README.md"), false)
})

test("media-rights dispatch keeps its legacy typo as an explicit non-scope alias", () => {
  assert.equal(
    traceabilityValidator.MEDIA_RIGHTS_DISPATCH_PATHS[2],
    "scripts/test/validate-traceability.mjs"
  )
  assert.equal(traceabilityValidator.MEDIA_RIGHTS_PATHS[2], "scripts/validate-traceability.mjs")
  const gate = traceabilityValidator.createMediaRightsAuthorizationGate()
  assert.equal(gate.allowsPath("scripts/test/validate-traceability.mjs"), false)
  assert.equal(gate.allowsPath("scripts/validate-traceability.mjs"), true)
})

test("media-library archive authority stays closed until its owner dispatch is sealed", () => {
  const gate = traceabilityValidator.createMediaArchiveAuthorizationGate({
    ...traceabilityValidator.MEDIA_ARCHIVE_AUTHORIZATION,
    ref: null,
    body_sha256: null,
    recorded_at: null,
    initial_seed: {
      ...traceabilityValidator.MEDIA_ARCHIVE_AUTHORIZATION.initial_seed,
      head_sha: null,
      tree_sha: null
    }
  })
  const changedPaths = [...traceabilityValidator.MEDIA_ARCHIVE_PATHS]
  const errors = []

  assert.equal(gate.isBound(), false)
  assert.equal(
    gate.requested(
      changedPaths,
      null,
      null,
      traceabilityValidator.MEDIA_ARCHIVE_AUTHORIZATION.base_sha
    ),
    false
  )
  assert.equal(gate.allowsPath(changedPaths[0]), false)
  assert.equal(
    gate.validate({
      changedPaths,
      changeBaseSha: traceabilityValidator.MEDIA_ARCHIVE_AUTHORIZATION.base_sha,
      boundedScopeActive: false,
      errors
    }),
    false
  )
  assert.match(errors.join("\n"), /media archive authorization is unbound/u)
})

test("media-library archive scope cannot authorize governance or release files", () => {
  const gate = traceabilityValidator.createMediaArchiveAuthorizationGate()

  for (const blockedPath of [
    "README.md",
    "specs/001-taiwan-basketball-magazine-ebook/tasks.md",
    ".github/workflows/ci.yml",
    "apps/api/src/main/java/tw/basketball/magazine/identity/OidcSecurityConfiguration.java"
  ]) {
    assert.equal(gate.allowsPath(blockedPath), false, blockedPath)
  }
})

test("media-library archive dispatch closes exactly its twenty-six regular paths", () => {
  const paths = traceabilityValidator.MEDIA_ARCHIVE_PATHS
  assert.equal(paths.length, 26)
  assert.equal(new Set(paths).size, paths.length)
  assert.ok(
    paths.includes(
      "apps/api/src/main/java/tw/basketball/magazine/media/api/MediaLibraryArchiveController.java"
    )
  )
  assert.ok(
    paths.includes("apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiContractTest.java")
  )
  assert.ok(paths.includes("scripts/validate-traceability.mjs"))
  assert.ok(paths.includes("scripts/test/validate-traceability.test.mjs"))
  assert.equal(paths.includes("README.md"), false)
})

test("media-library archive scope records the write-controller contract fixture", () => {
  assert.ok(
    traceabilityValidator.MEDIA_ARCHIVE_PATHS.includes(
      "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiContractTest.java"
    )
  )
})

test("media-library archive fixture remains a regular source path", () => {
  assert.equal(
    traceabilityValidator.MEDIA_ARCHIVE_MODES[
      "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiContractTest.java"
    ],
    "100644"
  )
})

test("receipt authority is pinned to the protected PR149 implementation snapshot", () => {
  const traceabilityText = fs.readFileSync(
    path.join(repositoryRoot, featurePath, "traceability.md"),
    "utf8"
  )
  const currentTasksText = fs.readFileSync(
    path.join(repositoryRoot, featurePath, "tasks.md"),
    "utf8"
  )
  const pendingTasksText = currentTasksText.replace(/^- \[[ xX]\] T085\b/m, "- [ ] T085")
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
  assert.equal(report.receipt_eligible, false)
  assert.equal(report.external_readback_required, true)
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
  "infra/compose/postgres/Dockerfile",
  "infra/compose/s3mock/Dockerfile",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".github/workflows/ci.yml",
  ".github/workflows/security.yml",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
]) {
  test(`completed T085 permits independently reviewed maintenance path ${changedPath}`, () => {
    const fixture = makeCompletedFixture()
    fixture.changedPaths = [changedPath]
    const report = runCompletedFixture(fixture)

    assert.equal(report.status, "PASS", report.errors.join("\n"))
    assert.equal(report.mode, "T085_COMPLETE_STEADY")
    assert.equal(report.receipt_eligible, false)
    assert.deepEqual(report.scope_validation.changed_paths, [changedPath])
    assert.equal(report.scope_boundaries.t086_dispatched, false)
  })
}

test("completed T085 authenticates only the draft PR 169 exact four-path addendum", () => {
  assert.equal(
    typeof traceabilityValidator.inspectAndroidNativeSurfaceAuthorizationForState,
    "function"
  )

  const fixture = makeCompletedFixture()
  fixture.changedPaths = [...androidNativeSurfaceAuthorizedPaths]
  let calls = 0
  const authorizationReadback = makeAndroidNativeSurfaceAuthorizationReadback()
  const inspected = traceabilityValidator.inspectAndroidNativeSurfaceAuthorizationForState(
    fixture.root,
    {
      changeBaseTasksText: fixture.changeBaseTasksText,
      changeBaseSha: androidNativeSurfaceAuthorizationBaseSha,
      boundedScopeActive: false,
      changedPaths: [...androidNativeSurfaceAuthorizedPaths],
      inspect: () => {
        calls += 1
        return authorizationReadback
      }
    }
  )
  assert.equal(calls, 1)
  assert.equal(inspected.addendum.html_url, androidNativeSurfaceAuthorizationRef)

  for (const overrides of [
    { changedPaths: androidNativeSurfaceAuthorizedPaths.slice(0, 3) },
    { changedPaths: [...androidNativeSurfaceAuthorizedPaths, "docs/research/unrelated.md"] },
    { changeBaseSha: "0".repeat(40) },
    { boundedScopeActive: true }
  ]) {
    const skipped = traceabilityValidator.inspectAndroidNativeSurfaceAuthorizationForState(
      fixture.root,
      {
        changeBaseTasksText: fixture.changeBaseTasksText,
        changeBaseSha: androidNativeSurfaceAuthorizationBaseSha,
        boundedScopeActive: false,
        changedPaths: [...androidNativeSurfaceAuthorizedPaths],
        inspect: () => {
          calls += 1
          return authorizationReadback
        },
        ...overrides
      }
    )
    assert.equal(skipped, null)
  }
  assert.equal(calls, 1)

  const passing = runAndroidNativeSurfaceFixture(fixture)
  assert.equal(passing.status, "PASS", passing.errors.join("\n"))
  assert.deepEqual(passing.scope_validation.changed_paths, androidNativeSurfaceAuthorizedPaths)
  assert.deepEqual(passing.scope_validation.unauthorized_paths, [])
  assert.equal(
    passing.source.android_native_surface_authorization_readback.addendum.html_url,
    androidNativeSurfaceAuthorizationRef
  )
  assert.equal(passing.source.github_actions_context.pull_request_number, 169)
  assert.equal(passing.source.github_actions_context.pull_request_draft, true)

  const cases = [
    [
      "missing readback",
      { androidNativeSurfaceAuthorizationReadback: null },
      /requires verified GitHub dispatch and addendum read-backs/
    ],
    [
      "API failure",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          addendumReadbackOverrides: { status: "UNAVAILABLE" }
        })
      },
      /requires verified GitHub dispatch and addendum read-backs/
    ],
    [
      "actor mismatch",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          dispatchReadbackOverrides: { user_login: "attacker" }
        })
      },
      /must be authored by the repository owner/
    ],
    [
      "dispatch mutation",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          dispatchReadbackOverrides: { updated_at: androidNativeSurfaceAuthorizationRecordedAt }
        })
      },
      /must be immutable after creation/
    ],
    [
      "addendum mutation",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          addendumAuthorizationOverrides: { authorized_paths: ["apps/web/unrelated.ts"] }
        })
      },
      /bodies must match the exact owner dispatch and addendum/
    ],
    [
      "base drift",
      {
        githubActionsContext: makeAndroidNativeSurfaceActionsContext(fixture.root, {
          baseSha: "0".repeat(40)
        })
      },
      /Actions context must bind draft PR 169, branch and base/
    ],
    [
      "branch drift",
      {
        githubActionsContext: makeAndroidNativeSurfaceActionsContext(fixture.root, {
          headRef: "fix/unrelated"
        })
      },
      /Actions context must bind draft PR 169, branch and base/
    ],
    [
      "pull request replay",
      {
        githubActionsContext: makeAndroidNativeSurfaceActionsContext(fixture.root, {
          pullRequest: 170
        })
      },
      /Actions context must bind draft PR 169, branch and base/
    ],
    [
      "ready-state widening",
      {
        githubActionsContext: makeAndroidNativeSurfaceActionsContext(fixture.root, {
          pullRequestDraft: false
        })
      },
      /must remain draft and NO MERGE/
    ],
    [
      "seed ancestry drift",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_seed_ancestor: false
        })
      },
      /seed head must be an ancestor/
    ],
    [
      "generic amendment path",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_amendment_paths: [
            ...androidNativeSurfaceAmendmentPaths,
            "apps/web/unrelated.ts"
          ]
        })
      },
      /post-seed amendments must change exactly the two validator paths/
    ],
    [
      "amendment commit overflow",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_amendment_commit_count: 3
        })
      },
      /must contain one tests-first commit and one implementation commit at most/
    ],
    [
      "merge commit in amendment",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_amendment_merge_commit_count: 1
        })
      },
      /must contain no merge commit/
    ]
  ]
  for (const [name, overrides, expected] of cases) {
    const report = runAndroidNativeSurfaceFixture(fixture, overrides)
    assert.equal(report.status, "FAIL", name)
    assert.match(report.errors.join("\n"), expected, name)
    assert.deepEqual(
      report.scope_validation.unauthorized_paths,
      androidNativeSurfaceAuthorizedPaths.slice(0, 2),
      name
    )
  }

  for (const changedPaths of [
    androidNativeSurfaceAuthorizedPaths.slice(0, 2),
    androidNativeSurfaceAuthorizedPaths.slice(0, 3),
    [...androidNativeSurfaceAuthorizedPaths, "apps/web/unrelated.ts"]
  ]) {
    const report = runAndroidNativeSurfaceFixture(fixture, { changedPaths })
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /requires the exact four-path PR 169 scope|outside the authorized post-T085 maintenance scope/
    )
  }
})

test("completed T085 fails closed unless the exact foreground-deadline addendum is authenticated", () => {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = [...androidNativeSurfaceAuthorizedPaths]

  const passing = runAndroidNativeSurfaceFixture(fixture)
  assert.equal(passing.status, "PASS", passing.errors.join("\n"))
  assert.equal(
    passing.source.android_native_surface_authorization_readback.foregroundAddendum.html_url,
    androidNativeSurfaceForegroundAuthorizationRef
  )

  for (const [name, overrides] of [
    [
      "missing foreground receipt",
      {
        androidNativeSurfaceAuthorizationReadback: {
          ...makeAndroidNativeSurfaceAuthorizationReadback(),
          foregroundAddendum: null
        }
      }
    ],
    [
      "foreground API failure",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          foregroundReadbackOverrides: { status: "UNAVAILABLE" }
        })
      }
    ],
    [
      "foreground actor mismatch",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          foregroundReadbackOverrides: { user_login: "attacker" }
        })
      }
    ],
    [
      "foreground mutation",
      {
        androidNativeSurfaceAuthorizationReadback: makeAndroidNativeSurfaceAuthorizationReadback({
          foregroundAuthorizationOverrides: {
            authorized_paths: ["apps/web/unrelated.ts"]
          }
        })
      }
    ],
    [
      "foreground seed ancestry drift",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_foreground_seed_ancestor: false
        })
      }
    ],
    [
      "foreground path widening",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_foreground_amendment_paths: [
            ...androidNativeSurfaceAuthorizedPaths,
            "apps/web/unrelated.ts"
          ]
        })
      }
    ],
    [
      "foreground commit overflow",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_foreground_amendment_commit_count: 3
        })
      }
    ],
    [
      "foreground merge commit",
      {
        gitBinding: makeAndroidNativeSurfaceGitBinding({
          android_native_surface_foreground_amendment_merge_commit_count: 1
        })
      }
    ]
  ]) {
    const report = runAndroidNativeSurfaceFixture(fixture, overrides)
    assert.equal(report.status, "FAIL", name)
    assert.match(
      report.errors.join("\n"),
      /foreground-deadline|foreground addendum|foreground seed|foreground amendments/u,
      name
    )
  }
})

test("the authenticated PR 169 squash push preserves exact four-path authority", () => {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = [...androidNativeSurfaceAuthorizedPaths]
  const githubActionsContext = makeAndroidNativeSurfacePushActionsContext(fixture.root)
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  const report = runAndroidNativeSurfaceFixture(fixture, {
    currentHead: androidNativeSurfaceMergeSha,
    githubActionsContext,
    post169GovernanceAuthorizationReadback: makePost169GovernanceAuthorizationReadback(),
    acceptedCompletedTasksSha256: ACCEPTED_COMPLETED_TASKS_SHA256,
    frozenT085CompletedTasksSha256: fixture.acceptedCompletedTasksSha256,
    gitBinding: makeAndroidNativeSurfaceGitBinding({
      head: androidNativeSurfaceMergeSha,
      head_parent_sha: androidNativeSurfaceAuthorizationBaseSha,
      head_parent_shas: [androidNativeSurfaceAuthorizationBaseSha],
      head_parent_count: 1,
      head_tree_sha: androidNativeSurfaceMergeTreeSha,
      android_native_surface_final_pr_head_sha: androidNativeSurfaceMergedHeadSha,
      android_native_surface_final_pr_head_tree_sha: androidNativeSurfaceMergeTreeSha,
      android_native_surface_merge_tree_matches_final_head: true
    })
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.source.github_actions_context.authority, "PROTECTED_MAIN_PUSH")
})

test("only the exact authenticated PR 169 squash push selects the frozen tasks digest", () => {
  for (const [name, contextOverrides, bindingOverrides, changedPaths] of [
    ["wrong head", { after: "6".repeat(40) }, { head: "6".repeat(40) }, null],
    ["wrong base", { before: "7".repeat(40) }, {}, null],
    ["wrong tree", {}, { head_tree_sha: "8".repeat(40) }, null],
    ["path drift", {}, {}, [...androidNativeSurfaceAuthorizedPaths, "docs/research/unrelated.md"]]
  ]) {
    const fixture = makeCompletedFixture()
    fixture.changedPaths = changedPaths ?? [...androidNativeSurfaceAuthorizedPaths]
    const githubActionsContext = makeAndroidNativeSurfacePushActionsContext(
      fixture.root,
      contextOverrides
   jÇºã
âµç«®ŠÁ®‰ž˜©z¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂv—F‡V$7F–öç46öçFW‡B¢6öç7B†VBÒ6öçFW‡D÷fW'&–FW2ægFW"óòæG&ö–DæF—fU7W&f6TÖW&vU6†¢6öç7B&W÷'BÒ'VäæG&ö–DæF—fU7W&f6Tf—‡GW&R†f—‡GW&RÂ°¢7W'&VçD†VC¢†VBÀ¢v—F‡V$7F–öç46öçFW‡BÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‚’À¢66WFVD6ö×ÆWFVEF6·56†#Sc¢44UDTEô4ôÕÄUDTEõD4µ5õ4„#SbÀ¢g&÷¦VåCƒT6ö×ÆWFVEF6·56†#Sc¢f—‡GW&Ræ66WFVD6ö×ÆWFVEF6·56†#SbÀ¢v—D&–æF–æs¢Ö¶TæG&ö–DæF—fU7W&f6Tv—D&–æF–ær‡°¢†VBÀ¢†VE÷&VçE÷6†¢æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†À¢†VE÷&VçE÷6†3¢¶æG&ö–DæF—fU7W&f6TWF†÷&—¦F–öä&6U6†ÒÀ¢†VE÷&VçEö6÷VçC¢À¢†VE÷G&VU÷6†¢æG&ö–DæF—fU7W&f6TÖW&vUG&VU6†À¢æG&ö–EöæF—fU÷7W&f6Uöf–æÅ÷%ö†VE÷6†¢æG&ö–DæF—fU7W&f6TÖW&vVD†VE6†À¢æG&ö–EöæF—fU÷7W&f6Uöf–æÅ÷%ö†VE÷G&VU÷6†¢æG&ö–DæF—fU7W&f6TÖW&vUG&VU6†À¢æG&ö–EöæF—fU÷7W&f6UöÖW&vU÷G&VUöÖF6†W5öf–æÅö†VC¢G'VRÀ¢ââæ&–æF–æt÷fW'&–FW0¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"ÂæÖR¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷F6·2×W7BÖF6‚F†R66WFVB–×ÆVÖVçFF–öâ6æ6†÷B÷R¢Ð§Ò §FW7B‚'÷7BÓc’v÷fW&ææ6R&V6öæ6–Æ–F–öâWF†VçF–6FW2öæRW†7BFW7G2Öf—'7Bf÷W"×F‚G&gB"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢6öç7BF6·5F‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂfVGW&UF‚Â'F6·2æÖB"¢6öç7B&6UF6·2Òg2ç&VDf–ÆU7–æ2‡F6·5F‚Â'WFc‚"¢6öç7B&V6öæ6–ÆVEF6·2Ò&6UF6·2ç&WÆ6R€¢õâÒÅ²ÅÒCƒbf—‡GW&RBöÒÀ¢Ò²ÒCƒbf—‡GW&RG·÷7Cc•Cƒe7FGW57Vff—‡Ö ¢¢76W'Bææ÷DWVÂ‡&V6öæ6–ÆVEF6·2Â&6UF6·2¢g2çw&—FTf–ÆU7–æ2‡F6·5F‚Â&V6öæ6–ÆVEF6·2¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5Ð ¢6öç7B76–ærÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&R¢76W'BæWVÂ‡76–ærç7FGW2Â%52"Â76–æræW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæWVÂ‡76–æræ6÷VçG2æ6†V6¶VE÷F6·2Âƒb¢76W'BæFVWWVÂ‡76–ærç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2ÂµÒ¢76W'BæWVÂ€¢76–ærç6÷W&6Rç÷7Cc•öv÷fW&ææ6UöWF†÷&—¦F–öå÷&VF&6²æFFVæGVÒæ‡FÖÅ÷W&ÂÀ¢÷7Cc”v÷fW&ææ6TFFVæGVÕ&V`¢ ¢f÷"†6öç7B¶æÖRÂ÷fW'&–FW2ÂW‡V7FVEÒöb°¢°¢&Ö—76–ær&VF&6²"À¢²÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢çVÆÂÒÀ¢÷&WV—&W2fW&–f–VBv—D‡V"F—7F6‚æBFFVæGVÒ&VBÖ&6·2ð¢ÒÀ¢°¢&7F÷"Ö—6ÖF6‚"À¢°¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢FFVæGVÕ&VF&6´÷fW'&–FW3¢²W6W%öÆöv–ã¢&GF6¶W""Ð¢Ò¢ÒÀ¢ö×W7B&RWF†÷&VB'’F†R&W÷6—F÷'’÷væW"ð¢ÒÀ¢°¢%"&WÆ’"À¢°¢v—F‡V$7F–öç46öçFW‡C¢Ö¶TæG&ö–DæF—fU7W&f6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ°¢VÆÅ&WVW7C¢÷7Cc”v÷fW&ææ6UVÆÅ&WVW7B²À¢†VE&Vc¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢&6U6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†¢Ò¢ÒÀ¢ô7F–öç26öçFW‡B×W7B&–æBG&gB"sÂ'&æ6‚æB&6Rð¢ÒÀ¢°¢'F‚v–FVæ–ær"À¢²6†ævVEF‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡2Â&Fö72÷&W6V&6‚÷Vç&VÆFVBæÖB%ÒÒÀ¢÷&WV—&W2F†RW†7Bf÷W"×F‚v÷fW&ææ6R&V6öæ6–Æ–F–öâ66÷WÆ÷WG6–FRF†RWF†÷&—¦VB÷7BÕCƒRÖ–çFVææ6R66÷Rð¢ÒÀ¢°¢'6VVBæ6W7G'’G&–gB"À¢°¢v—D&–æF–æs¢Ö¶U÷7Cc”v÷fW&ææ6Tv—D&–æF–ær‡°¢÷7Cc•öv÷fW&ææ6U÷6VVEöæ6W7F÷#¢fÇ6P¢Ò¢ÒÀ¢öv÷fW&ææ6R6VVB×W7B&Râæ6W7F÷"ð¢Ð¢Ò’°¢6öç7B&W÷'BÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ÷fW'&–FW2¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"ÂæÖR¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVBÂæÖR¢Ð ¢g2çw&—FTf–ÆU7–æ2‡F6·5F‚Â&V6öæ6–ÆVEF6·2ç&WÆ6R‚"Ò²ÒCƒb"Â"Ò·…ÒCƒb"’¢6öç7B6†V6¶&÷„G&–gBÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&R¢76W'BæWVÂ†6†V6¶&÷„G&–gBç7FGW2Â$d”Â"¢76W'BæÖF6‚†6†V6¶&÷„G&–gBæW'&÷'2æ¦ö–â‚%Æâ"’ÂõCƒgÇF6²6†V6¶&÷‚÷R§Ò §FW7B‚'÷7BÓc’6æF–FFW2Çv—2&WV—&RF†R–Ö×WF&ÆRW†7BÖ†VBõtäU"6VÂ"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢6öç7BF6·5F‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂfVGW&UF‚Â'F6·2æÖB"¢6öç7B&6UF6·2Òg2ç&VDf–ÆU7–æ2‡F6·5F‚Â'WFc‚"¢g2çw&—FTf–ÆU7–æ2€¢F6·5F‚À¢&6UF6·2ç&WÆ6R‚õâÒÅ²ÅÒCƒbf—‡GW&RBöÒÂÒ²ÒCƒbf—‡GW&RG·÷7Cc•Cƒe7FGW57Vff—‡Ö¢¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—D&–æF–ærÒÖ¶U÷7Cc”v÷fW&ææ6Tv—D&–æF–ær‚¢6öç7B&W÷'BÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–ærÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–ærÀ¢f–æÅ6VÅ&VF&6´÷fW'&–FW3¢²7FGW3¢%Täd”Ä$ÄR"Ð¢Ò¢Ò ¢76W'BæFVWWVÂ†v—D&–æF–ærç÷7Cc•öv÷fW&ææ6UöÖVæFÖVçE÷F‡2Â÷7Cc”v÷fW&ææ6TÖVæFÖVçEF‡2¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷&WV—&W2fW&–f–VBõtäU"FFVæGVÒæBf–æÂ×6VÂ&VBÖ&6·2ð¢§Ò §FW7B‚&WF†VçF–6FVB"s–FVçF—G’6ææ÷B'—72v÷fW&ææ6R'’&W7F÷&–ær&÷6RF‡2"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò°¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2 ¢Ð¢6öç7B&W÷'BÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢çVÆÀ¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷&WV—&W2F†RW†7Bf÷W"×F‚v÷fW&ææ6R&V6öæ6–Æ–F–öâ66÷Rð¢§Ò §FW7B‚'÷7BÓc’&Wf–Wr&VÖVF–F–öâ&–æG2öæR–Ö×WF&ÆRW†7BÖ†VBõtäU"6VÂ"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢6öç7BF6·5F‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂfVGW&UF‚Â'F6·2æÖB"¢6öç7B&6UF6·2Òg2ç&VDf–ÆU7–æ2‡F6·5F‚Â'WFc‚"¢g2çw&—FTf–ÆU7–æ2€¢F6·5F‚À¢&6UF6·2ç&WÆ6R‚õâÒÅ²ÅÒCƒbf—‡GW&RBöÒÂÒ²ÒCƒbf—‡GW&RG·÷7Cc•Cƒe7FGW57Vff—‡Ö¢¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—D&–æF–ærÒÖ¶U÷7Cc”v÷fW&ææ6Tv—D&–æF–ær‡°¢†VEö6öÖÖ—GFVEöC¢###bÓ’Ó…CC££ã¢"À¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡5Ð¢Ò¢6öç7B76–ærÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó…CC££ã¢"À¢v—D&–æF–ærÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–æp¢Ò¢Ò ¢76W'BæWVÂ‡76–ærç7FGW2Â%52"Â76–æræW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæWVÂ€¢76–ærç6÷W&6Rç÷7Cc•öv÷fW&ææ6UöWF†÷&—¦F–öå÷&VF&6²æf–æÅ6VÂç7FGW2À¢%dU$”d”TB ¢ ¢6öç7B7V6„ÖW&vU6†Ò#2"ç&WVBƒC¢6öç7BW6„6öçFW‡BÒÖ¶TæG&ö–DæF—fU7W&f6UW6„7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ°¢&Vf÷&S¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢gFW#¢7V6„ÖW&vU6†¢Ò¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂW6„6öçFW‡B¢6öç7B&÷FV7FVDÖ–åW6‚Ò'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢7W'&VçD†VC¢7V6„ÖW&vU6†À¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó…CC£#£ã¢"À¢v—F‡V$7F–öç46öçFW‡C¢W6„6öçFW‡BÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–æp¢Ò’À¢v—D&–æF–æs¢°¢ââæv—D&–æF–ærÀ¢†VC¢7V6„ÖW&vU6†À¢†VEö6öÖÖ—GFVEöC¢###bÓ’Ó…CC£#£ã¢"À¢†VE÷&VçE÷6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢†VE÷&VçE÷6†3¢·÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†ÒÀ¢÷7Cc•öv÷fW&ææ6U÷6VVEöæ6W7F÷#¢fÇ6RÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEö6öÖÖ—Eö6÷VçC¢çVÆÂÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEöÖW&vUö6öÖÖ—Eö6÷VçC¢çVÆÀ¢Ð¢Ò¢76W'BæWVÂ‡&÷FV7FVDÖ–åW6‚ç7FGW2Â%52"Â&÷FV7FVDÖ–åW6‚æW'&÷'2æ¦ö–â‚%Æâ"’ ¢f÷"†6öç7B¶æÖRÂW6„v—D&–æF–æuÒöb°¢°¢'w&öær&÷FV7FVBÖÖ–â&VçB"À¢°¢ââæv—D&–æF–ærÀ¢†VC¢7V6„ÖW&vU6†À¢†VEö6öÖÖ—GFVEöC¢###bÓ’Ó…CC£#£ã¢"À¢†VE÷&VçE÷6†¢#"ç&WVBƒC’À¢†VE÷&VçE÷6†3¢²#"ç&WVBƒC•ÒÀ¢÷7Cc•öv÷fW&ææ6U÷6VVEöæ6W7F÷#¢fÇ6RÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEö6öÖÖ—Eö6÷VçC¢çVÆÂÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEöÖW&vUö6öÖÖ—Eö6÷VçC¢çVÆÀ¢Ð¢ÒÀ¢°¢'w&öær&÷FV7FVBÖÖ–âG&VR"À¢°¢ââæv—D&–æF–ærÀ¢†VC¢7V6„ÖW&vU6†À¢†VEö6öÖÖ—GFVEöC¢###bÓ’Ó…CC£#£ã¢"À¢†VE÷G&VU÷6†¢#"ç&WVBƒC’À¢†VE÷&VçE÷6†¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†À¢†VE÷&VçE÷6†3¢·÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öä&6U6†ÒÀ¢÷7Cc•öv÷fW&ææ6U÷6VVEöæ6W7F÷#¢fÇ6RÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEö6öÖÖ—Eö6÷VçC¢çVÆÂÀ¢÷7Cc•öv÷fW&ææ6UöÖVæFÖVçEöÖW&vUö6öÖÖ—Eö6÷VçC¢çVÆÀ¢Ð¢Ð¢Ò’°¢6öç7B&V¦V7FVEW6‚Ò'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢7W'&VçD†VC¢7V6„ÖW&vU6†À¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó…CC£#£ã¢"À¢v—F‡V$7F–öç46öçFW‡C¢W6„6öçFW‡BÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–æp¢Ò’À¢v—D&–æF–æs¢W6„v—D&–æF–æp¢Ò¢76W'BæWVÂ‡&V¦V7FVEW6‚ç7FGW2Â$d”Â"ÂæÖR¢Ð ¢6öç7BW‡V7FVDf–æÄ†VBÒ°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢÷7Cc”v÷fW&ææ6U&–÷$f–æÄ†VE6†À¢G&VU÷6†¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅG&VU6†À¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢&VçEö6÷VçC¢À¢6öÖÖ—Eö6÷VçC¢"À¢ÖW&vUö6öÖÖ—Eö6÷VçC¢ ¢Ð¢6öç7BW‡V7FVD6öçFVçD&Æö'2Ò°¢%$TDÔRæÖB#¢÷7Cc”v÷fW&ææ6T&Æö6¶VE&VFÖT&Æö%6†À¢¶G¶fVGW&UF‡Ò÷F6·2æÖFÓ¢÷7Cc”v÷fW&ææ6T&Æö6¶VEF6·4&Æö%6†À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2#¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅFW7D&Æö%6†À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢÷7Cc”v÷fW&ææ6U&–÷$f–æÅfÆ–FF÷$&Æö%6†¢Ð¢f÷"†6öç7B¶æÖRÂ&VF&6´÷F–öç5Òöb°¢²&Ö—76–ær"Â²f–æÅ6VÅ&VF&6´÷fW'&–FW3¢²7FGW3¢%Täd”Ä$ÄR"ÒÕÒÀ¢²&æöâÔõtäU""Â²f–æÅ6VÅ&VF&6´÷fW'&–FW3¢²W6W%öÆöv–ã¢&GF6¶W""ÒÕÒÀ¢²&VF—FVB"Â²f–æÅ6VÅ&VF&6´÷fW'&–FW3¢²WFFVEöC¢###bÓ’Ó…C#£Cc£¢"ÒÕÒÀ¢°¢'7FÆR†VB"À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢f–æÅö†VC¢²ââæW‡V7FVDf–æÄ†VBÂ6†¢&B"ç&WVBƒC’Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærG&VR"À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢f–æÅö†VC¢²ââæW‡V7FVDf–æÄ†VBÂG&VU÷6†¢&R"ç&WVBƒC’Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öær&VçB"À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢f–æÅö†VC¢²ââæW‡V7FVDf–æÄ†VBÂ&VçE÷6†¢&b"ç&WVBƒC’Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærF‚"À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢WF†÷&—¦VE÷F‡3¢²ââç÷7Cc”v÷fW&ææ6TWF†÷&—¦VEF‡2Â&Fö72÷&W6V&6‚÷Vç&VÆFVBæÖB%Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærFW7B&Æö""À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢6öçFVçEö&Æö'3¢°¢ââæW‡V7FVD6öçFVçD&Æö'2À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2#¢#"ç&WVBƒC¢Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærfÆ–FF÷"&Æö""À¢°¢f–æÅ6VÄWF†÷&—¦F–öä÷fW'&–FW3¢°¢6öçFVçEö&Æö'3¢°¢ââæW‡V7FVD6öçFVçD&Æö'2À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢#""ç&WVBƒC¢Ð¢Ð¢Ð¢Ð¢Ò’°¢6öç7B&W÷'BÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó…CC££ã¢"À¢v—D&–æF–ærÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–ærÀ¢ââç&VF&6´÷F–öç0¢Ò¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"ÂæÖR¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&VÖVF–F–öçÆf–æÂ6VÇÆ&öF–W2×W7BÖF6‚÷RÂæÖR¢Ð ¢6öç7BW‡V7FVDf–æÄ†VEcBÒ°¢'&æ6ƒ¢÷7Cc”v÷fW&ææ6T'&æ6‚À¢6†¢v—D&–æF–æræ†VBÀ¢G&VU÷6†¢v—D&–æF–æræ†VE÷G&VU÷6†À¢&VçE÷6†¢÷7Cc”v÷fW&ææ6U6VVD†VE6†À¢6öÖÖ—GFVEöC¢v—D&–æF–æræ†VEö6öÖÖ—GFVEö@¢Ð¢6öç7BW‡V7FVD6öçFVçD&Æö'5cBÒ°¢%$TDÔRæÖB#¢÷7Cc”v÷fW&ææ6T&Æö6¶VE&VFÖT&Æö%6†À¢¶G¶fVGW&UF‡Ò÷F6·2æÖFÓ¢÷7Cc”v÷fW&ææ6T&Æö6¶VEF6·4&Æö%6†À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2# ¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷FW7Eö&Æö%÷6†À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢v—D&–æF–ærç÷7Cc•öv÷fW&ææ6Uöf–æÅ÷fÆ–FF÷%ö&Æö%÷6†¢Ð¢f÷"†6öç7B¶æÖRÂ&VF&6´÷F–öç5Òöb°¢²&Ö—76–ærcB"Â²f–æÅ6VÅcE&VF&6´÷fW'&–FW3¢²7FGW3¢%Täd”Ä$ÄR"ÒÕÒÀ¢²&æöâÔõtäU"cB"Â²f–æÅ6VÅcE&VF&6´÷fW'&–FW3¢²W6W%öÆöv–ã¢&GF6¶W""ÒÕÒÀ¢²&VF—FVBcB"Â²f–æÅ6VÅcE&VF&6´÷fW'&–FW3¢²WFFVEöC¢###bÓ’Ó…CC£c£¢"ÒÕÒÀ¢°¢'7FÆRcB†VB"À¢°¢f–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW3¢°¢f–æÅö†VC¢²ââæW‡V7FVDf–æÄ†VEcBÂ6†¢#B"ç&WVBƒC’Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærcBG&VR"À¢°¢f–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW3¢°¢f–æÅö†VC¢²ââæW‡V7FVDf–æÄ†VEcBÂG&VU÷6†¢#R"ç&WVBƒC’Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærcBFW7B&Æö""À¢°¢f–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW3¢°¢6öçFVçEö&Æö'3¢°¢ââæW‡V7FVD6öçFVçD&Æö'5cBÀ¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2#¢#b"ç&WVBƒC¢Ð¢Ð¢Ð¢ÒÀ¢°¢'w&öærcBfÆ–FF÷"&Æö""À¢°¢f–æÅ6VÅcDWF†÷&—¦F–öä÷fW'&–FW3¢°¢6öçFVçEö&Æö'3¢°¢ââæW‡V7FVD6öçFVçD&Æö'5cBÀ¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2#¢#r"ç&WVBƒC¢Ð¢Ð¢Ð¢Ð¢Ò’°¢6öç7B&W÷'BÒ'Vå÷7Cc”v÷fW&ææ6Tf—‡GW&R†f—‡GW&RÂ°¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó…CC££ã¢"À¢v—D&–æF–ærÀ¢÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6³¢Ö¶U÷7Cc”v÷fW&ææ6TWF†÷&—¦F–öå&VF&6²‡°¢v—D&–æF–ærÀ¢ââç&VF&6´÷F–öç0¢Ò¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"ÂæÖR¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷7V6‚×W6‡ÇcBf–æÂ6VÇÆ&öF–W2×W7BÖF6‚÷RÂæÖR¢Ð§Ò §FW7B‚&6ö×ÆWFVBCƒR66WG2F†RW†7BWF†VçF–6FVBU3bÖ–çFVææ6R&ö÷G7G&66÷R"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæWVÂ‡&W÷'BæÖöFRÂ%CƒUô4ôÕÄUDUõ5DTE’"¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâæ6†ævVE÷F‡2Â÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡2¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2ÂµÒ¢76W'BæWVÂ€¢&W÷'Bç6÷W&6Rç÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦F–öå÷&VF&6²æ‡FÖÅ÷W&ÂÀ¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&V`¢¢76W'BæWVÂ‡&W÷'Bç6÷W&6Ræv—F‡V%ö7F–öç5ö6öçFW‡BçVÆÅ÷&WVW7EöG&gBÂG'VR§Ò §FW7B‚&6ö×ÆWFVBCƒRÖ–çFVææ6R66÷R—2æöâÖWF†÷&—FF—fR÷WG6–FRW†7BÖ†VB4’"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢&WV—&TW†7D†VDWf–FVæ6S¢fÇ6RÀ¢v—F‡V$7F–öç46öçFW‡C¢çVÆÀ¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&WV—&W2W†7BÖ†VB4’ÖöFRð¢¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2Â°¢&2÷vV"÷FW7G2öS&R÷W3bÖöffÆ–æRÖ—77VRç7V2çG2 ¢Ò§Ò ¦f÷"†6öç7B¶æÖRÂ6öçFW‡Df7F÷'’ÂW‡V7FVEÒöb°¢°¢&vVæW&–24’6öçFW‡B"À¢‚’Óà¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢²4“¢'G'VR"ÒÀ¢v—D&–æF–æs¢°¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VP¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&WV—&W2WF†VçF–6FVBv—D‡V"7F–öç26öçFW‡Bð¢ÒÀ¢°¢'w&öærVÆÂ×&WVW7B&Vb"À¢†f—‡GW&R’ÓâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ²VÆÅ&WVW7C¢cBÒ’À¢÷÷7BÕCƒRÖ–çFVææ6R7F–öç26öçFW‡B×W7B&–æBWF†÷&—¦VB"c‚Â'&æ6‚æB&6Rð¢ÒÀ¢°¢&Ö—6ÖF6†VBWfVçBVÆÂ×&WVW7BçVÖ&W""À¢†f—‡GW&R’ÓâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ²WfVçEVÆÅ&WVW7C¢cBÒ’À¢÷÷7BÕCƒRÖ–çFVææ6R7F–öç26öçFW‡B×W7B&–æBWF†÷&—¦VB"c‚Â'&æ6‚æB&6Rð¢ÒÀ¢°¢'w&öær†VB'&æ6‚"À¢†f—‡GW&R’ÓâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ²†VE&Vc¢&f—‚÷Vç&VÆFVB"Ò’À¢÷÷7BÕCƒRÖ–çFVææ6R7F–öç26öçFW‡B×W7B&–æBWF†÷&—¦VB"c‚Â'&æ6‚æB&6Rð¢ÒÀ¢°¢'w&öær&6R4„"À¢†f—‡GW&R’ÓâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ²&6U6†¢#"ç&WVBƒC’Ò’À¢÷÷7BÕCƒRÖ–çFVææ6R7F–öç26öçFW‡B×W7B&–æBWF†÷&—¦VB"c‚Â'&æ6‚æB&6Rð¢ÒÀ¢°¢&Ö—76–ær"G&gB7FFR"À¢†f—‡GW&R’ÓâÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ²VÆÅ&WVW7DG&gC¢çVÆÂÒ’À¢÷÷7BÕCƒRÖ–çFVææ6R7F–öç26öçFW‡B×W7B&–æBF†R"c‚G&gB7FFRð¢Ð¥Ò’°¢FW7B†6ö×ÆWFVBCƒRf–Ç26Æ÷6VBf÷"G¶æÖWÒ–âW†7BÖ†VBÖöFVÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—F‡V$7F–öç46öçFW‡BÒ6öçFW‡Df7F÷'’†f—‡GW&R¢–b†v—F‡V$7F–öç46öçFW‡Bç7FGW2ÓÓÒ$ÔD4„TEôt•D…T%ô5D”ôå5ôÔUDDD"’°¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂv—F‡V$7F–öç46öçFW‡B¢Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢&WV—&TW†7D†VDWf–FVæ6S¢G'VRÀ¢v—F‡V$7F–öç46öçFW‡@¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVB¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR66WG2F†RWF†÷&—¦VB"c‚&VG’7FFR"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—F‡V$7F–öç46öçFW‡BÒÖ¶U÷7ECƒTÖ–çFVææ6T7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂ°¢VÆÅ&WVW7DG&gC¢fÇ6P¢Ò¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂv—F‡V$7F–öç46öçFW‡B¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ²v—F‡V$7F–öç46öçFW‡BÒ ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæWVÂ‡&W÷'Bç6÷W&6Ræv—F‡V%ö7F–öç5ö6öçFW‡BçVÆÅ÷&WVW7EöG&gBÂfÇ6R§Ò §FW7B‚&6ö×ÆWFVBCƒR66WG2F†R6–ævÆRW†7B&÷FV7FVBÖÖ–âÖW&vRW6‚"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—F‡V$7F–öç46öçFW‡BÒÖ¶U÷7ECƒTÖ–çFVææ6UW6„7F–öç46öçFW‡B†f—‡GW&Rç&ö÷B¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂv—F‡V$7F–öç46öçFW‡B¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢&WV—&TW†7D†VDWf–FVæ6S¢G'VRÀ¢v—F‡V$7F–öç46öçFW‡BÀ¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢†VE÷&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢†VE÷6V6öæE÷&VçE÷6†¢f—‡GW&U÷7ECƒTf–æÅ$†VBÀ¢†VE÷&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†Âf—‡GW&U÷7ECƒTf–æÅ$†VEÒÀ¢†VE÷&VçEö6÷VçC¢"À¢†VE÷G&VU÷6†¢&"ç&WVBƒC’À¢6V6öæE÷&VçE÷G&VU÷6†¢&"ç&WVBƒC’À¢÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷6†¢f—‡GW&U÷7ECƒTf–æÅ$†V@¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæWVÂ‡&W÷'Bç6÷W&6Ræv—F‡V%ö7F–öç5ö6öçFW‡BæWF†÷&—G’Â%$õDT5DTEôÔ”åõU4‚"§Ò ¦f÷"†6öç7B¶æÖRÂ&–æF–æt÷fW'&–FW2ÂW‡V7FVEÒöb°¢°¢'w&öærÖW&vR&VçB"À¢°¢†VE÷&VçE÷6†¢#"ç&WVBƒC’À¢†VE÷&VçE÷6†3¢²#"ç&WVBƒC’Âf—‡GW&U÷7ECƒTf–æÅ$†VEÐ¢ÒÀ¢÷÷7BÕCƒR&÷FV7FVBÖÖ–âWF†÷&—G’&WV—&W2F†R6–ævÆRW†7BGvò×&VçB"c‚ÖW&vRð¢ÒÀ¢°¢'6–ævÆR×&VçBW6‚"À¢°¢†VE÷6V6öæE÷&VçE÷6†¢çVÆÂÀ¢†VE÷&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†ÒÀ¢†VE÷&VçEö6÷VçC¢À¢6V6öæE÷&VçE÷G&VU÷6†¢çVÆÂÀ¢÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷6†¢çVÆÀ¢ÒÀ¢÷÷7BÕCƒR&÷FV7FVBÖÖ–âWF†÷&—G’&WV—&W2F†R6–ævÆRW†7BGvò×&VçB"c‚ÖW&vRð¢ÒÀ¢°¢&ÖW&vR×G&VRG&–gB"À¢²6V6öæE÷&VçE÷G&VU÷6†¢&""ç&WVBƒC’ÒÀ¢÷÷7BÕCƒRÖW&vRG&VR×W7BWVÂF†Rf–æÂWF†÷&—¦VB"†VBG&VRð¢Ð¥Ò’°¢FW7B†6ö×ÆWFVBCƒR&V¦V7G2G¶æÖWÒf÷"&÷FV7FVBÖÖ–âWF†÷&—G–Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7Bv—F‡V$7F–öç46öçFW‡BÒÖ¶U÷7ECƒTÖ–çFVææ6UW6„7F–öç46öçFW‡B†f—‡GW&Rç&ö÷B¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†f—‡GW&Rç&ö÷BÂv—F‡V$7F–öç46öçFW‡B¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—F‡V$7F–öç46öçFW‡BÀ¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢†VE÷&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢†VE÷6V6öæE÷&VçE÷6†¢f—‡GW&U÷7ECƒTf–æÅ$†VBÀ¢†VE÷&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†Âf—‡GW&U÷7ECƒTf–æÅ$†VEÒÀ¢†VE÷&VçEö6÷VçC¢"À¢†VE÷G&VU÷6†¢&"ç&WVBƒC’À¢6V6öæE÷&VçE÷G&VU÷6†¢&"ç&WVBƒC’À¢÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷6†¢f—‡GW&U÷7ECƒTf–æÅ$†VBÀ¢ââæ&–æF–æt÷fW'&–FW0¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVB¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G2÷7BÖWF†÷&—¦F–öâ6†ævW2÷WG6–FRF†RGvòfÆ–FF÷"F‡2"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢÷7E÷CƒUöÖ–çFVææ6Uö6æF–FFUöÖVæFÖVçE÷F‡3¢°¢ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VDÖVæFÖVçEF‡2À¢&2÷vV"÷FW7G2öS&R÷W3bÖöffÆ–æRÖ—77VRç7V2çG2 ¢Ð¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÖWF†÷&—¦F–öâÖVæFÖVçG2×W7B6†ævRW†7FÇ’F†RGvòfÆ–FF÷"F‡2ð¢§Ò ¦f÷"†6öç7B¶æÖRÂ&VçE6†2Â&VçD6÷VçEÒöb°¢²'w&öærf–æÂ×7W÷'B&VçB"Â²#"ç&WVBƒC•ÒÂÒÀ¢²&ÖW&vRf–æÂ×7W÷'B6öÖÖ—B"Â·÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†Â#"ç&WVBƒC•ÒÂ%Ð¥Ò’°¢FW7B†6ö×ÆWFVBCƒR&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷&VçE÷6†3¢&VçE6†2À¢÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷&VçEö6÷VçC¢&VçD6÷Vç@¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢öf–æÂ"c‚†VB×W7B&RF†RF—&V7BöæR×&VçB6†–ÆBöbF†RWF†÷&—¦VB6ö×÷6&–Æ—G’6æF–FFRð¢¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G26æF–FFRw&‚G&–gB"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢÷7E÷CƒUöÖ–çFVææ6Uö6æF–FFUöw&…öÖF6†W3¢fÇ6P¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6R6æF–FFRw&‚×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢§Ò ¦f÷"†6öç7B²Fƒ¢–ÆöEF‚Òöb÷7ECƒTÖ–çFVææ6U&W6W'fVE–ÆöD&Æö'2’°¢FW7B†6ö×ÆWFVBCƒR&V¦V7G2g&÷¦Vâ–ÆöBG&–gBBG·–ÆöEF‡ÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B–ÆöD&Æö$ö–G2Ò°¢W&UöÖW&vS¢²ââç÷7ECƒTÖ–çFVææ6TW‡V7FVE–ÆöD&Æö$ö–G2ÒÀ¢6ö×÷6&–Æ—G•ö6†–ÆC¢²ââç÷7ECƒTÖ–çFVææ6TW‡V7FVE–ÆöD&Æö$ö–G2ÒÀ¢f–æÅ÷%ö†VC¢°¢ââç÷7ECƒTÖ–çFVææ6TW‡V7FVE–ÆöD&Æö$ö–G2À¢·–ÆöEF…Ó¢#"ç&WVBƒC¢Ð¢Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢Ö¶U÷7ECƒTÖ–çFVææ6Tv—D&–æF–ær‡°¢÷7E÷CƒUöÖ–çFVææ6U÷&W6W'fVE÷–ÆöEö&Æö%öö–G3¢–ÆöD&Æö$ö–G0¢Ò¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6R–ÆöB&Æö'2×W7BÖF6‚ÆÂf—fRg&÷¦Vâ&–æF–æw2ð¢¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ&VF&6²ÂW‡V7FVEÒöb°¢°¢&Ö—76–ær&VF&6²"À¢çVÆÂÀ¢÷÷7BÕCƒRÖ–çFVææ6R&WV—&W2fW&–f–VBv—D‡V"÷væW"ÖWF†÷&—¦F–öâ&VF&6²ð¢ÒÀ¢°¢'Væf–Æ&ÆR&VF&6²"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢²7FGW3¢%Täd”Ä$ÄR"Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6R&WV—&W2fW&–f–VBv—D‡V"÷væW"ÖWF†÷&—¦F–öâ&VF&6²ð¢ÒÀ¢°¢&æöâÔv—D‡V"&VF&6²6÷W&6R"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢²6÷W&6S¢&f—‡GW&R"Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6R&WV—&W2fW&–f–VBv—D‡V"÷væW"ÖWF†÷&—¦F–öâ&VF&6²ð¢ÒÀ¢°¢'w&öær6öÖÖVçBU$Â"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢°¢‡FÖÅ÷W&Ã¢÷7ECƒTÖ–çFVææ6U7WW'6VFVDWF†÷&—¦F–öå&Vg5³ÒÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ócB ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&VF&6²×W7BÖF6‚F†RWF†÷&—¦VB—77VR6öÖÖVçBð¢ÒÀ¢°¢'w&öær7&VF–öâF–ÖW7F×"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢°¢7&VFVEöC¢###bÓ’ÓCC£3£5¢"À¢WFFVEöC¢###bÓ’ÓCC£3£5¢ ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâF–ÖW7F××W7BÖF6‚F†R÷væW"F—7F6‚ð¢ÒÀ¢°¢&æöâÖ÷væW"&VF&6²"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢²W6W%öÆöv–ã¢&GF6¶W""Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ6öÖÖVçB×W7B&RWF†÷&VB'’F†R&W÷6—F÷'’÷væW"ð¢ÒÀ¢°¢&æöâÖ÷væW"76ö6–F–öâ"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢²WF†÷%ö76ö6–F–öã¢$äôäR"Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ6öÖÖVçB×W7B&RWF†÷&VB'’F†R&W÷6—F÷'’÷væW"ð¢ÒÀ¢°¢&VF—FVB&VF&6²"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢²WFFVEöC¢###bÓ’ÓCC£3£5¢"Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ6öÖÖVçB×W7B&R–Ö×WF&ÆRgFW"7&VF–öâð¢ÒÀ¢°¢'w&öær&6R&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢WF†÷&—¦F–öåö&6S¢²'&æ6ƒ¢&Ö–â"Â6†¢#"ç&WVBƒC’Â&÷FV7FVC¢G'VRÐ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öærF‚&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢²WF†÷&—¦VE÷F‡3¢²&2÷vV"÷FW7G2öS&Rö÷F†W"ç7V2çG2%ÒÐ¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öær'&æ6‚&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢²'&æ6ƒ¢&f—‚÷Vç&VÆFVB"Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öærVÆÂ×&WVW7B&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢²VÆÅ÷&WVW7C¢cBÐ¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öær6öÖ&–æVB6æF–FFRw&‚"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢²6æF–FFUöw&ƒ¢·ÒÐ¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öærg&÷¦Vâ–ÆöB&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢&W6W'fVE÷–ÆöEö&Æö'3¢÷7ECƒTÖ–çFVææ6U&W6W'fVE–ÆöD&Æö'2æÖ‚†&–æF–ærÂ–æFW‚’Óà¢–æFW‚ÓÓÒò²ââæ&–æF–ærÂv—Eö&Æö%öö–C¢#"ç&WVBƒC’Ò¢²ââæ&–æF–ærÐ¢¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'w&öærf–æÂ×7W÷'B&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢WF†÷&—¦VEöf–æÅ÷7W÷'C¢°¢&VçE÷6†¢#"ç&WVBƒC’À¢6öÖÖ—Eö6÷VçC¢À¢&VçEö6÷VçC¢À¢6†ævVE÷F‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VDÖVæFÖVçEF‡5Ð¢Ð¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢&Ö—76–ær7WW'6W76–öâ&–æF–ær"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢²7WW'6VFW5öWF†÷&—¦F–öå÷&Vg3¢µÒÐ¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'&Wfö¶VB&VG’Öf÷"×&Wf–WrW&Ö—76–öâ"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢66÷Uö&÷VæF&–W3¢²#c…÷&VG•öf÷%÷&Wf–Wu÷G&ç6—F–öåöWF†÷&—¦VC¢fÇ6RÐ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢'&Wfö¶VBÖW&vRW&Ö—76–öâ"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢66÷Uö&÷VæF&–W3¢²6–ævÆUö6öÖ&–æVE÷#c…÷&VwVÆ%öÖW&vUöWF†÷&—¦VC¢fÇ6RÐ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢ÒÀ¢°¢&vVæW&–2&÷FV7FVBÖÖ–â×W6‚W&Ö—76–öâ"À¢Ö¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢WF†÷&—¦F–öä÷fW'&–FW3¢°¢66÷Uö&÷VæF&–W3¢²vVæW&–5÷&÷FV7FVEöÖ–å÷W6…öWF†÷&—¦VC¢G'VRÐ¢Ð¢Ò’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&öG’×W7BÖF6‚F†RW†7B÷væW"F—7F6‚ð¢Ð¥Ò’°¢FW7B†6ö×ÆWFVBCƒRf–Ç26Æ÷6VBf÷"G¶æÖWÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVB¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2Â°¢&2÷vV"÷FW7G2öS&R÷W3bÖöffÆ–æRÖ—77VRç7V2çG2 ¢Ò¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR66WG2âVæfVæ6VBW†7BÖ–çFVææ6RWF†÷&—¦F–öâ&öG’"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&VF&6²ÒÖ¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‚¢&VF&6²æ&öG’Ò&VF&6²æ&öG’ç&WÆ6R‚&§6öåÆâ"Â""’ç&WÆ6R‚%Ææ"Â""¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G2ÖÆf÷&ÖVBÖ–çFVææ6RWF†÷&—¦F–öâfVæ6R"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&VF&6²ÒÖ¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‚¢&VF&6²æ&öG’Ò&VF&6²æ&öG’ç&WÆ6R‚&§6öâ"Â&¥4ôâ"¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂöÖ–çFVææ6RWF†÷&—¦F–öâ¥4ôâfVæ6R—2–çfÆ–Bò§Ò §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G2GWÆ–6FR¶W—2–âfVæ6VBÖ–çFVææ6RWF†÷&—¦F–öâ¥4ôâ"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7BGWÆ–6FT¶W•&VF&6²ÒÖ¶U÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6²‡°¢&VF&6´÷fW'&–FW3¢°¢&öG“¢°¢#ÂÒÒ÷7B×CƒRÖÖ–çFVææ6S¦÷væW"ÖWF†÷&—¦F–öã§7F'BÒÓâ"À¢&§6öâ"À¢²'66†VÖ÷fW'6–öâ#¢"G·÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå66†VÖÒ"Â'66†VÖ÷fW'6–öâ#¢&f÷&vVB'ÖÀ¢&"À¢#ÂÒÒ÷7B×CƒRÖÖ–çFVææ6S¦÷væW"ÖWF†÷&—¦F–öã¦VæBÒÓâ ¢Òæ¦ö–â‚%Æâ"¢Ð¢Ò¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&VF&6³¢GWÆ–6FT¶W•&VF&6°¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂöGWÆ–6FR¥4ôâö&¦V7B¶W“¢66†VÖ÷fW'6–öâò§Ò §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G2'F–ÂU3bÖ–çFVææ6RF‚w&çB"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²&2÷vV"÷FW7G2öS&R÷W3bÖöffÆ–æRÖ—77VRç7V2çG2%Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&WV—&W2F†RW†7B6WfVâ×F‚6öÖ&–æVB66÷Rð¢§Ò §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G2âW‡G&V–v‡F‚Ö–çFVææ6RF‚"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡2Â&Fö72÷&W6V&6‚÷Vç&VÆFVBæÖB%Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&WV—&W2F†RW†7B6WfVâ×F‚6öÖ&–æVB66÷Rð¢§Ò §FW7B‚&6ö×ÆWFVBCƒR&–æG2F†RÖ–çFVææ6R7W÷'B6öÖÖ—BFòF†RWF†÷&—¦VBS$R†VB"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢°¢7FGW3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷&Vc¢&f—‡GW&S§÷7B×CƒRÖÖ–çFVææ6RÖ&6R"À¢6†ævUö&6U÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VRÀ¢†VE÷&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†À¢†VE÷&VçEö6÷VçC¢À¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷#¢fÇ6RÀ¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEö6öÖÖ—GFVEöC ¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VD6öÖÖ—GFVDBÀ¢÷7E÷CƒUöÖ–çFVææ6UöS&UöÖF6†W5öWF†÷&—¦VEö†VC¢G'VP¢Ð¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢öWF†÷&—¦VB6öÖ&–æVB6æF–FFR×W7B&Râæ6W7F÷"öbF†RWfÇVFVBÖ–çFVææ6R†VBð¢§Ò §FW7B‚&6ö×ÆWFVBCƒR&–æG2F†RS$R'—FW2FòF†R÷væW"×6–væVB6æF–FFR"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢°¢7FGW3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷&Vc¢&f—‡GW&S§÷7B×CƒRÖÖ–çFVææ6RÖ&6R"À¢6†ævUö&6U÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VRÀ¢†VE÷&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†À¢†VE÷&VçEö6÷VçC¢À¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷#¢G'VRÀ¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEö6öÖÖ—GFVEöC ¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VD6öÖÖ—GFVDBÀ¢÷7E÷CƒUöÖ–çFVææ6UöS&UöÖF6†W5öWF†÷&—¦VEö†VC¢fÇ6P¢Ð¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢öWF†÷&—¦VBU3bS$R'—FW2×W7B&VÖ–âVæ6†ævVBg&öÒF†R6öÖ&–æVB6æF–FFRð¢§Ò §FW7B‚&6ö×ÆWFVBCƒR&WV—&W2õtäU"WF†÷&—¦F–öâgFW"F†R6–væVB6æF–FFR6öÖÖ—B"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5Ð¢6öç7B&W÷'BÒ'Vå÷7ECƒTÖ–çFVææ6Tf—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢°¢7FGW3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷&Vc¢&f—‡GW&S§÷7B×CƒRÖÖ–çFVææ6RÖ&6R"À¢6†ævUö&6U÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢6†ævUö&6Uöæ6W7F÷#¢G'VRÀ¢†VE÷&VçE÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VE6†À¢†VE÷&VçEö6÷VçC¢À¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷#¢G'VRÀ¢÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEö6öÖÖ—GFVEöC ¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&V6÷&FVDBÀ¢÷7E÷CƒUöÖ–çFVææ6UöS&UöÖF6†W5öWF†÷&—¦VEö†VC¢G'VP¢Ð¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ×W7B÷7FFFRF†R÷væW"×6–væVB6æF–FFRð¢§Ò §FW7B‚'÷7BÕCƒRÖ–çFVææ6RWF†÷&—¦F–öâ&VBÖ&6²'Vç2öæÇ’f÷"—G2W†7B6ö×ÆWFVB66÷R"Â‚’Óâ°¢76W'BæWVÂ€¢G—VöbG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öäf÷%7FFRÀ¢&gVæ7F–öâ ¢¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢ÆWB6ÆÇ2Ò ¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öäf÷%7FFR€¢f—‡GW&Rç&ö÷BÀ¢°¢6†ævT&6UF6·5FW‡C¢f—‡GW&Ræ6†ævT&6UF6·5FW‡BÀ¢6†ævT&6U6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢6†ævVEF‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5ÒÀ¢–ç7V7C¢†WF†÷&—¦F–öå&Vb’Óâ°¢6ÆÇ2³Ò¢&WGW&â²7FGW3¢%dU$”d”TB"Â‡FÖÅ÷W&Ã¢WF†÷&—¦F–öå&VbÐ¢Ð¢Ð¢ ¢76W'BæWVÂ†6ÆÇ2Â¢76W'BæWVÂ‡&VF&6²æ‡FÖÅ÷W&ÂÂ÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öå&Vb§Ò §FW7B‚'÷7BÕCƒRÖ–çFVææ6R&VBÖ&6²6¶—2WfW'’æöâÖW†7B66÷R"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢ÆWB6ÆÇ2Ò ¢6öç7B–ç7V7BÒ‚’Óâ°¢6ÆÇ2³Ò¢&WGW&â²7FGW3¢%dU$”d”TB"Ð¢Ð¢f÷"†6öç7B÷fW'&–FW2öb°¢²6†ævVEF‡3¢·÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5³ÕÒÒÀ¢²6†ævVEF‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡2Â&Fö72÷&W6V&6‚÷Vç&VÆFVBæÖB%ÒÒÀ¢²6†ævT&6U6†¢#"ç&WVBƒC’ÒÀ¢²&÷VæFVE66÷T7F—fS¢G'VRÐ¢Ò’°¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öäf÷%7FFR€¢f—‡GW&Rç&ö÷BÀ¢°¢6†ævT&6UF6·5FW‡C¢f—‡GW&Ræ6†ævT&6UF6·5FW‡BÀ¢6†ævT&6U6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢6†ævVEF‡3¢²ââç÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5ÒÀ¢–ç7V7BÀ¢ââæ÷fW'&–FW0¢Ð¢¢76W'BæWVÂ‡&VF&6²ÂçVÆÂ¢Ð¢76W'BæWVÂ†6ÆÇ2Â§Ò ¦f÷"†6öç7B7WW'6VFVDWF†÷&—¦F–öå&Vböb÷7ECƒTÖ–çFVææ6U7WW'6VFVDWF†÷&—¦F–öå&Vg2’°¢FW7B†÷7BÕCƒRÖ–çFVææ6R&VBÖ&6²&V¦V7G27WW'6VFVBG·7WW'6VFVDWF†÷&—¦F–öå&VgÖÂ‚’Óâ°¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öâ€¢7WW'6VFVDWF†÷&—¦F–öå&VbÀ¢²Vçf—&öæÖVçC¢·ÒÐ¢ ¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%Täd”Ä$ÄR"¢76W'BæÖF6‚‡&VF&6²æW'&÷'2æ¦ö–â‚%Æâ"’ÂöFöW2æ÷B–FVçF–g’F†RWF†÷&—¦VB—77VRcr6öÖÖVçBò¢Ò§Ð ¦f÷"†6öç7B6†ævVEF‚öb°¢&æG&ö–Bö÷7&2öÖ–âö¦fö6öÒö6÷W'G6–FR÷Grõ'VçF–ÖRæ·B"À¢"æv—F‡V"÷v÷&¶fÆ÷w2öFWÆ÷’ç–ÖÂ"À¢&&6¶VæB÷7&2öÖ–âö¦fö6öÒö6÷W'G6–FR÷Grõ&÷f–FW$6öæf–ræ¦f"À¢'vV#2ö7F—fFRçG2 ¥Ò’°¢FW7B†6ö×ÆWFVBCƒR&V¦V7G2æöâ×&W6V&6‚7F—fF–öâF‚G¶6†ævVEF‡ÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò¶6†ævVEF…Ð¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢ö6†ævVBF‚—2÷WG6–FRF†RWF†÷&—¦VB÷7BÕCƒRÖ–çFVææ6R66÷Rð¢¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR¶VW2CƒbF—7F6‚F‡2&Æö6¶VBVçF–ÂfÆ–FF÷"WföÇWF–öâ"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢f—‡GW&Ræ6†ævVEF‡2Ò²"æÆö÷öWf–FVæ6R÷CƒbÖF—7F6‚æ§6öâ%Ð¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢ö6†ævVBF‚&WV—&W26W&FVÇ’WF†÷&—¦VBCƒbfÆ–FF÷"WföÇWF–öâð¢§Ò ¦f÷"†6öç7B¶æÖRÂ×WFFRÂW‡V7FVEÒöb°¢°¢&6ö×ÆWF–öâ&V6V—BG&–gB"À¢‡²&V6V—EF‚Ò’Óâ°¢6öç7B&V6V—BÒ¥4ôâç'6R†g2ç&VDf–ÆU7–æ2‡&V6V—EF‚Â'WFc‚"’¢&V6V—Bæ66WFVEö'’Ò&F–ffW&VçBÖf—‡GW&R×&VÆV6RÖ÷væW" ¢g2çw&—FTf–ÆU7–æ2‡&V6V—EF‚Â¥4ôâç7G&–æv–g’‡&V6V—B’¢ÒÀ¢ö6ö×ÆWFVBCƒR×W7B&W6W'fRF†R&6R6ö×ÆWF–öâ&V6V—B'—FRÖf÷"Ö'—FRð¢ÒÀ¢°¢&6ö×ÆWF–öâ&V6V—B&VÖ÷fÂ"À¢‡²&V6V—EF‚Ò’Óâ°¢g2çVæÆ–æµ7–æ2‡&V6V—EF‚¢ÒÀ¢ö6ö×ÆWFVBCƒR×W7B&W6W'fRF†R&6R6ö×ÆWF–öâ&V6V—B'—FRÖf÷"Ö'—FRð¢ÒÀ¢°¢'F6·2G&–gB"À¢‡²F6·5F‚Ò’Óâ°¢g2æVæDf–ÆU7–æ2‡F6·5F‚Â%ÆçVæWF†÷&—¦VB6ö×ÆWFVB×7FFR&÷6UÆâ"¢ÒÀ¢ö6ö×ÆWFVBCƒR×W7B&W6W'fR&6RF6·5ÂæÖB'—FRÖf÷"Ö'—FRð¢ÒÀ¢°¢'G&6V&–Æ—G’G&–gB"À¢‡²G&6V&–Æ—G•F‚Ò’Óâ°¢g2æVæDf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â%ÆçVæWF†÷&—¦VB6ö×ÆWFVB×7FFR&÷6UÆâ"¢ÒÀ¢ö6ö×ÆWFVBCƒR×W7B&W6W'fRF†Rg&÷¦VâG&6V&–Æ—G’6öçG&7B'—FRÖf÷"Ö'—FRð¢Ð¥Ò’°¢FW7B†6ö×ÆWFVBCƒR&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R†×WFFR¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVB¢Ò§Ð §FW7B‚&6ö×ÆWFVBCƒR&V¦V7G26†V6¶VB×Fò×Væ6†V6¶VB6†V6¶&÷‚&öÆÆ&6²"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚‡²F6·5F‚Ò’Óâ°¢6öç7BF6·2Òg2ç&VDf–ÆU7–æ2‡F6·5F‚Â'WFc‚"¢g2çw&—FTf–ÆU7–æ2‡F6·5F‚ÂF6·2ç&WÆ6R‚õâÒÅ·…ÅÒCƒUÆ"öÒÂ"Ò²ÒCƒR"’¢Ò¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†f—‡GW&R ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂõCƒR6†V6¶&÷‚6ææ÷B&öÆÂ&6²gFW"6ö×ÆWF–öâò§Ò §FW7B‚&6ö×ÆWFVBCƒRf–Ç26Æ÷6VBv†Vâ—G2&6R&V6V—B6ææ÷B&R&VB"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶T6ö×ÆWFVDf—‡GW&R‚¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†f—‡GW&RÂ²6†ævT&6T6ö×ÆWF–öå&V6V—EFW‡C¢çVÆÂÒ ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢ö6ö×ÆWFVBCƒR&WV—&W2&VF&ÆR6ö×ÆWF–öâ&V6V—BBF†RVF—FVB&6Rð¢§Ò §FW7B‚'&V6V—BÖöFR&V¦V7G2FWf–F–öâ×&W6öÇWF–öâG&–gB&ÆW76VB'’6VÆbÖFV6Æ&VBF–vW7B"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7BG&6V&–Æ—G•F‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"¢6öç7B&V6V—EF‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂ6ö×ÆWF–öå&V6V—EF‚¢6öç7B6öçG&7BÒW‡G&7D6öçG&7B†g2ç&VDf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â'WFc‚"’¢6öçG&7BæFWf–F–öç5³Òç7FFRÒ%$U4ôÅdTB ¢6öç7BG&–gFVEG&6V&–Æ—G’ÒÖ&¶F÷vâ†6öçG&7B¢f—‡GW&Ræ6†ævT&6UG&6V&–Æ—G•FW‡BÒG&–gFVEG&6V&–Æ—G¢g2çw&—FTf–ÆU7–æ2‡G&6V&–Æ—G•F‚ÂG&–gFVEG&6V&–Æ—G’¢6öç7B&V6V—BÒ¥4ôâç'6R†g2ç&VDf–ÆU7–æ2‡&V6V—EF‚Â'WFc‚"’¢&V6V—BçG&6V&–Æ—G•÷6†#SbÒ6†#Sb†G&–gFVEG&6V&–Æ—G’¢&V6V—BæFWf–F–öå÷6æ6†÷BÒ°¢F÷FÃ¢À¢÷Vã¢À¢66WFVC¢À¢&W6öÇfVC¢À¢÷Våö–G3¢µÐ¢Ð¢g2çw&—FTf–ÆU7–æ2‡&V6V—EF‚Â¥4ôâç7G&–æv–g’‡&V6V—B’ ¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&R¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷G&6V&–Æ—G’×W7BÖF6‚F†R66WFVB–×ÆVÖVçFF–öâ6æ6†÷Bð¢§Ò §FW7B‚'&V6V—BÖöFR&V¦V7G2&R×&V6V—BF6·2G&–gB&ÆW76VB'’6VÆbÖFV6Æ&VBF–vW7B"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7BF6·5F‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂfVGW&UF‚Â'F6·2æÖB"¢6öç7B&V6V—EF‚ÒF‚æ¦ö–â†f—‡GW&Rç&ö÷BÂ6ö×ÆWF–öå&V6V—EF‚¢6öç7BG&–gFVEVæF–æuF6·2ÒG¶f—‡GW&Ræ6†ævT&6UF6·5FW‡GÕÆçVæWF†÷&—¦VB&6R&÷6UÆæ ¢6öç7BG&–gFVD6ö×ÆWFVEF6·2ÒG&–gFVEVæF–æuF6·2ç&WÆ6R‚õâÒÅ²ÅÒCƒUÆ"öÒÂ"Ò·…ÒCƒR"¢f—‡GW&Ræ6†ævT&6UF6·5FW‡BÒG&–gFVEVæF–æuF6·0¢g2çw&—FTf–ÆU7–æ2‡F6·5F‚ÂG&–gFVD6ö×ÆWFVEF6·2¢6öç7B&V6V—BÒ¥4ôâç'6R†g2ç&VDf–ÆU7–æ2‡&V6V—EF‚Â'WFc‚"’¢&V6V—BçF6·5ö&Vf÷&U÷6†#SbÒ6†#Sb†G&–gFVEVæF–æuF6·2¢g2çw&—FTf–ÆU7–æ2‡&V6V—EF‚Â¥4ôâç7G&–æv–g’‡&V6V—B’ ¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&R¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷F6·2×W7BÖF6‚F†R66WFVB–×ÆVÖVçFF–öâ6æ6†÷Bò§Ò ¦f÷"†6öç7Bæ6W7G'’öb¶fÇ6RÂçVÆÅÒ’°¢FW7B†&V6V—BÖöFRf–Ç26Æ÷6VBv†Vâ–×ÆVÖVçFF–öâÖÖW&vRæ6W7G'’—2G¶æ6W7G'—ÖÂ‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&RÂ°¢–×ÆVÖVçFF–öäÖW&vTæ6W7F÷$öd6†ævT&6S¢æ6W7G'¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢ö6ö×ÆWF–öâ&V6V—B–×ÆVÖVçFF–öåöÖW&vU÷6†×W7B&Râæ6W7F÷"öb&V6V—Eö&6U÷6†ð¢¢Ò§Ð §FW7B‚'&V6V—BÖöFR&V¦V7G2×VÇF’Ö6öÖÖ—B6æF–FFRWfVâv†Vâ—G2æWBF–fb—2W†7B"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢°¢7FGW3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷&Vc¢&f—‡GW&S§G'W7FVBÖ&6R"À¢6†ævUö&6U÷6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævUö&6Uöæ6W7F÷#¢G'VRÀ¢†VE÷&VçE÷6†¢#b"ç&WVBƒC’À¢†VE÷&VçEö6÷VçC¢¢Ð¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢÷&V6V—B6æF–FFR†VB&VçB×W7BWVÂ&V6V—Eö&6U÷6†ð¢§Ò §FW7B‚'&V6V—BÖöFR&V¦V7G2ÖW&vRÖ6öÖÖ—B6æF–FFRWfVâv†Vâf—'7B&VçBæBæWBF–fb&RW†7B"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&RÂ°¢v—D&–æF–æs¢°¢7FGW3¢$4ÄTâ"À¢†VC¢f—‡GW&U&V6V—D†VBÀ¢6†ævUö&6U÷&Vc¢&f—‡GW&S§G'W7FVBÖ&6R"À¢6†ævUö&6U÷6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævUö&6Uöæ6W7F÷#¢G'VRÀ¢†VE÷&VçE÷6†¢f—‡GW&U&V6V—D&6RÀ¢†VE÷&VçEö6÷VçC¢ ¢Ð¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç&V6V—EöVÆ–v–&ÆRÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&V6V—B6æF–FFR†VB×W7B†fRW†7FÇ’öæR&VçBò§Ò §FW7B‚'&V6V—BÖöFR6ææ÷B&V6öÖRVÆ–v–&ÆRv—F†÷WBG'W7FVBv—B&–æF–ær"Â‚’Óâ°¢6öç7Bf—‡GW&RÒÖ¶U&V6V—Df—‡GW&R‚¢6öç7B&W÷'BÒ'Vå&V6V—Df—‡GW&R†f—‡GW&RÂ²v—D&–æF–æs¢çVÆÂÒ ¢6Ú±î¸Â¸­yêë¢°k¢G§¦*^sert.equal(report.status, "FAIL")
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

test("authenticated protected-main push validates the merged receipt transition", () => {
  const fixture = makeReceiptFixture()
  writeFixturePushExactHead(fixture.root)
  const githubActionsContext = makeFixturePushActionsContext(fixture.root)
  const report = runReceiptFixture(fixture, { githubActionsContext })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
  assert.equal(report.mode, "T085_RECEIPT_CANDIDATE")
  assert.equal(report.receipt_eligible, false)
  assert.equal(report.external_readback_required, true)
  assert.equal(report.source.github_actions_context.authority, "PROTECTED_MAIN_PUSH")
})

test("receipt mode rejects duplicate object keys before JSON parsing", () => {
  const fixture = makeReceiptFixture()
  const receiptPath = path.join(fixture.root, completionReceiptPath)
  const receiptText = fs.readFileSync(receiptPath, "utf8")
  const ambiguousReceipt = receiptText.replace(
    '"decision":"ACCEPTED"',
    '"decision":"REJECTED","decision":"ACCEPTED"'
  )
  assert.notEqual(ambiguousReceipt, receiptText)
  fs.writeFileSync(receiptPath, ambiguousReceipt)
  const report = runReceiptFixture(fixture)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /duplicate JSON object key: decision/)
})

test("receipt mode rejects a JSON null completion receipt", () => {
  const fixture = makeReceiptFixture()
  fs.writeFileSync(path.join(fixture.root, completionReceiptPath), "null\n")
  const report = runReceiptFixture(fixture)

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(report.errors.join("\n"), /checked T085 requires a structured completion receipt/)
})

test("receipt mode requires an evaluated head commit timestamp", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, { evaluatedHeadCommittedAt: null })

  assert.equal(report.status, "FAIL")
  assert.equal(report.receipt_eligible, false)
  assert.match(
    report.errors.join("\n"),
    /completion receipt requires a trusted evaluated head commit timestamp/
  )
})

test("receipt candidate accepts a fresh owner authorization recorded after the audited base", () => {
  const fixture = makeReceiptFixture(({ receipt }) => {
    receipt.authorization_ref = fixtureReceiptAuthorizationRef
    receipt.recorded_at = fixtureFreshAuthorizationRecordedAt
    receipt.authorization_base_sha = fixtureReceiptBase
    receipt.authorization_traceability_sha256 = receipt.traceability_sha256
  })
  const report = runReceiptFixture(fixture, {
    changeBaseCommittedAt: fixtureReceiptBaseCommittedAt,
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt
  })

  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("receipt candidate rejects an owner authorization recorded before the audited base", () => {
  const fixture = makeReceiptFixture(({ receipt }) => {
    receipt.authorization_ref = fixtureReceiptAuthorizationRef
    receipt.recorded_at = "2026-08-31T04:47:23Z"
    receipt.authorization_base_sha = fixtureReceiptBase
    receipt.authorization_traceability_sha256 = receipt.traceability_sha256
  })
  const report = runReceiptFixture(fixture, {
    changeBaseCommittedAt: fixtureReceiptBaseCommittedAt,
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt
  })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt recorded_at must not predate the audited change base/
  )
})

test("receipt candidate binds the fresh owner authorization to the audited base", () => {
  const fixture = makeReceiptFixture(({ receipt }) => {
    receipt.authorization_ref = fixtureReceiptAuthorizationRef
    receipt.recorded_at = fixtureFreshAuthorizationRecordedAt
    receipt.authorization_base_sha = "6".repeat(40)
    receipt.authorization_traceability_sha256 = receipt.traceability_sha256
  })
  const report = runReceiptFixture(fixture, {
    changeBaseCommittedAt: fixtureReceiptBaseCommittedAt,
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt
  })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt authorization_base_sha must equal the audited change base/
  )
})

test("receipt candidate binds the fresh owner authorization to the frozen traceability hash", () => {
  const fixture = makeReceiptFixture(({ receipt }) => {
    receipt.authorization_ref = fixtureReceiptAuthorizationRef
    receipt.recorded_at = fixtureFreshAuthorizationRecordedAt
    receipt.authorization_base_sha = fixtureReceiptBase
    receipt.authorization_traceability_sha256 = "0".repeat(64)
  })
  const report = runReceiptFixture(fixture, {
    changeBaseCommittedAt: fixtureReceiptBaseCommittedAt,
    evaluatedHeadCommittedAt: fixtureReceiptHeadCommittedAt
  })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt authorization_traceability_sha256 must equal the frozen traceability contract/
  )
})

test("receipt candidate requires a trusted audited-base commit timestamp", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, { changeBaseCommittedAt: null })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt requires a trusted audited change-base commit timestamp/
  )
})

test("receipt candidate requires an available GitHub owner-authorization readback", () => {
  const fixture = makeReceiptFixture()
  const report = runReceiptFixture(fixture, { ownerAuthorizationReadback: null })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt requires a verified GitHub owner-authorization readback/
  )
})

test("receipt candidate rejects a referenced comment not authored by the repository owner", () => {
  const fixture = makeReceiptFixture()
  const ownerAuthorizationReadback = makeOwnerAuthorizationReadback(fixture.receipt, {
    user_login: "attacker",
    author_association: "NONE"
  })
  const report = runReceiptFixture(fixture, { ownerAuthorizationReadback })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt authorization comment must be authored by the repository owner/
  )
})

test("receipt candidate rejects a GitHub comment timestamp that differs from recorded_at", () => {
  const fixture = makeReceiptFixture()
  const ownerAuthorizationReadback = makeOwnerAuthorizationReadback(fixture.receipt, {
    created_at: "2026-08-31T04:50:01Z",
    updated_at: "2026-08-31T04:50:01Z"
  })
  const report = runReceiptFixture(fixture, { ownerAuthorizationReadback })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt recorded_at must equal the GitHub authorization comment created_at/
  )
})

test("receipt candidate rejects mutable edited authorization evidence", () => {
  const fixture = makeReceiptFixture()
  const ownerAuthorizationReadback = makeOwnerAuthorizationReadback(fixture.receipt, {
    updated_at: "2026-08-31T04:51:00Z"
  })
  const report = runReceiptFixture(fixture, { ownerAuthorizationReadback })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt authorization comment must be immutable after creation/
  )
})

test("receipt candidate rejects authorization body drift from the audited base and hash", () => {
  const fixture = makeReceiptFixture()
  const ownerAuthorizationReadback = makeOwnerAuthorizationReadback(fixture.receipt)
  ownerAuthorizationReadback.body = ownerAuthorizationReadback.body.replace(
    fixture.receipt.authorization_traceability_sha256,
    "0".repeat(64)
  )
  const report = runReceiptFixture(fixture, { ownerAuthorizationReadback })

  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /completion receipt authorization body must bind the audited receipt base, traceability hash, and scope boundaries/
  )
})

test("owner authorization read-back runs only for a receipt candidate", () => {
  assert.equal(typeof traceabilityValidator.inspectOwnerAuthorizationForState, "function")
  const fixture = makeReceiptFixture()
  let calls = 0
  const readback = traceabilityValidator.inspectOwnerAuthorizationForState(fixture.root, {
    changeBaseTasksText: fixture.changeBaseTasksText,
    inspect: (authorizationRef) => {
      calls += 1
      return { status: "VERIFIED", html_url: authorizationRef }
    }
  })

  assert.equal(calls, 1)
  assert.equal(readback.html_url, fixture.receipt.authorization_ref)
})

test("completed T085 skips owner authorization read-back", () => {
  assert.equal(typeof traceabilityValidator.inspectOwnerAuthorizationForState, "function")
  const fixture = makeCompletedFixture()
  let calls = 0
  const readback = traceabilityValidator.inspectOwnerAuthorizationForState(fixture.root, {
    changeBaseTasksText: fixture.changeBaseTasksText,
    inspect: () => {
      calls += 1
      return { status: "VERIFIED" }
    }
  })

  assert.equal(readback, null)
  assert.equal(calls, 0)
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
    /completion receipt schema_version must be courtside-t085-completion-receipt\/v2/
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
    "a timestamp before the audited change base",
    ({ receipt }) => {
      receipt.recorded_at = "2026-08-31T04:47:23Z"
    },
    /completion receipt recorded_at must not predate the audited change base/
  ],
  [
    "a timestamp after the evaluated head commit",
    ({ receipt }) => {
      receipt.recorded_at = "2026-08-31T04:55:53Z"
    },
    /completion receipt recorded_at must not postdate the evaluated head commit/
  ],
  [
    "an untrusted receipt owner",
    ({ receipt }) => {
      receipt.accepted_by = "branch-author"
    },
    /completion receipt accepted_by must equal the authorized repository owner/
  ],
  [
    "an invalid receipt authorization URL",
    ({ receipt }) => {
      receipt.authorization_ref = "self-declared-authorization"
    },
    /completion receipt authorization_ref must identify an issue 145 comment/
  ],
  [
    "the stale pre-base receipt authorization",
    ({ receipt }) => {
      receipt.authorization_ref = fixtureLegacyReceiptAuthorizationRef
    },
    /completion receipt authorization_ref must identify a fresh post-base owner decision/
  ],
  ...[
    ["implementation_head_sha", "missing", undefined],
    ["implementation_head_sha", "invalid", "A".repeat(40)],
    ["implementation_merge_sha", "missing", undefined],
    ["implementation_merge_sha", "invalid", "A".repeat(40)],
    ["receipt_base_sha", "missing", undefined],
    ["receipt_base_sha", "invalid", "A".repeat(40)],
    ["authorization_base_sha", "missing", undefined],
    ["authorization_base_sha", "invalid", "A".repeat(40)]
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

for (const [suite, source] of [
  [
    "describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe.skip("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "test.describe.skip",
    'import { test } from "@playwright/test"\n' +
      'test.describe.skip("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "concise-arrow describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe.skip("disabled suite", () =>\n  test("fixture-proof", () => {}))\n'
  ],
  [
    "regex-bearing describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe.skip(/[)}]/u, () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "comment-like regex before describe.skip",
    'import test, { describe } from "node:test"\n' +
      'const marker = /[/*]/u\ndescribe.skip("disabled */ suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "control-head regex inside describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe.skip("disabled suite", () => {\n  if (true) /[)]/u.test("x")\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "comment-separated describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe /* suite */ . /* modifier */ skip("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "computed-template describe.skip",
    'import test, { describe } from "node:test"\n' +
      'describe[`skip`]("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "dynamic computed describe modifier",
    'import test, { describe } from "node:test"\n' +
      'const modifier = "skip"\ndescribe[modifier]("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "tagged describe.skip.each",
    'import test, { describe } from "node:test"\n' +
      'describe.skip.each`value\\n${1}`("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "aliased describe.skip",
    'import test, { describe } from "node:test"\n' +
      'const skippedSuite = describe.skip\nskippedSuite("disabled suite", () => {\n  test("fixture-proof", () => {})\n})\n'
  ],
  [
    "named describe.skip callback",
    'import test, { describe } from "node:test"\n' +
      'const register = () => {\n  test("fixture-proof", () => {})\n}\ndescribe.skip("disabled suite", register)\n'
  ]
]) {
  test(`a test inside ${suite} cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/skipped-suite-proof.test.js"
      files["tests/skipped-suite-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("a test after a closed skipped suite remains an executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/closed-skipped-suite-proof.test.js"
    files["tests/closed-skipped-suite-proof.test.js"] =
      'import test, { describe } from "node:test"\n' +
      'describe.skip("disabled suite", () => {\n  test("different-proof", () => {})\n})\n' +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("a CRLF test after a closed skipped suite remains executable", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/crlf-closed-skipped-suite-proof.test.js"
    files["tests/crlf-closed-skipped-suite-proof.test.js"] =
      'import test, { describe } from "node:test"\r\n' +
      'describe.skip("disabled suite", () => {\r\n' +
      '  test("different-proof", () => {})\r\n' +
      "\r\n".repeat(20) +
      "})\r\n" +
      'test("fixture-proof", () => {})\r\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("a named suite callback cannot serve as attributable executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/named-suite-callback-proof.test.js"
    files["tests/named-suite-callback-proof.test.js"] =
      'import test, { describe } from "node:test"\n' +
      'const register = () => {\n  test("fixture-proof", () => {})\n}\n' +
      'describe("active suite", register)\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [runner, source] of [
  [
    "node:test",
    'import test, { describe } from "node:test"\n' +
      'describe("active suite", () => {}, () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    'import { test } from "@playwright/test"\n' +
      'test.describe("active suite", () => {}, () => test("fixture-proof", () => {}))\n'
  ]
]) {
  test(`an ignored extra ${runner} suite callback cannot register executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/extra-suite-callback-proof.test.js"
      files["tests/extra-suite-callback-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("an inline active suite callback remains attributable executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/active-suite-proof.test.ts"
    files["tests/active-suite-proof.test.ts"] =
      'import { test } from "@playwright/test"\n' +
      'test.describe("active suite", () => {\n' +
      "  const marker: number = 1\n" +
      '  test("fixture-proof", () => marker)\n' +
      "})\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [disableCall, invocation] of [
  ["test.skip", 'test.skip(true, "environment")'],
  ["aliased test.fixme", 'const disable = test.fixme\ndisable(true, "environment")'],
  ["top-level test.skip alias", 'disableSuite(true, "environment")']
]) {
  test(`a Playwright suite disabled through ${disableCall} cannot register proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/playwright-suite-disable.test.ts"
      files["tests/playwright-suite-disable.test.ts"] =
        'import { test } from "@playwright/test"\n' +
        (disableCall === "top-level test.skip alias" ? "const disableSuite = test.skip\n" : "") +
        'test.describe("active suite", () => {\n' +
        `  ${invocation}\n` +
        '  test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
        "})\n"
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [runner, source] of [
  [
    "node:test",
    'import test, { describe } from "node:test"\n' +
      'describe("active suite", { concurrency: true }, () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    'import { test } from "@playwright/test"\n' +
      'test.describe("active suite", { tag: "@trace" }, () => test("fixture-proof", () => {}))\n'
  ]
]) {
  test(`an inline ${runner} three-argument suite callback remains executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/active-suite-options-proof.test.js"
      files["tests/active-suite-options-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "PASS", report.errors.join("\n"))
  })
}

test("a node:test suite disabled through options cannot register executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/disabled-suite-options-proof.test.js"
    files["tests/disabled-suite-options-proof.test.js"] =
      'import test, { describe } from "node:test"\n' +
      'describe("disabled suite", { skip: true }, () => test("fixture-proof", () => {}))\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a node:test suite callback overridden through options cannot register proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/overridden-suite-callback-proof.test.js"
    files["tests/overridden-suite-callback-proof.test.js"] =
      'import test, { describe } from "node:test"\n' +
      'describe("active suite", { fn: () => {} }, () => test("fixture-proof", () => {}))\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [runner, source] of [
  [
    "node:test",
    'import test, { describe } from "node:test"\n' +
      'describe("suite", function* () { test("fixture-proof", () => {}) })\n'
  ],
  [
    "Playwright",
    'import { test } from "@playwright/test"\n' +
      'test.describe("suite", function* () { test("fixture-proof", () => {}) })\n'
  ]
]) {
  test(`a ${runner} generator suite callback cannot register executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/generator-suite-proof.test.js"
      files["tests/generator-suite-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("an async Playwright suite callback cannot register executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/async-suite-proof.test.js"
    files["tests/async-suite-proof.test.js"] =
      'import { test } from "@playwright/test"\n' +
      'test.describe("suite", async () => { await 0; test("fixture-proof", () => {}) })\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("invalid Playwright suite details cannot register executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/invalid-suite-details-proof.test.js"
    files["tests/invalid-suite-details-proof.test.js"] =
      'import { test } from "@playwright/test"\n' +
      'test.describe("suite", { tag: "trace" }, () => test("fixture-proof", () => {}))\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [controlFlow, statement] of [
  ["if branch", 'if (process.platform === "win32") test("fixture-proof", () => {})'],
  [
    "switch case",
    'switch (process.platform) { case "win32": test("fixture-proof", () => {}); break }'
  ],
  ["empty for-of loop", 'for (const value of []) test("fixture-proof", () => value)'],
  ["false while loop", 'while (false) test("fixture-proof", () => {})'],
  ["short-circuit expression", 'process.platform === "win32" && test("fixture-proof", () => {})'],
  [
    "conditional expression",
    'process.platform === "win32" ? test("fixture-proof", () => {}) : undefined'
  ],
  ["logical assignment", 'let gate = false; gate &&= test("fixture-proof", () => {})'],
  ["optional call argument", 'null?.method(test("fixture-proof", () => {}))'],
  [
    "throwing array initializer",
    'for (const value of [missing]) test("fixture-proof", () => value)'
  ]
]) {
  test(`a registration inside a conditional ${controlFlow} cannot serve as proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/conditional-proof.test.js"
      files["tests/conditional-proof.test.js"] =
        'import test, { describe } from "node:test"\n' +
        `describe("active suite", () => { ${statement} })\n`
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [completion, body] of [
  ["return", 'return; test("fixture-proof", () => {})'],
  ["throw", 'throw new Error("stop"); test("fixture-proof", () => {})'],
  ["break", 'for (const value of [1]) { break; test("fixture-proof", () => value) }'],
  ["continue", 'for (const value of [1]) { continue; test("fixture-proof", () => value) }']
]) {
  test(`a registration after an unconditional ${completion} cannot serve as proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/unreachable-proof.test.js"
      files["tests/unreachable-proof.test.js"] =
        'import test, { describe } from "node:test"\n' +
        `describe("active suite", () => { ${body} })\n`
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("a statically nonempty for-of registration remains executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/nonempty-loop-proof.test.ts"
    files["tests/nonempty-loop-proof.test.ts"] =
      'import test from "node:test"\n' +
      "for (const value of [1, 2] as const) test(`fixture-proof ${value}`, () => {})\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("a malformed JavaScript proof file fails closed", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "tests/malformed-proof.test.js"
    files["tests/malformed-proof.test.js"] =
      'import test from "node:test"\ntest("fixture-proof", () => {\n'
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [modifier, source] of [
  ["skip", 'import test from "node:test"\ntest.skip("fixture-proof", () => {})\n'],
  ["todo", 'import { it } from "node:test"\nit.todo("fixture-proof")\n'],
  ["failing", 'import test from "node:test"\ntest.failing("fixture-proof", () => {})\n']
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

for (const [runner, modifier, source] of [
  [
    "node:test",
    "each",
    'import test from "node:test"\ntest.each([[1]])("fixture-proof %s", () => {})\n'
  ],
  [
    "node:test",
    "concurrent",
    'import test from "node:test"\ntest.concurrent("fixture-proof", () => {})\n'
  ],
  ["node:test", "serial", 'import test from "node:test"\ntest.serial("fixture-proof", () => {})\n'],
  [
    "Playwright",
    "each",
    'import { test } from "@playwright/test"\ntest.each([[1]])("fixture-proof %s", () => {})\n'
  ],
  [
    "Playwright",
    "concurrent",
    'import { test } from "@playwright/test"\ntest.concurrent("fixture-proof", () => {})\n'
  ],
  [
    "Playwright",
    "serial",
    'import { test } from "@playwright/test"\ntest.serial("fixture-proof", () => {})\n'
  ]
]) {
  test(`unsupported ${runner} test.${modifier} cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/unsupported-modifier-proof.test.js"
      files["tests/unsupported-modifier-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [runner, modifier, source] of [
  [
    "node:test",
    "each",
    'import test, { describe } from "node:test"\n' +
      'describe.each([[1]])("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "node:test",
    "parallel",
    'import test, { describe } from "node:test"\n' +
      'describe.parallel("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    "each",
    'import { test } from "@playwright/test"\n' +
      'test.describe.each([[1]])("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    "concurrent",
    'import { test } from "@playwright/test"\n' +
      'test.describe.concurrent("suite", () => test("fixture-proof", () => {}))\n'
  ]
]) {
  test(`unsupported ${runner} suite.${modifier} cannot register executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/unsupported-suite-proof.test.js"
      files["tests/unsupported-suite-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [registration, source] of [
  ["curried node:test test", 'import test from "node:test"\ntest()("fixture-proof", () => {})\n'],
  [
    "curried node:test suite",
    'import test, { describe } from "node:test"\n' +
      'describe()("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "curried Playwright suite",
    'import { test } from "@playwright/test"\n' +
      'test.describe()("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "tagged node:test test",
    'import test from "node:test"\ntest`data`("fixture-proof", () => {})\n'
  ],
  [
    "tagged node:test suite",
    'import test, { describe } from "node:test"\n' +
      'describe`data`("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "empty node:test modifier",
    'import test from "node:test"\ntest[""]("fixture-proof", () => {})\n'
  ],
  [
    "empty node:test suite modifier",
    'import test, { describe } from "node:test"\n' +
      'describe[""]("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "empty Playwright suite modifier",
    'import { test } from "@playwright/test"\n' +
      'test.describe[""]("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "collapsed Playwright suite modifier",
    'import { test } from "@playwright/test"\n' +
      'test.describe["parallel.only"]("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "unsupported node:test context import",
    'import test, { context } from "node:test"\n' +
      'context("suite", () => test("fixture-proof", () => {}))\n'
  ]
]) {
  test(`${registration} cannot register executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/invalid-registration-proof.test.js"
      files["tests/invalid-registration-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [runner, registration, source] of [
  [
    "node:test",
    "test.only",
    'import test from "node:test"\ntest.only("fixture-proof", () => {})\n'
  ],
  [
    "Playwright",
    "test.only",
    'import { test } from "@playwright/test"\ntest.only("fixture-proof", () => {})\n'
  ],
  [
    "node:test",
    "describe.only",
    'import test, { describe } from "node:test"\n' +
      'describe.only("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    "test.describe.only",
    'import { test } from "@playwright/test"\n' +
      'test.describe.only("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    "test.describe.parallel.only",
    'import { test } from "@playwright/test"\n' +
      'test.describe.parallel.only("suite", () => test("fixture-proof", () => {}))\n'
  ],
  [
    "Playwright",
    "test.describe.serial.only",
    'import { test } from "@playwright/test"\n' +
      'test.describe.serial.only("suite", () => test("fixture-proof", () => {}))\n'
  ]
]) {
  test(`focused ${runner} ${registration} cannot register executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/focused-proof.test.js"
      files["tests/focused-proof.test.js"] = source
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

for (const [option, value] of [
  ["skip", "true"],
  ["skip", '"not on this platform"'],
  ["todo", "true"],
  ["todo", '"pending implementation"']
]) {
  test(`node:test ${option} option ${value} cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "tests/disabled-options-proof.test.js"
      files["tests/disabled-options-proof.test.js"] =
        'import test from "node:test"\n' +
        `test("fixture-proof", { ${option}: ${value} }, () => {})\n`
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.mam«ëŒ+Š×ž®º+º$zzb¥çF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð ¦f÷"†6öç7B¶÷F–öç4¶–æBÂ6÷W&6UÒöb°¢°¢&fö7W6VBFW7B"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â²öæÇ“¢G'VRÒÂ‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&fö7W6VB7V—FR"À¢v–×÷'BFW7BÂ²FW67&–&RÒg&öÒ&æöFS§FW7B%Æâr°¢vFW67&–&R‚'7V—FR"Â²öæÇ“¢G'VRÒÂ‚’ÓâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò’•Æâp¢ÒÀ¢°¢&–çfÆ–BF–ÖV÷WB"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â²F–ÖV÷WC¢&&B"ÒÂ‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&–çfÆ–B6öæ7W'&Væ7’"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â²6öæ7W'&Væ7“¢&&B"ÒÂ‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&W‡V7FVBf–ÇW&R"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â²W‡V7Df–ÇW&S¢G'VRÒÂ‚’Óâ·Ò•Æâp¢Ð¥Ò’°¢FW7B†æöFS§FW7BG¶÷F–öç4¶–æGÒ÷F–öç26ææ÷B6W'fR2W†V7WF&ÆR&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö–æVÆ–v–&ÆRÖ÷F–öç2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö–æVÆ–v–&ÆRÖ÷F–öç2×&ööbçFW7Bæ§2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&æöFS§FW7B6ÆÆ&6²÷fW'&–FFVâF‡&÷Vv‚÷F–öç26ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö÷fW'&–FFVâ×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö÷fW'&–FFVâ×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â²fã¢‚’Óâ·ÒÒÂ‚’Óâ²F‡&÷ræWrW'&÷"‚'&ööb"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&æöFS§FW7BvVæW&F÷"6ÆÆ&6²6ææ÷B6W'fR2W†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2övVæW&F÷"×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2övVæW&F÷"×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"ÂgVæ7F–öâ¢‚’²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&æöFS§FW7B&Vv—7G&F–öâv—F†÷WB6ÆÆ&6²6ææ÷B6W'fR2W†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÖ—76–ær×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öÖ—76–ær×FW7BÖ6ÆÆ&6²×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr²wFW7B‚&f—‡GW&R×&ööb"•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&FW7B&Vv—7G&F–öâ–âæöâ×7FF–26Æ72f–VÆB6ææ÷B6W'fR2W†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö–ç7Fæ6RÖf–VÆB×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö–ç7Fæ6RÖf–VÆB×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v6Æ72FVfW'&VE&ööb²&ööbÒFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò’ÕÆâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&FW7B&Vv—7G&F–öâ–â7FF–26Æ72f–VÆB&VÖ–ç2W†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷7FF–2Öf–VÆB×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷7FF–2Öf–VÆB×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v6Æ72–ÖÖVF–FU&ööb²7FF–2&ööbÒFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò’ÕÆâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7BÖWF†öBöb²'6¶—"Â'FöFò%Ò’°¢FW7B†æöFS§FW7B6ÆÆ&6²6VÆbÖF—6&ÆVBv—F‚BâG¶ÖWF†öGÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷6VÆbÖF—6&ÆVB×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷6VÆbÖF—6&ÆVB×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢FW7B‚&f—‡GW&R×&ööb"ÂBÓâ²BâG¶ÖWF†öGÒ‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Ææ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&æöFS§FW7B6ÆÆ&6²v—F‚âÖ&–wV÷W26ö×WFVB6öçFW‡B6ÆÂ6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6ö×WFVBÖ6öçFW‡B×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6ö×WFVBÖ6öçFW‡B×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"ÂBÓâ²E²'6²"²&—%Ò‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B¶Æ–4¶–æBÂF—6&ÆU6÷W&6UÒöb°¢²$gVæ7F–öâæ6ÆÂ"Â'Bç6¶—æ6ÆÂ‡B’%ÒÀ¢²$gVæ7F–öâæÇ’"Â'BçFöFòæÇ’‡BÂµÒ’%ÒÀ¢²$gVæ7F–öâæ&–æBÆ–2"Â&6öç7BF—6&ÆRÒBç6¶—æ&–æB‡B“²F—6&ÆR‚’%ÒÀ¢²&ÖVÖ&W"Æ–2"Â&6öç7BF—6&ÆRÒBçFöFó²F—6&ÆR‚’%ÒÀ¢²&FW7G'V7GW&VBÆ–2"Â&6öç7B²6¶—¢F—6&ÆRÒÒC²F—6&ÆR‚’%ÒÀ¢²&6öçFW‡BÆ–2"Â&6öç7BÆ–2ÒC²Æ–2çFöFò‚’%ÒÀ¢²&†VÇW"Æ–2"Â&6öç7BF—6&ÆRÒ6öçFW‡BÓâ6öçFW‡Bç6¶—‚“²F—6&ÆR‡B’%Ð¥Ò’°¢FW7B†æöFS§FW7B6öçFW‡BF—6&ÆR&V6†VBF‡&÷Vv‚G¶Æ–4¶–æGÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÆ–6VBÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2öÆ–6VBÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢FW7B‚&f—‡GW&R×&ööb"ÂBÓâ²G¶F—6&ÆU6÷W&6WÓ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Ææ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&æöFS§FW7B6öçFW‡B7F÷&VB–â6ö×÷6—FRfÇVR6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6ö×÷6—FRÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6ö×÷6—FRÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"ÂBÓâ²6öç7B†öÆFW"Ò²6öçFW‡C¢BÓ²†öÆFW"æ6öçFW‡Bç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B·&ÖWFW$¶–æBÂ6÷W&6UÒöb°¢°¢'&W7B&ÖWFW""À¢wFW7B‚&f—‡GW&R×&ööb"Â‚ââæ&w2’Óâ²&w5³Òç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢ÒÀ¢°¢&FW7G'V7GW&VB&ÖWFW""À¢wFW7B‚&f—‡GW&R×&ööb"Â‡²6¶—Ò’Óâ²6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢Ð¥Ò’°¢FW7B†æöFS§FW7B6öçFW‡B†–FFVâ'’G·&ÖWFW$¶–æGÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö†–FFVâÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö†–FFVâÖ6öçFW‡BÖF—6&ÆRçFW7Bæ§2%ÒÒv–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr²6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&Æ—w&–v‡B6ÆÆ&6²6VÆbÖF—6&ÆVBv—F‚FW7Bç6¶—6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷6VÆbÖF—6&ÆVB×Æ—w&–v‡B×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷6VÆbÖF—6&ÆVB×Æ—w&–v‡B×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â7–æ2‚’Óâ²FW7Bç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&Æ—w&–v‡B6ÆÆ&6²F—6&ÆVBF‡&÷Vv‚âÆ–2öbFW7B6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÆ–6VB×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2öÆ–6VB×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â7–æ2‚’Óâ²6öç7B'VææW"ÒFW7C²'VææW"ç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&Æ—w&–v‡BFW7B&–æF–ær7F÷&VB–â6ö×÷6—FRfÇVR6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6ö×÷6—FR×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6ö×÷6—FR×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â7–æ2‚’Óâ²6öç7B†öÆFW"Ò²'VææW#¢FW7BÓ²†öÆFW"ç'VææW"ç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&Æ—w&–v‡B6ÆÆ&6²F—6&ÆVBF‡&÷Vv‚FW7D–æfò6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷FW7BÖ–æfòÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷FW7BÖ–æfòÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â7–æ2‡·ÒÂFW7D–æfò’Óâ²FW7D–æfòç6¶—‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B¶–çfö6F–öä¶–æBÂF—6&ÆU6÷W&6UÒöb°¢²$gVæ7F–öâæ6ÆÂ"Â'FW7Bç6¶—æ6ÆÂ‡FW7B’%ÒÀ¢²&6ö×WFVBÖVÖ&W""ÂwFW7E²'6²"²&—%Ò‚’uÒÀ¢²&ÖVÖ&W"Æ–2"Â&6öç7BF—6&ÆRÒFW7Bæf—†ÖS²F—6&ÆR‚’%Ð¥Ò’°¢FW7B†Æ—w&–v‡B6ÆÆ&6²F—6&ÆVBF‡&÷Vv‚G¶–çfö6F–öä¶–æGÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö–æF—&V7B×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö–æF—&V7B×Æ—w&–v‡BÖF—6&ÆRçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢FW7B‚&f—‡GW&R×&ööb"Â7–æ2‚’Óâ²G¶F—6&ÆU6÷W&6WÓ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB"’Ò•Ææ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð ¦f÷"†6öç7B·'VææW"Â6÷W&6UÒöb°¢°¢&æöFS§FW7B"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"ÂBÓâ²–b‡&ö6W72çÆFf÷&ÒÓÓÒ&Æ–çW‚"’Bç6¶—‚“²F‡&÷ræWrW'&÷"‚'&ööb"’Ò•Æâp¢ÒÀ¢°¢%Æ—w&–v‡B"À¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â7–æ2‚’Óâ²–b‡&ö6W72çÆFf÷&ÒÓÓÒ&Æ–çW‚"’FW7Bç6¶—‚“²F‡&÷ræWrW'&÷"‚'&ööb"’Ò•Æâp¢Ð¥Ò’°¢FW7B†6öæF—F–öæÆÇ’6VÆbÖF—6&ÆVBG·'VææW'Ò6ÆÆ&6²6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6öæF—F–öæÂ×6VÆbÖF—6&ÆVB×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6öæF—F–öæÂ×6VÆbÖF—6&ÆVB×&ööbçFW7Bæ§2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&&ööb&Vv—7G&F–öâ'—76VB'’6öæF—F–öæÂ&WGW&â6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6öæF—F–öæÂ×&WGW&â×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6öæF—F–öæÂ×&WGW&â×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7BÂ²FW67&–&RÒg&öÒ&æöFS§FW7B%Æâr°¢vFW67&–&R‚'7V—FR"Â‚’ÓâµÆâr°¢"–b‡&ö6W72æVçbå4´•õ$ôôb’&WGW&åÆâ"°¢rFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâr°¢'Ò•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&&ööb&Vv—7G&F–öâ'—76VB'’7v—F6‚&WGW&â6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷7v—F6‚×&WGW&â×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷7v—F6‚×&WGW&â×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7BÂ²FW67&–&RÒg&öÒ&æöFS§FW7B%Æâr°¢vFW67&–&R‚'7V—FR"Â‚’ÓâµÆâr°¢r7v—F6‚‡&ö6W72çÆFf÷&Ò’²66R&Æ–çW‚#¢&WGW&âÕÆâr°¢rFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâr°¢'Ò•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&&ööb&Vv—7G&F–öâgFW"&ö6W72æW†—B6ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷&ö6W72ÖW†—B×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷&ö6W72ÖW†—B×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢'&ö6W72æW†—Bƒ•Æâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B·FW&Ö–æF–öâÂ6÷W&6UÒöb°¢°¢&gFW"&Vv—7G&F–öâ"À¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æç&ö6W72æW†—Bƒ•Æâp¢ÒÀ¢°¢&–ç6–FR—G26ÆÆ&6²"À¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²&ö6W72æW†—Bƒ“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢ÒÀ¢°¢&–ç6–FRâ–çfö¶VBæW7FVB6ÆÆ&6²"À¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²‚‚’Óâ&ö6W72æW†—Bƒ’’‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚âW†—BÆ–2"À¢v6öç7BFW&Ö–æFRÒ&ö6W72æW†—EÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•ÆçFW&Ö–æFRƒ•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚â–çfö¶VB†VÇW""À¢vgVæ7F–öâFW&Ö–æFR‚’²&ö6W72æW†—Bƒ’ÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•ÆçFW&Ö–æFR‚•Æâp¢Ð¥Ò’°¢FW7B†&ööbv—F‚&ö6W72æW†—BG·FW&Ö–æF–öçÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷÷7B×&Vv—7G&F–öâÖW†—BçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷÷7B×&Vv—7G&F–öâÖW†—BçFW7Bæ§2%ÒÒv–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr²6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð ¦f÷"†6öç7B·FW&Ö–æF–öâÂ6÷W&6UÒöb°¢°¢'F‡&÷Vv‚G&ç6—F—fR†VÇW""À¢vgVæ7F–öâFW&Ö–æFR‚’²&ö6W72æW†—Bƒ’ÕÆægVæ7F–öâ7F÷‚’²FW&Ö–æFR‚’ÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æç7F÷‚•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚FW7G'V7GW&VBÆ–2"À¢v6öç7B²W†—C¢FW&Ö–æFRÒÒ&ö6W75ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•ÆçFW&Ö–æFRƒ•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚âö&¦V7B†VÇW""À¢v6öç7B†VÇW'2Ò²FW&Ö–æFR‚’²&ö6W72æW†—Bƒ’ÒÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Ææ†VÇW'2çFW&Ö–æFR‚•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚÷7B×&Vv—7G&F–öâ””dR"À¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æã²‚‚’Óâ&ö6W72æW†—Bƒ’’‚•Æâp¢ÒÀ¢°¢'F‡&÷Vv‚âW‡FW&æÂ†VÇW"6ÆÆVB'’—G26ÆÆ&6²"À¢vgVæ7F–öâFW&Ö–æFR‚’²&ö6W72æW†—Bƒ’ÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²FW&Ö–æFR‚“²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ð¥Ò’°¢FW7B†6VÆb×&Wf–Wr&V¦V7G2&ö6W72æW†—BG·FW&Ö–æF–öçÖÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö†VÇW"ÖW†—B×6VÆb×&Wf–WrçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö†VÇW"ÖW†—B×6VÆb×&Wf–WrçFW7Bæ§2%ÒÒv–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr²6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&&ö6W72Öö&¦V7BÆ–26ææ÷B†–FRâ–çfö¶VBW†—B†VÇW""Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷&ö6W72Öö&¦V7BÖÆ–2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷&ö6W72Öö&¦V7BÖÆ–2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢&6öç7B&ö2Ò&ö6W75Æâ"°¢&gVæ7F–öâFW&Ö–æFR‚’²&ö2æW†—Bƒ’ÕÆâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢'FW&Ö–æFR‚•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚'G&ç6—F—fR&ö6W72Öö&¦V7BÆ–6W26ææ÷B†–FRFW7G'V7GW&VBW†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷G&ç6—F—fR×&ö6W72ÖÆ–2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷G&ç6—F—fR×&ö6W72ÖÆ–2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢&6öç7B&ö2Ò&ö6W75Æâ"°¢&6öç7B'VçF–ÖRÒ&ö5Æâ"°¢&6öç7B²W†—C¢FW&Ö–æFRÒÒ'VçF–ÖUÆâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢'FW&Ö–æFRƒ•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&&ö6W72ö&¦V7B7F÷&VB–â6ö×÷6—FRfÇVR6ææ÷B†–FRâ–çfö¶VBW†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6ö×÷6—FR×&ö6W72ÖÆ–2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6ö×÷6—FR×&ö6W72ÖÆ–2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢&6öç7B†öÆFW"Ò²&ö3¢&ö6W72ÕÆâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&†öÆFW"ç&ö2æW†—Bƒ•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B·7F÷&vT¶–æBÂFV6Æ&F–öâÂ–çfö6F–öåÒöb°¢²&76–væVBÖVÖ&W""Â&6öç7B†öÆFW"Ò·ÕÆæ†öÆFW"ç&ö2Ò&ö6W75Æâ"Â&†öÆFW"ç&ö2æW†—Bƒ’%ÒÀ¢²&æW7FVB'&’"Â&6öç7B†öÆFW"Ò²'VçF–ÖW3¢·&ö6W75ÒÕÆâ"Â&†öÆFW"ç'VçF–ÖW5³ÒæW†—Bƒ’%Ð¥Ò’°¢FW7B†&ö6W72ö&¦V7B7F÷&VBF‡&÷Vv‚G·7F÷&vT¶–æGÒ6ææ÷B†–FRW†—FÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öF¦6VçB×&ö6W72ÖW66RçFW7Bæ§2 ¢f–ÆW5²'FW7G2öF¦6VçB×&ö6W72ÖW66RçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢FV6Æ&F–öâ°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢G¶–çfö6F–öçÕÆæ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&†VÇW"&WGW&æ–ærF†R&ö6W72ö&¦V7B6ææ÷B†–FRÆFW"W†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷&ö6W72×&WGW&âÖ†VÇW"çFW7Bæ§2 ¢f–ÆW5²'FW7G2÷&ö6W72×&WGW&âÖ†VÇW"çFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢&gVæ7F–öâ'VçF–ÖR‚’²&WGW&â&ö6W72ÕÆâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢''VçF–ÖR‚’æW†—Bƒ•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò §FW7B‚&âW†—BF‡&÷Vv‚F†RvÆö&ÅF†—2&ö6W72ö&¦V7B6ææ÷B'—72&Vv—7FW&VB&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2övÆö&Â×&ö6W72×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2övÆö&Â×&ö6W72×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&vÆö&ÅF†—2ç&ö6W72æW†—Bƒ•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B–çfö6F–öâöb²&vÆö&Âç&ö6W72æW†—Bƒ’"ÂvvÆö&ÅF†—5²'&ö6W72%Õ²&W†—B%Òƒ’uÒ’°¢FW7B†âW†—BF‡&÷Vv‚G¶–çfö6F–öçÒ6ææ÷B'—72&Vv—7FW&VB&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öF¦6VçBÖvÆö&Â×&ö6W72×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öF¦6VçBÖvÆö&Â×&ö6W72×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢G¶–çfö6F–öçÕÆæ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&Æ–âö&¦V7B&÷W'G’æÖVB&ö6W72FöW2æ÷B&V6öÖRfÇ6RFW&Ö–æF÷""Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷Æ–â×&ö6W72×&÷W'G’çFW7Bæ§2 ¢f–ÆW5²'FW7G2÷Æ–â×&ö6W72×&÷W'G’çFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢vgVæ7F–öâÖWFFF‚’²&WGW&â²&ö6W73¢'6fR"ÒÕÆâr°¢&ÖWFFF‚•Æâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶÷F–öç4¶–æBÂFV6Æ&F–öâÂ÷F–öç5Òöb°¢²&G–æÖ–2"Â&6öç7B÷F–öç2Ò²6¶—¢G'VRÕÆâ"Â&÷F–öç2%ÒÀ¢²'7&VB"Â""Â'²ââç²FöFó¢G'VRÒÒ%Ð¥Ò’°¢FW7B†G¶÷F–öç4¶–æGÒæöFS§FW7B÷F–öç26ææ÷B6W'fR2W†V7WF&ÆR&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÖ&–wV÷W2Ö÷F–öç2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öÖ&–wV÷W2Ö÷F–öç2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢FV6Æ&F–öâ°¢FW7B‚&f—‡GW&R×&ööb"ÂG¶÷F–öç7ÒÂ‚’Óâ·Ò•Ææ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚'7FF–6ÆÇ’fÆ–BæöFS§FW7B÷F–öç2&VÖ–âW†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö7F—fRÖ÷F–öç2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö7F—fRÖ÷F–öç2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â²6öæ7W'&Væ7“¢G'VRÂöæÇ“¢fÇ6RÂ6¶—¢fÇ6RÂFöFó¢fÇ6RÂF–ÖV÷WC¢ÂÆã¢ÂW‡V7Df–ÇW&S¢fÇ6RÒÂ‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚%Æ—w&–v‡BFWF–Ç2&VÖ–âW†V7WF&ÆR&ööb÷F–öç2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷Æ—w&–v‡BÖFWF–Ç2×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷Æ—w&–v‡BÖFWF–Ç2×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢v6öç7BFWF–Ç2Ò²Fs¢$G&6R"ÕÆâr°¢wFW7B‚&f—‡GW&R×&ööb"ÂFWF–Ç2Â‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B·F—FÆT¶–æBÂ6÷W&6UÒöb°¢°¢&&–æ'’F—FÆR6öÖÖVçB"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v6öç7B7Vff—‚Ò"%ÆçFW7B‚&F–ffW&VçB"²ò¢f—‡GW&R×&ööb¢ò7Vff—‚Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢'FV×ÆFRW‡&W76–öâ6öÖÖVçB"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v6öç7B7Vff—‚Ò"%ÆçFW7B†F–ffW&VçBG²ò¢f—‡GW&R×&ööb¢ò7Vff—‡ÖÂ‚’Óâ·Ò•Æâp¢Ð¥Ò’°¢FW7B†6VÆV7F÷"–âG·F—FÆT¶–æGÒ6ææ÷B&–æBâW†V7WF&ÆR&ööbF—FÆVÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö6öÖÖVçB×F—FÆR×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö6öÖÖVçB×F—FÆR×&ööbçFW7Bæ§2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð §FW7B‚&6VÆV7F÷"–âG–æÖ–2FV×ÆFRF—FÆRV6’&VÖ–ç2W†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2÷FV×ÆFR×F—FÆR×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2÷FV×ÆFR×F—FÆR×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v6öç7B7Vff—‚Ò'f–Ww÷'B%ÆçFW7B†f—‡GW&R×&ööbG·7Vff—‡ÖÂ‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&6VÆV7F÷"&W6VçBöæÇ’–â&rW66VBFV×ÆFRFW‡B6ææ÷B&–æB'VçF–ÖRF—FÆR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öW66VB×FV×ÆFR×F—FÆR×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öW66VB×FV×ÆFR×F—FÆR×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr²'FW7B†ÅÆf—‡GW&R×&ööfÂ‚’Óâ·Ò•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò§Ò ¦f÷"†6öç7B¶÷F–öæÄ6ÆÂÂ6÷W&6UÒöb°¢²&F—&V7BFW7B"Âv–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7Còâ‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆâuÒÀ¢²'FW7BÖVÖ&W""Âv–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7CòæöæÇ’‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆâuÒÀ¢²'FW7B–çfö6F–öâ"Âv–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7BæöæÇ“òâ‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆâuÒÀ¢°¢&F—&V7B7V—FR"À¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7BæFW67&–&Sòâ‚&7F—fR7V—FR"Â‚’ÓâµÆâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÒ•Æâp¢ÒÀ¢°¢'7V—FRÖVÖ&W""À¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢wFW7CòæFW67&–&RæöæÇ’‚&7F—fR7V—FR"Â‚’ÓâµÆâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÒ•Æâp¢Ð¥Ò’°¢FW7B†â÷F–öæÂG¶÷F–öæÄ6ÆÇÒ6ææ÷B6W'fR2W†V7WF&ÆR&ööb&Vv—7G&F–öæÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2ö÷F–öæÂ×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2ö÷F–öæÂ×&ööbçFW7Bæ§2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð ¦f÷"†6öç7B·&÷fVææ6RÂF„æÖRÂ6÷W&6UÒöb°¢°¢&Æö6ÂæòÖ÷FW7B"À¢&Æö6Â×FW7B×&ööbçFW7Bæ§2"À¢v6öç7BFW7BÒ…÷F—FÆRÂö&öG’’Óâ·ÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢'6†F÷vVB–×÷'FVBFW7B"À¢'6†F÷vVB×FW7B×&ööbçFW7Bæ§2"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçµÆâ6öç7BFW7BÒ‚’Óâ·ÕÆâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÕÆâp¢ÒÀ¢°¢&Æöö¶Æ–¶R6¶vR–×÷'B"À¢&Æöö¶Æ–¶R×FW7B×&ööbçFW7Bæ§2"À¢v–×÷'B²FW7BÒg&öÒ&Æöö¶Æ–¶R×FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢'G—RÖöæÇ’FW7B–×÷'B"À¢'G—RÖöæÇ’×FW7B×&ööbçFW7BçG2"À¢v–×÷'BG—R²FW7BÒg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢$6öÖÖöä¥2FW7B–×÷'B"À¢&6öÖÖöæ§2×FW7B×&ööbçFW7Bæ§2"À¢v6öç7B²FW7BÒÒ&WV—&R‚&æöFS§FW7B"•ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢'&RÖW‡÷'FVBFW7BæÖR"À¢'&RÖW‡÷'FVB×FW7B×&ööbçFW7Bæ§2"À¢vW‡÷'B²FW7BÒg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢'&V76–væVB–×÷'FVBFW7B"À¢'&V76–væVB×FW7B×&ööbçFW7Bæ§2"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7BÒ‚’Óâ·ÕÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&f÷"Ööb&V76–væVB–×÷'FVBFW7B"À¢&f÷"Ööb×&V76–væVB×FW7B×&ööbçFW7Bæ§2"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Ææf÷"‡FW7Böb²‚’Óâ·ÕÒ’FW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&f÷"Ö–â&V76–væVB–×÷'FVBFW7B"À¢&f÷"Ö–â×&V76–væVB×FW7B×&ööbçFW7Bæ§2"À¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Ææf÷"‡FW7B–â·Ò’FW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&Æö6Âf¶RFW7BæFW67&–&R"À¢&f¶R×7V—FR×&ööbçFW7Bæ§2"À¢&6öç7BFW7BÒ²FW67&–&S¢…÷F—FÆRÂ6ÆÆ&6²’Óâ6ÆÆ&6²‚’ÕÆâ"°¢wFW7BæFW67&–&R‚&7F—fR7V—FR"Â‚’ÓâµÆâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÒ•Æâp¢Ð¥Ò’°¢FW7B†G·&÷fVææ6WÒ6ææ÷BWF†÷&—¦RW†V7WF&ÆR&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚ÒFW7G2òG·F„æÖWÖ ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷"ò¢Ò§Ð ¦f÷"†6öç7B¶&–æF–ærÂ6÷W&6UÒöb°¢°¢&Æ–6VBÆ—w&–v‡BFW7B"À¢v–×÷'B²FW7B2'VææW"Òg&öÒ$Æ—w&–v‡B÷FW7B%Æç'VææW"‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&Æ–6VBÆ—w&–v‡B7V—FR"À¢v–×÷'B²FW7B2'VææW"Òg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢w'VææW"æFW67&–&R‚&7F—fR7V—FR"Â‚’ÓâµÆâ'VææW"‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÒ•Æâp¢ÒÀ¢°¢&Æ–6VBæöFS§FW7B"À¢v–×÷'B²FW7B2'VææW"Òg&öÒ&æöFS§FW7B%Æç'VææW"‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢ÒÀ¢°¢&Æ–6VBæöFS§FW7B7V—FR"À¢v–×÷'BFW7BÂ²FW67&–&R2w&÷WÒg&öÒ&æöFS§FW7B%Æâr°¢vw&÷W‚&7F—fR7V—FR"Â‚’ÓâµÆâFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆçÒ•Æâp¢Ð¥Ò’°¢FW7B†G¶&–æF–æwÒ&VÖ–ç2GG&–'WF&ÆRW†V7WF&ÆR&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÆ–6VB×&ööbçFW7BçG2 ¢f–ÆW5²'FW7G2öÆ–6VB×&ööbçFW7BçG2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð §FW7B‚&æW7FVB&ÖWFW"FöW2æ÷B6†F÷rF÷ÖÆWfVÂæöFS§FW7B&ööb6ÆÂ"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öÆW†–6ÂÖ–×÷'B×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öÆW†–6ÂÖ–×÷'B×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢&gVæ7F–öâ†VÇW"‡FW7B’²&WGW&âFW7BÕÆâ"°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&æöFS§FW7BFVfVÇBW‡÷'BFW67&–&R&Vv—7FW'2æW7FVBW†V7WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öFVfVÇBÖFW67&–&R×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öFVfVÇBÖFW67&–&R×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7BæFW67&–&R‚'7V—FR"Â‚’ÓâµÆâr°¢rFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâr°¢'Ò•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶ÖVÖ&W"Â6÷W&6UÒöb°¢²'FW7B"Âv–×÷'B¢2æöFUFW7Bg&öÒ&æöFS§FW7B%ÆææöFUFW7BçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆâuÒÀ¢²&—B"Âv–×÷'B¢2æöFUFW7Bg&öÒ&æöFS§FW7B%ÆææöFUFW7Bæ—B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•ÆâuÒÀ¢°¢&FW67&–&R"À¢v–×÷'B¢2æöFUFW7Bg&öÒ&æöFS§FW7B%Æâr°¢væöFUFW7BæFW67&–&R‚'7V—FR"Â‚’ÓâæöFUFW7BçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò’•Æâp¢ÒÀ¢°¢'7V—FR"À¢v–×÷'B¢2æöFUFW7Bg&öÒ&æöFS§FW7B%Æâr°¢væöFUFW7Bç7V—FR‚'7V—FR"Â‚’ÓâæöFUFW7Bæ—B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò’•Æâp¢Ð¥Ò’°¢FW7B†æöFS§FW7BæÖW76RG¶ÖVÖ&W'ÒÖVÖ&W"&VÖ–ç2GG&–'WF&ÆRW†V7WF&ÆR&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öæÖW76R×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öæÖW76R×&ööbçFW7Bæ§2%ÒÒ6÷W&6P¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð ¦f÷"†6öç7B6öÖÖæBöb°¢'G'VRÇÂæöFRÒ×FW7BFW7G2ò¢çFW7Bæ§2"À¢&fÇ6RbbæöFRÒ×FW7BFW7G2ò¢çFW7Bæ§2 ¥Ò’°¢FW7B†6öæF—F–öæÆÇ’Vç&V6†&ÆR6¶vRFW7B6öÖÖæB‚G¶6öÖÖæBç7Æ—B‚""•³×Ò’6ææ÷B6VÆV7B&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²f–ÆW2Ò’Óâ°¢f–ÆW5²'6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡²&—fFS¢G'VRÂ67&—G3¢²FW7C¢6öÖÖæBÒÒ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢¢Ò§Ð ¦f÷"†6öç7Bf–ÇFW"öb°¢"Ò×FW7BÖæÖR×GFW&ã×Vç&VÆFVB"À¢"Ò×FW7BÖöæÇ’"À¢"Ò×FW7B×&W'VâÖf–ÇW&W3×7FFRæ§6öâ"À¢"Ò×FW7B×6†&CÓ"ó""À¢"Ò×FW7B×6¶—×GFW&ãÖf—‡GW&R×&ööb ¥Ò’°¢FW7B†æöFR'VææW"G¶f–ÇFW'Ò6öÆÆV7F–öâf–ÇFW"6ææ÷B6VÆV7B&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²f–ÆW2Ò’Óâ°¢f–ÆW5²'6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²FW7C¢æöFRÒ×FW7BG¶f–ÇFW'ÒFW7G2ò¢çFW7Bæ§6Ð¢Ò¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢¢Ò§Ð ¦f÷"†6öç7Bf–ÇFW"öb°¢"ÒÖw&WVç&VÆFVB"À¢"ÒÖw&WÖ–çfW'Bf—‡GW&R×&ööb"À¢"Ò×6†&B"ó""À¢'FW7G2öS&R÷Vç&VÆFVBç7V2çG2 ¥Ò’°¢FW7B†Æ—w&–v‡B'VææW"G¶f–ÇFW'Ò6öÆÆV7F–öâf–ÇFW"6ææ÷B6VÆV7B&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢Æ—w&–v‡BFW7BG¶f–ÇFW'ÖÐ¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÒvW‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÕÆâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢¢Ò§Ð §FW7B‚&âW†7BVæf–ÇFW&VBÆ—w&–v‡B'VææW"&VÖ–ç2GG&–'WF&ÆR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÒvW‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÕÆâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ6WBÖò—Vf–ÅÆâçÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&R#âcÂFVR'F–f7G2÷vV"ÖS&R÷Æ—w&–v‡BÖ6öÖ&–æVBæÆöuÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&Æ—w&–v‡Bv÷&¶fÆ÷r6öÖÖVçB6ææ÷B6VÆV7B&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÒvW‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÕÆâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ2çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâG'VUÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢§Ò §FW7B‚&Æ—w&–v‡B6öÖÖæB–âf÷&v—fVâv÷&¶fÆ÷r¦ö"6ææ÷B6VÆV7B&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÒvW‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÕÆâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ6öçF–çVRÖöâÖW'&÷#¢G'VUÆâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢§Ò ¦f÷"†6öç7B6öæf–tf–ÇFW"öb°¢&w&W¢÷Vç&VÆFVBò"À¢wFW7D–væ÷&S¢&f—‡GW&R×&ööbç7V2çG2"rÀ¢'6†&C¢²7W'&VçC¢"ÂF÷FÃ¢"Ò ¥Ò’°¢FW7B†Æ—w&–v‡B6öæf–rG¶6öæf–tf–ÇFW"ç7Æ—B‚#¢"•³×Ò6öÆÆV7F–öâf–ÇFW"6ææ÷B6VÆV7B&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÐ¢W‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÂG¶6öæf–tf–ÇFW'ÒÕÆæ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢¢Ò§Ð ¦f÷"†6öç7B¶76–væÖVçD¶–æBÂ76–væÖVçEÒöb°¢²&ÖVÖ&W"76–væÖVçB"Â&6öæf–ræw&WÒ÷Vç&VÆFVBò%ÒÀ¢²&6ö×WFVB76–væÖVçB"Âv6öæf–u²'FW7D–væ÷&R%ÒÒ&f—‡GW&R×&ööbç7V2çG2"uÒÀ¢²&Æöv–6Â76–væÖVçB"Â&6öæf–ræw&WóóÒ÷Vç&VÆFVBò%Ð¥Ò’°¢FW7B†Æ—w&–v‡B6öæf–rG¶76–væÖVçD¶–æGÒf–ÇFW"6ææ÷B6VÆV7B&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÐ¢v6öç7B6öæf–rÒ²FW7DF—#¢"â÷FW7G2öS&R"ÕÆâr°¢G¶76–væÖVçGÕÆæ°¢&W‡÷'BFVfVÇB6öæf–uÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢¢Ò§Ð §FW7B‚&7FF–6ÆÇ’76–væVBÆ—w&–v‡BFW7DF—"&VÖ–ç2GG&–'WF&ÆR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÐ¢&6öç7B6öæf–rÒ·ÕÆâ"²v6öæf–rçFW7DF—"Ò"â÷FW7G2öS&R%Æâr²&W‡÷'BFVfVÇB6öæf–uÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&¦f67&—B&ööb÷WG6–FRF†R6öæf–wW&VB'VææW"vÆö'26ææ÷B6W'fR2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'FW7G2öf—‡GW&W2÷Vçv—&VB×&ööbçFW7Bæ§2 ¢f–ÆW5²'FW7G2öf—‡GW&W2÷Vçv—&VB×&ööbçFW7Bæ§2%ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢õdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—Bð¢§Ò ¦f÷"†6öç7B¶ÖVçF–öä¶–æBÂv÷&¶fÆ÷uÒöb°¢°¢'v÷&¶fÆ÷r6öÖÖVçB"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ267&—G2÷FW7B÷Vçv—&VB×&ööbç6…ÆâV6†òFöæUÆâ ¢ÒÀ¢°¢'v÷&¶fÆ÷rVçf—&öæÖVçBfÇVR"À¢&¦ö'3¥ÆâfW&–g“¥ÆâVçc¥Æâ$ôôeõDƒ¢67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ7FW3¥ÆâÒ'Vã¢V6†òFöæUÆâ ¢ÒÀ¢°¢'v÷&¶fÆ÷rF–væ÷7F–2ÖW76vR"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢V6†ò67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢'v÷&¶fÆ÷r†W&VFö2&öG’"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ6BÃÂtTôbuÆâ67&—G2÷FW7B÷Vçv—&VB×&ööbç6…ÆâTôeÆâ ¢ÒÀ¢°¢'Vç&V6†VBv÷&¶fÆ÷r'&æ6‚"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ–bfÇ6S²F†VåÆâ67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâf•Æâ ¢ÒÀ¢°¢&f÷&v—fVâv÷&¶fÆ÷r7FW"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ6öçF–çVRÖöâÖW'&÷#¢G·²G'VR×ÕÆâ'Vã¢&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢&f÷&v—fVâv÷&¶fÆ÷r¦ö""À¢&¦ö'3¥ÆâfW&–g“¥Æâ6öçF–çVRÖöâÖW'&÷#¢G'VUÆâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢'v÷&¶fÆ÷r—VÆ–æRv—F†÷WB—Vf–Â"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ÂFVR&ööbæÆöuÆâ ¢ÒÀ¢°¢'v÷&¶fÆ÷r6öÖÖæBgFW"W†—B"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâW†—BÆâ&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢&&6¶w&÷VæFVBv÷&¶fÆ÷r6öÖÖæB"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚eÆâG'VUÆâ ¢ÒÀ¢°¢'v÷&¶fÆ÷r6öÖÖæBgFW"F—6&Æ–ærW'&W†—B"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ6WB¶UÆâ&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…ÆâG'VUÆâ ¢Ð¥Ò’°¢FW7B†6†VÆÂ&ööbÖVçF–öæVBöæÇ’–âG¶ÖVçF–öä¶–æGÒ6ææ÷B6W'fR2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚%ÒÒ&W†—B2f—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÒv÷&¶fÆ÷p¢Ò¢6öç7B&W÷'BÚ±î¸Â¸­yêë¢°k¢G§¦*^= run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

test("a no-exec shell invocation cannot select an otherwise valid shell proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/unwired-proof.sh"
    files["scripts/test/unwired-proof.sh"] = "fail() {\n  exit 1\n}\n" + "fail fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash -n scripts/test/unwired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

for (const invocation of [
  "bash --noexec scripts/test/unwired-proof.sh",
  "bash -o noexec scripts/test/unwired-proof.sh",
  "sh -n scripts/test/unwired-proof.sh"
]) {
  test(`equivalent no-exec invocation ${invocation} cannot select shell proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/unwired-proof.sh"
      files["scripts/test/unwired-proof.sh"] = "fail() {\n  exit 1\n}\n" + "fail fixture-proof\n"
      files[".github/workflows/ci.yml"] =
        `jobs:\n  verify:\n    steps:\n      - run: ${invocation}\n`
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

test("a shell proof invoked by a workflow run step remains executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "printf '%s\\n' 'fixture-proof' >&2; exit 1\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          set -o pipefail\n          PROOF_MODE=1 bash scripts/test/wired-proof.sh 2>&1 | tee proof.log\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("a successful exit line cannot serve as a failing shell proof anchor", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "exit 0 # fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [fakeKind, source] of [
  ["comment", "true # fixture-proof fail\n"],
  ["diagnostic", 'echo "fixture-proof assert"\n'],
  ["successful print", 'printf "%s\\n" "fixture-proof fail"\n'],
  ["unresolved assert command", "assert fixture-proof\n"]
]) {
  test(`a shell ${fakeKind} cannot serve as a failure-producing proof anchor`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] = source
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("a shell failure masked by a successful OR branch cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = 'false "fixture-proof" || true\n'
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a returning shell helper masked by a successful OR branch cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "fail() {\n  return 1\n}\n" + 'fail "fixture-proof" || true\n'
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a returning shell helper followed by a successful command cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "fail() {\n  return 1\n}\n" + 'fail "fixture-proof"\ntrue\n'
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("an exiting shell helper remains a failure even when followed by an OR branch", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "die() {\n  exit 1\n}\n" + 'die "fixture-proof" || true\n'
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [maskingKind, source] of [
  ["later command", 'false "fixture-proof"\ntrue\n'],
  ["semicolon", 'false "fixture-proof"; true\n'],
  ["pipeline", 'false "fixture-proof" | true\n']
]) {
  test(`a shell failure masked by a ${maskingKind} cannot serve as proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] = source
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

function addGradleProofRunnerFixture(files) {
  files["apps/api/build.gradle.kts"] =
    "tasks.withType<Test> {\n" +
    '  include("**/*Test.class")\n' +
    '  include("**/*Tests.class")\n' +
    '  include("**/*TestCase.class")\n' +
    '  include("**/*IT.class")\n' +
    "}\n"
  files[".github/workflows/ci.yml"] =
    "jobs:\n  verify:\n    steps:\n      - run: gradle --no-daemon --console=plain -p apps/api test\n"
}

for (const [inactiveKind, inactiveInclude] of [
  ["comment", '  // include("**/*IT.class")\n'],
  ["unrelated string", String.raw`  val note = "include(\"**/*IT.class\")"` + "\n"]
]) {
  test(`an IT include present only in a Gradle ${inactiveKind} cannot select proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleIT.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleIT {\n  @Test\n  void fixtureProof() {}\n}\n"
      files["apps/api/build.gradle.kts"] =
        "tasks.withType<Test> {\n" + '  include("**/*Test.class")\n' + inactiveInclude + "}\n"
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: gradle -p apps/api test\n"
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

for (const [unreachableKind, unreachableInclude] of [
  ["false branch", '  if (false) { include("**/*IT.class") }\n'],
  ["uncalled local function", '  fun configureIT() { include("**/*IT.class") }\n'],
  ["braceless false branch", '  if (false) include("**/*IT.class")\n'],
  ["expression-bodied local function", '  fun configureIT() = include("**/*IT.class")\n']
]) {
  test(`an IT include nested in a Gradle ${unreachableKind} cannot select proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleIT.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleIT {\n  @Test\n  void fixtureProof() {}\n}\n"
      files["apps/api/build.gradle.kts"] =
        "tasks.withType<Test> {\n" + '  include("**/*Test.class")\n' + unreachableInclude + "}\n"
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: gradle -p apps/api test\n"
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

for (const exclusion of ["**/*IT.class", "**/*"]) {
  test(`an actively excluded Gradle IT (${exclusion}) cannot serve as proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleIT.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleIT {\n  @Test\n  void fixtureProof() {}\n}\n"
      addGradleProofRunnerFixture(files)
      files["apps/api/build.gradle.kts"] = files["apps/api/build.gradle.kts"].replace(
        '  include("**/*IT.class")\n',
        `  include("**/*IT.class")\n  exclude("${exclusion}")\n`
      )
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

test("a Gradle command mentioned only in a workflow comment cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          # gradle --no-daemon -p apps/api test\n          true\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("a Gradle command in a forgiven workflow job cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    continue-on-error: true\n    steps:\n      - run: gradle -p apps/api test\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("a Gradle --tests collection filter cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: gradle -p apps/api test --tests example.UnrelatedTests\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("a Gradle dry-run workflow command cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: gradle --dry-run -p apps/api test\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("a Gradle -m dry-run workflow command cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: gradle -m -p apps/api test\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("a Gradle --version workflow command cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: gradle --version -p apps/api test\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

for (const earlyExitOption of ["--help", "-v"]) {
  test(`a Gradle ${earlyExitOption} workflow command cannot select Java proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
      addGradleProofRunnerFixture(files)
      files[".github/workflows/ci.yml"] =
        `jobs:\n  verify:\n    steps:\n      - run: gradle ${earlyExitOption} -p apps/api test\n`
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(
      report.errors.join("\n"),
      /VERIFIED repository proof must be an executable check or durable receipt/
    )
  })
}

test("pipefail enabled after a Gradle pipeline cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          gradle -p apps/api test | tee proof.log\n          set -o pipefail\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("pipefail disabled again before a Gradle pipeline cannot select Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          set -o pipefail\n          set +o pipefail\n          gradle -p apps/api test | tee proof.log\n"
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(
    report.errors.join("\n"),
    /VERIFIED repository proof must be an executable check or durable receipt/
  )
})

test("pipefail enabled on the same command list before a Gradle pipeline remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: set -o pipefail; gradle -p apps/api test | tee proof.log\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("the repository-style Gradle pipeline remains attributable Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          set -o pipefail\n          mkdir -p artifacts/api\n          gradle --no-daemon --console=plain -p apps/api checkstyleMain spotbugsMain test 2>&1 | tee artifacts/api/gradle-quality.log\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const suffix of ["Tests", "TestCase"]) {
  test(`a Gradle-configured *${suffix}.java source remains executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = `apps/api/src/test/java/example/Example${suffix}.java`
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n\n" +
        "import org.junit.jupiter.api.Test;\n\n" +
        `class Example${suffix} {\n` +
        "  @Test\n" +
        "  void fixtureProof() {}\n" +
        "}\n"
      addGradleProofRunnerFixture(files)
    })
    const report = run(root)
    assert.equal(report.status, "PASS", report.errors.join("\n"))
  })
}

for (const [annotationScope, source] of [
  [
    "method-level @Disabled",
    "class ExampleTests {\n  @org.junit.jupiter.api.Disabled\n  @Test\n  void fixtureProof() {}\n}\n"
  ],
  [
    "class-level @Disabled",
    "@Disabled\nclass ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
  ],
  [
    "method-level conditional annotation",
    "class ExampleTests {\n  @EnabledOnOs(OS.LINUX)\n  @Test\n  void fixtureProof() {}\n}\n"
  ],
  [
    "class-level conditional annotation",
    "@DisabledOnOs(OS.WINDOWS)\nclass ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
  ]
]) {
  test(`a JUnit proof with ${annotationScope} cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] = "import org.junit.jupiter.api.Test;\n\n" + source
      addGradleProofRunnerFixture(files)
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("a JUnit proof disabled by an execution-condition extension cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "import org.junit.jupiter.api.extension.ConditionEvaluationResult;\n" +
      "import org.junit.jupiter.api.extension.ExecutionCondition;\n" +
      "import org.junit.jupiter.api.extension.ExtendWith;\n" +
      "import org.junit.jupiter.api.extension.ExtensionContext;\n" +
      "class AlwaysDisabled implements ExecutionCondition {\n" +
      "  public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {\n" +
      '    return ConditionEvaluationResult.disabled("disabled");\n' +
      "  }\n" +
      "}\n" +
      "@ExtendWith(AlwaysDisabled.class)\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a composed JUnit execution extension cannot authorize a proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n" +
      "import org.junit.jupiter.api.extension.ExtendWith;\n" +
      "@ExtendWith(AlwaysDisabled.class)\n" +
      "@interface ConditionallyDisabled {}\n" +
      "@ConditionallyDisabled\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a registered JUnit execution extension cannot authorize a proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n" +
      "import org.junit.jupiter.api.extension.RegisterExtension;\n" +
      "class ExampleTests {\n" +
      "  @RegisterExtension static final AlwaysDisabled condition = new AlwaysDisabled();\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a JUnit proof in an undiscovered nested class cannot serve as executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  class Helper {\n" +
      "    @Test\n" +
      "    void fixtureProof() {}\n" +
      "  }\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("current-head regression: an empty JUnit @TestFactory cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import java.util.stream.Stream;\n" +
      "import org.junit.jupiter.api.DynamicTest;\n" +
      "import org.junit.jupiter.api.TestFactory;\n\n" +
      "class ExampleTests {\n" +
      "  @TestFactory\n" +
      "  Stream<DynamicTest> fixtureProof() { return Stream.empty(); }\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a locally declared @Test annotation cannot authorize a JUnit proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTestCase.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "@interface Test {}\n\n" +
      "class ExampleTestCase {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a commented JUnit annotation cannot authorize a proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  // @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a Unicode-escaped Java line comment cannot authorize a JUnit proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  \\u002f\\u002f @Test void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("escaped delimiters inside a Java text block cannot expose a false JUnit proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      '  String source = """\n' +
      '    \\"""\n' +
      "    @Test void fixtureProof() {}\n" +
      '    \\"""\n' +
      '    """;\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("an odd backslash run keeps a Java text-block delimiter escaped", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n" +
      '  String source = """\n' +
      "    " +
      "\\".repeat(3) +
      '"""\n' +
      "    @Test void fixtureProof() {}\n" +
      "    " +
      "\\".repeat(3) +
      '"""\n' +
      '    """;\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a JUnit proof in an abstract class cannot serve as executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "abstract class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a JUnit proof in an interface cannot serve as executable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Test;\n\n" +
      "interface ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof();\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a composed JUnit disabling annotation cannot authorize a proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Disabled;\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "@Disabled\n" +
      "@interface Quarantined {}\n\n" +
      "class ExampleTests {\n" +
      "  @Quarantined\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a composed JUnit disabling annotation declared in another source cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/Quarantined.java"] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Disabled;\n\n" +
      "@Disabled\n" +
      "@interface Quarantined {}\n"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Quarantined\n" +
      "  @Test\n" +
      "  void fixtureProof() {}\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("transitively composed JUnit disabling annotations across sources cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/Quarantined.java"] =
      "package example;\nimport org.junit.jupiter.api.Disabled;\n@Disabled\n@interface Quarantined {}\n"
    files["apps/api/src/main/java/example/Slow.java"] =
      "package example;\n@Quarantined\n@interface Slow {}\n"
    files[proofPath] =
      "package example;\nimport org.junit.jupiter.api.Test;\nclass ExampleTests {\n  @Slow\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const [assumptionKind, imports, invocation] of [
  [
    "qualified Assumptions call",
    "import org.junit.jupiter.api.Assumptions;\n",
    "Assumptions.assumeTrue(false);"
  ],
  [
    "statically imported assumption",
    "import static org.junit.jupiter.api.Assumptions.assumeTrue;\n",
    "assumeTrue(false);"
  ]
]) {
  test(`a JUnit proof aborted by a ${assumptionKind} cannot serve as proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n\n" +
        imports +
        "import org.junit.jupiter.api.Test;\n\n" +
        "class ExampleTests {\n" +
        "  @Test\n" +
        `  void fixtureProof() { ${invocation} throw new AssertionError("unreached"); }\n` +
        "}\n"
      addGradleProofRunnerFixture(files)
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("a JUnit proof aborted by an external Java helper cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/AbortHelper.java"] =
      "package example;\n" +
      "import org.junit.jupiter.api.Assumptions;\n" +
      "final class AbortHelper {\n" +
      "  static void abort() { Assumptions.assumeTrue(false); }\n" +
      "}\n"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      '  void fixtureProof() { AbortHelper.abort(); throw new AssertionError("unreached"); }\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a transitively aborting external Java helper cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/AbortHelper.java"] =
      "package example;\n" +
      "import org.junit.jupiter.api.Assumptions;\n" +
      "final class AbortHelper {\n" +
      "  static void abort() { Assumptions.assumeTrue(false); }\n" +
      "}\n"
    files["apps/api/src/test/java/example/BridgeHelper.java"] =
      "package example;\n" +
      "final class BridgeHelper {\n" +
      "  static void verify() { AbortHelper.abort(); }\n" +
      "}\n"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      '  void fixtureProof() { BridgeHelper.verify(); throw new AssertionError("unreached"); }\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a statically imported aborting external Java helper cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/AbortHelper.java"] =
      "package example;\n" +
      "import org.junit.jupiter.api.Assumptions;\n" +
      "final class AbortHelper {\n" +
      "  static void abort() { Assumptions.assumeTrue(false); }\n" +
      "}\n"
    files[proofPath] =
      "package example;\n" +
      "import static example.AbortHelper.abort;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      '  void fixtureProof() { abort(); throw new AssertionError("unreached"); }\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("an inherited aborting Java helper cannot serve as proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files["apps/api/src/test/java/example/AbortBase.java"] =
      "package example;\n" +
      "import org.junit.jupiter.api.Assumptions;\n" +
      "abstract class AbortBase {\n" +
      "  void abort() { Assumptions.assumeTrue(false); }\n" +
      "}\n"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests extends AbortBase {\n" +
      "  @Test\n" +
      '  void fixtureProof() { abort(); throw new AssertionError("unreached"); }\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("a JUnit lifecycle assumption cannot abort an otherwise attributable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.BeforeEach;\n" +
      "import org.junit.jupiter.api.Assumptions;\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @BeforeEach\n" +
      "  void prepare() { Assumptions.assumeTrue(false); }\n" +
      "  @Test\n" +
      '  void fixtureProof() { throw new AssertionError("unreached"); }\n' +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

test("an explicit JUnit aborted-test exception cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "import org.opentest4j.TestAbortedException;\n\n" +
      "class ExampleTests {\n" +
      "  @Test\n" +
      "  void fixtureProof() { throw new TestAbortedException(); }\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "FAIL")
  assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
})

for (const modifier of ["private", "static"]) {
  test(`a ${modifier} JUnit method cannot serve as executable proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "import org.junit.jupiter.api.Test;\n\n" +
        "class ExampleTests {\n" +
        "  @Test\n" +
        `  ${modifier} void fixtureProof() {}\n` +
        "}\n"
      addGradleProofRunnerFixture(files)
    })
    const report = run(root)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /selector must identify an executable test anchor/)
  })
}

test("an imported JUnit @Nested class remains discoverable proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "import org.junit.jupiter.api.Nested;\n" +
      "import org.junit.jupiter.api.Test;\n\n" +
      "class ExampleTests {\n" +
      "  @Nested\n" +
      "  class Proofs {\n" +
      "    @Test\n" +
      "    void fixtureProof() {}\n" +
      "  }\n" +
      "}\n"
    addGradleProofRunnerFixture(files)
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [commentStyle, source] of [
  ["line-commented", 'import test from "node:test"\n// test("fixture-proof", () => {})\n'],
  ["block-commented", 'import test from "node:test"\n/* test("fixture-proof", () => {}) */\n'],
  [
    "multiline-block-commented",
    'import test from "node:test"\n/*\ntest("fixture-proof", () => {})\n*/\n'
  ]
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
    files["tests/overlapping-proof.test.js"] =
      'import test from "node:test"\ntest("aaaaaaa", () => {})\n'
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
    traceabilm«ëŒ+Š×ž®º+º$zzb¥æ—G’ç&WÆ6R€¢&¶VWF†Rf—‡GW&R&÷VæFVBF&vWC¢f—‡GW&RföÆÆ÷r×Wâ"À¢'6–ÆVçFÇ’'&öFVâf—‡GW&R66÷RâF&vWC¢–ÖÖVF–FR&VÆV6Râ ¢¢ ¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö‡VÖâ×&VF&ÆRFWf–F–öâDUbÕCƒRÓ““’ò§Ò §FW7B‚&FWf–F–öâffV7FVBe"æB42”G2&WV—&R&V6—&ö6Â&WV—&VÖVçBÆ–æ·2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÒ’Óâ°¢6öçG&7BæFWf–F–öç5³ÒæffV7FVEö–G2çW6‚‚$e"Ó"¢6öçG&7Bç&WV—&VÖVçG2æf–æB‚‡²–BÒ’Óâ–BÓÓÒ%42Ó"’æFWf–F–öåö–G2ÒµÐ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂôDUbÕCƒRÓ““’ffV7G2e"Óò¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂôDUbÕCƒRÓ““’ffV7G242Óò§Ò §FW7B‚%dU$”d”TB&WV—&VÖVçG26ææ÷B&WF–â&V6—&ö6ÂõTâFWf–F–öâ"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÒ’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³ÒæFWf–F–öåö–G2Ò²$DUbÕCƒRÓ““’%Ð¢6öçG&7BæFWf–F–öç5³ÒæffV7FVEö–G2çW6‚‚$e"Ó"¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âôe"Óâ¥dU$”d”TBâ¤õTâFWf–F–öâDUbÕCƒRÓ““’ò§Ò §FW7B‚&&&—G&'’Wf–FVæ6R¥4ôâ6ææ÷B6W'fR2&W÷6—F÷'’&ööb&V6V—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒÒ°¢–C¢%ôdõ$tTEô¥4ôâ"À¢¶–æC¢%$Uõ4•Dõ%•õ$ôôb"À¢Fƒ¢"æÆö÷öWf–FVæ6Röf÷&vVBæ§6öâ"À¢6VÆV7F÷#¢r&FV6—6–öâ#¢%52"p¢Ð¢f–ÆW5²"æÆö÷öWf–FVæ6Röf÷&vVBæ§6öâ%ÒÒG´¥4ôâç7G&–æv–g’€¢°¢66†VÖ÷fW'6–öã¢'Vç&V6övæ—¦VB÷c"À¢FV6—6–öã¢%52"À¢&WV—&VÖVçEö–C¢$e"Ó"À¢6÷W&6Uö†VE÷6†¢#"ç&WVBƒC¢ÒÀ¢çVÆÂÀ¢ ¢—ÕÆæ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&V6övæ—¦VB&W÷6—F÷'’&ööb&V6V—Bò§Ò ¦gVæ7F–öâÖ¶U–ææVE&W÷6—F÷'•&V6V—Df—‡GW&R†×WFFRÒ‚’Óâ·Ò’°¢&WGW&âÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&÷rÒ6öçG&7Bç&WV—&VÖVçG2æf–æB‚‡²–BÒ’Óâ–BÓÓÒ%42Ó"¢6öç7B&Wf–÷W5F6´–G2Ò²ââç&÷rçF6µö–G5Ð¢&÷rçF6µö–G2Ò²%C"%Ð¢&÷ræ–×ÆVÖVçFF–öå÷7FFRÒ$4ôÕÄUDR ¢&÷ræWf–FVæ6U÷7FFRÒ%dU$”d”TB ¢&÷ræFWf–F–öåö–G2ÒµÐ¢6öç7B&ööbÒ°¢–C¢%ô$4µUõ$T4T•Eõ$TD$4²"À¢¶–æC¢%$Uõ4•Dõ%•õ$ôôb"À¢Fƒ¢"æÆö÷öWf–FVæ6R÷CƒR×&Wf–Wræ§6öâ"À¢6VÆV7F÷# ¢r'&W7F÷&U÷&V6V—E÷6†#Sb#¢&SC66F3#F&#“3vff&&cCc#FS#3v3“SsƒCsV&#3ƒc363s“ƒ3–F†&S“3#"p¢Ð¢&÷rç&öög2Ò·&ööeÐ¢6öç7BfÆÆ&6µ&÷rÒ6öçG&7Bç&WV—&VÖVçG2æf–æB‚‡²–BÒ’Óâ–BÓÓÒ%42Ó"¢f÷"†6öç7BF6´–Böb&Wf–÷W5F6´–G2’°¢6öç7BF6²Ò6öçG&7BçF6µöÆVFvW"æf–æB‚‡²–BÒ’Óâ–BÓÓÒF6´–B¢F6²ç&WV—&VÖVçEö–G2ÒF6²ç&WV—&VÖVçEö–G2æf–ÇFW"‚†–B’Óâ–BÓÒ%42Ó"¢–b‚fÆÆ&6µ&÷rçF6µö–G2æ–æ6ÇVFW2‡F6´–B’’fÆÆ&6µ&÷rçF6µö–G2çW6‚‡F6´–B¢–b‚F6²ç&WV—&VÖVçEö–G2æ–æ6ÇVFW2‚%42Ó"’’F6²ç&WV—&VÖVçEö–G2çW6‚‚%42Ó"¢FVÆWFRF6²æ÷'†å÷&V6öà¢Ð¢6öç7B&WÆ6VÖVçEF6²Ò6öçG&7BçF6µöÆVFvW"æf–æB‚‡²–BÒ’Óâ–BÓÓÒ%C""¢&WÆ6VÖVçEF6²ç&WV—&VÖVçEö–G2çW6‚‚%42Ó"¢FVÆWFR&WÆ6VÖVçEF6²æ÷'†å÷&V6öà¢6öçG&7BæFWf–F–öç5³ÒæffV7FVEö–G2Ò6öçG&7BæFWf–F–öç5³ÒæffV7FVEö–G2æf–ÇFW"€¢†–B’Óâ–BÓÒ%42Ó ¢¢6öç7B&V6V—BÒ°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×CƒR×&Wf–Wr÷c"À¢F6³¢%CƒR"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢—77VS¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2óCR"À¢7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Ws¢°¢66÷U÷&Wf–Ws¢°¢%öF–fe÷F‡5öW‡V7FVC¢2À¢'VçF–ÖUöf–ÆW5öFFVE÷Fõ÷%öF–fc¢fÇ6RÀ¢v÷&¶fÆ÷uö6†ævVC¢G'VRÀ¢CƒUö6†V6¶VC¢fÇ6RÀ¢&VG•ö÷%öÖW&vU÷W&f÷&ÖVC¢fÇ6RÀ¢f÷&&–FFVå÷66÷Uö6†ævVC¢fÇ6P¢Ð¢ÒÀ¢÷7EöÖW&vU÷66÷Uö6÷'&V7F–öã¢°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×CƒR×&Wf–WrÖ6÷'&V7F–öâ÷c"À¢&V6÷&FVEöC¢###bÓ‚Ó#•CS£3C£e¢"À¢6÷W&6S¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÂóC’6F—67W76–öå÷#3ƒƒSs#CB"À¢F&vWC¢&7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Wrç66÷U÷&Wf–Wr"À¢7WW'6VFW3¢°¢%öF–fe÷F‡5öW‡V7FVC¢"À¢v÷&¶fÆ÷uö6†ævVC¢fÇ6P¢ÒÀ¢6÷'&V7FVC¢°¢%öF–fe÷F‡5öW‡V7FVC¢2À¢v÷&¶fÆ÷uö6†ævVC¢G'VP¢ÒÀ¢&V6öã ¢%F†R66WFVB#C’–×ÆVÖVçFF–öâ66÷R6öçF–ç22F‡2Â–æ6ÇVF–æræv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂâ ¢ÒÀ¢†—7F÷&–6Åö66WFæ6U÷&VF&6³¢°¢&WV—&VÖVçEö–C¢%42Ó"À¢F6³¢%Cƒ"À¢'F–f7Eö–C¢“CCƒS3sRÀ¢'F–f7EöæÖS¢&6’ÖFWVæFVæ7’×&W÷'G2"À¢'F–f7EöF–vW7C¢'6†#Sc£#Ss&Ss#&3Fc†#SC#“cSF3vcS&V&VVSƒ†S#cS3ƒCSƒc3“#VVSFS#cFV#r"À¢'F–f7EöF÷væÆöFVC¢G'VRÀ¢6÷W&6Uö†VE÷6†¢#6f63vc&c#–SV36CC3sfff6V&C3FC“#V3F3““"À¢v÷&¶fÆ÷s¢$4’"À¢v÷&¶fÆ÷u÷'Våö–C¢3#3“s3s3“"À¢v÷&¶fÆ÷u÷'VåöçVÖ&W#¢ƒbÀ¢W†7Eö†VEöÖæ–fW7E÷6†#Sc ¢#VfcF#sF“S“&F3ƒ&3cCc6V&Sƒ3CScf#–#SSvFcV6ccSF#6C–"À¢&W7F÷&U÷&V6V—E÷6†#Sc¢&SC66F3#F&#“3vff&&cCc#FS#3v3“SsƒCsV&#3ƒc363s“ƒ3–F†&S“3#"À¢&W7F÷&U÷&V6V—C¢°¢&W7VÇC¢%52"À¢&VÆV6U÷&VG“¢G'VRÀ¢'õö†÷W'3¢ãÀ¢'õöÆ–Ö—Eö†÷W'3¢#BÀ¢'FõöÖ–çWFW3¢ã3rÀ¢'FõöÆ–Ö—EöÖ–çWFW3¢#CÀ¢ÖVF–ö76WG3¢"À¢ÖVF–÷f&–çG3¢"À¢6†V6·7VÕ÷6×ÆU÷&WVW7FVC¢"À¢6†V6·7VÕ÷6×ÆU÷fW&–f–VC¢ ¢Ð¢Ð¢Ð¢×WFFR‡²&V6V—BÂ&ööbÒ¢f–ÆW5²"æÆö÷öWf–FVæ6R÷CƒR×&Wf–Wræ§6öâ%ÒÒG´¥4ôâç7G&–æv–g’‡&V6V—BÂçVÆÂÂ"—ÕÆæ ¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb°¢°¢&Ö—76–ær66÷R6÷'&V7F–öâ"À¢‡²&V6V—BÒ’Óâ°¢FVÆWFR&V6V—Bç÷7EöÖW&vU÷66÷Uö6÷'&V7F–öà¢Ð¢ÒÀ¢°¢'7FÆR&V6öæ6–ÆVB66÷R"À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Wrç66÷U÷&Wf–Wrç%öF–fe÷F‡5öW‡V7FVBÒ ¢&V6V—Bæ7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Wrç66÷U÷&Wf–Wrçv÷&¶fÆ÷uö6†ævVBÒfÇ6P¢Ð¢ÒÀ¢°¢&G&–gFVB6÷'&V7FVB66÷R"À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bç÷7EöÖW&vU÷66÷Uö6÷'&V7F–öâæ6÷'&V7FVBç%öF–fe÷F‡5öW‡V7FVBÒ ¢Ð¢Ð¥Ò’°¢FW7B†F†R–ææVB&W÷6—F÷'’&V6V—B&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B&W÷'BÒ'Vâ†Ö¶U–ææVE&W÷6—F÷'•&V6V—Df—‡GW&R†×WFFR’¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö66WFVB2×F‚66÷R6÷'&V7F–öâò¢Ò§Ð §FW7B‚'F†R–ææVB42Ó†—7F÷&–6Â66WFæ6R&V6V—B&VÖ–ç2fÆ–B&W÷6—F÷'’&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶U–ææVE&W÷6—F÷'•&V6V—Df—‡GW&R‚¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ×WFFRÂW‡V7FVEÒöb°¢°¢'6÷W&6R†VB"À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç6÷W&6Uö†VE÷6†Ò&b"ç&WVBƒC¢ÒÀ¢ö66WFVBW†7BÖ†VB'F–f7Bð¢ÒÀ¢°¢'&W7VÇB"À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—Bç&W7VÇBÒ$d”Â ¢ÒÀ¢÷76–ær&÷VæFVB&W7F÷&R&V6V—Bð¢ÒÀ¢°¢&F–vW7BæBÖF6†–ær6VÆV7F÷""À¢‡²&V6V—BÂ&ööbÒ’Óâ°¢6öç7BF–vW7BÒ&b"ç&WVBƒcB¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—E÷6†#SbÒF–vW7@¢&ööbç6VÆV7F÷"Ò'&W7F÷&U÷&V6V—E÷6†#Sb#¢"G¶F–vW7GÒ& ¢ÒÀ¢ö66WFVB&W7F÷&R&V6V—BF–vW7GÇ76–ær&÷VæFVB&W7F÷&R&V6V—Bð¢ÒÀ¢°¢&æVvF—fRÖWG&–2—""À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—Bç'õö†÷W'2ÒÓ ¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—Bç'õöÆ–Ö—Eö†÷W'2ÒÓ¢ÒÀ¢÷76–ær&÷VæFVB&W7F÷&R&V6V—Bð¢ÒÀ¢°¢'÷6—F—fRÖWG&–2G&–gB"À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—Bç'FõöÖ–çWFW2Òã3€¢ÒÀ¢÷76–ær&÷VæFVB&W7F÷&R&V6V—Bð¢ÒÀ¢°¢'Væ&÷VæB66Æ""À¢‡²&V6V—BÒ’Óâ°¢&V6V—Bæ†—7F÷&–6Åö66WFæ6U÷&VF&6²ç&W7F÷&U÷&V6V—BçVæ&÷VæBÒG'VP¢ÒÀ¢÷76–ær&÷VæFVB&W7F÷&R&V6V—Bð¢Ð¥Ò’°¢FW7B†F†R–ææVB&W÷6—F÷'’&V6V—B&V¦V7G2G¶æÖWÒG&–gFÂ‚’Óâ°¢6öç7B&W÷'BÒ'Vâ†Ö¶U–ææVE&W÷6—F÷'•&V6V—Df—‡GW&R†×WFFR’¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂW‡V7FVB¢Ò§Ð §FW7B‚'F†R‡VÖâ7F÷'’ò6Æ–6R6öÇVÖâ×W7BÖF6‚F†RÖ6†–æR6öçG&7B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7BG&6V&–Æ—G•F‚ÒF‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"¢6öç7BG&6V&–Æ—G’Òg2ç&VDf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â'WFc‚"¢g2çw&—FTf–ÆU7–æ2€¢G&6V&–Æ—G•F‚À¢G&6V&–Æ—G’ç&WÆ6R‚'Âe"ÓÂ5$õ55ô5UBòf—‡GW&RÂ"Â'Âe"ÓÂdõ$tTBò6Æ–6RÂ"¢ ¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö‡VÖâ×&VF&ÆR&÷re"Óò§Ò §FW7B‚'F†RÖ6†–æR6öçG&7B&W÷6—F÷'’×W7BÖF6‚F†R–Ö×WF&ÆRF—7F6‚"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÒ’Óâ°¢6öçG&7Bç&W÷6—F÷'’Ò&GF6¶W"ö÷F†W"×&W÷6—F÷'’ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö6öçG&7B&W÷6—F÷'’×W7BWVÂ'–ææ6•Âö6÷W'G6–FR×Grò§Ò §FW7B‚'F†R#C’&Wf–Wr&V6V—B&V6÷&G2F†R7GVÂ2×F‚v÷&¶fÆ÷r66÷R"Â‚’Óâ°¢6öç7B&Wf–WrÒ¥4ôâç'6R€¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ"æÆö÷öWf–FVæ6R÷CƒR×&Wf–Wræ§6öâ"’Â'WFc‚"¢¢76W'BæWVÂ‡&Wf–Wræ7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Wrç66÷U÷&Wf–Wrç%öF–fe÷F‡5öW‡V7FVBÂ2¢76W'BæWVÂ‡&Wf–Wræ7W'&VçEö&6U÷&V6öæ6–Æ–F–öå÷&Wf–Wrç66÷U÷&Wf–Wrçv÷&¶fÆ÷uö6†ævVBÂG'VR¢76W'BæÖF6‚€¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’Â'WFc‚"’À¢ó2×F‚CƒRÆÆ÷vÆ—7Bð¢§Ò ¦f÷"†6öç7B¶&÷VæF'’Â×WFFUÒöb°¢²&WF†÷&—¦VB66÷R"Â†F—7F6‚’ÓâF—7F6‚æWF†÷&—¦VBçW6‚‚'Væ&÷VæFVB'VçF–ÖRv÷&²"•ÒÀ¢²&f÷&&–FFVâ66÷R"Â†F—7F6‚’ÓâF—7F6‚æf÷&&–FFVâç÷‚•ÒÀ¢²'F6²g&öçF–W""Â†F—7F6‚’Óâ†F—7F6‚æ&6RçCƒeö6ö×ÆWFRÒG'VR•ÒÀ¢²'6÷W&6R–çfVçF÷'’"Â†F—7F6‚’Óâ†F—7F6‚æ–çfVçF÷'’æ6†V6¶VE÷F6·2Òƒb•ÒÀ¢²'FW7G2Öf—'7B6Æ–Ò"Â†F—7F6‚’Óâ†F—7F6‚çFW7G5öf—'7Bç&VEö6Æ–ÒÒ&f÷&vVB"•ÒÀ¢²'FW&Ö–æÂöÆ–7’"Â†F—7F6‚’Óâ†F—7F6‚çFW&Ö–æÅ÷öÆ–7’Ò&WFòÖÖW&vR"•Ð¥Ò’°¢FW7B†F—7F6‚G¶&÷VæF'—Ò&VÖ–ç2–Ö×WF&ÆVÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²f–ÆW2Ò’Óâ°¢6öç7BF—7F6‚Ò¥4ôâç'6R†f–ÆW5²"æÆö÷öWf–FVæ6R÷CƒRÖF—7F6‚æ§6öâ%Ò¢×WFFR†F—7F6‚¢f–ÆW5²"æÆö÷öWf–FVæ6R÷CƒRÖF—7F6‚æ§6öâ%ÒÒ¥4ôâç7G&–æv–g’†F—7F6‚¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢öF—7F6‚WF†÷&—G’×W7BÖF6‚F†R–Ö×WF&ÆRCƒR&V6V—Bð¢¢Ò§Ð §FW7B‚'VæF–ærCƒR&V¦V7G2CƒbF—7F6‚WfVâgFW"G&6V&–Æ—G’&V6†W2Ö–â"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B7W'&VçDÖ–âÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"Â7W'&VçDÖ–â¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â&f÷&&–FFVâ×CƒbÖF—7F6‚"¢6öç7BCƒdF—7F6…F‚ÒF‚æ¦ö–â‡&ö÷BÂ"æÆö÷öWf–FVæ6R÷CƒbÖF—7F6‚æ§6öâ"¢g2çw&—FTf–ÆU7–æ2‡CƒdF—7F6…F‚Â'·ÕÆâ"¢v—B‡&ö÷BÂ&FB"Â"æÆö÷öWf–FVæ6R÷CƒbÖF—7F6‚æ§6öâ"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&GFV×BCƒbF—7F6‚" ¢76W'BæWVÂ‡G—VöbG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—BÂ&gVæ7F–öâ"¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6U÷6†Â7W'&VçDÖ–â¢76W'BæWVÂ†–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fRÂfÇ6R¢76W'BæFVWWVÂ†–ç7V7F–öâæ6†ævVEF‡2Â²"æÆö÷öWf–FVæ6R÷CƒbÖF—7F6‚æ§6öâ%Ò ¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢7W'&VçD†VC¢–ç7V7F–öâæ†VBÀ¢v—D&–æF–æs¢–ç7V7F–öâÀ¢6†ævVEF‡3¢–ç7V7F–öâæ6†ævVEF‡2À¢6†ævT&6U6†¢–ç7V7F–öâæ6†ævUö&6U÷6†À¢6†ævT&6UF6·5FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷F6·5÷FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷G&6V&–Æ—G•÷FW‡BÀ¢&÷VæFVE66÷T7F—fS¢–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fP¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢ö÷WG6–FRF†RWF†÷&—¦VBCƒR&V6V—B×7W÷'B66÷S¢ÂæÆö÷ÂöWf–FVæ6UÂ÷CƒbÖF—7F6…Âæ§6öâð¢¢76W'BæWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâæ&÷VæFVE÷66÷Uö7F—fRÂfÇ6R§Ò §FW7B‚'VæF–ærCƒRW&Ö—G27W÷'B6†ævRg&öÒF†Rg&÷¦Vâ–×ÆVÖVçFF–öâÆÆ÷vÆ—7B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B7W'&VçDÖ–âÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"Â7W'&VçDÖ–â¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â'&V6V—B×fÆ–FF÷"×7W÷'B"¢6öç7BfÆ–FF÷%F‚ÒF‚æ¦ö–â‡&ö÷BÂ'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡fÆ–FF÷%F‚’Â²&V7W'6—fS¢G'VRÒ¢g2çw&—FTf–ÆU7–æ2‡fÆ–FF÷%F‚Â"òò&V6V—B7W÷'Bf—‡GW&UÆâ"¢v—B‡&ö÷BÂ&FB"Â'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&FB&V6V—BfÆ–FF÷"7W÷'B" ¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢7W'&VçD†VC¢–ç7V7F–öâæ†VBÀ¢v—D&–æF–æs¢–ç7V7F–öâÀ¢6†ævVEF‡3¢–ç7V7F–öâæ6†ævVEF‡2À¢6†ævT&6U6†¢–ç7V7F–öâæ6†ævUö&6U÷6†À¢6†ævT&6UF6·5FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷F6·5÷FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷G&6V&–Æ—G•÷FW‡BÀ¢&÷VæFVE66÷T7F—fS¢–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fP¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæFVWWVÂ†–ç7V7F–öâæ6†ævVEF‡2Â²'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2%Ò¢76W'BæÖF6‚†–ç7V7F–öâæ6†ævUö&6Uö6öÖÖ—GFVEöBÂõåÆG³GÒÕÆG³'ÒÕÆG³'ÕEÆG³'Ó¥ÆG³'Ó¥ÆG³'ÕÂåÆG³7Õ¢Bò§Ò §FW7B‚'VæF–ærCƒRW&Ö—G2öæÇ’F†RW†7BWF†VçF–6FVB÷væW"×&VF&6²7W÷'B66÷R"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢6†ævVEF‡3¢°¢"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2 ¢ÒÀ¢6†ævT&6U6†¢f—‡GW&T÷væW%&VF&6µ7W÷'D&6RÀ¢6†ævT&6UF6·5FW‡C¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'F6·2æÖB"’Â'WFc‚"’À¢6†ævT&6UG&6V&–Æ—G•FW‡C¢g2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’À¢'WFc‚ ¢’À¢&÷VæFVE66÷T7F—fS¢fÇ6P¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚$4’v—fW2öæÇ’F†R&W÷6—F÷'’×fW&–f–6F–öâ7FWWF†VçF–6FVB—77VR&VBÖ&6²"Â‚’Óâ°¢6öç7Bv÷&¶fÆ÷rÒg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"’Â'WFc‚" ¢76W'BæÖF6‚‡v÷&¶fÆ÷rÂ÷W&Ö—76–öç3¥Æâ³'Ö6öçFVçG3¢&VEÆâ³'Ö—77VW3¢&VBò¢76W'BæÖF6‚€¢v÷&¶fÆ÷rÀ¢òÒæÖS¢'Vâ&W÷6—F÷'’fW&–f–6F–öåÆâ³‡ÖVçc¥Æâ³Ôt•D…T%õDô´Tã¢ÂEÇµÇ²v—F‡V%ÂçFö¶VâÇÕÇÕÆâ³‡×'Vã¢ð¢¢76W'BæWVÂ‡v÷&¶fÆ÷ræÖF6‚‚ôt•D…T%õDô´Tã¢ÂEÇµÇ²v—F‡V%ÂçFö¶VâÇÕÇÒör“òæÆVæwF‚Â¢76W'BæÖF6‚‡v÷&¶fÆ÷rÂ÷W'6—7BÖ7&VFVçF–Ç3¢fÇ6Rò§Ò §FW7B‚$õtäU"Ö6öÖÖVçB&VBÖ&6²WF†VçF–6FW2æBv–æFW2v—F‚F†R–æ¦V7FVB7F–öç27&VFVçF–Â"Â‚’Óâ°¢6öç7BfÆ–FF÷"Òg2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"’À¢'WFc‚ ¢ ¢76W'BæÖF6‚‡fÆ–FF÷"Âö6öç7BFö¶VâÒ&ö6W75ÂæVçeÂät•D…T%õDô´TåÃõÂçG&–ÕÂ…Â’ò¢76W'BæÖF6‚‡fÆ–FF÷"Âö†VFW'5ÂäWF†÷&—¦F–öâÒ$&V&W""Â²Fö¶Vâò¢76W'BæÖF6‚‡fÆ–FF÷"Âö6†–ÆDVçf—&öæÖVçEÂät•D…T%õDô´TâÒVçf—&öæÖVçEÂät•D…T%õDô´Tâò¢76W'BæÖF6‚‡fÆ–FF÷"Â÷&W7öç6UÂæ†VFW'5ÂævWEÂ‚&Æ–æ²%Â’ò¢76W'BæÖF6‚‡fÆ–FF÷"Â÷&VÃÒ&æW‡B"ò¢76W'BæÖF6‚‡fÆ–FF÷"ÂöÖF6…ö6÷VçC¢ÖF6†W5ÂæÆVæwF‚ò§Ò §FW7B‚'VæF–ærCƒRW&Ö—G2F†RW†7BöæR×F–ÖR÷7B×&Wf–WræBæG&ö–B†&æW72&VÖVF–F–öâ"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7BF6·5FW‡BÒg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'F6·2æÖB"’Â'WFc‚"¢6öç7BG&6V&–Æ—G•F‚ÒF‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"¢6öç7B&U&VÖVF–F–öåG&6V&–Æ—G•FW‡BÒg2ç&VDf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â'WFc‚"¢6öç7B6÷'&V7FVEG&6V&–Æ—G•FW‡BÒG·&U&VÖVF–F–öåG&6V&–Æ—G•FW‡GÕÆãÂÒÒ÷7BÕCƒR6æ6†÷B&VÖVF–F–öâf—‡GW&RÒÓåÆæ ¢76W'Bææ÷DWVÂ†6÷'&V7FVEG&6V&–Æ—G•FW‡BÂ&U&VÖVF–F–öåG&6V&–Æ—G•FW‡B¢g2çw&—FTf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â6÷'&V7FVEG&6V&–Æ—G•FW‡B¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢6†ævVEF‡3¢²ââç÷7ECƒU&VÖVF–F–öä6†ævVEF‡5ÒÀ¢6†ævT&6U6†¢÷7ECƒU&VÖVF–F–öä&6U6†À¢6†ævT&6UF6·5FW‡C¢F6·5FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢&U&VÖVF–F–öåG&6V&–Æ—G•FW‡BÀ¢66WFVEG&6V&–Æ—G•6†#Sc¢6†#Sb†6÷'&V7FVEG&6V&–Æ—G•FW‡B’À¢&U&VÖVF–F–öåG&6V&–Æ—G•6†#Sc¢6†#Sb‡&U&VÖVF–F–öåG&6V&–Æ—G•FW‡B’À¢&÷VæFVE66÷T7F—fS¢fÇ6P¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâæ6†ævVE÷F‡2Â÷7ECƒU&VÖVF–F–öä6†ævVEF‡2§Ò ¦f÷"†6öç7B¶Æ&VÂÂ6†ævVEF‡2Â6†ævT&6U6†Òöb°¢²'7FÆR&6R"Â÷7ECƒU&VÖVF–F–öä6†ævVEF‡2Â&R"ç&WVBƒC•ÒÀ¢²&W‡G&F‚"Â²ââç÷7ECƒU&VÖVF–F–öä6†ævVEF‡2Â&gWGW&RçG‡B%ÒÂ÷7ECƒU&VÖVF–F–öä&6U6†ÒÀ¢°¢''F–Â'VçF–ÖR66÷R"À¢²&2÷vV"÷67&—G2öæG&ö–BÖ6‡&öÖR×W&f÷&Öæ6R×6Öö¶RæÖ§2%ÒÀ¢÷7ECƒU&VÖVF–F–öä&6U6†¢Ð¥Ò’°¢FW7B†öæR×F–ÖR÷7B×&Wf–Wr&VÖVF–F–öâ&V¦V7G2G¶Æ&VÇÖÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢6†ævVEF‡2À¢6†ævT&6U6†À¢6†ævT&6UF6·5FW‡C¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'F6·2æÖB"’Â'WFc‚"’À¢6†ævT&6UG&6V&–Æ—G•FW‡C¢g2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’À¢'WFc‚ ¢’À¢&÷VæFVE66÷T7F—fS¢fÇ6P¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö÷WG6–FRF†RWF†÷&—¦VBCƒR&V6V—B×7W÷'B66÷Rò¢Ò§Ð §FW7B‚$v—B–ç7V7F–öâW‡÷6W2&÷F‚6–FW2öb&VæÖR–çFòF†R6ö×ÆWF–öâ&V6V—BF‚"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B7W'&VçDÖ–âÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"Â7W'&VçDÖ–â¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â'&VæÖRÖWf–FVæ6RÖ–çFò×&V6V—B"¢v—B€¢&ö÷BÀ¢&×b"À¢"æÆö÷öWf–FVæ6R÷CƒRÖF—7F6‚æ§6öâ"À¢"æÆö÷öWf–FVæ6R÷CƒRÖ6ö×ÆWF–öâ×&V6V—Bæ§6öâ ¢¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â'&VæÖRWf–FVæ6R–çFò&V6V—B" ¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæFVWWVÂ†–ç7V7F–öâæ6†ævVEF‡2Â°¢"æÆö÷öWf–FVæ6R÷CƒRÖ6ö×ÆWF–öâ×&V6V—Bæ§6öâ"À¢"æÆö÷öWf–FVæ6R÷CƒRÖF—7F6‚æ§6öâ ¢Ò§Ò §FW7B‚$v—B–ç7V7F–öâ&–æG2F†R&VÂÖ–çFVææ6RDræB6–væVBS$R'—FW2"Â‚’Óâ°¢6öç7B&W÷6—F÷'”–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&W÷6—F÷'•&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæWVÂ‡&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷"ÂG'VR¢76W'BæWVÂ‡&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöS&UöÖF6†W5öWF†÷&—¦VEö†VBÂG'VR¢76W'BæWVÂ‡&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6Uö6æF–FFUöw&…öÖF6†W2ÂG'VR¢76W'BæFVWWVÂ‡&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6Uö6æF–FFUöw&‚Â°¢ÖF6†W3¢G'VRÀ¢W&UöÖW&vU÷&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6U6V7W&—G”†VE6†Â÷7ECƒTÖ–çFVææ6UW3d†VE6†ÒÀ¢W&UöÖW&vU÷G&VU÷6†¢÷7ECƒTÖ–çFVææ6UW&TÖW&vUG&VU6†À¢6ö×÷6&–Æ—G•÷&VçE÷6†3¢·÷7ECƒTÖ–çFVææ6UW&TÖW&vU6†ÒÀ¢6ö×÷6&–Æ—G•÷G&VU÷6†¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VEG&VU6†À¢&6U÷Fõ÷W&UöÖW&vU÷F‡3¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡2À¢&6U÷Fõö6ö×÷6&–Æ—G•÷F‡3¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡2À¢6ö×÷6&–Æ—G•ö6†ævVE÷F‡3¢÷7ECƒTÖ–çFVææ6T6ö×÷6&–Æ—G”6†ævVEF‡0¢Ò¢76W'BæFVWWVÂ€¢&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6U÷&W6W'fVE÷–ÆöEö&Æö%öö–G2çW&UöÖW&vRÀ¢÷7ECƒTÖ–çFVææ6TW‡V7FVE–ÆöD&Æö$ö–G0¢¢76W'BæFVWWVÂ€¢&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6U÷&W6W'fVE÷–ÆöEö&Æö%öö–G2æ6ö×÷6&–Æ—G•ö6†–ÆBÀ¢÷7ECƒTÖ–çFVææ6TW‡V7FVE–ÆöD&Æö$ö–G0¢¢76W'BæWVÂ€¢&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEö6öÖÖ—GFVEöBÀ¢÷7ECƒTÖ–çFVææ6TWF†÷&—¦VD†VD6öÖÖ—GFVD@¢¢76W'BæWVÂ€¢&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷6†À¢v—B‡&W÷6—F÷'•&ö÷BÂ'&Wb×'6R"Â$„TB"¢¢f÷"†6öç7BÖVæFÖVçEF‚öb÷7ECƒTÖ–çFVææ6TWF†÷&—¦VDÖVæFÖVçEF‡2’°¢76W'BæWVÂ€¢&W÷6—F÷'”–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6Uö6æF–FFUöÖVæFÖVçE÷F‡2æ–æ6ÇVFW2†ÖVæFÖVçEF‚’À¢G'VP¢¢Ð ¢6öç7BFV×÷&'•&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â&6÷W'G6–FRÖÖ–çFVææ6RÖFrÒ"’¢6öç7B6ÆöæU&ö÷BÒF‚æ¦ö–â‡FV×÷&'•&ö÷BÂ'&Wò"¢W†V4f–ÆU7–æ2‚&v—B"Â²&6ÆöæR"Â"Ò×V–WB"Â"ÒÖæòÖÆö6Â"Â&W÷6—F÷'•&ö÷BÂ6ÆöæU&ö÷EÒÂ°¢7FF–ó¢²&–væ÷&R"Â&–væ÷&R"Â'—R%Ð¢Ò¢6öç7B&W÷6—F÷'”†VBÒv—B‡&W÷6—F÷'•&ö÷BÂ'&Wb×'6R"Â$„TB"¢v—B†6ÆöæU&ö÷BÂ&6†V6¶÷WB"Â"ÒÖFWF6‚"Â&W÷6—F÷'”†VB¢v—B†6ÆöæU&ö÷BÂ&6öæf–r"Â'W6W"ææÖR"Â%G&6V&–Æ—G’FW7B"¢v—B†6ÆöæU&ö÷BÂ&6öæf–r"Â'W6W"æVÖ–Â"Â'G&6V&–Æ—G”W†×ÆRæ–çfÆ–B" ¢6öç7BS&UF‚ÒF‚æ¦ö–â†6ÆöæU&ö÷BÂ÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5³Ò¢g2æVæDf–ÆU7–æ2†S&UF‚Â%ÆâòòVæWF†÷&—¦VB÷7BÖWF†÷&—¦F–öâG&–gEÆâ"¢v—B†6ÆöæU&ö÷BÂ&FB"Â÷7ECƒTÖ–çFVææ6TWF†÷&—¦VEF‡5³Ò¢v—B†6ÆöæU&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&×WFFRWF†÷&—¦VBS$R'—FW2"¢6öç7B×WFFVD–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B†6ÆöæU&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæWVÂ†×WFFVD–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷"ÂG'VR¢76W'BæWVÂ†×WFFVD–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöS&UöÖF6†W5öWF†÷&—¦VEö†VBÂfÇ6R ¢v—B†6ÆöæU&ö÷BÂ&6†V6¶÷WB"Â"ÒÖFWF6‚"Â÷7ECƒTÖ–çFVææ6TWF†÷&—¦F–öä&6U6†¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â†6ÆöæU&ö÷BÂ&F—fW&vVçBÖÖ–çFVææ6RçG‡B"’Â&F—fW&vVçEÆâ"¢v—B†6ÆöæU&ö÷BÂ&FB"Â&F—fW&vVçBÖÖ–çFVææ6RçG‡B"¢v—B†6ÆöæU&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&7&VFRF—fW&vVçBÖ–çFVææ6R†VB"¢6öç7BF—fW&vVçD–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B†6ÆöæU&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæWVÂ†F—fW&vVçD–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6UöWF†÷&—¦VEö†VEöæ6W7F÷"ÂfÇ6R§Ò §FW7B‚$v—B–ç7V7F–öâ&–æG2âW†7BGvò×&VçBÖW&vRG&VRæBFWFV7G2ÖW&vR×F–ÖRG&–gB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&6RÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â&Ö–çFVææ6RÖ6æF–FFR"¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&6æF–FFRçG‡B"’Â&WF†÷&—¦VB6æF–FFUÆâ"¢v—B‡&ö÷BÂ&FB"Â&6æF–FFRçG‡B"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&'V–ÆBÖ–çFVææ6R6æF–FFR"¢6öç7B6æF–FFRÒv—B‡&ö÷BÂ'&Wb×'6R"Â$„TB" ¢v—B‡&ö÷BÂ'7v—F6‚"Â&Ö–â"¢v—B‡&ö÷BÂ&ÖW&vR"Â"ÒÖæòÖfb"Â"ÒÖæòÖVF—B"Â&Ö–çFVææ6RÖ6æF–FFR"¢6öç7BÖW&vT†VBÒv—B‡&ö÷BÂ'&Wb×'6R"Â$„TB"¢6öç7BWfVçEF‚ÒF‚æ¦ö–â‡&ö÷BÂ&v—F‡V"ÖÖ–çFVææ6RÖÖW&vR×W6‚æ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’‡°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vf÷&S¢&6RÀ¢gFW#¢ÖW&vT†VBÀ¢&Vc¢'&Vg2ö†VG2öÖ–â ¢Ò¢¢6öç7BÖW&vT–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%ôUdTåEôäÔS¢'W6‚"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF€¢Ð¢Ò ¢76W'BæFVWWVÂ†ÖW&vT–ç7V7F–öâæ†VE÷&VçE÷6†2Â¶&6RÂ6æF–FFUÒ¢76W'BæWVÂ†ÖW&vT–ç7V7F–öâæ†VE÷&VçEö6÷VçBÂ"¢76W'BæWVÂ†ÖW&vT–ç7V7F–öâæ†VE÷G&VU÷6†ÂÖW&vT–ç7V7F–öâç6V6öæE÷&VçE÷G&VU÷6†¢76W'BæWVÂ†ÖW&vT–ç7V7F–öâç÷7E÷CƒUöÖ–çFVææ6Uöf–æÅ÷%ö†VE÷6†Â6æF–FFR ¢v—B‡&ö÷BÂ'7v—F6‚"Â&Ö–çFVææ6RÖ6æF–FFR"¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&G&–gBçG‡B"’Â'VæWF†÷&—¦VBÖW&vR×G&VRG&–gEÆâ"¢v—B‡&ö÷BÂ&FB"Â&G&–gBçG‡B"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&7&VFRâVæWF†÷&—¦VBG&VR"¢6öç7BG&–gEG&VRÒv—B‡&ö÷BÂ'&Wb×'6R"Â$„TEç·G&VWÒ"¢6öç7BG&–gDÖW&vRÒv—B€¢&ö÷BÀ¢&6öÖÖ—B×G&VR"À¢G&–gEG&VRÀ¢"×"À¢&6RÀ¢"×"À¢6æF–FFRÀ¢"ÖÒ"À¢&f÷&vRÖW&vRG&VRG&–gB ¢¢v—B‡&ö÷BÂ'7v—F6‚"Â"ÒÖFWF6‚"ÂG&–gDÖW&vR¢6öç7BG&–gD–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%ôUdTåEôäÔS¢'W6‚"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF€¢Ð¢Ò ¢76W'BæFVWWVÂ†G&–gD–ç7V7F–öâæ†VE÷&VçE÷6†2Â¶&6RÂ6æF–FFUÒ¢76W'Bææ÷DWVÂ†G&–gD–ç7V7F–öâæ†VE÷G&VU÷6†ÂG&–gD–ç7V7F–öâç6V6öæE÷&VçE÷G&VU÷6†§Ò ¦f÷"†6öç7B6†ævVEF‚öb°¢"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"À¢"æÆö÷öWf–FVæ6R÷CƒR×&Wf–Wræ§6öâ"À¢'6¶vRæ§6öâ"À¢G¶fVGW&UF‡Ò÷ÆâæÖF ¥Ò’°¢FW7B†÷7BÖ–×ÆVÖVçFF–öâVæF–ærÖöFR&V¦V7G2æöâ×7W÷'BF‚G¶6†ævVEF‡ÖÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢6†ævVEF‡3¢¶6†ævVEF…ÒÀ¢6†ævT&6U6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævT&6UF6·5FW‡C¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'F6·2æÖB"’Â'WFc‚"’À¢6†ævT&6UG&6V&–Æ—G•FW‡C¢g2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’À¢'WFc‚ ¢’À¢&÷VæFVE66÷T7F—fS¢fÇ6P¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö÷WG6–FRF†RWF†÷&—¦VBCƒR&V6V—B×7W÷'B66÷Rò¢Ò§Ð §FW7B‚&ÆVv7’&RÖ–×ÆVÖVçFF–öâVæF–ærÖöFR&WF–ç2F†R÷&–v–æÂ2×F‚ÆÆ÷vÆ—7B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢6†ævVEF‡3¢²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÀ¢6†ævT&6U6†¢f—‡GW&U&V6V—D&6RÀ¢6†ævT&6UF6·5FW‡C¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'F6·2æÖB"’Â'WFc‚"’À¢6†ævT&6UG&6V&–Æ—G•FW‡C¢çVÆÂÀ¢&÷VæFVE66÷T7F—fS¢G'VP¢Ò ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&âGfæ6VB&6Rv—F†÷WBF†RCƒR'F–f7B¶VW2F†R&÷VæFVB66÷R7F—fR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7BG&6V&–Æ—G•F‚ÒF‚æ¦ö–â‡&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"¢6öç7BG&6V&–Æ—G’Òg2ç&VDf–ÆU7–æ2‡G&6V&–Æ—G•F‚Â'WFc‚"¢g2çVæÆ–æµ7–æ2‡G&6V&–Æ—G•F‚¢6öç7BGfæ6VD&6RÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"ÂGfæ6VD&6R¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â'CƒR×&V&6VB"¢g2çw&—FTf–ÆU7–æ2‡G&6V&–Æ—G•F‚ÂG&6V&–Æ—G’¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&gWGW&RçG‡B"’Â'Væ&÷VæFVBv÷&µÆâ"¢v—B‡&ö÷BÂ&FB"Â"â"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&–×ÆVÖVçBCƒRv—F‚66÷RG&–gB" ¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ²Vçf—&öæÖVçC¢·ÒÒ¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6U÷6†ÂGfæ6VD&6R¢76W'BæWVÂ†–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fRÂG'VR¢6öç7B&W÷'BÒfÆ–FFUG&6V&–Æ—G’‡°¢&ö÷BÀ¢7W'&VçD†VC¢–ç7V7F–öâæ†VBÀ¢v—D&–æF–æs¢–ç7V7F–öâÀ¢6†ævVEF‡3¢–ç7V7F–öâæ6†ævVEF‡2À¢6†ævT&6U6†¢–ç7V7F–öâæ6†ævUö&6U÷6†À¢&÷VæFVE66÷T7F—fS¢–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fP¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö÷WG6–FRF†RWF†÷&—¦VBCƒR66÷S¢gWGW&UÂçG‡Bò§Ò §FW7B‚'6†ÆÆ÷rVÆÂ×&WVW7B–ç7V7F–öâf–Ç26Æ÷6VBv†VâF†RWfVçB&6Rö&¦V7B—2'6VçB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B7W'&VçDÖ–âÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"Â7W'&VçDÖ–â¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â'VÆÂ×&WVW7B"¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&gWGW&RçG‡B"’Â&gWGW&Rv÷&µÆâ"¢v—B‡&ö÷BÂ&FB"Â&gWGW&RçG‡B"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&gWGW&Rv÷&²"¢6öç7BWfVçE&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â&6÷W'G6–FRÖWfVçBÒ"’¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†WfVçE&ö÷BÂ&WfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2†WfVçEF‚Â¥4ôâç7G&–æv–g’‡²VÆÅ÷&WVW7C¢²&6S¢²6†¢&b"ç&WVBƒC’ÒÒÒ’ ¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ°¢Vçf—&öæÖVçC¢²t•D…T%ô5D”ôå3¢'G'VR"Ât•D…T%ôUdTåEõDƒ¢WfVçEF‚Ð¢Ò¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6U÷6†ÂçVÆÂ¢76W'BæWVÂ†–ç7V7F–öâæ6†ævVEF‡2ÂçVÆÂ¢6öç7B&W÷'BÒfÆ–FFUG&6V&–Æ—G’‡°¢&ö÷BÀ¢7W'&VçD†VC¢–ç7V7F–öâæ†VBÀ¢v—D&–æF–æs¢–ç7V7F–öâÀ¢6†ævVEF‡3¢–ç7V7F–öâæ6†ævVEF‡2À¢6†ævT&6U6†¢–ç7V7F–öâæ6†ævUö&6U÷6†À¢&÷VæFVE66÷T7F—fS¢–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fRÀ¢&WV—&TVF—FVE66÷S¢G'VP¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âô4’fÆ–FF–öâ&WV—&W2âVF—FVB7W'&VçBÖ6†ævRF–fbò§Ò §FW7B‚'VÆÂ×&WVW7B–ç7V7F–öâ&V¦V7G2†VBF†BFöW2æ÷B6öçF–âF†RW†7BWfVçB&6R"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢v—B‡&ö÷BÂ'7v—F6‚"Â"Ö2"Â'7FÆR×&V6V—B×7W÷'B"¢6öç7BfÆ–FF÷%F‚ÒF‚æ¦ö–â‡&ö÷BÂ'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡fÆ–FF÷%F‚’Â²&V7W'6—fS¢G'VRÒ¢g2çw&—FTf–ÆU7–æ2‡fÆ–FF÷%F‚Â"òò7FÆR&V6V—B7W÷'EÆâ"¢v—B‡&ö÷BÂ&FB"Â'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â'7FÆR&V6V—B7W÷'B"¢v—B‡&ö÷BÂ'7v—F6‚"Â&Ö–â"¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ'&÷FV7FVBÖÖ–âÖGfæ6RçG‡B"’Â'&÷FV7FVBÖ–âGfæ6VEÆâ"¢v—B‡&ö÷BÂ&FB"Â'&÷FV7FVBÖÖ–âÖGfæ6RçG‡B"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&Gfæ6R&÷FV7FVBÖ–â"¢6öç7BÆ—fTWfVçD&6RÒv—B‡&ö÷BÂ'&Wb×'6R"Â$„TB"¢v—B‡&ö÷BÂ'7v—F6‚"Â'7FÆR×&V6V—B×7W÷'B" ¢6öç7BWfVçE&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â&6÷W'G6–FRÖWfVçBÒ"’¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†WfVçE&ö÷BÂ&WfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2†WfVçEF‚Â¥4ôâç7G&–æv–g’‡²VÆÅ÷&WVW7C¢²&6S¢²6†¢Æ—fTWfVçD&6RÒÒÒ’¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ°¢Vçf—&öæÖVçC¢²t•D…T%ô5D”ôå3¢'G'VR"Ât•D…T%ôUdTåEõDƒ¢WfVçEF‚Ð¢Ò ¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6U÷6†ÂÆ—fTWfVçD&6R¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6Uöæ6W7F÷"ÂfÇ6R¢6öç7B&W÷'BÒ'Vâ‡&ö÷BÂ°¢7W'&VçD†VC¢–ç7V7F–öâæ†VBÀ¢v—D&–æF–æs¢–ç7V7F–öâÀ¢6†ævVEF‡3¢–ç7V7F–öâæ6†ævVEF‡2À¢6†ævT&6U6†¢–ç7V7F–öâæ6†ævUö&6U÷6†À¢6†ævT&6UF6·5FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷F6·5÷FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢–ç7V7F–öâæ6†ævUö&6U÷G&6V&–Æ—G•÷FW‡BÀ¢&÷VæFVE66÷T7F—fS¢–ç7V7F–öâæ&÷VæFVE÷66÷Uö7F—fRÀ¢&WV—&TVF—FVE66÷S¢G'VP¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂöVF—FVB6†ævR&6R—2æ÷Bâæ6W7F÷"ò§Ò §FW7B‚'W6‚–ç7V7F–öâW6W2WfVçBæ&Vf÷&Rv†Vâ÷&–v–âÖ–âÇ&VG’ö–çG2B„TB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚¢6öç7B&Vf÷&RÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&gWGW&RçG‡B"’Â&gWGW&Rv÷&µÆâ"¢v—B‡&ö÷BÂ&FB"Â&gWGW&RçG‡B"¢v—B‡&ö÷BÂ&6öÖÖ—B"Â"ÖÒ"Â&gWGW&Rv÷&²"¢6öç7B†VBÒv—B‡&ö÷BÂ'&Wb×'6R"Â$„TB"¢v—B‡&ö÷BÂ'WFFR×&Vb"Â'&Vg2÷&VÖ÷FW2ö÷&–v–âöÖ–â"Â†VB¢6öç7BWfVçE&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â&6÷W'G6–FRÖWfVçBÒ"’¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†WfVçE&ö÷BÂ&WfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2†WfVçEF‚Â¥4ôâç7G&–æv–g’‡²&Vf÷&RÒ’ ¢6öç7B–ç7V7F–öâÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—B‡&ö÷BÂ°¢Vçf—&öæÖVçC¢²t•D…T%ô5D”ôå3¢'G'VR"Ât•D…T%ôUdTåEõDƒ¢WfVçEF‚Ð¢Ò¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6U÷6†Â&Vf÷&R¢76W'BæWVÂ†–ç7V7F–öâæ6†ævUö&6Uöæ6W7F÷"ÂG'VR¢76W'BæFVWWVÂ†–ç7V7F–öâæ6†ævVEF‡2Â²&gWGW&RçG‡B%Ò§Ò §FW7B‚&6ö×÷6—FRdU$”d”TB&÷w2&WF–â6ÆW6RÖ6ö×ÆWFR6VÖçF–2&ööb"Â‚’Óâ°¢6öç7B6öçG&7BÒW‡G&7D6öçG&7B€¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’Â'WFc‚"¢¢6öç7B'”–BÒæWrÖ†6öçG&7Bç&WV—&VÖVçG2æÖ‚‡&÷r’Óâ·&÷ræ–BÂ&÷uÒ’¢6öç7B6VÆV7F÷'2Ò†–B’Óâ'”–BævWB†–B’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷" ¢76W'BæFVWWVÂ‡6VÆV7F÷'2‚$e"Ó2"’Â°¢'&WGW&ç56fU&ö&ÆVÔFWF–Ç4f÷%Væ¶æ÷våv—F†G&väæD–çfÆ–EV&Æ–5&WVW7G2"À¢&Æ—7G4öæÇ•V&Æ—6†VE&–v‡G5fÆ–D—77VW5v—F„&÷VæFVD÷VT¶W—6WEv–æF–öäæDWFw2"À¢'&WGW&ç5f—6–&ÆU6V7F–öç4æD'F–6ÆW4–äVF—F÷$÷&FW%v—F†÷WDG&gDÖWFFF"À¢'&V¦V7G4gWGW&UV&Æ—6†VD—77VT–ç7FVDödÆV¶–æu66†VGVÆVDÖWFFF"À¢&FVæ–W4G&gEv—F†G&vä†—7F÷&–6ÄæE&—fFU&–v‡G46öçFVçB ¢Ò¢76W'BæWVÂ†'”–BævWB‚$e"Ó’"’æWf–FVæ6U÷7FFRÂ%%D”Â"¢76W'BæFVWWVÂ†'”–BævWB‚$e"Ó’"’æFWf–F–öåö–G2Â²$DUbÕCƒRÓ3’%Ò¢76W'BæFVWWVÂ‡6VÆV7F÷'2‚$e"Ó2"’Â°¢&VF—F÷%7V&Ö—G4æEV&Æ—6†W$&÷fW4öæÇ”gFW%&–v‡G4&U&VG’"À¢'V&Æ—6†W$6å66†VGVÆUF†VåV&Æ—6„öæÇ•v†VäGVR"À¢'V&Æ—6†VD6ä&6†—fTF—&V7FÇ’"À¢'V&Æ—6†W$6å66†VGVÆTæEV&Æ—6„ä&÷fVD—77VR ¢Ò¢76W'BæWVÂ†'”–BævWB‚$e"Ó2"’æ–×ÆVÖVçFF–öå÷7FFRÂ%ÄääTB"¢76W'BæWVÂ†'”–BævWB‚$e"Ó2"’æWf–FVæ6U÷7FFRÂ%%D”Â"¢76W'BæFVWWVÂ†'”–BævWB‚$e"Ó2"’æFWf–F–öåö–G2Â²$DUbÕCƒRÓC%Ò§Ò §FW7B‚'&Wf–WvVB×VÇF’Ö6ÆW6R&÷w2&VÖ–â'F–ÂVçF–ÂWfW'’ÕU5B6ÆW6R†2GG&–'WF&ÆR&ööb"Â‚’Óâ°¢6öç7B6öçG&7BÒW‡G&7D6öçG&7B€¢g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’Â'WFc‚"¢¢6öç7B'”–BÒæWrÖ†6öçG&7Bç&WV—&VÖVçG2æÖ‚‡&÷r’Óâ·&÷ræ–BÂ&÷uÒ’ ¢f÷"†6öç7B¶–BÂFWf–F–öä–EÒöb°¢²$e"Ó"Â$DUbÕCƒRÓC%ÒÀ¢²$e"ÓB"Â$DUbÕCƒRÓC"%ÒÀ¢²$e"Ób"Â$DUbÕCƒRÓC2%ÒÀ¢²$e"Ó#2"Â$DUbÕCƒRÓCB%ÒÀ¢²$e"Ó3"Â$DUbÕCƒRÓCR%ÒÀ¢²$e"Ó3""Â$DUbÕCƒRÓCb%ÒÀ¢²$e"ÓC‚"Â$DUbÕCƒRÓCr%Ð¢Ò’°¢76W'BæWVÂ†'”–BævWB†–B’æWf–FVæ6U÷7FFRÂ%%D”Â"ÂG¶–GÒ×W7Bæ÷B&VÖ–âdU$”d”TF¢76W'BæFVWWVÂ†'”–BævWB†–B’æFWf–F–öåö–G2Â¶FWf–F–öä–EÒ¢76W'BæWVÂ€¢'”–BævWB†–B’ç&VÆV6Uö–×7BÀ¢$$Äô4µ5õCƒeõTäÄU55ôD¥TD”4DTB"À¢G¶–GÒ×W7B&W6W'fRF†RÆFW"ÖvFR–×7F ¢¢Ð ¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"ÓR"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢'V&Æ—6†W%66†VGVÆUW'6—7G46–F—V”Æö6ÅF–ÖT5WF2"À¢'V&Æ—6†W$6åv—F†G&uF†Vä&6†—fUv—F†÷WDFVÆWF–æuF†UV&Æ—6†VDWf–FVæ6R ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"ÓB"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢'&öÆT&÷VæF&–W5&V¦V7DVF—F÷$&÷fÄæEV&Æ—6†W%7V&Ö—76–öâ"À¢'V&Æ—6†W$6åv—F†G&uF†Vä&6†—fUv—F†÷WDFVÆWF–æuF†UV&Æ—6†VDWf–FVæ6R ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"Ób"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢'66†VGVÆVD6öÖÖæD—46¶æ÷vÆVFvVD–FV×÷FVçFÇ”'•F†Uv÷&¶W""À¢'V&Æ—6†W$6å66†VGVÆTæEV&Æ—6„ä&÷fVD—77VR ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"Ó#2"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢&Ö—76–æu&V6÷&D&Æö6·5v—F…7F&ÆT6öFR"À¢&W‡—&VE&V6÷&D&Æö6·4&Vf÷&T—D6ä&UW6VB"À¢'&Wfö¶VE&V6÷&Ev–ç4÷fW$÷F†W%&V6÷&G2"À¢&7F—fU&V6÷&Df÷$æ÷F†W$6†ææVÄ&Æö6·5v—F…w&öæt6†ææVÂ"À¢&Ö—76–æu&–v‡G4&Æö6·57V&Ö—Ev—F†÷WDGfæ6–æufW'6–öäæD¶VW476WD–B"À¢&GVUv÷&¶W%&V6†V6·5&–v‡G4æD&Æö6·5v—F†÷WEV&Æ—6†–æt÷$7&VF–æu6æ6†÷B"À¢&W‡—&VE&–v‡G4DW†V7WF–öä&Æö6·5v—F†÷WEV&Æ—6†–ær ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"Ó3r"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢&FöW2æ÷B–ç7FÆÂ'F–ÆÇ’F÷væÆöFVB—77VRgFW"–çFW''WF–öâ"À¢'&WGW&ç4&÷VæFVEfW'6–öæVDÖæ–fW7Df÷$V&Æ—6†VD—77VR"À¢'6†÷w27F÷&vRÂ&öw&W72æBW‡—'’&Vf÷&R&VÖ÷f–ærâ—77VRÆö6ÆÇ’ ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"ÓC"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢'&V¦V7G4WfW'”6æöæ–6Ä–çfÆ–Df—‡GW&R"À¢'FW‡B&VæFW&–ær¶VW2gVRW66–æræBFÖ—G2öæÇ’&÷VæFVB…EE2÷"Ö–ÇFòÆ–æ·2"À¢&'F–6ÆR4Tò6W&–Æ—¦W2†÷7F–ÆR&ö¦V7F–öâFW‡Bv—F†÷WBFW&Ö–æF–ær¥4ôâÔÄB ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"ÓC2"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢&Ö¶RfW&–g’#âcÂFVR'F–f7G2ög&öçFVæBöÖ¶R×fW&–g’æÆör"À¢'çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&R#âcÂFVR'F–f7G2÷vV"ÖS&R÷Æ—w&–v‡BÖ6öÖ&–æVBæÆör"À¢'çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C§W&f÷&Öæ6R#âcÂFVR'F–f7G2÷vV"ÖS&R÷W&f÷&Öæ6RæÆör"À¢'çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦Æ–v‡F†÷W6R#âcÂFVR'F–f7G2÷vV"ÖS&RöÆ–v‡F†÷W6RæÆör"À¢&w&FÆRÒÖæòÖFVÖöâÒÖ6öç6öÆS×Æ–â×2ö’6†V6·7G–ÆTÖ–â7÷F'Vw4Ö–âFW7B#âcÂFVR'F–f7G2ö’öw&FÆR×VÆ—G’æÆör ¢Ð¢¢76W'BæFVWWVÂ€¢'”–BævWB‚$e"ÓCr"’ç&öög2æÖ‚‡&ööb’Óâ&ööbç6VÆV7F÷"’À¢°¢'&V¦V7G4f÷&&–FFVävVæW&F—fT6çf46&–Æ—F–W4E'VçF–ÖR"À¢&66WG4fÆ–DvVæW&F—fT6çf5–ÆöB"À¢'&V¦V7G4WfW'”6æöæ–6Ä–çfÆ–Df—‡GW&R"À¢'Væ¶æ÷vâ7&VF—fR&W6WG2&VæFW"öæÇ’F–ÖVç6–öæVBGG&–'WFVBfÆÆ&6² ¢Ð¢§Ò ¦gVæ7F–öâ76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B’°¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚€¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’À¢òƒó§6VÆV7F÷"×W7B–FVçF–g’âW†V7WF&ÆRFW7Bæ6†÷'ÅdU$”d”TB&W÷6—F÷'’&ööb×W7B&RâW†V7WF&ÆR6†V6²÷"GW&&ÆR&V6V—B’ð¢§Ð §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢âW†—B–×÷'FVBg&öÒæöFS§&ö6W726ææ÷B'—72&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2ö–×÷'FVB×&ö6W72ÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢v–×÷'B²W†—B2FW&Ö–æFRÒg&öÒ&æöFS§&ö6W72%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢'FW&Ö–æFRƒ•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢&Vf—†VB6WB¶R6ææ÷BWF†÷&—¦R6†VÆÂ&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâƒÓ6WB¶UÆâ&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…ÆâG'VUÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢VÆ–f–VBw&FÆRW†6ÇW6–öâ6ææ÷BWF†÷&—¦R¦f&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢w&FÆR×2ö’FW7B×‚§FW7EÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢â–æ†W&—FVB¥Væ—BW‡FVç6–öâ6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2W‡FVæG2F—6&ÆVD&6RµÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢f–ÆW5²&2ö’÷7&2÷FW7Bö¦föW†×ÆRôF—6&ÆVD&6Ræ¦f%ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’æW‡FVç6–öâäW‡FVæEv—FƒµÆâ"°¢$W‡FVæEv—F‚„Çv—4F—6&ÆVBæ6Æ72•Æâ"°¢&6Æ72F—6&ÆVD&6R·ÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢âVç&V6†&ÆRW†—B–â6†VÆÂ†VÇW"6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢&f–Â‚’µÆâ&WGW&âÆâW†—BÆçÕÆâ"²vf–Â&f—‡GW&R×&ööb%Æâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢õ4•‚6†VÆÂgVæ7F–öâ6ææ÷B6†F÷rF†R&ööb'VææW""Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ&6‚‚’²&WGW&â²ÕÆâ&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢æöFRVçbf–ÆR6ææ÷B6öæ6VÂFW7Bf–ÇFW""Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2öVçbÖf–ÆR×&ööbçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'BFW7Bg&öÒ&æöFS§FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²"æVçb%ÒÒ$äôDUôõD”ôå3ÒÒ×FW7BÖæÖR×GFW&ã×Vç&VÆFVEÆâ ¢f–ÆW5²'6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²FW7C¢&æöFRÒÖVçbÖf–ÆSÒæVçbÒ×FW7BFW7G2ò¢çFW7Bæ§2"Ð¢Ò¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢w&FÆR¥Væ—BFrf–ÇFW"6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFsµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢v6Æ72W†×ÆUFW7G2µÆâFr‚'&ööb"•ÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâp¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wF6·2çFW7B²W6T¥Væ—EÆFf÷&Ò²W†6ÇVFUFw2‚'&ööb"’ÒÕÆâp¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢Æ—w&–v‡BvÆö&Å6WGW6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2÷vV"÷FW7G2öS&Röf—‡GW&R×&ööbç7V2çG2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÒv–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%ÆçFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ·Ò•Æâp¢f–ÆW5²&2÷vV"÷6¶vRæ§6öâ%ÒÒ¥4ôâç7G&–æv–g’‡°¢&—fFS¢G'VRÀ¢67&—G3¢²'FW7C¦S&R#¢'Æ—w&–v‡BFW7B"Ð¢Ò¢f–ÆW5²&2÷vV"÷Æ—w&–v‡Bæ6öæf–rçG2%ÒÐ¢vW‡÷'BFVfVÇB²FW7DF—#¢"â÷FW7G2öS&R"ÂvÆö&Å6WGW¢"âövÆö&Â×6WGWçG2"ÕÆâp¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢çÒÒÖf–ÇFW"6÷W'G6–FR÷vV"'VâFW7C¦S&UÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢—F†öâ7—7FVÔW†—B¦W&ò6ææ÷B6W'fR2f–ÇW&R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò%7—7FVÔW†—Bƒ’ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆç—F†öâÒÃÂu’uÆç&—6R7—7FVÔW†—Bƒ’2f—‡GW&R×&ööeÆå•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢6¶—VBæVVFVB¦ö"6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥Æâ"°¢"vFS¥Æâ"°¢"–c¢G··²fÇ6R×ÕÆâ"°¢"7FW3¥Æâ"°¢"Ò'Vã¢G'VUÆâ"°¢"fW&–g“¥Æâ"°¢"æVVG3¢vFUÆâ"°¢"7FW3¥Æâ"°¢"Ò'Vã¢&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'6V6öæB×&Wf–Wr&Vw&W76–öã¢'V–ÇF–â—Vf–ÂF—6&ÆR6ææ÷BWF†÷&—¦R¦f&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ6WBÖò—Vf–ÅÆâ'V–ÇF–â6WB¶ò—Vf–ÅÆâw&FÆR×2ö’FW7BÂFVR&ööbæÆöuÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'6V6öæB×&Wf–Wr&Vw&W76–öã¢&VfÆV7F—fR&ö6W72W†—B6ææ÷B'—72&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2÷&VfÆV7F—fR×&ö6W72ÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢u&VfÆV7BævWB‡&ö6W72Â&W†—B"’ƒ•Æâp¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'6V6öæB×&Wf–Wr&Vw&W76–öã¢âVç&V6†&ÆRv÷&¶fÆ÷r'VææW"6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷Vçv—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâfÇ6Rbb&6‚67&—G2÷FW7B÷Vçv—&VB×&ööbç6…ÆâG'VUÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò ¦f÷"†6öç7B¶–×÷'D¶–æBÂ6÷W&6UÒöb°¢°¢&æÖW76R–×÷'B"À¢v–×÷'B¢2'VçF–ÖRg&öÒ&æöFS§&ö6W72%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢''VçF–ÖRæW†—Bƒ•Æâ ¢ÒÀ¢°¢&FVfVÇB–×÷'B"À¢v–×÷'B'VçF–ÖRfÚ±î¸Â¸­yêë¢°k¢G§¦*^rom "process"\n' +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
      "runtime.exit(0)\n"
  ],
  [
    "destructured CommonJS require",
    'const { exit: terminate } = require("node:process")\n' +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
      "terminate(0)\n"
  ],
  [
    "CommonJS process object",
    'const runtime = require("process")\n' +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
      "runtime.exit(0)\n"
  ]
]) {
  test("adjacent process-module safety: " + importKind + " cannot bypass proof", () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "tests/adjacent-process-module.test.js"
      contract.requirements[0].proofs[0].path = proofPath
      files[proofPath] = 'import test from "node:test"\n' + source
    })
    assertExecutableProofRejected(root)
  })
}

test("adjacent process-module safety: a harmless named import remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-process-import.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      'import { pid } from "node:process"\n' +
      "void pid\n" +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("adjacent shell safety: builtin set +e cannot authorize shell proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/unwired-proof.sh"
    files["scripts/test/unwired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: |\n          builtin set +e\n          bash scripts/test/unwired-proof.sh\n          true\n"
  })
  assertExecutableProofRejected(root)
})

test("adjacent Gradle safety: an inline qualified exclusion cannot authorize Java proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: gradle -p apps/api test --exclude-task=:app:test\n"
  })
  assertExecutableProofRejected(root)
})

test("adjacent JUnit safety: a transitive inherited extension cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests extends MiddleBase {\n  @Test\n  void fixtureProof() {}\n}\n"
    files["apps/api/src/test/java/example/MiddleBase.java"] =
      "package example;\nclass MiddleBase extends DisabledBase {}\n"
    files["apps/api/src/test/java/example/DisabledBase.java"] =
      "package example;\n" +
      "import org.junit.jupiter.api.extension.ExtendWith;\n" +
      "@ExtendWith(AlwaysDisabled.class)\n" +
      "class DisabledBase {}\n"
    addGradleProofRunnerFixture(files)
  })
  assertExecutableProofRejected(root)
})

test("adjacent shell safety: a reachable exit remains an exiting helper", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "die() {\n  exit 1\n  return 0\n}\n" + 'die "fixture-proof" || true\n'
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("adjacent Node-runner safety: env-file-if-exists cannot conceal a test filter", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/env-file-if-exists-proof.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] = 'import test from "node:test"\ntest("fixture-proof", () => {})\n'
    files["package.json"] = JSON.stringify({
      private: true,
      scripts: {
        test: "node --env-file-if-exists .env --test tests/*.test.js"
      }
    })
  })
  assertExecutableProofRejected(root)
})

for (const platformFilter of [
  'includeTags("unrelated")',
  'excludeEngines("junit-jupiter")',
  'includeEngines("unrelated")'
]) {
  test("adjacent Gradle safety: " + platformFilter + " cannot authorize Java proof", () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
      addGradleProofRunnerFixture(files)
      files["apps/api/build.gradle.kts"] +=
        "tasks.test { useJUnitPlatform { " + platformFilter + " } }\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const [hookKind, config] of [
  [
    "globalTeardown property",
    'export default { testDir: "./tests/e2e", globalTeardown: "./global-teardown.ts" }\n'
  ],
  [
    "assigned globalSetup",
    'const config = { testDir: "./tests/e2e" }\n' +
      'config.globalSetup = "./global-setup.ts"\n' +
      "export default config\n"
  ]
]) {
  test("adjacent Playwright safety: " + hookKind + " cannot authorize proof", () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/web/tests/e2e/fixture-proof.spec.ts"
      contract.requirements[0].proofs[0].path = proofPath
      files[proofPath] =
        'import { test } from "@playwright/test"\ntest("fixture-proof", () => {})\n'
      files["apps/web/package.json"] = JSON.stringify({
        private: true,
        scripts: { "test:e2e": "playwright test" }
      })
      files["apps/web/playwright.config.ts"] = config
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: pnpm --filter @courtside/web run test:e2e\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const statusExpression of ["", "256", "False"]) {
  test(
    "adjacent Python safety: SystemExit(" + statusExpression + ") cannot serve as failure proof",
    () => {
      const root = makeFixture(({ contract, files }) => {
        contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
        contract.requirements[0].proofs[0].selector = "SystemExit(" + statusExpression + ")"
        files["scripts/test/wired-proof.sh"] =
          "set -e\npython - <<'PY'\nraise SystemExit(" +
          statusExpression +
          ") # fixture-proof\nPY\n"
        files[".github/workflows/ci.yml"] =
          "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
      })
      assertExecutableProofRejected(root)
    }
  )
}

test("adjacent Python safety: a literal-message SystemExit remains failure proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npython - <<'PY'\nraise SystemExit(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("adjacent Python safety: a statically nonzero SystemExit remains failure proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    contract.requirements[0].proofs[0].selector = "SystemExit(7)"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npython - <<'PY'\nraise SystemExit(7) # fixture-proof\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("adjacent workflow safety: a transitive skipped dependency cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/unwired-proof.sh"
    files["scripts/test/unwired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n" +
      "  gate:\n" +
      "    if: ${{{ false }}\n" +
      "    steps:\n" +
      "      - run: true\n" +
      "  middle:\n" +
      "    needs: gate\n" +
      "    steps:\n" +
      "      - run: true\n" +
      "  verify:\n" +
      "    needs: middle\n" +
      "    steps:\n" +
      "      - run: bash scripts/test/unwired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("adjacent workflow safety: an unconditional dependency chain remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n" +
      "  gate:\n" +
      "    steps:\n" +
      "      - run: true\n" +
      "  verify:\n" +
      "    needs: gate\n" +
      "    steps:\n" +
      "      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("latest-head regression: a terminating Node before hook cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/terminating-before-hook.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, { before } from "node:test"\n' +
      "before(() => process.exit(0))\n" +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
  })
  assertExecutableProofRejected(root)
})

test("latest-head regression: a disabled Gradle Test block cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files["apps/api/build.gradle.kts"] = files["apps/api/build.gradle.kts"].replace(
      "}\n",
      "  enabled = false\n}\n"
    )
  })
  assertExecutableProofRejected(root)
})

test("latest-head regression: a Python anchor stored in shell data cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npayload='\nraise AssertionError(\"fixture-proof\")\n'\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("latest-head regression: a zero-status EXIT trap cannot authorize shell proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "trap 'exit 0' EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

for (const [hookKind, source] of [
  [
    "namespace afterEach hook",
    'import test, * as nodeTest from "node:test"\n' +
      "nodeTest.afterEach(() => process.exit(0))\n" +
      'test("fixture-proof", () => {})\n'
  ],
  [
    "aliased helper hook",
    'import test, { beforeEach as prepare } from "node:test"\n' +
      "function terminate() { process.exit(0) }\n" +
      "prepare(() => terminate())\n" +
      'test("fixture-proof", () => {})\n'
  ],
  [
    "conditional hook",
    'import test, { before } from "node:test"\n' +
      "if (process.platform === 'linux') before(() => process.exit(0))\n" +
      'test("fixture-proof", () => {})\n'
  ],
  [
    "named callback hook",
    'import test, { after } from "node:test"\n' +
      "function terminate() { process.exit(0) }\n" +
      "after(terminate)\n" +
      'test("fixture-proof", () => {})\n'
  ]
]) {
  test("adjacent Node-hook safety: " + hookKind + " cannot authorize proof", () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "tests/terminating-lifecycle-hook.test.js"
      contract.requirements[0].proofs[0].path = proofPath
      files[proofPath] = source
    })
    assertExecutableProofRejected(root)
  })
}

test("adjacent Node-hook safety: a harmless hook remains attributable", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-lifecycle-hook.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, { before } from "node:test"\n' +
      "before(() => {})\n" +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [disableKind, configuration] of [
  ["named test task", "tasks.test { enabled = false }\n"],
  ["setEnabled call", "tasks.test { setEnabled(false) }\n"],
  ["provider-named test task", 'tasks.named<Test>("test") { enabled = false }\n']
]) {
  test("adjacent Gradle safety: " + disableKind + " cannot authorize proof", () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
      addGradleProofRunnerFixture(files)
      files["apps/api/build.gradle.kts"] += configuration
    })
    assertExecutableProofRejected(root)
  })
}

test("adjacent Gradle safety: an explicitly enabled test task remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files["apps/api/build.gradle.kts"] += "tasks.test { enabled = true }\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("adjacent Python safety: a non-Python heredoc cannot authorize a Python anchor", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\ncat <<'PY'\nraise AssertionError(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("adjacent Python safety: a Python argument does not make a heredoc executable Python", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\nprintf python <<'PY'\nraise AssertionError(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

for (const [trapKind, action, expectedStatus] of [
  ["wrapped zero", "exit 256", "FAIL"],
  ["nonzero", "exit 7", "PASS"],
  ["cleanup only", "printf cleanup >/dev/null", "PASS"]
]) {
  test("adjacent EXIT-trap safety: " + trapKind + " action is classified", () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] = `trap '${action}' EXIT\nfalse fixture-proof\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    const report = run(root)
    assert.equal(report.status, expectedStatus, report.errors.join("\n"))
  })
}

test("final-head review regression: an escaped Node lifecycle alias cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/escaped-lifecycle-alias.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, * as nodeTest from "node:test"\n' +
      "const { before: prepare } = nodeTest\n" +
      "prepare(() => process.exit(0))\n" +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: Gradle onlyIf suppression cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files["apps/api/build.gradle.kts"] += "tasks.test { onlyIf { false } }\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: a Python early-exit option cannot authorize a heredoc", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npython3 --version <<'PY'\nraise AssertionError(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: an EXIT-trap helper that exits zero cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "cleanup() { exit 0; }\ntrap cleanup EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: a Node early-exit runner option cannot select proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/fixture-proof.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] = 'import test from "node:test"\ntest("fixture-proof", () => {})\n'
    files["package.json"] = JSON.stringify({
      private: true,
      scripts: { test: "node --version --test tests/fixture-proof.test.js" }
    })
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: a workflow shell without errexit cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n" +
      "  verify:\n" +
      "    steps:\n" +
      "      - shell: bash {0}\n" +
      "        run: bash scripts/test/wired-proof.sh; true\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: an anchor in an uncalled shell function cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "set -e\nproof() {\n  false fixture-proof\n}\ntrue\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head review regression: a scheduled Node exit cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/scheduled-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
      "queueMicrotask(() => process.exit(0))\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: a Node lifecycle member alias fails closed", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/escaped-lifecycle-member.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, * as nodeTest from "node:test"\n' +
      "const prepare = nodeTest.before\n" +
      "prepare(() => process.exit(0))\n" +
      'test("fixture-proof", () => {})\n'
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: Gradle setOnlyIf suppression cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
    contract.requirements[0].proofs[0].path = proofPath
    contract.requirements[0].proofs[0].selector = "fixtureProof"
    files[proofPath] =
      "package example;\n" +
      "import org.junit.jupiter.api.Test;\n" +
      "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
    addGradleProofRunnerFixture(files)
    files["apps/api/build.gradle.kts"] += "tasks.test { setOnlyIf({ false }) }\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: Python -V cannot authorize a heredoc", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npython3 -V <<'PY'\nraise AssertionError(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: explicit Python stdin with arguments remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\npython3 - input.json <<'PY'\nraise AssertionError(\"fixture-proof\")\nPY\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("final-head adjacent safety: a transitive zero-status EXIT helper cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "finish() { exit 0; }\ncleanup() { finish; }\ntrap cleanup EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: a nonzero EXIT helper preserves proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "cleanup() { exit 7; }\ntrap cleanup EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("final-head adjacent safety: Node --help cannot select proof", () => {
  const root = makeFixture(({ files }) => {
    files["package.json"] = JSON.stringify({
      private: true,
      scripts: { test: "node --help --test tests/fixture-proof.test.js" }
    })
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: an unsafe workflow default shell cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "defaults:\n" +
      "  run:\n" +
      "    shell: bash {0}\n" +
      "jobs:\n" +
      "  verify:\n" +
      "    steps:\n" +
      "      - run: bash scripts/test/wired-proof.sh; true\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: an explicit errexit workflow shell remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "false fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n" +
      "  verify:\n" +
      "    steps:\n" +
      "      - shell: bash -e {0}\n" +
      "        run: bash scripts/test/wired-proof.sh; true\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("final-head adjacent safety: a one-line uncalled shell function cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "set -e; proof() { false fixture-proof; }; true\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: process.nextTick cannot schedule a terminating helper", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/next-tick-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      "function terminate() { process.exit(0) }\n" +
      'test("fixture-proof", () => {})\n' +
      "process.nextTick(terminate)\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: setTimeout cannot schedule a terminating callback", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/timer-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      'test("fixture-proof", () => {})\n' +
      "setTimeout(() => process.exit(0), 0)\n"
  })
  assertExecutableProofRejected(root)
})

test("final-head adjacent safety: a harmless microtask remains proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-microtask.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      "queueMicrotask(() => {})\n" +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("exact-head review regression: a qualified microtask exit cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/qualified-microtask-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n' +
      "globalThis.queueMicrotask(() => process.exit(0))\n"
  })
  assertExecutableProofRejected(root)
})

test("exact-head adjacent safety: a static scheduler alias cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/aliased-scheduler-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      "const schedule = global.setImmediate\n" +
      'test("fixture-proof", () => {})\n' +
      "schedule(() => process.exit(0))\n"
  })
  assertExecutableProofRejected(root)
})

test("exact-head review regression: querying an overriding EXIT trap preserves rejection", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "trap 'exit 0' EXIT\ntrap -p EXIT >/dev/null\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("exact-head adjacent safety: resetting an EXIT trap restores attributable failure", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "trap 'exit 0' EXIT\ntrap - EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("exact-head review regression: an anchor in an unreachable if branch cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\nif false; then\n  false fixture-proof\nfi\ntrue\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

for (const [compoundKind, source] of [
  ["loop", "set -e\nwhile false; do\n  false fixture-proof\ndone\ntrue\n"],
  ["case branch", "set -e\ncase x in\n  y)\n    false fixture-proof\n    ;;\nesac\ntrue\n"]
]) {
  test(`exact-head adjacent safety: an anchor in an unreachable ${compoundKind} is rejected`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] = source
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const commandPrefix of ["builtin", "command"]) {
  test(`exact-head review regression: ${commandPrefix} set +e disables proof-side errexit`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `set -e\n${commandPrefix} set +e\nfalse fixture-proof\ntrue\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const hookName of ["beforeEach", "afterEach"]) {
  test(`exact-head review regression: a Node ${hookName} skip cannot authorize proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = `tests/${hookName}-skip.test.js`
      contract.requirements[0].proofs[0].path = proofPath
      files[proofPath] =
        `import test, { ${hookName} } from "node:test"\n` +
        `${hookName}((t) => t.skip("disabled"))\n` +
        'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
    })
    assertExecutableProofRejected(root)
  })
}

test("exact-head adjacent safety: a harmless Node hook context remains attributable", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-hook-context.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, { beforeEach } from "node:test"\n' +
      'beforeEach((t) => t.diagnostic("starting"))\n' +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const fluentMethod of ["configureEach", "all"]) {
  test(`exact-head review regression: a fluent Gradle ${fluentMethod} disable cannot authorize proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = "apps/api/src/test/java/example/ExampleTests.java"
      contract.requirements[0].proofs[0].path = proofPath
      contract.requirements[0].proofs[0].selector = "fixtureProof"
      files[proofPath] =
        "package example;\n" +
        "import org.junit.jupiter.api.Test;\n" +
        "class ExampleTests {\n  @Test\n  void fixtureProof() {}\n}\n"
      addGradleProofRunnerFixture(files)
      files["apps/api/build.gradle.kts"] +=
        `tasks.withType<Test>().${fluentMethod} { enabled = false }\n`
    })
    assertExecutableProofRejected(root)
  })
}

test("follow-up exact-head regression: a named default timers import cannot authorize proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/named-default-timer-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test from "node:test"\n' +
      'import { default as timers } from "node:timers"\n' +
      'test("fixture-proof", async () => new Promise(() => {}))\n' +
      "timers.setImmediate(() => process.exit(0))\n"
  })
  assertExecutableProofRejected(root)
})

for (const [groupKind, open, close] of [
  ["brace", "{", "}"],
  ["subshell", "(", ")"]
]) {
  test(`follow-up exact-head regression: an anchor in a gated ${groupKind} group is rejected`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `set -e\nfalse && ${open}\n  false fixture-proof\n${close}\ntrue\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const queryOption of ["-l", "-lp"]) {
  test(`follow-up exact-head regression: trap ${queryOption} preserves an overriding EXIT trap`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `trap 'exit 0' EXIT\ntrap ${queryOption} EXIT >/dev/null\nfalse fixture-proof\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const [contextKind, access] of [
  ["arguments", 'arguments[0].skip("disabled")'],
  ["this", 'this.skip("disabled")']
]) {
  test(`follow-up exact-head regression: a Node hook cannot skip through ${contextKind}`, () => {
    const root = makeFixture(({ contract, files }) => {
      const proofPath = `tests/implicit-${contextKind}-hook-skip.test.js`
      contract.requirements[0].proofs[0].path = proofPath
      files[proofPath] =
        'import test, { beforeEach } from "node:test"\n' +
        `beforeEach(function () { ${access} })\n` +
        'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
    })
    assertExecutableProofRejected(root)
  })
}

test("follow-up exact-head safety: a harmless traditional Node hook remains attributable", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-traditional-hook.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import test, { beforeEach } from "node:test"\n' +
      "beforeEach(function () {})\n" +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [direction, operator] of [
  ["input", "<"],
  ["output", ">"]
]) {
  test(`post-5695 exact-head regression: ${direction} process substitution cannot hide a failing shell proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `set -e\ncat ${operator}(\n  false fixture-proof\n)\ntrue\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

test("post-5695 adjacent safety: a completed harmless process substitution preserves proof", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] =
      "set -e\ncat <(printf harmless) >/dev/null\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

for (const [substitutionKind, open, close] of [
  ["command", "$(", ")"],
  ["legacy command", "`", "`"]
]) {
  test(`post-5695 adjacent regression: ${substitutionKind} substitution cannot hide a failing shell proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `set -e\nprintf '%s\\n' "${open}\n  false fixture-proof\n${close}"\ntrue\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

for (const [substitutionKind, expression] of [
  ["command", "$(printf harmless)"],
  ["legacy command", "`printf harmless`"]
]) {
  test(`post-5695 adjacent safety: a completed harmless ${substitutionKind} substitution preserves proof`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] =
        `set -e\nprintf '%s\\n' "${expression}"\nfalse fixture-proof\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    const report = run(root)
    assert.equal(report.status, "PASS", report.errors.join("\n"))
  })
}

test("post-5695 exact-head regression: trap -- cannot hide an overriding EXIT action", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "trap -- 'exit 0' EXIT\nfalse fixture-proof\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

for (const [trapVariant, source] of [
  ["command separator", "command -- trap -- 'exit 0' EXIT"],
  ["wrapped action", "trap 'command -- exit 0' EXIT"],
  ["lowercase signal", "trap 'exit 0' exit"],
  ["zero-padded signal", "trap 'exit 0' 00"]
]) {
  test(`post-5695 adjacent regression: ${trapVariant} cannot hide an overriding EXIT action`, () => {
    const root = makeFixture(({ contract, files }) => {
      contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
      files["scripts/test/wired-proof.sh"] = `${source}\nfalse fixture-proof\n`
      files[".github/workflows/ci.yml"] =
        "jobs:\n  verify:\n    steps:\n      - run: bash scripts/test/wired-proof.sh\n"
    })
    assertExecutableProofRejected(root)
  })
}

test("post-5695 exact-head regression: a Playwright lifecycle hook cannot skip proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/playwright-hook-skip.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import { test } from "@playwright/test"\n' +
      "test.beforeEach(() => test.skip())\n" +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
  })
  assertExecutableProofRejected(root)
})

test("post-5695 adjacent safety: a harmless Playwright lifecycle hook preserves proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/harmless-playwright-hook.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import { test } from "@playwright/test"\n' +
      "test.beforeEach(() => {})\n" +
      'test("fixture-proof", () => {})\n'
  })
  const report = run(root)
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("post-5695 adjacent regression: an escaped Playwright lifecycle hook cannot skip proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/aliased-playwright-hook-skip.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import { test } from "@playwright/test"\n' +
      "const prepare = test.beforeEach\n" +
      "prepare(() => test.skip())\n" +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
  })
  assertExecutableProofRejected(root)
})

test("post-5695 adjacent regression: a Playwright lifecycle hook cannot terminate proof", () => {
  const root = makeFixture(({ contract, files }) => {
    const proofPath = "tests/playwright-hook-exit.test.js"
    contract.requirements[0].proofs[0].path = proofPath
    files[proofPath] =
      'import { test } from "@playwright/test"\n' +
      "test.beforeAll(() => process.exit(0))\n" +
      'test("fixture-proof", () => { throw new Error("unreached proof") })\n'
  })
  assertExecutableProofRejected(root)
})

for (const [preloadOption, preloadPath] of [
  ["--require", "./scripts/test/exit-zero.cjs"],
  ["--import", "./scripts/test/exit-zero.mjs"],
  ["--test-global-setup", "./scripts/test/exit-zero-setup.mjs"],
  ["--test-reporter", "./scripts/test/exit-zero-reporter.mjs"]
]) {
  test(`post-5695 exact-head regression: Node ${preloadOption} cannot select proof`, () => {
    const root = makeFixture(({ files }) => {
      files["package.json"] = JSON.stringify({
        private: true,
        scripts: {
          test: `node ${preloadOption} ${preloadPath} --test tests/*.test.js`
        }
      })
      files[preloadPath.slice(2)] = "process.exit(0)\n"
    })
    assertExecutableProofRejected(root)
  })
}

test("post-5695 exact-head regression: BASH_ENV cannot preload a successful shell exit", () => {
  const root = makeFixture(({ contract, files }) => {
    contract.requirements[0].proofs[0].path = "scripts/test/wired-proof.sh"
    files["scripts/test/wired-proof.sh"] = "false fixture-proof\n"
    files["scripts/test/exit-zero.sh"] = "exit 0\n"
    files[".github/workflows/ci.yml"] =
      "jobs:\n  verify:\n    steps:\n      - run: BASH_ENV=scripts/test/exit-zero.sh bash scripts/test/wired-proof.sh\n"
  })
  assertExecutableProofRejected(root)
})

test("post-5695 adjacent regression: exported BASH_ENV cannot preload a successful shell exit", () => {
  const root = makeFm«ëŒ+Š×ž®º+º$zzb¥æ—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²'67&—G2÷FW7BöW†—B×¦W&òç6‚%ÒÒ&W†—BÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâW‡÷'B$4…ôTåc×67&—G2÷FW7BöW†—B×¦W&òç6…Æâ&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓSc“RF¦6VçB&Vw&W76–öã¢v÷&¶fÆ÷r$4…ôTåb6ææ÷B&VÆöB7V66W76gVÂ6†VÆÂW†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²'67&—G2÷FW7BöW†—B×¦W&òç6‚%ÒÒ&W†—BÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥ÆâVçc¥Æâ$4…ôTåc¢67&—G2÷FW7BöW†—B×¦W&òç6…Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò ¦f÷"†6öç7B¶6ÆÆ&6´¶–æBÂFV6Æ&F–öâÂ&Vv—7G&F–öåÒöb°¢²&–æÆ–æR"Â""Â'FW7Bæ&Vf÷&TV6‚†gVæ7F–öâ‚’²&wVÖVçG5³Òç6¶—‚’Ò’%ÒÀ¢°¢&æÖVB"À¢&gVæ7F–öâF—6&ÆTg&öÔ†öö´6öçFW‡B‚’²&wVÖVçG5³Òç6¶—‚’ÕÆâ"À¢'FW7Bæ&Vf÷&TV6‚†F—6&ÆTg&öÔ†öö´6öçFW‡B’ ¢Ð¥Ò’°¢FW7B†÷7BÓ6F"W†7BÖ†VB&Vw&W76–öã¢G¶6ÆÆ&6´¶–æGÒÆ—w&–v‡B†öö²&wVÖVçG26ææ÷B6¶—&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚ÒFW7G2òG¶6ÆÆ&6´¶–æGÒ×Æ—w&–v‡BÖ†öö²Ö&wVÖVçG2çFW7Bæ§6 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'B²FW7BÒg&öÒ$Æ—w&–v‡B÷FW7B%Æâr°¢FV6Æ&F–öâ°¢G·&Vv—7G&F–öçÕÆæ°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâp¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓ6F"W†7BÖ†VB&Vw&W76–öã¢t•D…T%ôTåb6ææ÷B&VÆöBÆFW"6†VÆÂ&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²'67&—G2÷FW7BöW†—B×¦W&òç6‚%ÒÒ&W†—BÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢V6†òt$4…ôTåc×67&—G2÷FW7BöW†—B×¦W&òç6‚rãâÂ"Dt•D…T%ôTåeÂ%ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò ¦f÷"†6öç7B·&V7F–öâÂ6÷W&6UÒöb°¢²'F†Vâ"Â%&öÖ—6Rç&W6öÇfR‚’çF†Vâ‚‚’Óâ&ö6W72æW†—Bƒ’’%ÒÀ¢²&6F6‚"Â%&öÖ—6Rç&V¦V7B†æWrW'&÷"‚’’æ6F6‚‚‚’Óâ&ö6W72æW†—Bƒ’’%ÒÀ¢²&f–æÆÇ’"Â%&öÖ—6Rç&W6öÇfR‚’æf–æÆÇ’‚‚’Óâ&ö6W72æW†—Bƒ’’%Ð¥Ò’°¢FW7B†÷7BÓ6F"W†7BÖ†VB&Vw&W76–öã¢&öÖ—6RG·&V7F–öçÒ6ææ÷B66†VGVÆRFW&Ö–æF–ær6ÆÆ&6¶Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚ÒFW7G2÷&öÖ—6RÒG·&V7F–öçÒÖW†—BçFW7Bæ§6 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢G·6÷W&6WÕÆæ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓ6F"W†7BÖ†VB&Vw&W76–öã¢âW†V2U„•BG&6ææ÷B÷fW'&–FR&ööbf–ÇW&R"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ'G&vW†V2G'VRrU„•EÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ6F"W†7BÖ†VB&Vw&W76–öã¢æÖVB6÷&ö6W726ææ÷B†–FR&ööbf–ÇW&R"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆæ6÷&ö2tõ$´U"µÆâfÇ6Rf—‡GW&R×&ööeÆçÕÆçG'VUÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ6F"F¦6VçB6fWG“¢&ööbgFW"6Æ÷6VB†&ÖÆW726÷&ö6W72&VÖ–ç2GG&–'WF&ÆR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆæ6÷&ö2tõ$´U"µÆâG'VUÆçÕÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ÷F–öåÒöb°¢²'6†÷'B"Â"Ö’%ÒÀ¢²&Æöær"Â"ÒÖ–çFW&7F—fR%Ð¥Ò’°¢FW7B†÷7BÖsV2W†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒ–çFW&7F—fR&6‚6ææ÷BWF†÷&—¦R&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²'67&—G2÷FW7Bö–çFW&7F—fRÖ†öÖRòæ&6‡&2%ÒÒ&W†—BÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢„ôÔS×67&—G2÷FW7Bö–çFW&7F—fRÖ†öÖR&6‚G¶÷F–öçÒ67&—G2÷FW7B÷v—&VB×&ööbç6…Ææ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ&Vf—…Òöb°¢²&–æÆ–æR"Â%•D„ôåDƒ×67&—G2÷FW7B÷—F†öâ×7F'GW%ÒÀ¢²&Vçb"Â&Vçb•D„ôåDƒ×67&—G2÷FW7B÷—F†öâ×7F'GW%Ð¥Ò’°¢FW7B†÷7BÖsV2W†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒ—F†öâ7F'GW–æ¦V7F–öâ6ææ÷BWF†÷&—¦R†W&VFö2&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢6WBÖUÆâG·&Vf—‡Ò—F†öã2ÃÂu’uÆæ²w&—6R76W'F–öäW'&÷"‚&f—‡GW&R×&ööb"•Æâr²%•Æâ ¢f–ÆW5²'67&—G2÷FW7B÷—F†öâ×7F'GW÷6—FV7W7FöÖ—¦Rç’%ÒÒ&–×÷'B÷3²÷2åöW†—Bƒ•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÖsV2F¦6VçB&Vw&W76–öã¢v÷&¶fÆ÷r—F†öâ7F'GWVçf—&öæÖVçB6ææ÷BWF†÷&—¦R†W&VFö2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆç—F†öã2ÃÂu’uÆâ"²w&—6R76W'F–öäW'&÷"‚&f—‡GW&R×&ööb"•Æâr²%•Æâ ¢f–ÆW5²'67&—G2÷FW7B÷—F†öâ×7F'GW÷6—FV7W7FöÖ—¦Rç’%ÒÒ&–×÷'B÷3²÷2åöW†—Bƒ•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥ÆâVçc¥Æâ•D„ôåDƒ¢67&—G2÷FW7B÷—F†öâ×7F'GWÆâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò ¦f÷"†6öç7B¶æÖRÂ6÷W&6UÒöb°¢²&F—&V7B"Â'&ö6W72ç&VÆÇ”W†—Bƒ’%ÒÀ¢²&6ö×WFVBvÆö&Â"ÂvvÆö&ÅF†—2ç&ö6W75²'&VÆÇ”W†—B%Òƒ’uÒÀ¢²&æÖVB–×÷'B"Âv–×÷'B²&VÆÇ”W†—B2FW&Ö–æFRÒg&öÒ&æöFS§&ö6W72%ÆçFW&Ö–æFRƒ’uÐ¥Ò’°¢FW7B†÷7BÖsV2W†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒ&ö6W72ç&VÆÇ”W†—B6ææ÷BWF†÷&—¦R&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚ÒFW7G2÷&ö6W72×&VÆÇ’ÖW†—BÒG¶æÖRç&WÆ6TÆÂ‚""Â"Ò"—ÒçFW7Bæ§6 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢G·6÷W&6WÕÆæ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ6÷W&6UÒöb°¢²&–æÆ–æR"Â#µ³Òæf÷$V6‚‚‚’Óâ&ö6W72æW†—Bƒ’’%ÒÀ¢°¢&æÖVB"À¢&gVæ7F–öâFW&Ö–æFTg&öÔ6ÆÆ&6²‚’²&ö6W72æW†—Bƒ’ÕÆãµ³Òæf÷$V6‚‡FW&Ö–æFTg&öÔ6ÆÆ&6²’ ¢Ð¥Ò’°¢FW7B†÷7BÓ#fSBW†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒVæ6Æ76–f–VB6ÆÆ&6²W†—B6ææ÷BWF†÷&—¦R&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚ÒFW7G2÷Væ6Æ76–f–VBÖ6ÆÆ&6²ÒG¶æÖWÒçFW7Bæ§6 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢G·6÷W&6WÕÆæ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ6†VÆÅÒöb°¢²'6†÷'B"Â&&6‚ÖRÖâ³Ò%ÒÀ¢²&Æöær"Â&&6‚ÖRÒÖæöW†V2³Ò%Ð¥Ò’°¢FW7B†÷7BÓ#fSBW†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒæòÖW†V2v÷&¶fÆ÷r6†VÆÂ6ææ÷BWF†÷&—¦R&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ6†VÆÃ¢G·6†VÆÇÕÆâ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Ææ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ6öÖÖæEÒöb°¢²'6÷W&6R"Â'6÷W&6R67&—G2÷FW7BöF—6&ÆRÖW'&W†—Bç6‚%ÒÀ¢²&F÷B"Â"â67&—G2÷FW7BöF—6&ÆRÖW'&W†—Bç6‚%Ð¥Ò’°¢FW7B†÷7BÓ#fSBW†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒ6ææ÷BÖ6²&ööb×6–FRW'&W†—FÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ6WBÖUÆâG¶6öÖÖæGÕÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆæ ¢f–ÆW5²'67&—G2÷FW7BöF—6&ÆRÖW'&W†—Bç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓ#fSBF¦6VçB6fWG“¢†&ÖÆW726÷W&6VB†VÇW"&W6W'fW2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆç6÷W&6R67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6…ÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ6öæf–wW&F–öâÂW‡V7FVE7FGW5Òöb°¢²&76–væÖVçBG'VR"Â&–væ÷&Tf–ÇW&W2ÒG'VR"Â$d”Â%ÒÀ¢²'6WGFW"G'VR"Â'6WD–væ÷&Tf–ÇW&W2‡G'VR’"Â$d”Â%ÒÀ¢²&76–væÖVçBfÇ6R"Â&–væ÷&Tf–ÇW&W2ÒfÇ6R"Â%52%Ð¥Ò’°¢FW7B†÷7BÓ#fSBw&FÆR6fWG“¢G¶æÖWÒ—26Æ76–f–VFÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³ÒF6·2çFW7B²G¶6öæf–wW&F–öçÒÕÆæ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2ÂW‡V7FVE7FGW2Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð §FW7B‚'÷7BÓ#fSBW†7BÖ†VB&Vw&W76–öã¢â÷fW'&–F–ærU%"G&6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ'6WBÖUÆçG&vW†—BrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ#fSBF¦6VçB6fWG“¢&W6WGF–ærâU%"G&&W7F÷&W2GG&–'WF&ÆRf–ÇW&R"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆçG&vW†—BrU%%ÆçG&ÒU%%ÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ7F—fU6–væÂÂ&W6WE6–væÅÒöb°¢²$U„•B&VÖ–ç27F—fR"Â$U„•B"Â$U%"%ÒÀ¢²$U%"&VÖ–ç27F—fR"Â$U%""Â$U„•B%Ð¥Ò’°¢FW7B†÷7BÓ#fSBF¦6VçB&Vw&W76–öã¢G¶æÖWÒgFW"æ÷F†W"G&—2&W6WFÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢6WBÖUÆçG&vW†—BrG¶7F—fU6–væÇÕÆçG&ÒG·&W6WE6–væÇÕÆæfÇ6Rf—‡GW&R×&ööeÆæ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓCcC‚W†7BÖ†VB&Vw&W76–öã¢&öÖ—6R6öç7G'V7F÷"6ÆÆ&6²6ææ÷BFW&Ö–æFR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2÷&öÖ—6RÖ6öç7G'V7F÷"ÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&æWr&öÖ—6R‚‚’Óâ&ö6W72æW†—Bƒ’•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓCcC‚F¦6VçB&Vw&W76–öã¢æÖVB&öÖ—6R6öç7G'V7F÷"6ÆÆ&6²6ææ÷BFW&Ö–æFR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2öæÖVB×&öÖ—6RÖ6öç7G'V7F÷"ÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&gVæ7F–öâFW&Ö–æFTg&öÔ6öç7G'V7F÷"‚’²&ö6W72æW†—Bƒ’ÕÆâ"°¢&æWr&öÖ—6R‡FW&Ö–æFTg&öÔ6öç7G'V7F÷"•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓCcC‚W†7BÖ†VB&Vw&W76–öã¢âU%"G&6ææ÷BF—6&ÆR&ööb×6–FRW'&W†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ'6WBÖUÆçG&w6WB¶RrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓCcC‚F¦6VçB6fWG“¢âU%"G&F†B&W6W'fW2W'&W†—B&VÖ–ç2GG&–'WF&ÆR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ'6WBÖUÆçG&w6WBÖRrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚'÷7BÓCcC‚F¦6VçB&Vw&W76–öã¢âU%"G&6ææ÷BF—6&ÆRÆöærÖf÷&ÒW'&W†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆçG&v'V–ÇF–â6WB¶òW'&W†—BrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò ¦f÷"†6öç7B¶æÖRÂ†VÇW"ÂW‡V7FVE7FGW5Òöb°¢²&Ö6¶–ær"Â'6WB¶R"Â$d”Â%ÒÀ¢²&†&ÖÆW72"Â&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG’"Â%52%Ð¥Ò’°¢FW7B†÷7BÓCcC‚G–æÖ–26÷W&6R6fWG“¢G¶æÖWÒ&W6öÇfVB†VÇW"—26Æ76–f–VFÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆâ"°¢$„TÅU#×67&—G2÷FW7BöG–æÖ–2×6÷W&6Rç6…Æâ"°¢w6÷W&6R"D„TÅU"%Æâr°¢&fÇ6Rf—‡GW&R×&ööeÆçG'VUÆâ ¢f–ÆW5²'67&—G2÷FW7BöG–æÖ–2×6÷W&6Rç6‚%ÒÒG¶†VÇW'ÕÆæ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2ÂW‡V7FVE7FGW2Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ6÷W&6T6öÖÖæEÒöb°¢²'Vç&W6öÇfVBf&–&ÆR"Âw6÷W&6R"ETå$U4ôÅdTEô„TÅU""uÒÀ¢²&6öÖÖæB7V'7F—GWF–öâ"Âw6÷W&6R"B‡&–çFb67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚’"uÐ¥Ò’°¢FW7B†÷7BÓCcC‚F¦6VçB&Vw&W76–öã¢6÷W&6RG¶æÖWÒf–Ç26Æ÷6VFÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ6WBÖUÆâG·6÷W&6T6öÖÖæGÕÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆæ ¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓCcC‚F¦6VçB6fWG“¢7FF–26÷W&6R&ÖWFW"fÆÆ&6²&VÖ–ç2GG&–'WF&ÆR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6WBÖUÆä„TÅU#Ò"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%Æâr°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ6†VÆÅÒöb°¢²'6†÷'B"Â&&6‚ÖRÔB³Ò%ÒÀ¢²&6ÇW7FW&VB"Â&&6‚ÖTB³Ò%ÒÀ¢²&Æöær"Â&&6‚ÒÖGV××7G&–æw2ÖR³Ò%ÒÀ¢²'ò"Â&&6‚ÖRÒÖGV××ò×7G&–æw2³Ò%Ð¥Ò’°¢FW7B†÷7BÓCcC‚W†7BÖ†VB&Vw&W76–öã¢G¶æÖWÒGV××7G&–æw26†VÆÂ6ææ÷BWF†÷&—¦R&ööfÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ6†VÆÃ¢G·6†VÆÇÕÆâ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Ææ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð ¦f÷"†6öç7B·fÇVRÂW‡V7FVE7FGW5Òöb°¢²'G'VR"Â$d”Â%ÒÀ¢²&fÇ6R"Â%52%Ð¥Ò’°¢FW7B†÷7BÓCcC‚w&FÆR&÷f–FW"6fWG“¢6öæf–wW&VB–væ÷&Tf–ÇW&W2G·fÇVWÒ—26Æ76–f–VFÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢F6·2ææÖVCÅFW7Câ‚'FW7B"’æ6öæf–wW&R²–væ÷&Tf–ÇW&W2ÒG·fÇVWÒÕÆæ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2ÂW‡V7FVE7FGW2Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð §FW7B‚'÷7BÓCcC‚F¦6VçB&Vw&W76–öã¢&÷f–FW"6WD–væ÷&Tf–ÇW&W2G'VRf–Ç26Æ÷6VB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wF6·2ææÖVCÅFW7Câ‚'FW7B"’æ6öæf–wW&R²6WD–væ÷&Tf–ÇW&W2‡G'VR’ÕÆâp¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢â–çfö¶VB6öç7G'V7F÷"6ÆÆVR6ææ÷BFW&Ö–æFR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2ö6öç7G'V7F÷"Ö6ÆÆVRÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&æWr†gVæ7F–öâ‚’²&ö6W72æW†—Bƒ’Ò’‚•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢U%"G&6öçG&öÂfÆ÷r6ææ÷B†–FRF—6&ÆVBW'&W†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆçG&w6WB¶RÇÂ6WBÖRrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢v÷&¶fÆ÷rVçf—&öæÖVçB6öçG&öÇ26÷W&6RfÆÆ&6²"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6WBÖUÆä„TÅU#Ò"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%Æâr°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥Æâ"°¢"Ò'Vã¢„TÅU%ôõdU%$”DS×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢Vç&V6†&ÆR6÷W&6R76–væÖVçB6ææ÷B&WÆ6RÖ6¶–ærF‚"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆâ"°¢$„TÅU#×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6ƒ²fÇ6Rbb„TÅU#×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6ƒ²"°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢Æ–6VBw&FÆRFW7B&÷f–FW"6ææ÷B–væ÷&Rf–ÇW&W2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wfÂ6VÆV7FVEFW7BÒF6·2ææÖVCÅFW7Câ‚'FW7B"•Æâr°¢'6VÆV7FVEFW7Bæ6öæf–wW&R²–væ÷&Tf–ÇW&W2ÒG'VRÕÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"W†7BÖ†VB&Vw&W76–öã¢ÇW2ÔBv÷&¶fÆ÷r6†VÆÂ6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥Æâ"°¢"Ò6†VÆÃ¢&6‚´BÖR³ÕÆâ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"F¦6VçB6fWG“¢U„•BG&÷F–öâ6†ævW2&W6W'fRVæF–ærf–ÇW&R7FGW2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ'6WBÖUÆçG&w6WB¶RrU„•EÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚'÷7BÓ“6"F¦6VçB&Vw&W76–öã¢æÖVB6öç7G'V7F÷"6ÆÆVR6ææ÷BFW&Ö–æFR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2öæÖVBÖ6öç7G'V7F÷"Ö6ÆÆVRÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&gVæ7F–öâFW&Ö–æF–æt6öç7G'V7F÷"‚’²&ö6W72æW†—Bƒ’ÕÆâ"°¢&æWrFW&Ö–æF–æt6öç7G'V7F÷"‚•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'÷7BÓ“6"F¦6VçB6fWG“¢†&ÖÆW726öç7G'V7F÷"6ÆÆVR&W6W'fW2&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2ö†&ÖÆW72Ö6öç7G'V7F÷"Ö6ÆÆVRçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚&GG&–'WF&ÆR&ööb"’Ò•Æâr°¢&æWr†gVæ7F–öâ‚’²F†—2ç&VG’ÒG'VRÒ’‚•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚'÷7BÓ“6"F¦6VçB6fWG“¢U%"G&6öçG&öÂfÆ÷rÖ’&W7F÷&RW'&W†—B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆçG&w6WB¶Rbb6WBÖRrU%%ÆæfÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B·66÷RÂv÷&¶fÆ÷uÒöb°¢°¢'v÷&¶fÆ÷r"À¢&Vçc¥Æâ„TÅU%ôõdU%$”DS¢67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6…Æâ"°¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢&¦ö""À¢&¦ö'3¥ÆâfW&–g“¥ÆâVçc¥Æâ„TÅU%ôõdU%$”DS¢67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6…Æâ"°¢"7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢ÒÀ¢°¢'7FW"À¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒVçc¥Æâ„TÅU%ôõdU%$”DS¢67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6…Æâ"°¢"'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ð¥Ò’°¢FW7B†÷7BÓ“6"F¦6VçB&Vw&W76–öã¢G·66÷WÒVçf—&öæÖVçB6öçG&öÇ26÷W&6RfÆÆ&6¶Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6WBÖUÆä„TÅU#Ò"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%Æâr°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆçG'VUÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÒv÷&¶fÆ÷p¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B¢Ò§Ð §FW7B‚'÷7BÓ“6"F¦6VçB6fWG“¢–æÆ–æRVçf—&öæÖVçB÷fW'&–FW2Ö6¶–ær7FWVçf—&öæÖVçB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6WBÖUÆä„TÅU#Ò"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%Æâr°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥Æâ"°¢"ÒVçc¥Æâ„TÅU%ôõdU%$”DS¢67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6…Æâ"°¢"'Vã¢„TÅU%ôõdU%$”DS×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò ¦f÷"†6öç7B¶æÖRÂ76–væÖVçEÒöb°¢²'Væ6öæF—F–öæÂ"Â$„TÅU#×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÀ¢²'G'VRÖæB"Â'G'VRbb„TÅU#×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÀ¢²&fÇ6RÖ÷""Â&fÇ6RÇÂ„TÅU#×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%Ð¥Ò’°¢FW7B†÷7BÓ“6"F¦6VçB6fWG“¢G¶æÖWÒ6÷W&6R&V76–væÖVçB&VÖ–ç2GG&–'WF&ÆVÂ‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢6WBÖUÆä„TÅU#×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6ƒ²G¶76–væÖVçGÓ²°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð §FW7B‚'÷7BÓ“6"F¦6VçB6fWG“¢Æ–6VBw&FÆRFW7B&÷f–FW"¶VW2f–ÇW&W27G&–7B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wfÂ6VÆV7FVEFW7BÒF6·2ææÖVCÅFW7Câ‚'FW7B"•Æâr°¢'6VÆV7FVEFW7Bæ6öæf–wW&R²–væ÷&Tf–ÇW&W2ÒfÇ6RÕÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚'÷7BÓ“6"F¦6VçB&Vw&W76–öã¢6ÇW7FW&VBÇW2ÔBv÷&¶fÆ÷r6†VÆÂ6ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÒ&fÇ6Rf—‡GW&R×&ööeÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥Æâ"°¢"Ò6†VÆÃ¢&6‚¶TBÖR³ÕÆâ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢t•D…T%ôTåb6÷W&6R÷fW'&–FW26ææ÷BWF†÷&—¦R&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6÷W&6R"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥Æâ"°¢"Ò'Vã¢V6†òt„TÅU%ôõdU%$”DS×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚rãâÂ"Dt•D…T%ôTåeÂ%Æâ"°¢"Ò'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢Vç6WBÖb&W6W'fW2â–æ†W&—FVB6÷W&6R÷fW'&–FR"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6÷W&6R"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‡Ò%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒVçc¥Æâ"°¢"„TÅU%ôõdU%$”DS¢67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6…Æâ"°¢"'Vã¢Vç6WBÖb„TÅU%ôõdU%$”DS²&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢WfW'’76–væÖVçBÖöæÇ’6÷W&6Rf&–&ÆR—2ÖöFVÆVB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'6WBÖUÆä„TÅU#×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6ƒ²"°¢$„TÅU#×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚õD„U#×fÇVS²"°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢G—VBw&FÆR&÷f–FW"Æ–6W26ææ÷B–væ÷&Rf–ÇW&W2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wfÂ6VÆV7FVEFW7C¢÷&ræw&FÆRæ’çF6·2åF6µ&÷f–FW#ÅFW7CâÒF6·2ææÖVCÅFW7Câ‚'FW7B"•Æâr°¢'6VÆV7FVEFW7Bæ6öæf–wW&R²–væ÷&Tf–ÇW&W2ÒG'VRÕÆâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB6fWG“¢G—VBw&FÆR&÷f–FW"Æ–6W2¶VWf–ÇW&W27G&–7B"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò&2ö’÷7&2÷FW7Bö¦föW†×ÆRôW†×ÆUFW7G2æ¦f ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³Òç6VÆV7F÷"Ò&f—‡GW&U&ööb ¢f–ÆW5·&ööeF…ÒÐ¢'6¶vRW†×ÆSµÆâ"°¢&–×÷'B÷&ræ§Væ—Bæ§W—FW"æ’åFW7CµÆâ"°¢&6Æ72W†×ÆUFW7G2µÆâFW7EÆâfö–Bf—‡GW&U&ööb‚’·ÕÆçÕÆâ ¢FDw&FÆU&ööe'VææW$f—‡GW&R†f–ÆW2¢f–ÆW5²&2ö’ö'V–ÆBæw&FÆRæ·G2%Ò³Ð¢wfÂ6VÆV7FVEFW7C¢÷&ræw&FÆRæ’çF6·2åF6µ&÷f–FW#ÅFW7CâÒF6·2ææÖVCÅFW7Câ‚'FW7B"•Æâr°¢'6VÆV7FVEFW7Bæ6öæf–wW&R²–væ÷&Tf–ÇW&W2ÒfÇ6RÕÆâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢Væ¶æ÷vâÆ–â6÷W&6Rf&–&ÆW2f–Â6Æ÷6VB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6÷W&6R'67&—G2÷FW7BòD„TÅU%ôõdU%$”DR%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7BöçVÆÂ%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒVçc¥Æâ"°¢"„TÅU%ôõdU%$”DS¢G·²f'2ä„TÅU%ôõdU%$”DR×ÕÆâ"°¢"'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢6÷W&6VBÖ†VÇW"&W6öÇWF–öâÆ–W2Vç6WB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢'Vç6WB„TÅU%ôõdU%$”DUÆâ"°¢t„TÅU#Ò"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‡Ò%Æâr°¢w6÷W&6R"D„TÅU"%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒVçc¥Æâ"°¢"„TÅU%ôõdU%$”DS¢67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6…Æâ"°¢"'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢VæW‡÷'FVB76–væÖVçG2Fòæ÷B&V6‚6†–ÆB&öög2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6÷W&6R"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‡Ò%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ"°¢"„TÅU%ôõdU%$”DS×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6…Æâ"°¢"&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB6fWG“¢W‡÷'FVB76–væÖVçG2&V6‚6†–ÆB&öög2"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢w6÷W&6R"G´„TÅU%ôõdU%$”DS¢×67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‡Ò%ÆæfÇ6Rf—‡GW&R×&ööeÆâp¢f–ÆW5²'67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6‚%ÒÒ&W‡÷'Bd•…EU$Uô4ôåDU…C×&VG•Æâ ¢f–ÆW5²'67&—G2÷FW7BöÖ6¶–ær×6÷W&6Rç6‚%ÒÒ'6WB¶UÆâ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢ÅÆâ"°¢"W‡÷'B„TÅU%ôõdU%$”DS×67&—G2÷FW7Bö†&ÖÆW72×6÷W&6Rç6…Æâ"°¢"&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢7FF–2ÖVÖ&W"6öç7G'V7F÷'26ææ÷BFW&Ö–æFR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2÷7FF–2ÖÖVÖ&W"Ö6öç7G'V7F÷"ÖW†—BçFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚'Vç&V6†VB&ööb"’Ò•Æâr°¢&6öç7B6öç7G'V7F÷'2Ò²W†—C¢gVæ7F–öâ‚’²&ö6W72æW†—Bƒ’ÒÕÆâ"°¢&æWr6öç7G'V7F÷'2äW†—B‚•Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚&7W'&VçBÖ†VB6fWG“¢†&ÖÆW727FF–2ÖVÖ&W"6öç7G'V7F÷'2&W6W'fR&ööb"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öç7B&ööeF‚Ò'FW7G2ö†&ÖÆW72×7FF–2ÖÖVÖ&W"Ö6öç7G'V7F÷"çFW7Bæ§2 ¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò&ööeF€¢f–ÆW5·&ööeF…ÒÐ¢v–×÷'BFW7Bg&öÒ&æöFS§FW7B%Æâr°¢wFW7B‚&f—‡GW&R×&ööb"Â‚’Óâ²F‡&÷ræWrW'&÷"‚&GG&–'WF&ÆR&ööb"’Ò•Æâr°¢&6öç7B6öç7G'V7F÷'2Ò²&VG“¢gVæ7F–öâ‚’²F†—2ç&VG’ÒG'VRÒÕÆâ"°¢&æWr6öç7G'V7F÷'2å&VG’‚•Æâ ¢Ò¢6öç7B&W÷'BÒ'Vâ‡&ö÷B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚&7W'&VçBÖ†VB&Vw&W76–öã¢ÆöærG&–Æ–ærG&6W&F÷'2&VÖ–â&÷VæFVB"Â‚’Óâ°¢6öç7B&ö÷BÒÖ¶Tf—‡GW&R‚‡²6öçG&7BÂf–ÆW2Ò’Óâ°¢6öçG&7Bç&WV—&VÖVçG5³Òç&öög5³ÒçF‚Ò'67&—G2÷FW7B÷v—&VB×&ööbç6‚ ¢6öç7BG&–Æ–æu6W&F÷'2Ò"²"ç&WVBƒ#C‚¢f–ÆW5²'67&—G2÷FW7B÷v—&VB×&ööbç6‚%ÒÐ¢6WBÖUÆçG&vW†—BG·G&–Æ–æu6W&F÷'7ÒrU„•EÆæfÇ6Rf—‡GW&R×&ööeÆæ ¢f–ÆW5²"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ%ÒÐ¢&¦ö'3¥ÆâfW&–g“¥Æâ7FW3¥ÆâÒ'Vã¢&6‚67&—G2÷FW7B÷v—&VB×&ööbç6…Æâ ¢Ò¢76W'DW†V7WF&ÆU&ööe&V¦V7FVB‡&ö÷B§Ò §FW7B‚'&VG’Öf÷"×&Wf–Wr&VÖ–ç2âW‡Æ–6—B&VÆV6RÖ÷væW"vFR"Â‚’Óâ°¢6öç7Bw&‚Òg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ"æÆö÷÷CƒR×G&6V&–Æ—G’ç–ÖÂ"’Â'WFc‚"¢6öç7BG&6V&–Æ—G’Òg2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂfVGW&UF‚Â'G&6V&–Æ—G’æÖB"’À¢'WFc‚ ¢ ¢76W'BæÖF6‚€¢w&‚À¢ö÷WC¥Æâƒó¢â¥Æâ’£õÇ2²Ò&VG’Öf÷"×&Wf–WrÂ&÷FV7FVBÖW&vR÷"CƒR6ö×ÆWF–öâ&V6V—EÂâð¢¢76W'BæFöW4æ÷DÖF6‚†w&‚Âö×&VG’×G&ç6—F–öâ×c'Ç×&VG’×&VF&6²×c"ò¢76W'BæFöW4æ÷DÖF6‚†w&‚Âö7W'&VçB&VÆV6RÖ÷væW"–ç7G'V7F–öâWF†÷&—¦W2&VG’Öf÷"×&Wf–Wrò¢76W'BæÖF6‚€¢w&‚À¢ö'VFvWG3¢Ç¶Ö…ö—FW&F–öç3¢’ÂÖ…öÖ–çWFW3¢CCÂÖ…÷6ÖUöf–ÇW&S¢"ÂÖ…öw&…ö6†ævW3¢SbÂÖ…÷Fö¶Vç3¢##ÇÒð¢¢76W'BæÖF6‚‡G&6V&–Æ—G’ÂöFöW2æ÷BWF†÷&—¦R&VG’Öf÷"×&Wf–Wrò¢76W'BæFöW4æ÷DÖF6‚‡G&6V&–Æ—G’Âö6öæF—F–öæÆÇ’WF†÷&—¦W2&VG’Öf÷"×&Wf–Wrò¢76W'BæÖF6‚€¢G&6V&–Æ—G’À¢ôF—7F6‚WF†÷&—G’&VÖ–ç2f—†VBB6f3FFC#–##f6SCfSFC3cF6VV3s–“sF6VcCFð¢¢76W'BæÖF6‚‡G&6V&–Æ—G’Â÷&÷FV7FVBÖ–äƒFF#6F#“VS“fV#3v#s3FVV“#ff3f3V6Vò¢76W'BæÖF6‚‡G&6V&–Æ—G’ÂöU…DU$äÅõ$TD$4µõ$UT•$TFò§Ò¦gVæ7F–öâ&WV—&VDvFU'VçF–ÖR‚’°¢6öç7Bv÷&¶fÆ÷rÒg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ"æv—F‡V"÷v÷&¶fÆ÷w2÷Cƒb×&WV—&VBÖvFRç–ÖÂ"’Â'WFc‚"¢6öç7BÖF6‚Òv÷&¶fÆ÷ræÖF6‚m«ëŒ+Š×ž®º+º$zzb¥è/\\/\\/ T086_PURE_START\\n([\\s\\S]*?)\\s*\\/\\/ T086_PURE_END/u)
  assert.ok(match, "trusted workflow contains the actual pure evaluator")
  return new Function("createHash", match[1] + "\\nreturn {evaluateSnapshot, classifyCandidate, canonicalComment, commentIdentity};")(createHash)
}

function requiredGateFixture() {
  const candidate = "1".repeat(40)
  const base = "2".repeat(40)
  const frozen = "204662214eada892332d1ddbeab8d0b8037cfc5477d9152d6fb3a61e56832b79"
  const boundaries = {participant_research_executed:false, web3_activated:false, production_activated:false, provider_configured:false, credentials_or_secrets_accessed_or_changed:false, external_product_writes:false, t087_or_later_dispatched:false, t086_task_state_changed:false, beta_flag_removed:false}
  const entries = [{id:"DEV-1", severity:"P1", type:"HUMAN_OPEN", affected_ids:["SC-001"], outcome:"RISK_ACCEPTED_FOR_BETA", rationale:"Explicit owner adjudication for this exact candidate only.", evidence_refs:[], follow_up_issue:"https://github.com/bynanci/courtside-tw/issues/171"}]
  const contract = {schema_version:"courtside-t086-owner-adjudication/v1", accepted_by:"bynanci", decision:"ADJUDICATION_ACCEPTED", repository:"bynanci/courtside-tw", issue:"https://github.com/bynanci/courtside-tw/issues/160", task:"T086", candidate_sha:candidate, protected_base_sha:base, frozen_t085_traceability_sha256:frozen, scope_boundaries:boundaries, adjudications:entries}
  const comment = {id:987, user:{login:"bynanci"}, author_association:"OWNER", created_at:"2026-09-08T10:00:00Z", updated_at:"2026-09-08T10:00:00Z", html_url:"https://github.com/bynanci/courtside-tw/issues/160#issuecomment-987", body:"<!-- t086:owner-adjudication:start -->\\n```json\\n"+JSON.stringify(contract)+"\\n```\\n<!-- t086:owner-adjudication:end -->"}
  const report = {schema_version:"courtside-t086-beta-release/v1", task:"T086", decision_scope:"T086_GATE_ONLY", status:"PASS", release_decision:"PASS", release_decision_reasons:[], candidate_sha:candidate, base:{branch:"main", sha:base, authorized_sha:base}, frozen_t085_traceability:{sha256:frozen, expected_sha256:frozen}, scope_boundaries:boundaries, errors:[], surfaces:{result:"PASS", required:["public-read","two-role-publish","retry","revision","withdrawal","backup-restore","rollback"]}, stability:{result:"PASS", required_consecutive_runs:20,same_candidate_sha:true}, blockers:{source_count:1,count:0,source:[{id:"DEV-1",severity:"P1",type:"HUMAN_OPEN",affected_ids:["SC-001"]}],unadjudicated:[],adjudicated:entries}, adjudication:{status:"VERIFIED",html_url:comment.html_url,created_at:comment.created_at,updated_at:comment.updated_at,candidate_sha:candidate,body_sha256:createHash("sha256").update(comment.body).digest("hex"),adjudicated:entries,unadjudicated:[]}}
  return {classification:"T086", candidate,base,mergeBase:base,frozenHash:frozen,sourceBlockers:report.blockers.source,comments:[comment],producerTrusted:true,requiredEvidenceFresh:true,report,decisionStartedAt:"2026-09-08T11:00:00Z",decisionCompletedAt:"2026-09-08T11:01:00Z",artifactCreatedAt:"2026-09-08T11:01:01Z"}
}

test("required T086 gate accepts only independently bound complete PASS", () => {
  assert.equal(requiredGateRuntime().evaluateSnapshot(requiredGateFixture()).decision, "PASS")
})

for (const [name, mutate] of [
  ["HOLD", s => {s.report.release_decision="HOLD"}],
  ["FAIL", s => {s.report.status="FAIL"}],
  ["UNKNOWN", s => {s.report.release_decision="UNKNOWN"}],
  ["missing report", s => {s.report=null}],
  ["untrusted producer", s => {s.producerTrusted=false}],
  ["unavailable evidence", s => {s.requiredEvidenceFresh=false}],
  ["stale head", s => {s.report.candidate_sha="3".repeat(40)}],
  ["stale protected base", s => {s.report.base.sha="3".repeat(40)}],
  ["stale merge base", s => {s.mergeBase="3".repeat(40)}],
  ["stale frozen hash", s => {s.frozenHash="3".repeat(64)}],
  ["deleted adjudication", s => {s.comments=[]}],
  ["spoofed owner", s => {s.comments[0].user.login="attacker"}],
  ["wrong association", s => {s.comments[0].author_association="CONTRIBUTOR"}],
  ["edited adjudication", s => {s.comments[0].updated_at="2026-09-08T12:00:00Z"}],
  ["new comment after decision", s => {s.comments[0].created_at=s.comments[0].updated_at="2026-09-08T12:00:00Z"}],
  ["incomplete blockers", s => {s.report.blockers.adjudicated=[]}],
  ["missing surface", s => {s.report.surfaces.required.pop()}],
  ["failed stability", s => {s.report.stability.result="FAIL"}],
  ["expanded scope", s => {s.report.scope_boundaries.web3_activated=true}],
  ["missing canonical digest", s => {delete s.report.adjudication.body_sha256}],
  ["missing artifact freshness", s => {s.artifactCreatedAt="2026-09-08T09:00:00Z"}]
]) {
  test("required T086 gate blocks " + name, () => {
    const s=requiredGateFixture(); mutate(s)
    assert.equal(requiredGateRuntime().evaluateSnapshot(s).decision, "HOLD")
  })
}

test("required T086 gate classifies only complete server-side non-T086 file lists", () => {
  const {classifyCandidate}=requiredGateRuntime()
  assert.equal(classifyCandidate(161,[{filename:"README.md"}],1),"T086")
  assert.equal(classifyCandidate(171,[{filename:"README.md"}],1),"NOT_APPLICABLE")
  assert.equal(classifyCandidate(171,[{filename:"renamed.txt",previous_filename:"scripts/validate-beta-release.mjs"}],1),"T086")
  assert.equal(classifyCandidate(171,[{filename:"README.md"}],2),"UNKNOWN")
  assert.equal(classifyCandidate(171,[],0),"UNKNOWN")
})

test("required T086 gate ignores spoofed new comments but treats owner marker removal as invalidation", () => {
  const {canonicalComment}=requiredGateRuntime(); const s=requiredGateFixture()
  assert.equal(canonicalComment([...s.comments,{...s.comments[0],id:999,user:{login:"attacker"}}]).id,987)
  assert.equal(canonicalComment([]),null)
})

const pnpmSecurityBase = "db19da68807bf2974e0b052f2ce5dbcf3accbab7"
const pnpmSecurityPr = 174
const pnpmSecurityBranch = "fix/pnpm-11-11-security"
const pnpmSecurityPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/security.yml",
  "Makefile",
  "apps/web/package.json",
  "package.json",
  "packages/api-client/package.json",
  "packages/content-schema/package.json",
  "packages/creative-runtime/package.json",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-traceability.mjs"
]
const pnpmSecurityOwnerBody =
  '<!-- toolchain173:owner-dispatch:v1:start -->\n```json\n{\n  "schema_version": "courtside-toolchain173-owner-dispatch/v1",\n  "decision": "DISPATCH_ACCEPTED",\n  "repository": "bynanci/courtside-tw",\n  "issue": 173,\n  "pr": 174,\n  "branch": "fix/pnpm-11-11-security",\n  "base_sha": "db19da68807bf2974e0b052f2ce5dbcf3accbab7",\n  "initial_seed": {\n    "head_sha": "b8c5b086955bebe87b73ff69bb89ef100aeee5c1",\n    "tree_sha": "53be27240b6097d0ac399bee743b5baa785ef66f",\n    "changed_paths": [\n      "package.json",\n      "Makefile",\n      "apps/web/package.json",\n      "packages/api-client/package.json",\n      "packages/content-schema/package.json",\n      "packages/creative-runtime/package.json",\n      ".github/workflows/ci.yml",\n      ".github/workflows/security.yml"\n    ]\n  },\n  "authorized_paths": [\n    ".github/workflows/ci.yml",\n    ".github/workflows/security.yml",\n    "Makefile",\n    "apps/web/package.json",\n    "package.json",\n    "packages/api-client/package.json",\n    "packages/content-schema/package.json",\n    "packages/creative-runtime/package.json",\n    "scripts/test/validate-traceability.test.mjs",\n    "scripts/validate-traceability.mjs"\n  ],\n  "target_toolchain": {\n    "node": "24.14.0",\n    "pnpm": "11.11.0",\n    "pnpm_engines": "11.11.x"\n  },\n  "allowed": [\n    "tests-first exact-scope authorization support",\n    "bounded implementation and reviewed causal optimization",\n    "draft and ready same-repository PR execution",\n    "one exact-head squash merge after current required CI/Security and review pass",\n    "authenticated same-tree single-parent squash-push readback"\n  ],\n  "invariants": [\n    "all frozen T085 receipt bytes preserved",\n    "README and tasks checkbox bytes preserved",\n    "no beta flag or release acceptance",\n    "no participant evidence fabrication or risk acceptance",\n    "no provider/production/credential/secret mutation",\n    "no unrelated workflow/script/path whitelist",\n    "post-seed commits linear and created after this dispatch"\n  ],\n  "user_instruction": "è«‹å¹«æˆ‘å°‡å‰©é¤˜çš„ä»»å‹™å®Œæˆ ,å®Œæˆå¾Œ@review ä¸¦ä¸” @optimize ï¼Œæœ€çµ‚å†ä¾ä½ çš„ç¶“é©—merge",\n  "authorization_source": "Explicit Mark instruction in the current conversation; recorded on his behalf for the bounded #173 successor scope."\n}\n```\n<!-- toolchain173:owner-dispatch:v1:end -->'
const pnpmSecurityOwnerRef =
  "https://github.com/bynanci/courtside-tw/issues/173#issuecomment-5594192010"
const pnpmSecurityOwnerTime = "2026-09-09T01:07:32Z"

function makePnpmSecurityFixture({ push = false, draft = true } = {}) {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = [...pnpmSecurityPaths]
  const head = push ? "3".repeat(40) : fixtureReceiptHead
  const gitBinding = {
    status: "CLEAN",
    head,
    change_base_ref: "fixture:pnpm-security-base",
    change_base_sha: pnpmSecurityBase,
    change_base_ancestor: true,
    head_parent_sha: pnpmSecurityBase,
    head_parent_shas: [pnpmSecurityBase],
    head_parent_count: 1,
    head_tree_sha: "a".repeat(40)
  }
  const readback = {
    status: "VERIFIED",
    source: "github-api",
    authorization: {
      status: "VERIFIED",
      source: "github-api",
      html_url: pnpmSecurityOwnerRef,
      issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/173",
      user_login: "bynanci",
      author_association: "OWNER",
      created_at: pnpmSecurityOwnerTime,
      updated_at: pnpmSecurityOwnerTime,
      body: pnpmSecurityOwnerBody
    },
    pull_request: {
      number: pnpmSecurityPr,
      html_url: `https://github.com/bynanci/courtside-tw/pull/${pnpmSecurityPr}`,
      state: push ? "closed" : "open",
      draft: push ? false : draft,
      merged: push,
      merged_at: push ? "2026-09-09T12:00:00Z" : null,
      merge_commit_sha: push ? head : null,
      head: {
        sha: fixtureReceiptHead,
        ref: pnpmSecurityBranch,
        repo: { full_name: "bynanci/courtside-tw" }
      },
      base: { sha: pnpmSecurityBase, ref: "main", repo: { full_name: "bynanci/courtside-tw" } }
    },
    candidate: {
      head: fixtureReceiptHead,
      tree_sha: "a".repeat(40),
      base_ancestor: true,
      seed_ancestor: true,
      seed_tree_sha: "53be27240b6097d0ac399bee743b5baa785ef66f",
      seed_parent_shas: [pnpmSecurityBase],
      commit_count: 2,
      merge_commit_count: 0,
      changed_paths: [...pnpmSecurityPaths],
      history_paths: [...pnpmSecurityPaths],
      pin_replacements_match: true,
      commits_postdate_authorization: true
    }
  }
  const eventPath = path.join(fixture.root, "github-pnpm-security-event.json")
  fs.writeFileSync(
    eventPath,
    JSON.stringify(
      push
        ? {
            repository: { full_name: "bynanci/courtside-tw" },
            ref: "refs/heads/main",
            before: pnpmSecurityBase,
            after: head
          }
        : {
            repository: { full_name: "bynanci/courtside-tw" },
            number: pnpmSecurityPr,
            pull_request: readback.pull_request
          }
    )
  )
  const githubActionsContext = traceabilityValidator.inspectGitHubActionsContext({
    environment: {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "bynanci/courtside-tw",
      GITHUB_EVENT_NAME: push ? "push" : "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SHA: push ? head : fixtureActionsMergeSha,
      GITHUB_WORKFLOW: "CI",
      GITHUB_JOB: "frontend-contract",
      GITHUB_RUN_ID: fixtureActionsRunId,
      GITHUB_RUN_NUMBER: fixtureActionsRunNumber,
      GITHUB_RUN_ATTEMPT: fixtureActionsRunAttempt,
      GITHUB_REF: push ? "refs/heads/main" : `refs/pull/${pnpmSecurityPr}/merge`,
      GITHUB_REF_NAME: push ? "main" : `${pnpmSecurityPr}/merge`,
      GITHUB_BASE_REF: push ? "" : "main",
      GITHUB_HEAD_REF: push ? "" : pnpmSecurityBranch
    },
    gitBinding
  })
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return { fixture, gitBinding, readback, githubActionsContext, head }
}

function runPnpmSecurityFixture(context, overrides = {}) {
  return runCompletedFixture(context.fixture, {
    currentHead: context.head,
    changeBaseSha: pnpmSecurityBase,
    evaluatedHeadCommittedAt: "2026-09-09T12:00:00Z",
    pnpmSecurityAuthorizationReadback: context.readback,
    requireExactHeadEvidence: true,
    githubActionsContext: context.githubActionsContext,
    gitBinding: context.gitBinding,
    ...overrides
  })
}

for (const state of ["draft", "ready", "squash-push"]) {
  test(`pnpm security authorization accepts exact ${state} candidate without changing frozen tasks`, () => {
    const context = makePnpmSecurityFixture({
      push: state === "squash-push",
      draft: state === "draft"
    })
    const report = runPnpmSecurityFixture(context)
    assert.equal(report.status, "PASS", report.errors.join("\n"))
    assert.deepEqual(report.scope_validation.unauthorized_paths, [])
    assert.equal(report.source.pnpm_security_authorization_readback.accepted, true)
  })
}

const pnpmSecurityReadbackNearMisses = [
  [
    "unavailable API",
    (r) => {
      r.status = "UNAVAILABLE"
    }
  ],
  [
    "wrong comment ref",
    (r) => {
      r.authorization.html_url += "0"
    }
  ],
  [
    "wrong issue",
    (r) => {
      r.authorization.issue_url = "https://api.github.com/repos/bynanci/courtside-tw/issues/121"
    }
  ],
  [
    "edited comment",
    (r) => {
      r.authorization.updated_at = "2026-09-10T00:00:00Z"
    }
  ],
  [
    "edited body",
    (r) => {
      r.authorization.body += "\n"
    }
  ],
  [
    "spoofed owner",
    (r) => {
      r.authorization.user_login = "attacker"
    }
  ],
  [
    "non-owner association",
    (r) => {
      r.authorization.author_association = "MEMBER"
    }
  ],
  [
    "wrong PR",
    (r) => {
      r.pull_request.number += 1
    }
  ],
  [
    "wrong branch",
    (r) => {
      r.pull_request.head.ref = "fix/unrelated"
    }
  ],
  [
    "wrong base",
    (r) => {
      r.pull_request.base.sha = "b".repeat(40)
    }
  ],
  [
    "fork head",
    (r) => {
      r.pull_request.head.repo.full_name = "attacker/courtside-tw"
    }
  ],
  [
    "stale head",
    (r) => {
      r.pull_request.head.sha = "b".repeat(40)
    }
  ],
  [
    "closed unmerged",
    (r) => {
      r.pull_request.state = "closed"
    }
  ],
  [
    "missing draft",
    (r) => {
      r.pull_request.draft = null
    }
  ],
  [
    "missing seed ancestry",
    (r) => {
      r.candidate.seed_ancestor = false
    }
  ],
  [
    "wrong seed tree",
    (r) => {
      r.candidate.seed_tree_sha = "b".repeat(40)
    }
  ],
  [
    "wrong seed parent",
    (r) => {
      r.candidate.seed_parent_shas = ["b".repeat(40)]
    }
  ],
  [
    "no base ancestry",
    (r) => {
      r.candidate.base_ancestor = false
    }
  ],
  [
    "merge commit",
    (r) => {
      r.candidate.merge_commit_count = 1
    }
  ],
  [
    "empty history",
    (r) => {
      r.candidate.commit_count = 0
    }
  ],
  [
    "restored unauthorized path",
    (r) => {
      r.candidate.history_paths.push("apps/web/unrelated.ts")
    }
  ],
  [
    "candidate missing path",
    (r) => {
      r.candidate.changed_paths.pop()
    }
  ],
  [
    "candidate changed tree",
    (r) => {
      r.candidate.tree_sha = "b".repeat(40)
    }
  ],
  [
    "pin file scope expansion",
    (r) => {
      r.candidate.pin_replacements_match = false
    }
  ],
  [
    "predated implementation",
    (r) => {
      r.candidate.commits_postdate_authorization = false
    }
  ]
]
for (const [name, mutate] of pnpmSecurityReadbackNearMisses) {
  test(`pnpm security authorization rejects ${name}`, () => {
    const context = makePnpmSecurityFixture()
    mutate(context.readback)
    const report = runPnpmSecurityFixture(context)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /pnpm security/u)
  })
}

for (const [name, mutate] of [
  [
    "non-squash parents",
    (c) => {
      c.gitBinding.head_parent_count = 2
      c.gitBinding.head_parent_shas.push(fixtureReceiptHead)
    }
  ],
  [
    "wrong squash parent",
    (c) => {
      c.gitBinding.head_parent_shas = ["b".repeat(40)]
    }
  ],
  [
    "unmerged PR",
    (c) => {
      c.readback.pull_request.merged = false
    }
  ],
  [
    "wrong merge SHA",
    (c) => {
      c.readback.pull_request.merge_commit_sha = "b".repeat(40)
    }
  ],
  [
    "squash tree drift",
    (c) => {
      c.gitBinding.head_tree_sha = "b".repeat(40)
    }
  ],
  [
    "squash before authorization",
    (c) => {
      c.readback.pull_request.merged_at = "2026-08-01T00:00:00Z"
    }
  ]
]) {
  test(`pnpm security authorization rejects ${name}`, () => {
    const context = makePnpmSecurityFixture({ push: true })
    mutate(context)
    const report = runPnpmSecurityFixture(context)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /pnpm security/u)
  })
}

test("pnpm security authorization rejects missing authority, wrong event, base and extra or removed paths", () => {
  const context = makePnpmSecurityFixture()
  for (const overrides of [
    { pnpmSecurityAuthorizationReadback: null },
    { githubActionsContext: { ...context.githubActionsContext } },
    { requireExactHeadEvidence: false },
    { changeBaseSha: "b".repeat(40) },
    { changedPaths: [...pnpmSecurityPaths, "apps/web/unrelated.ts"] },
    {
      changedPaths: [
        "scripts/validate-traceability.mjs",
        "scripts/test/validate-traceability.test.mjs"
      ]
    }
  ]) {
    const report = runPnpmSecurityFixture(context, overrides)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /pnpm security/u)
  }
})

test("pnpm security CLI read-back uses only the fixed PR and exact owner comment", () => {
  const context = makePnpmSecurityFixture()
  const environment = { GITHUB_TOKEN: "fixture-not-a-real-token" }
  const calls = []
  const readback = traceabilityValidator.inspectPnpmSecurityAuthorization(context.fixture.root, {
    environment,
    inspectComment(ref, options) {
      calls.push("comment")
      assert.equal(ref, pnpmSecurityOwnerRef)
      assert.equal(options.environment, environment)
      assert.equal(options.isAuthorizedRef(ref), true)
      assert.equal(options.isAuthorizedRef(`${ref}0`), false)
      return context.readback.authorization
    },
    fetchPr(url) {
      calls.push("pr")
      assert.equal(url, "https://api.github.com/repos/bynanci/courtside-tw/pulls/174")
      return context.readback.pull_request
    },
    inspectCandidate(root, head) {
      calls.push("git")
      assert.equal(root, context.fixture.root)
      assert.equal(head, context.readback.pull_request.head.sha)
      return context.readback.candidate
    }
  })
  assert.deepEqual(calls, ["comment", "pr", "git"])
  assert.equal(readback.status, "VERIFIED")
  const report = runPnpmSecurityFixture(context, { pnpmSecurityAuthorizationReadback: readback })
  assert.equal(report.status, "PASS", report.errors.join("\n"))
})

test("pnpm security CLI fails closed on PR API failure without exposing credential errors", () => {
  const context = makePnpmSecurityFixture()
  const readback = traceabilityValidator.inspectPnpmSecurityAuthorization(context.fixture.root, {
    inspectComment: () => context.readback.authorization,
    fetchPr() {
      throw new Error("fixture-secret-must-not-be-reported")
    },
    inspectCandidate() {
      assert.fail("must not inspect an unavailable PR")
    }
  })
  assert.equal(readback.status, "UNAVAILABLE")
  assert.doesNotMatch(JSON.stringify(readback), /fixture-secret-must-not-be-reported/u)
  const report = runPnpmSecurityFixture(context, { pnpmSecurityAuthorizationReadback: readback })
  assert.equal(report.status, "FAIL")
})

for (const [name, mutateEvent] of [
  [
    "spoofed repository",
    (event) => {
      event.repository.full_name = "attacker/courtside-tw"
    }
  ],
  [
    "wrong PR number",
    (event) => {
      event.number = 175
    }
  ],
  [
    "stale PR head",
    (event) => {
      event.pull_request.head.sha = "b".repeat(40)
    }
  ],
  [
    "wrong PR event base",
    (event) => {
      event.pull_request.base.sha = "b".repeat(40)
    }
  ]
]) {
  test(`pnpm security rejects actual Actions event with ${name}`, () => {
    const context = makePnpmSecurityFixture()
    const eventPath = path.join(context.fixture.root, "github-pnpm-security-event.json")
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"))
    mutateEvent(event)
    fs.writeFileSync(eventPath, JSON.stringify(event))
    const githubActionsContext = traceabilityValidator.inspectGitHubActionsContext({
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
        GITHUB_REF: "refs/pull/174/merge",
        GITHUB_BASE_REF: "main",
        GITHUB_HEAD_REF: pnpmSecurityBranch
      },
      gitBinding: context.gitBinding
    })
    const report = runPnpmSecurityFixture(context, { githubActionsContext })
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /pnpm security/u)
  })
}

const productRemediationBase = "74d3b6dfba087394a3e522252dc4a8cf5e1b3f0d"
const productRemediationPr = 175
const productRemediationBranch = "fix/t086-product-remediation"
const productRemediationPaths = [
  "apps/api/src/main/java/tw/basketball/magazine/identity/OidcSecurityConfiguration.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialIssueController.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/application/EditorialIssueService.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/persistence/JdbcEditorialIssueRepository.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/worker/IssuePublicationJobHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationInvalidationKeys.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationWorkerConfiguration.java",
  "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitFilter.java",
  "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitPolicy.java",
  "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimiter.java",
  "apps/api/src/main/java/tw/basketball/magazine/security/SecurityBoundaryConfiguration.java",
  "apps/api/src/test/java/tw/basketball/magazine/identity/OidcRoleMatrixTest.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialIssueApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/api/PublicationAcceptanceApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java",
  "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitFilterTest.java",
  "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitHttpIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimiterTest.java",
  "apps/web/server/auth/rate-limit.ts",
  "apps/web/server/middleware/auth.ts",
  "apps/web/tests/e2e/us1-browse-issue.spec.ts",
  "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",
  "apps/web/tests/e2e/us2-no-js.spec.ts",
  "apps/web/tests/integration/auth-rate-limit.test.ts",
  "contracts/openapi.yaml",
  "packages/api-client/src/generated/openapi.d.ts",
  "scripts/test/validate-traceability.test.mjs",
  "scripts/validate-openapi.mjs",
  "scripts/validate-traceability.mjs"
]
const productRemediationOptionalPaths = [
  "apps/api/src/main/java/tw/basketball/magazine/content/EditorialContributorConfiguration.java",
  "apps/api/src/main/java/tw/basketball/magazine/content/api/EditorialContributorController.java",
  "apps/api/src/main/java/tw/basketball/magazine/content/application/EditorialContributorService.java",
  "apps/api/src/main/java/tw/basketball/magazine/identity/SecurityAuditConfiguration.java",
  "apps/api/src/main/java/tw/basketball/magazine/identity/SecurityAuditFilter.java",
  "apps/api/src/main/java/tw/basketball/magazine/identity/VerifiedRoleAuditService.java",
  "apps/api/src/main/java/tw/basketball/magazine/identity/api/AccountApiExceptionHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/media/MediaRevocationWorkerConfiguration.java",
  "apps/api/src/main/java/tw/basketball/magazine/media/application/MediaRevocationHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/media/application/PublisherMediaService.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialApiExceptionHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/publication/application/OfflineManifestService.java",
  "apps/api/src/main/java/tw/basketball/magazine/readerlibrary/api/ReaderLibraryApiExceptionHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/shared/ApiExceptionHandler.java",
  "apps/api/src/main/java/tw/basketball/magazine/taxonomy/api/TaxonomyApiExceptionHandler.java",
  "apps/api/src/main/resources/db/migration/V016__editorial_contributors_and_identity_audit.sql",
  "apps/api/src/main/resources/db/migration/V017__asset_revocation_withdrawal_cursor.sql",
  "apps/api/src/test/java/tw/basketball/magazine/content/api/EditorialContributorApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/editorial/EditorialApiIntegrationTestSupport.java",
  "apps/api/src/test/java/tw/basketball/magazine/identity/SecurityAuditFilterTest.java",
  "apps/api/src/test/java/tw/basketball/magazine/identity/VerifiedRoleAuditServiceIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/media/api/PublisherMediaRevokeApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/media/application/MediaRevocationHandlerIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIntegrationTestSupport.java",
  "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialCrudAcceptanceApiIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiConcurrencyIT.java",
  "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiContractTest.java",
  "apps/web/app/components/content-blocks/creative/P5CanvasHost.vue",
  "apps/web/app/features/offline/services/OfflineIssueManager.ts",
  "apps/web/scripts/android-chrome-performance-smoke.mjs",
  "apps/web/scripts/android-creative-timeline.mjs",
  "apps/web/tests/unit/android-creative-timeline.test.ts",
  "apps/web/tests/unit/offline-issue-manager.test.ts"
]
const productRemediationOwnerBody =
  '<!-- product175:owner-dispatch:v1:start -->\n## Bounded P1 product remediation authorization\n\nCanonical successor to comment #5594575189. All prior records remain immutable historical snapshots and cannot replace this canonical record. This record accepts the exact previously authorized test-only RED commit as a reviewable pre-successor snapshot; it does not backdate authorization or allow any other predated implementation. The completed dependency audit fixes the scope at 31 required and 33 optional code/test paths. The user\'s explicit completion/review/optimization/merge instruction is quoted below. Frozen release evidence, real human/provider prerequisites and protections remain in force.\n\n```json\n{\n  "allowed": [\n    "Implement and test the bounded P1 editorial, publication, asset withdrawal, identity, API contract, reader fallback and Android reliability remediation in the closed path union.",\n    "Create draft commits, run exact-head CI, conduct independent review, optimize accepted findings, mark ready, and perform one exact-head squash merge after required checks and thread resolution pass.",\n    "The named initial seed and exact accepted predecessor RED test commit are explicitly accepted as reviewable pre-dispatch snapshots. Every commit after that exact predecessor must form a linear history and postdate this immutable canonical dispatch. No other predated implementation is authorized."\n  ],\n  "authorization_source": "Recorded by the assistant through the owner\'s connected GitHub account on behalf of the user\'s explicit current-session instruction quoted above. This records actual session authorization, not a separate human acceptance of release blockers.",\n  "base_sha": "74d3b6dfba087394a3e522252dc4a8cf5e1b3f0d",\n  "branch": "fix/t086-product-remediation",\n  "decision": "DISPATCH_ACCEPTED",\n  "initial_seed": {\n    "changed_paths": [\n      "apps/api/src/main/java/tw/basketball/magazine/identity/OidcSecurityConfiguration.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialIssueController.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/application/EditorialIssueService.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/persistence/JdbcEditorialIssueRepository.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/worker/IssuePublicationJobHandler.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationInvalidationKeys.java",\n      "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationWorkerConfiguration.java",\n      "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitFilter.java",\n      "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitPolicy.java",\n      "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimiter.java",\n      "apps/api/src/main/java/tw/basketball/magazine/security/SecurityBoundaryConfiguration.java",\n      "apps/api/src/test/java/tw/basketball/magazine/identity/OidcRoleMatrixTest.java",\n      "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",\n      "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialIssueApiIT.java",\n      "apps/api/src/test/java/tw/basketball/magazine/publication/api/PublicationAcceptanceApiIT.java",\n      "apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java",\n      "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",\n      "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitFilterTest.java",\n      "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitHttpIT.java",\n      "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimiterTest.java",\n      "apps/web/server/auth/rate-limit.ts",\n      "apps/web/server/middleware/auth.ts",\n      "apps/web/tests/e2e/us1-browse-issue.spec.ts",\n      "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",\n      "apps/web/tests/e2e/us2-no-js.spec.ts",\n      "apps/web/tests/integration/auth-rate-limit.test.ts",\n      "contracts/openapi.yaml",\n      "packages/api-client/src/generated/openapi.d.ts",\n      "scripts/validate-openapi.mjs"\n    ],\n    "head_sha": "c90270157e50a1fd8c0abc2a700d22f2481fa7f9",\n    "tree_sha": "6e130341bd03972acd4133679aea3063838abff8"\n  },\n  "invariants": [\n    "Preserve frozen T085 traceability, dispatch, acceptance and task checkbox bytes.",\n    "Do not claim T086 beta PASS, close unrelated tasks, disable the beta flag, or infer human-study/rights/provider acceptance.",\n    "Do not weaken branch rules, test assertions, required contexts, workflow permissions, dependency pins, or existing authorization scopes.",\n    "On a PR event bind live protected main to the exact base; on actual push require the matching merged PR, event.before, single parent, identical final tree and live protected main at the squash SHA.",\n    "Every required path remains changed; optional amendments are restricted to the explicit path list; every historical changed path remains inside that closed union."\n  ],\n  "issue": 121,\n  "optional_amendment_paths": [\n    "apps/api/src/main/java/tw/basketball/magazine/content/EditorialContributorConfiguration.java",\n    "apps/api/src/main/java/tw/basketball/magazine/content/api/EditorialContributorController.java",\n    "apps/api/src/main/java/tw/basketball/magazine/content/application/EditorialContributorService.java",\n    "apps/api/src/main/java/tw/basketball/magazine/identity/SecurityAuditConfiguration.java",\n    "apps/api/src/main/java/tw/basketball/magazine/identity/SecurityAuditFilter.java",\n    "apps/api/src/main/java/tw/basketball/magazine/identity/VerifiedRoleAuditService.java",\n    "apps/api/src/main/java/tw/basketball/magazine/identity/api/AccountApiExceptionHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/media/MediaRevocationWorkerConfiguration.java",\n    "apps/api/src/main/java/tw/basketball/magazine/media/application/MediaRevocationHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/media/application/PublisherMediaService.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialApiExceptionHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/application/OfflineManifestService.java",\n    "apps/api/src/main/java/tw/basketball/magazine/readerlibrary/api/ReaderLibraryApiExceptionHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/shared/ApiExceptionHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/taxonomy/api/TaxonomyApiExceptionHandler.java",\n    "apps/api/src/main/resources/db/migration/V016__editorial_contributors_and_identity_audit.sql",\n    "apps/api/src/main/resources/db/migration/V017__asset_revocation_withdrawal_cursor.sql",\n    "apps/api/src/test/java/tw/basketball/magazine/content/api/EditorialContributorApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/editorial/EditorialApiIntegrationTestSupport.java",\n    "apps/api/src/test/java/tw/basketball/magazine/identity/SecurityAuditFilterTest.java",\n    "apps/api/src/test/java/tw/basketball/magazine/identity/VerifiedRoleAuditServiceIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/media/api/PublisherMediaRevokeApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/media/application/MediaRevocationHandlerIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIntegrationTestSupport.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialCrudAcceptanceApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiConcurrencyIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/shared/WriteApiContractTest.java",\n    "apps/web/app/components/content-blocks/creative/P5CanvasHost.vue",\n    "apps/web/app/features/offline/services/OfflineIssueManager.ts",\n    "apps/web/scripts/android-chrome-performance-smoke.mjs",\n    "apps/web/scripts/android-creative-timeline.mjs",\n    "apps/web/tests/unit/android-creative-timeline.test.ts",\n    "apps/web/tests/unit/offline-issue-manager.test.ts"\n  ],\n  "pr": 175,\n  "repository": "bynanci/courtside-tw",\n  "required_paths": [\n    "apps/api/src/main/java/tw/basketball/magazine/identity/OidcSecurityConfiguration.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/api/EditorialIssueController.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/application/EditorialIssueService.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/persistence/JdbcEditorialIssueRepository.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/worker/IssuePublicationJobHandler.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationInvalidationKeys.java",\n    "apps/api/src/main/java/tw/basketball/magazine/publication/worker/PublicationWorkerConfiguration.java",\n    "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitFilter.java",\n    "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimitPolicy.java",\n    "apps/api/src/main/java/tw/basketball/magazine/security/RouteRateLimiter.java",\n    "apps/api/src/main/java/tw/basketball/magazine/security/SecurityBoundaryConfiguration.java",\n    "apps/api/src/test/java/tw/basketball/magazine/identity/OidcRoleMatrixTest.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/PublicIssueApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/api/EditorialIssueApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/api/PublicationAcceptanceApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/publication/domain/PublicationWorkflowTest.java",\n    "apps/api/src/test/java/tw/basketball/magazine/readerlibrary/ReaderLibraryApiIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitFilterTest.java",\n    "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimitHttpIT.java",\n    "apps/api/src/test/java/tw/basketball/magazine/security/RouteRateLimiterTest.java",\n    "apps/web/server/auth/rate-limit.ts",\n    "apps/web/server/middleware/auth.ts",\n    "apps/web/tests/e2e/us1-browse-issue.spec.ts",\n    "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts",\n    "apps/web/tests/e2e/us2-no-js.spec.ts",\n    "apps/web/tests/integration/auth-rate-limit.test.ts",\n    "contracts/openapi.yaml",\n    "packages/api-client/src/generated/openapi.d.ts",\n    "scripts/test/validate-traceability.test.mjs",\n    "scripts/validate-openapi.mjs",\n    "scripts/validate-traceability.mjs"\n  ],\n  "schema_version": "courtside-t086-product-remediation-owner-dispatch/v1",\n  "supersedes_comment": 5594575189,\n  "user_instruction": "è«‹å¹«æˆ‘å°‡å‰©é¤˜çš„ä»»å‹™å®Œæˆ ,å®Œæˆå¾Œ@review ä¸¦ä¸” @optimize ï¼Œæœ€çµ‚å†ä¾ä½ çš„ç¶“é©—merge",\n  "predecessor_authorization": {\n    "ref": "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5594498950",\n    "body_sha256": "4e9dcc96b44fb04fc1b015bb24e444f49959f5c26f708c8e0ce9019472790867",\n    "recorded_at": "2026-09-09T01:44:34Z"\n  },\n  "accepted_predecessor_commit": {\n    "head_sha": "6eeb96fe7d5b0c25a631d45ccfe8db5b31fbe94b",\n    "tree_sha": "100e9a650d9fe7e5958571729a29bd4ab62744d5",\n    "parent_sha": "c90270157e50a1fd8c0abc2a700d22f2481fa7f9",\n    "changed_paths": [\n      "scripts/test/validate-traceability.test.mjs"\n    ]\n  }\n}\n```\n<!-- product175:owner-dispatch:v1:end -->'
const productRemediationOwnerRef =
  "https://github.com/bynanci/courtside-tw/issues/121#issuecomment-5594585089"
const productRemediationOwnerTime = "2026-09-09T01:55:20Z"

function makeProductRemediationFixture({ push = false, draft = true } = {}) {
  const fixture = makeCompletedFixture()
  fixture.changedPaths = [...productRemediationPaths]
  const head = push ? "3".repeat(40) : fixtureReceiptHead
  const gitBinding = {
    status: "CLEAN",
    head,
    change_base_ref: "fixture:product-remediation-base",
    change_base_sha: productRemediationBase,
    change_base_ancestor: true,
    head_parent_sha: productRemediationBase,
    head_parent_shas: [productRemediationBase],
    head_parent_count: 1,
    head_tree_sha: "a".repeat(40)
  }
  const readback = {
    status: "VERIFIED",
    source: "github-api",
    authorization: {
      status: "VERIFIED",
      source: "github-api",
      html_url: productRemediationOwnerRef,
      issue_url: "https://api.github.com/repos/bynanci/courtside-tw/issues/121",
      user_login: "bynanci",
      author_association: "OWNER",
      created_at: productRemediationOwnerTime,
      updated_at: productRemediationOwnerTime,
      body: productRemediationOwnerBody
    },
    protected_main: {
      name: "main",
      protected: true,
      commit: { sha: push ? head : productRemediationBase }
    },
    pull_request: {
      number: productRemediationPr,
      html_url: `https://github.com/bynanci/courtside-tw/pull/${productRemediationPr}`,
      state: push ? "closed" : "open",
      draft: push ? false : draft,
      merged: push,
      merged_at: push ? "2026-09-09T12:00:00Z" : null,
      merge_commit_sha: push ? head : null,
      head: {
        sha: fixtureReceiptHead,
        ref: productRemediationBranch,
        repo: { full_name: "bynanci/courtside-tw" }
      },
      base: {
        sha: productRemediationBase,
        ref: "main",
        repo: { full_name: "bynanci/courtside-tw" }
      }
    },
    candidate: {
      head: fixtureReceiptHead,
      tree_sha: "a".repeat(40),
      base_ancestor: true,
      seed_ancestor: true,
      accepted_red_ancestor: true,
      accepted_red_tree_sha: "100e9a650d9fe7e5958571729a29bd4ab62744d5",
      accepted_red_parent_shas: ["c90270157e50a1fd8c0abc2a700d22f2481fa7f9"],
      accepted_red_changed_paths: ["scripts/test/validate-traceability.test.mjs"],
      seed_tree_sha: "6e130341bd03972acd4133679aea3063838abff8",
      seed_parent_shas: [productRemediationBase],
      commit_count: 2,
      merge_commit_count: 0,
      changed_paths: [...productRemediationPaths],
      history_paths: [...productRemediationPaths],
      seed_changed_paths: productRemediationPaths.filter(
        (p) =>
          ![
            "scripts/validate-traceability.mjs",
            "scripts/test/validate-traceability.test.mjs"
          ].includes(p)
      ),
      frozen_blobs_match: true,
      allowed_path_modes_match: true,
      commits_postdate_authorization: true
    }
  }
  const eventPath = path.join(fixture.root, "github-product-remediation-event.json")
  fs.writeFileSync(
    eventPath,
    JSON.stringify(
      push
        ? {
            repository: { full_name: "bynanci/courtside-tw" },
            ref: "refs/heads/main",
            before: productRemediationBase,
            after: head
          }
        : {
            repository: { full_name: "bynanci/courtside-tw" },
            number: productRemediationPr,
            pull_request: readback.pull_request
          }
    )
  )
  const githubActionsContext = traceabilityValidator.inspectGitHubActionsContext({
    environment: {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "bynanci/courtside-tw",
      GITHUB_EVENT_NAME: push ? "push" : "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SHA: push ? head : fixtureActionsMergeSha,
      GITHUB_WORKFLOW: "CI",
      GITHUB_JOB: "frontend-contract",
      GITHUB_RUN_ID: fixtureActionsRunId,
      GITHUB_RUN_NUMBER: fixtureActionsRunNumber,
      GITHUB_RUN_ATTEMPT: fixtureActionsRunAttempt,
      GITHUB_REF: push ? "refs/heads/main" : `refs/pull/${productRemediationPr}/merge`,
      GITHUB_REF_NAME: push ? "main" : `${productRemediationPr}/merge`,
      GITHUB_BASE_REF: push ? "" : "main",
      GITHUB_HEAD_REF: push ? "" : productRemediationBranch
    },
    gitBinding
  })
  writeExactHeadForActionsContext(fixture.root, githubActionsContext)
  return { fixture, gitBinding, readback, githubActionsContext, head }
}

function runProductRemediationFixture(context, overrides = {}) {
  return runCompletedFixture(context.fixture, {
    currentHead: context.head,
    changeBaseSha: productRemediationBase,
    evaluatedHeadCommittedAt: "2026-09-09T12:00:00Z",
    productRemediationAuthorizationReadback: context.readback,
    requireExactHeadEvidence: true,
    githubActionsContext: context.githubActionsContext,
    gitBinding: context.gitBinding,
    ...overrides
  })
}

for (const state of ["draft", "ready", "squash-push"]) {
  test(`product remediation authorization accepts exact ${state} candidate without changing frozen tasks`, () => {
    const context = makeProductRemediationFixture({
      push: state === "squash-push",
      draft: state === "draft"
    })
    const report = runProductRemediationFixture(context)
    assert.equal(report.status, "PASS", report.errors.join("\n"))
    assert.deepEqual(report.scope_validation.unauthorized_paths, [])
    assert.equal(report.source.product_remediation_authorization_readback.accepted, true)
  })
}

const productRemediationReadbackNearMisses = [
  [
    "unavailable API",
    (r) => {
      r.status = "UNAVAILABLE"
    }
  ],
  [
    "wrong comment ref",
    (r) => {
      r.authorization.html_url += "0"
    }
  ],
  [
    "wrong issue",
    (r) => {
      r.authorization.issue_url = "https://api.github.com/repos/bynanci/courtside-tw/issues/173"
    }
  ],
  [
    "edited comment",
    (r) => {
      r.authorization.updated_at = "2026-09-10T00:00:00Z"
    }
  ],
  [
    "edited body",
    (r) => {
      r.authorization.body += "\n"
    }
  ],
  [
    "spoofed owner",
    (r) => {
      r.authorization.user_login = "attacker"
    }
  ],
  [
    "non-owner association",
    (r) => {
      r.authorization.author_association = "MEMBER"
    }
  ],
  [
    "wrong PR",
    (r) => {
      r.pull_request.number += 1
    }
  ],
  [
    "wrong branch",
    (r) => {
      r.pull_request.head.ref = "fix/unrelated"
    }
  ],
  [
    "wrong base",
    (r) => {
      r.pull_request.base.sha = "b".repeat(40)
    }
  ],
  [
    "fork head",
    (r) => {
      r.pull_request.head.repo.full_name = "attacker/courtside-tw"
    }
  ],
  [
    "stale head",
    (r) => {
      r.pull_request.head.sha = "b".repeat(40)
    }
  ],
  [
    "closed unmerged",
    (r) => {
      r.pull_request.state = "closed"
    }
  ],
  [
    "missing draft",
    (r) => {
      r.pull_request.draft = null
    }
  ],
  [
    "missing seed ancestry",
    (r) => {
      r.candidate.seed_ancestor = false
    }
  ],
  [
    "wrong seed tree",
    (r) => {
      r.candidate.seed_tree_sha = "b".repeat(40)
    }
  ],
  [
    "wrong seed parent",
    (r) => {
      r.candidate.seed_parent_shas = ["b".repeat(40)]
    }
  ],
  [
    "no base ancestry",
    (r) => {
      r.candidate.base_ancestor = false
    }
  ],
  [
    "merge commit",
    (r) => {
      r.candidate.merge_commit_count = 1
    }
  ],
  [
    "empty history",
    (r) => {
      r.candidate.commit_count = 0
    }
  ],
  [
    "restored unauthorized path",
    (r) => {
      r.candidate.history_paths.push("apps/web/unrelated.ts")
    }
  ],
  [
    "candidate missing path",
    (r) => {
      r.candidate.changed_paths.pop()
    }
  ],
  [
    "candidate changed tree",
    (r) => {
      r.candidate.tree_sha = "b".repeat(40)
    }
  ],
  [
    "changed frozen blob",
    (r) => {
      r.candidate.frozen_blobs_match = false
    }
  ],
  [
    "predated implementation",
    (r) => {
      r.candidate.commits_postdate_authorization = false
    }
  ]
]
for (const [name, mutate] of productRemediationReadbackNearMisses) {
  test(`product remediation authorization rejects ${name}`, () => {
    const context = makeProductRemediationFixture()
    mutate(context.readback)
    const report = runProductRemediationFixture(context)
    assert.equal(report.status, "FAIL")
    assert.match(report.errors.join("\n"), /product remediation/u)
  })
}

for (const [name, mutate] of [
  [
    "non-squash parents",
    (c) => {
      c.gitBinding.head_parent_count = 2
      c.gitBinding.head_parent_shas.push(fixtureReceiptHead)
    }
  ],
  [
    "wrong squash parent",
    (c) => {
      c.gitBinding.head_parent_shas = ["b".repeat(40)]
    }
  ],
  [
    "unmerged PR",
    (c) => {
      c.readback.pull_request.merged = false
    }
  ],
  [
    "wrong mfÚ±î¸Â¸­yêë¢°k¢G§¦*^W&vR4„"À¢†2’Óâ°¢2ç&VF&6²çVÆÅ÷&WVW7BæÖW&vUö6öÖÖ—E÷6†Ò&""ç&WVBƒC¢Ð¢ÒÀ¢°¢'7V6‚G&VRG&–gB"À¢†2’Óâ°¢2æv—D&–æF–æræ†VE÷G&VU÷6†Ò&""ç&WVBƒC¢Ð¢ÒÀ¢°¢'7V6‚&Vf÷&RWF†÷&—¦F–öâ"À¢†2’Óâ°¢2ç&VF&6²çVÆÅ÷&WVW7BæÖW&vVEöBÒ###bÓ‚ÓC££¢ ¢Ð¢Ð¥Ò’°¢FW7B†&öGV7B&VÖVF–F–öâWF†÷&—¦F–öâ&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‡²W6ƒ¢G'VRÒ¢×WFFR†6öçFW‡B¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&öGV7B&VÖVF–F–öâ÷R¢Ò§Ð §FW7B‚'&öGV7B&VÖVF–F–öâWF†÷&—¦F–öâ&V¦V7G2Ö—76–ærWF†÷&—G’Âw&öærWfVçBÂ&6RæBW‡G&÷"&VÖ÷fVBF‡2"Â‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢f÷"†6öç7B÷fW'&–FW2öb°¢²&öGV7E&VÖVF–F–öäWF†÷&—¦F–öå&VF&6³¢çVÆÂÒÀ¢²v—F‡V$7F–öç46öçFW‡C¢²ââæ6öçFW‡Bæv—F‡V$7F–öç46öçFW‡BÒÒÀ¢²&WV—&TW†7D†VDWf–FVæ6S¢fÇ6RÒÀ¢²6†ævT&6U6†¢&""ç&WVBƒC’ÒÀ¢²6†ævVEF‡3¢²ââç&öGV7E&VÖVF–F–öåF‡2Â&2÷vV"÷Vç&VÆFVBçG2%ÒÒÀ¢°¢6†ævVEF‡3¢°¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2 ¢Ð¢Ð¢Ò’°¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡BÂ÷fW'&–FW2¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&öGV7B&VÖVF–F–öâ÷R¢Ð§Ò §FW7B‚'&öGV7B&VÖVF–F–öâ4Ä’&VBÖ&6²W6W2öæÇ’F†Rf—†VB"æBW†7B÷væW"6öÖÖVçB"Â‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öç7BVçf—&öæÖVçBÒ²t•D…T%õDô´Tã¢&f—‡GW&RÖæ÷BÖ×&VÂ×Fö¶Vâ"Ð¢6öç7B6ÆÇ2ÒµÐ¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäWF†÷&—¦F–öâ€¢6öçFW‡Bæf—‡GW&Rç&ö÷BÀ¢°¢Vçf—&öæÖVçBÀ¢–ç7V7D6öÖÖVçB‡&VbÂ÷F–öç2’°¢6ÆÇ2çW6‚‚&6öÖÖVçB"¢76W'BæWVÂ‡&VbÂ&öGV7E&VÖVF–F–öä÷væW%&Vb¢76W'BæWVÂ†÷F–öç2æVçf—&öæÖVçBÂVçf—&öæÖVçB¢76W'BæWVÂ†÷F–öç2æ—4WF†÷&—¦VE&Vb‡&Vb’ÂG'VR¢76W'BæWVÂ†÷F–öç2æ—4WF†÷&—¦VE&Vb†G·&VgÓ’ÂfÇ6R¢&WGW&â6öçFW‡Bç&VF&6²æWF†÷&—¦F–öà¢ÒÀ¢fWF6„Ö–â‡W&Â’°¢6ÆÇ2çW6‚‚&Ö–â"¢76W'BæWVÂ‡W&ÂÂ&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö'&æ6†W2öÖ–â"¢&WGW&â6öçFW‡Bç&VF&6²ç&÷FV7FVEöÖ–à¢ÒÀ¢fWF6…"‡W&Â’°¢6ÆÇ2çW6‚‚'""¢76W'BæWVÂ‡W&ÂÂ&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÇ2ósR"¢&WGW&â6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7@¢ÒÀ¢–ç7V7D6æF–FFR‡&ö÷BÂ†VB’°¢6ÆÇ2çW6‚‚&v—B"¢76W'BæWVÂ‡&ö÷BÂ6öçFW‡Bæf—‡GW&Rç&ö÷B¢76W'BæWVÂ††VBÂ6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7Bæ†VBç6†¢&WGW&â6öçFW‡Bç&VF&6²æ6æF–FFP¢Ð¢Ð¢¢76W'BæFVWWVÂ†6ÆÇ2Â²&6öÖÖVçB"Â'""Â&Ö–â"Â&v—B%Ò¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%dU$”d”TB"¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡BÂ°¢&öGV7E&VÖVF–F–öäWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’§Ò §FW7B‚'&öGV7B&VÖVF–F–öâ4Ä’f–Ç26Æ÷6VBöâ"’f–ÇW&Rv—F†÷WBW‡÷6–ær7&VFVçF–ÂW'&÷'2"Â‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäWF†÷&—¦F–öâ€¢6öçFW‡Bæf—‡GW&Rç&ö÷BÀ¢°¢–ç7V7D6öÖÖVçC¢‚’Óâ6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâÀ¢fWF6…"‚’°¢F‡&÷ræWrW'&÷"‚&f—‡GW&R×6V7&WBÖ×W7BÖæ÷BÖ&R×&W÷'FVB"¢ÒÀ¢–ç7V7D6æF–FFR‚’°¢76W'Bæf–Â‚&×W7Bæ÷B–ç7V7BâVæf–Æ&ÆR""¢Ð¢Ð¢¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%Täd”Ä$ÄR"¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’‡&VF&6²’Âöf—‡GW&R×6V7&WBÖ×W7BÖæ÷BÖ&R×&W÷'FVB÷R¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡BÂ°¢&öGV7E&VÖVF–F–öäWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"§Ò ¦f÷"†6öç7B¶æÖRÂ×WFFTWfVçEÒöb°¢°¢'7ööfVB&W÷6—F÷'’"À¢†WfVçB’Óâ°¢WfVçBç&W÷6—F÷'’ægVÆÅöæÖRÒ&GF6¶W"ö6÷W'G6–FR×Gr ¢Ð¢ÒÀ¢°¢'w&öær"çVÖ&W""À¢†WfVçB’Óâ°¢WfVçBæçVÖ&W"Òs`¢Ð¢ÒÀ¢°¢'7FÆR"†VB"À¢†WfVçB’Óâ°¢WfVçBçVÆÅ÷&WVW7Bæ†VBç6†Ò&""ç&WVBƒC¢Ð¢ÒÀ¢°¢'w&öær"WfVçB&6R"À¢†WfVçB’Óâ°¢WfVçBçVÆÅ÷&WVW7Bæ&6Rç6†Ò&""ç&WVBƒC¢Ð¢Ð¥Ò’°¢FW7B†&öGV7B&VÖVF–F–öâ&V¦V7G27GVÂ7F–öç2WfVçBv—F‚G¶æÖWÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ&v—F‡V"×&öGV7B×&VÖVF–F–öâÖWfVçBæ§6öâ"¢6öç7BWfVçBÒ¥4ôâç'6R†g2ç&VDf–ÆU7–æ2†WfVçEF‚Â'WFc‚"’¢×WFFTWfVçB†WfVçB¢g2çw&—FTf–ÆU7–æ2†WfVçEF‚Â¥4ôâç7G&–æv–g’†WfVçB’¢6öç7Bv—F‡V$7F–öç46öçFW‡BÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢f—‡GW&T7F–öç5'VäGFV×BÀ¢t•D…T%õ$Tc¢'&Vg2÷VÆÂósRöÖW&vR"À¢t•D…T%ô$4Uõ$Tc¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢&öGV7E&VÖVF–F–öä'&æ6€¢ÒÀ¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–æp¢Ò¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡BÂ²v—F‡V$7F–öç46öçFW‡BÒ¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&öGV7B&VÖVF–F–öâ÷R¢Ò§Ð ¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb°¢°¢&Ö—76–ær&÷FV7FVBÖ–â&VF&6²"À¢‡"’Óâ°¢"ç&÷FV7FVEöÖ–âÒçVÆÀ¢Ð¢ÒÀ¢°¢&F—6&ÆVBÖ–â&÷FV7F–öâ"À¢‡"’Óâ°¢"ç&÷FV7FVEöÖ–âç&÷FV7FVBÒfÇ6P¢Ð¢ÒÀ¢°¢&Gfæ6VB&÷FV7FVBÖ–â"À¢‡"’Óâ°¢"ç&÷FV7FVEöÖ–âæ6öÖÖ—Bç6†Ò&""ç&WVBƒC¢Ð¢ÒÀ¢°¢'w&öær&÷FV7FVB'&æ6‚"À¢‡"’Óâ°¢"ç&÷FV7FVEöÖ–âææÖRÒ'&VÆV6R ¢Ð¢ÒÀ¢°¢&FVÆWFVBõtäU"6öÖÖVçB"À¢‡"’Óâ°¢"æWF†÷&—¦F–öâç7FGW2Ò%Täd”Ä$ÄR ¢"æWF†÷&—¦F–öâæ&öG’ÒçVÆÀ¢Ð¢ÒÀ¢°¢&Ö—76–ær6VVBF‚"À¢‡"’Óâ°¢"æ6æF–FFRç6VVEö6†ævVE÷F‡2ç÷‚¢Ð¢ÒÀ¢°¢&Ö—76–ær†—7F÷&–6Â&WV—&VBF‚"À¢‡"’Óâ°¢"æ6æF–FFRæ†—7F÷'•÷F‡2ç÷‚¢Ð¢ÒÀ¢°¢&GWÆ–6FR6æF–FFRF‚"À¢‡"’Óâ°¢"æ6æF–FFRæ6†ævVE÷F‡2çW6‚‡"æ6æF–FFRæ6†ævVE÷F‡5³Ò¢Ð¢ÒÀ¢°¢&æöâ×&VwVÆ"ÆÆ÷vVBf–ÆR"À¢‡"’Óâ°¢"æ6æF–FFRæÆÆ÷vVE÷F…öÖöFW5öÖF6‚ÒfÇ6P¢Ð¢Ð¥Ò’°¢FW7B†&öGV7B&VÖVF–F–öâWF†÷&—¦F–öâ&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢×WFFR†6öçFW‡Bç&VF&6²¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&öGV7B&VÖVF–F–öâ÷R¢Ò§Ð ¦f÷"†6öç7B÷F–öæÅF‚öb&öGV7E&VÖVF–F–öä÷F–öæÅF‡2’°¢FW7B†&öGV7B&VÖVF–F–öâÆÆ÷w2F†RWF†÷&—¦VB÷F–öæÂÖVæFÖVçBG¶÷F–öæÅF‡ÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öçFW‡Bæf—‡GW&Ræ6†ævVEF‡2çW6‚†÷F–öæÅF‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ6†ævVE÷F‡2çW6‚†÷F–öæÅF‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ†—7F÷'•÷F‡2çW6‚†÷F–öæÅF‚¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð §FW7B‚'&öGV7B&VÖVF–F–öâ&V¦V7G2&÷FV7FVBÖÖ–â’f–ÇW&Rv—F†÷WBfÆÆ&6²÷"7&VFVçF–ÂÆV¶vR"Â‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öç7B&VF&6²ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäWF†÷&—¦F–öâ€¢6öçFW‡Bæf—‡GW&Rç&ö÷BÀ¢°¢–ç7V7D6öÖÖVçC¢‚’Óâ6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâÀ¢fWF6…#¢‚’Óâ6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7BÀ¢fWF6„Ö–â‚’°¢F‡&÷ræWrW'&÷"‚&f—‡GW&RÖ7&VFVçF–ÂÖ×W7B×7F’×&—fFR"¢ÒÀ¢–ç7V7D6æF–FFR‚’°¢76W'Bæf–Â‚&×W7Bæ÷B–ç7V7Bv—BgFW"Ö–â&VF&6²f–ÇW&R"¢Ð¢Ð¢¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%Täd”Ä$ÄR"¢76W'BæWVÂ‡&VF&6²çVÆÅ÷&WVW7BÂçVÆÂ¢76W'BæWVÂ‡&VF&6²ç&÷FV7FVEöÖ–âÂçVÆÂ¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’‡&VF&6²’Âöf—‡GW&RÖ7&VFVçF–ÂÖ×W7B×7F’×&—fFR÷R¢76W'BæWVÂ€¢'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡BÂ²&öGV7E&VÖVF–F–öäWF†÷&—¦F–öå&VF&6³¢&VF&6²Ò¢ç7FGW2À¢$d”Â ¢§Ò §FW7B‚'&öGV7B&VÖVF–F–öâæWfW"fÆÇ2&6²FòF†R7WW'6VFVB÷væW"66÷R"Â‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&ÂÐ¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“CC“##s ¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö–Ö×WF&ÆR—77VR#õtäU"F—7F6‚÷R§Ò §FW7B‚'&öGV7B&VÖVF–F–öâv—Bf–ÆR6Æ÷7W&R&V¦V7G2FVÆWFVB&WV—&VBf–ÆW2æBæöâ×&VwVÆ"VçG&–W2"Â‚’Óâ°¢6öç7B&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'&öGV7B×&VÖVF–F–öâÖf–ÆW2Ò"’¢G'’°¢f÷"†6öç7Bf–ÆUF‚öb&öGV7E&VÖVF–F–öåF‡2’°¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡F‚æ¦ö–â‡&ö÷BÂf–ÆUF‚’’Â²&V7W'6—fS¢G'VRÒ¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂf–ÆUF‚’Â&f—‡GW&R&WV—&VBf–ÆUÆâ"¢Ð¢6öç7B&6VÆ–æRÒ–æ—F–Æ—¦Tv—Df—‡GW&R‡&ö÷B¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäf–ÆW2‡&ö÷BÂ&6VÆ–æR’À¢G'VRÀ¢&ÆÂ&WV—&VB&VwVÆ"f–ÆW2W†—7C²÷F–öæÂf–ÆW2Ö’&VÖ–â'6VçB ¢¢f÷"†6öç7Bf–ÆUF‚öb°¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâõV&Æ–4—77VT”•Bæ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷6V7W&—G’õ&÷WFU&FTÆ–Ö—Df–ÇFW"æ¦f ¢Ò’°¢v—B‡&ö÷BÂ'&Ò"Â"ÒÒ"Âf–ÆUF‚¢6öç7BFVÆWFVEG&VRÒv—B‡&ö÷BÂ'w&—FR×G&VR"¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäf–ÆW2‡&ö÷BÂFVÆWFVEG&VR’À¢fÇ6RÀ¢FVÆWF–ær&WV—&VBf–ÆR×W7Bf–Ã¢G¶f–ÆUF‡Ö ¢¢v—B‡&ö÷BÂ'&W6WB"Â"ÒÖ†&B"Â&6VÆ–æR¢Ð¢6öç7B&WV—&VEF‚Ò&öGV7E&VÖVF–F–öåF‡5³Ð¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&WV—&VEF‚’¢g2ç7–ÖÆ–æµ7–æ2‚'VçG'W7FVB×F&vWB"ÂF‚æ¦ö–â‡&ö÷BÂ&WV—&VEF‚’¢v—B‡&ö÷BÂ&FB"Â"ÒÒ"Â&WV—&VEF‚¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäf–ÆW2‡&ö÷BÂv—B‡&ö÷BÂ'w&—FR×G&VR"’’À¢fÇ6RÀ¢&&WV—&VB7–ÖÆ–æ²×W7Bæ÷B6÷VçB2&VwVÆ"6÷W&6Rf–ÆR ¢¢v—B‡&ö÷BÂ'&W6WB"Â"ÒÖ†&B"Â&6VÆ–æR¢6öç7B÷F–öæÅF‚Ò&öGV7E&VÖVF–F–öä÷F–öæÅF‡5³Ð¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡F‚æ¦ö–â‡&ö÷BÂ÷F–öæÅF‚’’Â²&V7W'6—fS¢G'VRÒ¢g2ç7–ÖÆ–æµ7–æ2‚'VçG'W7FVB×F&vWB"ÂF‚æ¦ö–â‡&ö÷BÂ÷F–öæÅF‚’¢v—B‡&ö÷BÂ&FB"Â"ÒÒ"Â÷F–öæÅF‚¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäf–ÆW2‡&ö÷BÂv—B‡&ö÷BÂ'w&—FR×G&VR"’’À¢fÇ6RÀ¢&â÷F–öæÂ7–ÖÆ–æ²×W7BÇ6òf–Â ¢¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡&ö÷BÂ²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð§Ò ¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb°¢°¢&Ö—76–ær66WFVB$TBæ6W7G'’"À¢‡"’Óâ°¢"æ6æF–FFRæ66WFVE÷&VEöæ6W7F÷"ÒfÇ6P¢Ð¢ÒÀ¢°¢&6†ævVB66WFVB$TBG&VR"À¢‡"’Óâ°¢"æ6æF–FFRæ66WFVE÷&VE÷G&VU÷6†Ò&""ç&WVBƒC¢Ð¢ÒÀ¢°¢&6†ævVB66WFVB$TB&VçB"À¢‡"’Óâ°¢"æ6æF–FFRæ66WFVE÷&VE÷&VçE÷6†2Ò²&""ç&WVBƒC•Ð¢Ð¢ÒÀ¢°¢&W‡G&&RÖF—7F6‚$TBF‚"À¢‡"’Óâ°¢"æ6æF–FFRæ66WFVE÷&VEö6†ævVE÷F‡2çW6‚‚'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"¢Ð¢Ð¥Ò’°¢FW7B†&öGV7B&VÖVF–F–öâWF†÷&—¦F–öâ&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢×WFFR†6öçFW‡Bç&VF&6²¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Â÷&öGV7B&VÖVF–F–öâ÷R¢Ò§Ð ¦f÷"†6öç7B7WW'6VFVD6öÖÖVçBöb³SS“CC“ƒ“SÂSS“CSsSƒ•Ò’°¢FW7B†&öGV7B&VÖVF–F–öâFöW2æ÷BfÆÂ&6²Fò7WW'6VFVB6æöæ–6ÂG·7WW'6VFVD6öÖÖVçGÖÂ‚’Óâ°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‚¢6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&ÂÒ‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÒG·7WW'6VFVD6öÖÖVçGÖ ¢6öç7B&W÷'BÒ'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†6öçFW‡B¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âö–Ö×WF&ÆR—77VR#õtäU"F—7F6‚÷R¢Ò§Ð ¦6öç7B&öGV7Df—‡GW&UF‚Ð¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâõV&Æ–6F–öå&VÆ–&–Æ—G”•Bæ¦f ¦6öç7B&öGV7Df—‡GW&T&öG’Ð¢sÂÒÒ&öGV7CsS¦f—‡GW&RÖFFVæGVÓ§c§7F'BÒÓåÆåF†—2–Ö×WF&ÆRÂöæR×F‚FFVæGVÒ&V6÷&G2F†RW6W%Âw26öçF–çV–ær6ö×ÆWF–öâÂ&Wf–WrÂ÷F–Ö—¦F–öâæBÖW&vRWF†÷&—¦F–öââF†R76—7FçB&V6÷&G2—BF‡&÷Vv‚F†R÷væW%Âw26öææV7FVB66÷VçBöâF†RW6W%Âw2&V†Æc²—B—2æ÷B6W&FR‡VÖâ&VÆV6R×&—6²66WFæ6RåÆåÆåW6W"–ç7G'V7F–öã¢.Š¸¾[š¾h‰[~XšžšIŽy¨NK»¾X¹žZèÎh‰ÎZèÎh‰[èÄ&Wf–WrKŠnK‰B÷F–Ö—¦RûÈÎiÈ{X.XhÞKéÞKÚy¨N{i>š™vÖW&vR#²&W7VÖVBv—F‚.{›Î{¨ÎZèÎh‰"åÆåÆå&W÷6—F÷'“¢'–ææ6’ö6÷W'G6–FR×GuÆå#¢sUÆä'&æ6ƒ¢f—‚÷Cƒb×&öGV7B×&VÖVF–F–öåÆå&÷FV7FVB&6S¢sFC6#fFf&ƒs3“F6SS###S&F3F†6cVS#6cEÆå&WV—&VB÷&–v–æÂWF†÷&—¦F–öã¢‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“CSƒSƒ•ÆäÇ&VG’×V&Æ—6†VB&÷VæF'’†VC¢c3sƒ&SVc3“3&csCV&#cFSSvfFSs63cveÆä&÷VæF'’G&VS¢v3“33sƒƒcS&cccƒ3VcfVCSF&“ƒ“S3S#%ÆåÆäFF—F–öæÂFƒ¥ÆâÒ2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâõV&Æ–6F–öå&VÆ–&–Æ—G”•Bæ¦fÆåÆåW'÷6S¢cbæ÷rVæf÷&6W2G&gBÖöæÇ’6öçG&–'WF÷"6†ævW2âF†R†—7F÷&–6Âv—F†G&vÂf—‡GW&R7&VFW2âÇ&VG’Õt•D„E$tâ&Wf—6–öâ&Vf÷&R–ç6W'F–ær—G27&VF—G2Â6òF†RæWr–çf&–çB6÷'&V7FÇ’&V¦V7G2F†Rf—‡GW&R6WGWâ7&VFRF†B6ÖRf—‡GW&R–âE$eBÂ–ç6W'B—G27&VF—G2ÂF†VâG&ç6—F–öâFòt•D„E$tâ&Vf÷&RW†V7WF–ærF†R÷&–v–æÂ&V6÷fW'’76W'F–öç2âFòæ÷BvV¶VâF†RFF&6RG&–vvW"ÂFW7B76W'F–öç2Â&öGV7F–öâWF†÷&—¦F–öâÂ÷"Ö–w&F–öâ6÷fW&vRåÆåÆåF†RÇ&VG’ÖWF†÷&—¦VB67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2æB67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2Ö’FBf–ÂÖ6Æ÷6VBfÆ–FF–öâöbF†—2W†7B–Ö×WF&ÆRFFVæGVÒâ&WV—&RF†R÷&–v–æÂWF†÷&—¦F–öâ2vVÆÂ2F†—2FFVæGVÒv†VæWfW"F†RW‡G&F‚V'2–âf–æÂ÷"†—7F÷&–6Â6†ævW2â&WV—&RF†RW†7BV&Æ—6†VB&÷VæF'’2âæ6W7F÷"æBWfW'’æWr6†ævRFòF†—2W‡G&F‚Fò÷7FFFRF†—26öÖÖVçBâ&W6W'fRW†—7F–ær'&æ6‚ö&6RÂ6ö×ÆWFRF‚ö†—7F÷'’ÂW†7BÖ†VB4’õ6V7W&—G’Â6–ævÆR×&VçB–FVçF–6Â×G&VR7V6‚æBF‡&VB×&W6öÇWF–öâ&WV—&VÖVçG2åÆåÆäæò÷F†W"F‚—2FFVBâÆÂg&÷¦VâCƒR&V6÷&G2Â$TDÔRÂF6²6†V6¶&÷‚Æ–æW2Â&WFfÆrÂCƒb66WFæ6RÂ'F–6—çB&W6V&6‚ÂvV#2ÂFWÆ÷–ÖVçBÂ&÷f–FW"6öæf–wW&F–öâÂ7&VFVçF–Ç2æB6V7&WG2&WF–âF†V—"7W'&VçB&÷VæF&–W2âF†—2FFVæGVÒFöW2æ÷BF§VF–6FRç’&VÆV6R&Æö6¶W"åÆãÂÒÒ&öGV7CsS¦f—‡GW&RÖFFVæGVÓ§c¦VæBÒÓâp¦gVæ7F–öâÖ¶U&öGV7Df—‡GW&TFFVæGVÔ66R†÷F–öç2Ò·Ò’°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R†÷F–öç2¢6öçFW‡Bæf—‡GW&Ræ6†ævVEF‡2çW6‚‡&öGV7Df—‡GW&UF‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ6†ævVE÷F‡2çW6‚‡&öGV7Df—‡GW&UF‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ†—7F÷'•÷F‡2çW6‚‡&öGV7Df—‡GW&UF‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒÒ°¢&÷VæF'•öæ6W7F÷#¢G'VRÀ¢&÷VæF'•÷G&VU÷6†¢#v3“33sƒƒcS&cccƒ3VcfVCSF&“ƒ“S3S#""À¢&VwVÆ%öf–ÆS¢G'VRÀ¢6†ævW5÷÷7FFFUöFFVæGVÓ¢G'VP¢Ð¢6öçFW‡Bç&VF&6²æf—‡GW&UöFFVæGVÒÒ°¢ââæ6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâÀ¢‡FÖÅ÷W&Ã¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“S33ƒ“’"À¢7&VFVEöC¢###bÓ’Ó•C3£#ƒ£•¢"À¢WFFVEöC¢###bÓ’Ó•C3£#ƒ£•¢"À¢&öG“¢&öGV7Df—‡GW&T&öG¢Ð¢&WGW&â6öçFW‡@§Ð¦f÷"†6öç7BW6‚öb¶fÇ6RÂG'VUÒ’°¢FW7B†&öGV7Bf—‡GW&RFFVæGVÒ66WG2WF†VçF–6FVBW†7BG·W6‚ò'7V6‚"¢%"'ÒÖVæFÖVçFÂ‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7Df—‡GW&TFFVæGVÔ66R‡²W6‚Ò¢6öç7B"Ò'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†2¢76W'BæWVÂ‡"ç7FGW2Â%52"Â"æW'&÷'2æ¦ö–â‚%Æâ"’¢Ò§Ð¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb°¢°¢&FVÆWFVB÷"7–ÖÆ–æ²f—‡GW&R"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒç&VwVÆ%öf–ÆRÒfÇ6P¢Ð¢ÒÀ¢°¢&Ö—76–ær6öÖÖVçB"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒÒçVÆÀ¢Ð¢ÒÀ¢°¢&VF—FVB6öÖÖVçB"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒçWFFVEöBÒ###bÓ’ÓC££¢ ¢Ð¢ÒÀ¢°¢&6†ævVB&öG’"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒæ&öG’³Ò%Æâ ¢Ð¢ÒÀ¢°¢'w&öær÷væW""À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒçW6W%öÆöv–âÒ&GF6¶W" ¢Ð¢ÒÀ¢°¢'w&öær—77VR"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒæ—77VU÷W&Â³Ò# ¢Ð¢ÒÀ¢°¢'Væf–Æ&ÆR’"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒç7FGW2Ò%Täd”Ä$ÄR ¢Ð¢ÒÀ¢°¢&öÆB&÷VæF'’"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒæ&÷VæF'•öæ6W7F÷"ÒfÇ6P¢Ð¢ÒÀ¢°¢&6†ævVB&÷VæF'’G&VR"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒæ&÷VæF'•÷G&VU÷6†Ò#"ç&WVBƒC¢Ð¢ÒÀ¢°¢'&VFFVBF‚6†ævR"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒæ6†ævW5÷÷7FFFUöFFVæGVÒÒfÇ6P¢Ð¢ÒÀ¢°¢'&VÖ÷fVB†—7F÷&–6ÂF‚"À¢†2’Óâ°¢2æf—‡GW&Ræ6†ævVEF‡2Ò2æf—‡GW&Ræ6†ævVEF‡2æf–ÇFW"‚‡’ÓâÓÒ&öGV7Df—‡GW&UF‚¢2ç&VF&6²æ6æF–FFRæ6†ævVE÷F‡2Ò²ââæ2æf—‡GW&Ræ6†ævVEF‡5Ð¢Ð¢ÒÀ¢°¢&Ö—76–ær÷&–v–æÂWF†÷&—G’"À¢†2’Óâ°¢2ç&VF&6²æWF†÷&—¦F–öâÒçVÆÀ¢Ð¢Ð¥Ò’°¢FW7B†&öGV7Bf—‡GW&RFFVæGVÒ&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7Df—‡GW&TFFVæGVÔ66R‚¢×WFFR†2¢76W'BæWVÂ‡'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†2’ç7FGW2Â$d”Â"¢Ò§Ð§FW7B‚'&öGV7Bf—‡GW&RFFVæGVÒ&VFW"fWF6†W2F†RW†7B6öÖÖVçBöæÇ’v†VâF†RF‚†—7F÷'’&WV—&W2—B"Â‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7Df—‡GW&TFFVæGVÔ66R‚¢6öç7B&Vg2ÒµÐ¢6öç7B"ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäWF†÷&—¦F–öâ†2æf—‡GW&Rç&ö÷BÂ°¢–ç7V7D6öÖÖVçC¢‡&Vb’Óâ°¢&Vg2çW6‚‡&Vb¢&WGW&â&VbÓÓÒ2ç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&À¢ò2ç&VF&6²æWF†÷&—¦F–öà¢¢2ç&VF&6²æf—‡GW&UöFFVæGVÐ¢ÒÀ¢fWF6…#¢‚’Óâ2ç&VF&6²çVÆÅ÷&WVW7BÀ¢fWF6„Ö–ã¢‚’Óâ2ç&VF&6²ç&÷FV7FVEöÖ–âÀ¢–ç7V7D6æF–FFS¢‚’Óâ2ç&VF&6²æ6æF–FFP¢Ò¢76W'BæFVWWVÂ‡&Vg2Â¶2ç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&ÂÂ2ç&VF&6²æf—‡GW&UöFFVæGVÒæ‡FÖÅ÷W&ÅÒ¢76W'BæWVÂ‡"æf—‡GW&UöFFVæGVÒæ&öG’Â&öGV7Df—‡GW&T&öG’§Ò §FW7B‚'&öGV7Bf—‡GW&RFFVæGVÒ–ç7V7G2—6öÆFVBv—Bæ6W7G'’F–ÖW7F×2æBf–ÆRÖöFR"Â‚’Óâ°¢6öç7B&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'&öGV7BÖf—‡GW&RÖv—BÒ"’¢6öç7B6ÆöæVBÒF‚æ¦ö–â‡&ö÷BÂ'&Wòæv—B"¢W†V4f–ÆU7–æ2‚&v—B"Â²&–æ—B"Â"ÒÖ&&R"Â"Ò×V–WB"Â6ÆöæVEÒ¢6öç7BVçf—&öæÖVçBÒ°¢ââç&ö6W72æVçbÀ¢t•Eô”äDU…ôd”ÄS¢F‚æ¦ö–â‡&ö÷BÂ&–æFW‚"’À¢t•EôUD„õ%ôäÔS¢$f—‡GW&R"À¢t•EôUD„õ%ôTÔ”Ã¢&f—‡GW&TW†×ÆRæ–çfÆ–B"À¢t•Eô4ôÔÔ•EDU%ôäÔS¢$f—‡GW&R"À¢t•Eô4ôÔÔ•EDU%ôTÔ”Ã¢&f—‡GW&TW†×ÆRæ–çfÆ–B"À¢t•EôUD„õ%ôDDS¢###bÓ’Ó•C#££¢"À¢t•Eô4ôÔÔ•EDU%ôDDS¢###bÓ’Ó•C#££¢ ¢Ð¢6öç7B'VâÒ†&w2Â–çWBÒVæFVf–æVBÂVçbÒVçf—&öæÖVçB’Óà¢W†V4f–ÆU7–æ2‚&v—B"Â&w2Â°¢7vC¢6ÆöæVBÀ¢VçbÀ¢–çWBÀ¢Væ6öF–æs¢'WFc‚"À¢7FF–ó¢²'—R"Â'—R"Â'—R%Ð¢Ò’çG&–Ò‚¢G'’°¢'Vâ…²'&VB×G&VR"Â"ÒÖV×G’%Ò¢6öç7BöÆD&Æö"Ò'Vâ…²&†6‚Öö&¦V7B"Â"×r"Â"Ò×7FF–â%ÒÂ&öÆBf—‡GW&UÆâ"¢'Vâ…²'WFFRÖ–æFW‚"Â"ÒÖFB"Â"ÒÖ66†V–æfò"ÂcCBÂG¶öÆD&Æö'ÒÂG·&öGV7Df—‡GW&UF‡ÖÒ¢6öç7B&÷VæF'•G&VRÒ'Vâ…²'w&—FR×G&VR%Ò¢6öç7B&÷VæF'’Ò'Vâ…²&6öÖÖ—B×G&VR"Â&÷VæF'•G&VUÒÂ%7–çF†WF–2&÷VæF'•Æâ"¢6öç7B÷F–öç2Ò²&÷VæF'’Âf–ÆUFƒ¢&öGV7Df—‡GW&UF‚Â&V6÷&FVDC¢###bÓ’Ó•C3£#ƒ£•¢"Ð¢6öç7B&Æö"Ò'Vâ…²&†6‚Öö&¦V7B"Â"×r"Â"Ò×7FF–â%ÒÂ'WFFVBf—‡GW&UÆâ"¢'Vâ…²'WFFRÖ–æFW‚"Â"ÒÖ66†V–æfò"ÂcCBÂG¶&Æö'ÒÂG·&öGV7Df—‡GW&UF‡ÖÒ¢6öç7BG&VRÒ'Vâ…²'w&—FR×G&VR%Ò¢6öç7B†VBÒ'Vâ…²&6öÖÖ—B×G&VR"ÂG&VRÂ"×"Â&÷VæF'•ÒÂ%7–çF†WF–2Æö6Âf—‡GW&RöæÇ•Æâ"¢76W'BæFVWWVÂ‡G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7Df—‡GW&TFFVæGVÒ†6ÆöæVBÂ†VBÂ÷F–öç2’Â°¢&÷VæF'•öæ6W7F÷#¢G'VRÀ¢&÷VæF'•÷G&VU÷6†¢&÷VæF'•G&VRÀ¢&VwVÆ%öf–ÆS¢G'VRÀ¢6†ævW5÷÷7FFFUöFFVæGVÓ¢G'VP¢Ò¢6öç7BV&Ç’Ò'Vâ…²&6öÖÖ—B×G&VR"ÂG&VRÂ"×"Â&÷VæF'•ÒÂ%&VFFVB7–çF†WF–2f—‡GW&UÆâ"Â°¢ââæVçf—&öæÖVçBÀ¢t•EôUD„õ%ôDDS¢###bÓ’Ó•C££¢"À¢t•Eô4ôÔÔ•EDU%ôDDS¢###bÓ’Ó•C££¢ ¢Ò¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7Df—‡GW&TFFVæGVÒ†6ÆöæVBÂV&Ç’Â÷F–öç2¢òæ6†ævW5÷÷7FFFUöFFVæGVÒÀ¢fÇ6P¢¢'Vâ…²'WFFRÖ–æFW‚"Â"ÒÖ–æFW‚Ö–æfò%ÒÂG²#"ç&WVBƒC—ÕÇBG·&öGV7Df—‡GW&UF‡ÕÆæ¢6öç7BFVÆWFVBÒ'Vâ€¢²&6öÖÖ—B×G&VR"Â'Vâ…²'w&—FR×G&VR%Ò’Â"×"Â&÷VæF'•ÒÀ¢$FVÆWFVB7–çF†WF–2f—‡GW&UÆâ ¢¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7Df—‡GW&TFFVæGVÒ†6ÆöæVBÂFVÆWFVBÂ÷F–öç2“òç&VwVÆ%öf–ÆRÀ¢fÇ6P¢¢'Vâ…²'WFFRÖ–æFW‚"Â"ÒÖFB"Â"ÒÖ66†V–æfò"Â#ÂG¶&Æö'ÒÂG·&öGV7Df—‡GW&UF‡ÖÒ¢6öç7B7–ÖÆ–æ²Ò'Vâ€¢²&6öÖÖ—B×G&VR"Â'Vâ…²'w&—FR×G&VR%Ò’Â"×"Â&÷VæF'•ÒÀ¢%7–ÖÆ–æ²7–çF†WF–2f—‡GW&UÆâ ¢¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7Df—‡GW&TFFVæGVÒ†6ÆöæVBÂ7–ÖÆ–æ²Â÷F–öç2“òç&VwVÆ%öf–ÆRÀ¢fÇ6P¢¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡&ö÷BÂ²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð§Ò ¦6öç7B&öGV7D'&÷w6W%F‚Ò&2÷vV"÷FW7G2öS&R÷W3R×&VFW"ÖÆ–'&'’ç7V2çG2 ¦6öç7B&öGV7D'&÷w6W$&öG’Ð¢#ÂÒÒ&öGV7CsS¦'&÷w6W"ÖFFVæGVÓ§c§7F'BÒÓåÆåF†—2–Ö×WF&ÆRÂöæR×F‚FFVæGVÒ&V6÷&G2F†RW6W"w26öçF–çV–ær–ç7G'V7F–öâFòf–æ—6‚&VÖ–æ–ærF6·2Â&Wf–WrÂ÷F–Ö—¦RæBÖW&vRgFW"fW&–f–6F–öââ&V6÷&FVB'’F†R76—7FçBF‡&÷Vv‚F†R÷væW"w26öææV7FVBv—D‡V"66÷VçBöâF†RW6W"w2&V†Æc²æ÷B6W&FR‡VÖâ&VÆV6R×&—6²66WFæ6RåÆåÆå&W÷6—F÷'“¢'–ææ6’ö6÷W'G6–FR×GuÆå#¢sUÆä'&æ6ƒ¢f—‚÷Cƒb×&öGV7B×&VÖVF–F–öåÆå&÷FV7FVB&6S¢sFC6#fFf&ƒs3“F6SS###S&F3F†6cVS#6cEÆå&WV—&VB÷&–v–æÂWF†÷&—¦F–öã¢‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“CSƒSƒ•ÆåV&Æ—6†VB&÷VæF'’†VC¢c3sƒ&SVc3“3&csCV&#cFSSvfFSs63cveÆä&÷VæF'’G&VS¢v3“33sƒƒcS&cccƒ3VcfVCSF&“ƒ“S3S#%ÆåÆäFF—F–öæÂFƒ¥ÆâÒ2÷vV"÷FW7G2öS&R÷W3R×&VFW"ÖÆ–'&'’ç7V2çG5ÆåÆä6W6RæB6÷'&V7F–öã¢4’'Vâ3C3cƒScƒ3R'F–f7Bƒsƒ“3"&÷fW2F†Rv—F†G&vâÖ&öö¶Ö&²FW7B—2F†RVÆWfVçF‚Æöv–âg&öÒF†R6†&VB'VææW"6ö6¶WBv—F†–âc6V6öæG2â&÷F‚GFV×G2&V6V—fRvVçV–æRC#’$DUôÄ”Ô•DTBÂv—F‚&WG'’ÔgFW"S2æBCr&W7V7F—fVÇ’â—G2f—‡GW&R&W6WBFöW2æ÷B&W6WBF†R&öGV7F–öâçW‡BÆ–Ö—FW"âÆÆ÷röæÇ’F†—2FW7BFòfW&–g’F†RC#’6öçG&7BÂ†öæ÷"&÷VæFVBâãc×6V6öæB&WG'’ÔgFW"ÂæB&WG'’Æöv–âöæ6R&Vf÷&RF†R÷&–v–æÂWF†VçF–6FVB÷v—F†G&vâÖ6öçFVçB76W'F–öç2â¶VWf–æ—FRFW7BFVFÆ–æRâFòæ÷BF—6&ÆRÂ'—72Â&W6WBÂ&—6R÷"&WÆ6RF†R&öGV7F–öâÆ–Ö—FW"Â7ööb6Æ–VçB•ÂvV¶Vâ76W'F–öç2Â÷"6¶—ç’FW7BåÆåÆåF†RÇ&VG’ÖWF†÷&—¦VBG&6V&–Æ—G’fÆ–FF÷"æBFW7G2Ö’fÆ–FFRF†—2W†7B–Ö×WF&ÆRFF—F–öæÂ66÷RâF†R÷&–v–æÂWF†÷&—¦F–öâ—27F–ÆÂÖæFF÷'’âF†Rf—‡GW&RÖöæÇ’FFVæGVÒ‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“S33ƒ“’&VÖ–ç26W&FVÇ’ÖæFF÷'’f÷"V&Æ–6F–öå&VÆ–&–Æ—G”•Bæ¦fæB6ææ÷BWF†÷&—¦RF†—2'&÷w6W"F‚âV6‚FF—F–öæÂF‚×W7B&VÖ–â&VwVÆ"f–ÆRÂ&WF–â—G2÷vâVæ6†ævVBõtäU"6öÖÖVçBÂ&W6W'fRF†RV&Æ—6†VB&÷VæF'’2âæ6W7F÷"ÂæB†fRöæÇ’÷7BÖ6öÖÖVçBÖöF–f–6F–öç2åÆåÆäÆÂW†—7F–ærW†7B&6Rö†VB÷G&VRö†—7F÷'’Âg&W6‚4’õ6V7W&—G’Â6öçfW'6F–öâ&W6öÇWF–öâÂæB6–ævÆR×&VçB–FVçF–6Â×G&VR7V6‚6öæF—F–öç2&VÖ–ââæò÷F†W"æWrF‚ÂF6²6†V6¶&÷‚Âg&÷¦VâCƒR&V6V—BÂ$TDÔRÂ&WFfÆrÂ&VÆV6RF§VF–6F–öâÂ'F–6—çB&W6V&6‚ÂvV#2ÂFWÆ÷–ÖVçBÂ&÷f–FW"6öæf–wW&F–öâÂ7&VFVçF–Â÷"6V7&WB6†ævR—2WF†÷&—¦VBåÆãÂÒÒ&öGV7CsS¦'&÷w6W"ÖFFVæGVÓ§c¦VæBÒÓâ ¦gVæ7F–öâÖ¶U&öGV7D'&÷w6W$FFVæGVÔ66R‚’°¢6öç7B6öçFW‡BÒÖ¶U&öGV7Df—‡GW&TFFVæGVÔ66R‚¢6öçFW‡Bæf—‡GW&Ræ6†ævVEF‡2çW6‚‡&öGV7D'&÷w6W%F‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ6†ævVE÷F‡2çW6‚‡&öGV7D'&÷w6W%F‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ†—7F÷'•÷F‡2çW6‚‡&öGV7D'&÷w6W%F‚¢6öçFW‡Bç&VF&6²æ6æF–FFRæ'&÷w6W%öFFVæGVÒÒ²ââæ6öçFW‡Bç&VF&6²æ6æF–FFRæf—‡GW&UöFFVæGVÒÐ¢6öçFW‡Bç&VF&6²æ'&÷w6W%öFFVæGVÒÒ°¢ââæ6öçFW‡Bç&VF&6²æf—‡GW&UöFFVæGVÒÀ¢‡FÖÅ÷W&Ã¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓSS“SCS""À¢7&VFVEöC¢###bÓ’Ó•C3£3ƒ£#e¢"À¢WFFVEöC¢###bÓ’Ó•C3£3ƒ£#e¢"À¢&öG“¢&öGV7D'&÷w6W$&öG¢Ð¢&WGW&â6öçFW‡@§Ð§FW7B‚'&öGV7B'&÷w6W"FFVæGVÒ66WG2&÷F‚6W&FVÇ’WF†VçF–6FVB&W—'2"Â‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7D'&÷w6W$FFVæGVÔ66R‚¢6öç7B"Ò'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†2¢76W'BæWVÂ‡"ç7FGW2Â%52"Â"æW'&÷'2æ¦ö–â‚%Æâ"’§Ò¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb°¢°¢&f—‡GW&R6öÖÖVçB7V'7F—GWFVB"À¢†2’Óâ°¢2ç&VF&6²æ'&÷w6W%öFFVæGVÒÒ2ç&VF&6²æf—‡GW&UöFFVæGVÐ¢Ð¢ÒÀ¢°¢&Ö—76–ær'&÷w6W"6öÖÖVçB"À¢†2’Óâ°¢2ç&VF&6²æ'&÷w6W%öFFVæGVÒÒçVÆÀ¢Ð¢ÒÀ¢°¢&VF—FVB'&÷w6W"6öÖÖVçB"À¢†2’Óâ°¢2ç&VF&6²æ'&÷w6W%öFFVæGVÒçWFFVEöBÒ###bÓ’ÓC££¢ ¢Ð¢ÒÀ¢°¢&Ö—76–ærf—‡GW&R6öÖÖVçB"À¢†2’Óâ°¢2ç&VF&6²æf—‡GW&UöFFVæGVÒÒçVÆÀ¢Ð¢ÒÀ¢°¢'&RÖ6öÖÖVçB'&÷w6W"6†ævR"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæ'&÷w6W%öFFVæGVÒæ6†ævW5÷÷7FFFUöFFVæGVÒÒfÇ6P¢Ð¢ÒÀ¢°¢&FVÆWFVB'&÷w6W"f–ÆR"À¢†2’Óâ°¢2ç&VF&6²æ6æF–FFRæ'&÷w6W%öFFVæGVÒç&VwVÆ%öf–ÆRÒfÇ6P¢Ð¢Ð¥Ò’°¢FW7B†&öGV7B'&÷w6W"FFVæGVÒ&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7D'&÷w6W$FFVæGVÔ66R‚¢×WFFR†2¢76W'BæWVÂ‡'Vå&öGV7E&VÖVF–F–öäf—‡GW&R†2’ç7FGW2Â$d”Â"¢Ò§Ð§FW7B‚'&öGV7B'&÷w6W"FFVæGVÒ&VFW"–æFWVæFVçFÇ’fWF6†W2&÷F‚Æ—fRWF†÷&—F–W2"Â‚’Óâ°¢6öç7B2ÒÖ¶U&öGV7D'&÷w6W$FFVæGVÔ66R‚¢6öç7B&Vg2ÒµÐ¢6öç7B6öÖÖVçG2Ò°¢2ç&VF&6²æWF†÷&—¦F–öâÀ¢2ç&VF&6²æf—‡GW&UöFFVæGVÒÀ¢2ç&VF&6²æ'&÷w6W%öFFVæGVÐ¢Ð¢6öç7B"ÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7E&öGV7E&VÖVF–F–öäWF†÷&—¦F–öâ†2æf—‡GW&Rç&ö÷BÂ°¢–ç7V7D6öÖÖVçC¢‡&Vb’Óâ°¢&Vg2çW6‚‡&Vb¢&WGW&â6öÖÖVçG2æf–æB‚†2’Óâ2æ‡FÖÅ÷W&ÂÓÓÒ&Vb¢ÒÀ¢fWF6…#¢‚’Óâ2ç&VF&6²çVÆÅ÷&WVW7BÀ¢fWF6„Ö–ã¢‚’Óâ2ç&VF&6²ç&÷FV7FVEöÖ–âÀ¢–ç7V7D6æF–FFS¢‚’Óâ2ç&VF&6²æ6æF–FFP¢Ò¢76W'BæFVWWVÂ€¢&Vg2À¢6öÖÖVçG2æÖ‚†2’Óâ2æ‡FÖÅ÷W&Â¢¢76W'BæWVÂ‡"æ'&÷w6W%öFFVæGVÒæ&öG’Â&öGV7D'&÷w6W$&öG’§Ò ¢òò7GVF–òW6W26W&FR–ææVBWF†÷&—G“²f—‡GW&RG'W7BæWfW"VçFW'2'Vä6Æ’÷fÆ–FFUG&6V&–Æ—G’à¦gVæ7F–öâÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‡²W6‚ÒfÇ6RÂG&gBÒG'VRÒÒ·Ò’°¢6öç7B6öçFW‡BÒÖ¶U&öGV7E&VÖVF–F–öäf—‡GW&R‡²W6‚ÂG&gBÒ¢6öç7B6öæf–rÒ°¢&Vc¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓcsb"À¢&V6÷&FVEöC¢###bÓ’Ó•CC££¢"À¢#¢sbÀ¢'&æ6ƒ¢&f—‚÷7GVF–òÖ6ö×ÆWF–öâ"À¢&6U÷6†¢&""ç&WVBƒC’À¢–æ—F–Å÷6VVC¢°¢†VE÷6†¢&2"ç&WVBƒC’À¢G&VU÷6†¢&B"ç&WVBƒC’À¢6†ævVE÷F‡3¢°¢ââçG&6V&–Æ—G•fÆ–FF÷"å5ETD”õô4ôÕÄUD”ôåôUD„õ$•¤D”ôâæ–æ—F–Å÷6VVBæ6†ævVE÷F‡0¢Ð¢ÒÀ¢&WV—&VE÷F‡3¢²ââçG&6V&–Æ—G•fÆ–FF÷"å5ETD”õô4ôÕÄUD”ôåôUD„õ$•¤D”ôâç&WV—&VE÷F‡5ÒÀ¢÷F–öæÅ÷F‡3¢µÐ¢Ð¢6öç7BF—7F6‚Ò°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×7GVF–òÖ6ö×ÆWF–öâÖ÷væW"ÖF—7F6‚÷c"À¢FV6—6–öã¢$D•5D4…ô44UDTB"À¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢#¢6öæf–rç"À¢'&æ6ƒ¢6öæf–ræ'&æ6‚À¢&6U÷6†¢6öæf–ræ&6U÷6†À¢–æ—F–Å÷6VVC¢7G'V7GW&VD6ÆöæR†6öæf–ræ–æ—F–Å÷6VVB’À¢&WV—&VE÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢÷F–öæÅ÷F‡3¢µÐ¢Ð¢6öç7B&öG’Ð¢#ÂÒÒ7GVF–òÖ6ö×ÆWF–öã¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓåÆæ§6öåÆâ"°¢¥4ôâç7G&–æv–g’†F—7F6‚’°¢%ÆæÆãÂÒÒ7GVF–òÖ6ö×ÆWF–öã¦÷væW"ÖF—7F6ƒ§c¦VæBÒÓâ ¢6öæf–ræ&öG•÷6†#SbÒ7&VFT†6‚‚'6†#Sb"’çWFFR†&öG’’æF–vW7B‚&†W‚"¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâÂ°¢‡FÖÅ÷W&Ã¢6öæf–rç&VbÀ¢&öG’À¢7&VFVEöC¢6öæf–rç&V6÷&FVEöBÀ¢WFFVEöC¢6öæf–rç&V6÷&FVEö@¢Ò¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7BÂ°¢çVÖ&W#¢6öæf–rç"À¢‡FÖÅ÷W&Ã¢‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÂòG¶6öæf–rç'ÖÀ¢ÖW&vVEöC¢W6‚ò###bÓ’Ó•C#££¢"¢çVÆÀ¢Ò¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&VbÒ6öæf–ræ'&æ6€¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7Bæ&6Rç6†Ò6öæf–ræ&6U÷6†¢6öçFW‡Bç&VF&6²ç&÷FV7FVEöÖ–âæ6öÖÖ—Bç6†ÒW6‚ò6öçFW‡Bæ†VB¢6öæf–ræ&6U÷6†¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²æ6æF–FFRÂ°¢6VVE÷G&VU÷6†¢6öæf–ræ–æ—F–Å÷6VVBçG&VU÷6†À¢6VVE÷&VçE÷6†3¢¶6öæf–ræ&6U÷6†ÒÀ¢6VVEö6†ævVE÷F‡3¢²ââæ6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡5ÒÀ¢f—'7EöÖVæFÖVçE÷&VçE÷6†3¢¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†ÒÀ¢f—'7EöÖVæFÖVçEö6†ævVE÷F‡3¢²'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2%ÒÀ¢6†ævVE÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢†—7F÷'•÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5Ð¢Ò¢ö&¦V7Bæ76–vâ†6öçFW‡Bæv—D&–æF–ærÂ°¢6†ævUö&6U÷6†¢6öæf–ræ&6U÷6†À¢†VE÷&VçE÷6†¢6öæf–ræ&6U÷6†À¢†VE÷&VçE÷6†3¢¶6öæf–ræ&6U÷6†Ð¢Ò¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ'7GVF–òÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’€¢W6€¢ò°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vc¢'&Vg2ö†VG2öÖ–â"À¢&Vf÷&S¢6öæf–ræ&6U÷6†À¢gFW#¢6öçFW‡Bæ†V@¢Ð¢¢°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢çVÖ&W#¢6öæf–rç"À¢VÆÅ÷&WVW7C¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7@¢Ð¢¢¢6öçFW‡Bæv—F‡V$7F–öç46öçFW‡BÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢W6‚ò'W6‚"¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢W6‚ò6öçFW‡Bæ†VB¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢#"À¢t•D…T%õ$Tc¢W6‚ò'&Vg2ö†VG2öÖ–â"¢&Vg2÷VÆÂòG¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%õ$TeôäÔS¢W6‚ò&Ö–â"¢G¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%ô$4Uõ$Tc¢W6‚ò""¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢W6‚ò""¢6öæf–ræ'&æ6€¢ÒÀ¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–æp¢Ò¢&WGW&â°¢6öæf–rÀ¢6öçFW‡BÀ¢÷F–öç3¢°¢&VF&6³¢6öçFW‡Bç&VF&6²À¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–ærÀ¢6†ævVEF‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢6†ævT&6U6†¢6öæf–ræ&6U÷6†À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢v—F‡V$7F–öç46öçFW‡C¢6öçFW‡Bæv—F‡V$7F–öç46öçFW‡BÀ¢&WV—&TW†7D†VDWf–FVæ6S¢G'VP¢Ð¢Ð§Ð ¦f÷"†6öç7B7FFRöb²&G&gB"Â'&VG’"Â'7V6‚×W6‚%Ò’°¢FW7B†7GVF–ò6ö×ÆWF–öâ6W&FRvFR66WG2WF†VçF–6FVBW†7BG·7FFWÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‡°¢W6ƒ¢7FFRÓÓÒ'7V6‚×W6‚"À¢G&gC¢7FFRÓÓÒ&G&gB ¢Ò¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’À¢G'VRÀ¢W'&÷'2æ¦ö–â‚%Æâ"¢¢Ò§Ð ¦6öç7B7GVF–ôæVvF—fT66W2Ò°¢°¢&–×ÆVÖVçFF–öâ&Vf÷&RG&6V&–Æ—G’$TB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæf—'7EöÖVæFÖVçEö6†ævVE÷F‡2Ò°¢&2÷vV"ööfVGW&W2÷7GVF–ò÷7GVF–òÖ’çG2 ¢Ð¢Ð¢ÒÀ¢°¢&FWF6†VBG&6V&–Æ—G’$TB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæf—'7EöÖVæFÖVçE÷&VçE÷6†2Ò²&b"ç&WVBƒC•Ð¢Ð¢ÒÀ¢°¢&Ö—76–ær÷væW""À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâÒçVÆÀ¢Ð¢ÒÀ¢°¢'Væf–Æ&ÆR’"À¢†ò’Óâ°¢òç&VF&6²ç7FGW2Ò%Täd”Ä$ÄR ¢Ð¢ÒÀ¢°¢'w&öær÷væW""À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâçW6W%öÆöv–âÒ&6öçG&–'WF÷" ¢Ð¢ÒÀ¢°¢'w&öær÷væW"76ö6–F–öâ"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæWF†÷%ö76ö6–F–öâÒ$ÔTÔ$U" ¢Ð¢ÒÀ¢°¢&VF—FVB6öÖÖVçB"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâçWFFVEöBÒ###bÓ’ÓCC££¢ ¢Ð¢ÒÀ¢°¢&6†ævVB&öG’"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ&öG’³Ò" ¢Ð¢ÒÀ¢°¢'w&öær–Ö×WF&ÆR&Vb"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&Â³Ò# ¢Ð¢ÒÀ¢°¢'w&öær—77VR"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ—77VU÷W&Â³Ò# ¢Ð¢ÒÀ¢°¢'7FÆRÖ–â"À¢†ò’Óâ°¢òç&VF&6²ç&÷FV7FVEöÖ–âæ6öÖÖ—Bç6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'Vç&÷FV7FVBÖ–â"À¢†ò’Óâ°¢òç&VF&6²ç&÷FV7FVEöÖ–âç&÷FV7FVBÒfÇ6P¢Ð¢ÒÀ¢°¢&÷F†W""&WÆ’"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæçVÖ&W"ÒsP¢Ð¢ÒÀ¢°¢&÷F†W"'&æ6‚"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&VbÒ&f—‚÷Vç&VÆFVB ¢Ð¢ÒÀ¢°¢&f÷&²†VB"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&WòægVÆÅöæÖRÒ&÷F†W"ö6÷W'G6–FR×Gr ¢Ð¢ÒÀ¢°¢&†VBG&–gB"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'G&VRG&–gB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRçG&VU÷6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢&&6RG&–gB"À¢†ò’Óâ°¢òæ6†ævT&6U6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'6VVBG&–gB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRç6VVE÷G&VU÷6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'6VVBæ6W7G'’"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRç6VVEöæ6W7F÷"ÒfÇ6P¢Ð¢ÒÀ¢°¢'&VFFVB–×ÆVÖVçFF–öâ"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæ6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâÒfÇ6P¢Ð¢ÒÀ¢°¢&ÖW&vVB†—7F÷'’"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæÖW&vUö6öÖÖ—Eö6÷VçBÒ¢Ð¢ÒÀ¢°¢&Ö—76–ær&WV—&VBf–ÆR"À¢†ò’Óâ°¢òæ6†ævVEF‡2ç÷‚¢Ð¢ÒÀ¢°¢&W‡G&f–ÆR"À¢†ò’Óâ°¢òæ6†ævVEF‡2çW6‚‚&2÷vV"÷6W'fW"÷Vç&VÆFVBçG2"¢Ð¢ÒÀ¢°¢'G&ç6–VçB66÷RW‡ç6–öâ"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæ†—7F÷'•÷F‡2çW6‚‚%$TDÔRæÖB"¢Ð¢ÒÀ¢°¢&g&÷¦Vâ'—FW26†ævVB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæg&÷¦Våö&Æö'5öÖF6‚ÒfÇ6P¢Ð¢ÒÀ¢°¢'7–ÖÆ–æ²÷"FVÆWFVBf–ÆR"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæÆÆ÷vVE÷F…öÖöFW5öÖF6‚ÒfÇ6P¢Ð¢ÒÀ¢°¢&F—'G’G&VR"À¢†ò’Óâ°¢òæv—D&–æF–ærç7FGW2Ò$D•%E’ ¢Ð¢ÒÀ¢°¢&æöæW†7B'Vâ"À¢†ò’Óâ°¢òç&WV—&TW†7D†VDWf–FVæ6RÒfÇ6P¢Ð¢ÒÀ¢°¢&f÷&vVB7F–öç2ÖWFFF"À¢†ò’Óâ°¢òæv—F‡V$7F–öç46öçFW‡BÒ¥4ôâç'6R„¥4ôâç7G&–æv–g’†òæv—F‡V$7F–öç46öçFW‡B’¢Ð¢Ð¥Ð¦f÷"†6öç7B¶æÖRÂ×WFFUÒöb7GVF–ôæVvF—fT66W2’°¢FW7B†7GVF–ò6ö×ÆWF–öâ6W&FRvFR&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢×WFFR†÷F–öç2¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’À¢fÇ6P¢¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’Âõ7GVF–ò6ö×ÆWF–öâ÷R¢Ò§Ð ¦f÷"†6öç7B×WFFRöb°¢†ò’Óâ°¢òæv—D&–æF–æræ†VE÷&VçEö6÷VçBÒ ¢ÒÀ¢†ò’Óâ°¢òæv—D&–æF–æræ†VE÷&VçE÷6†2Ò²&b"ç&WVBƒC•Ð¢ÒÀ¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæÖW&vUö6öÖÖ—E÷6†Ò&b"ç&WVBƒC¢ÒÀ¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæÖW&vVEöBÒ###bÓ’Ó•C3££¢ ¢Ð¥Ò’°¢FW7B‚%7GVF–ò6ö×ÆWF–öâ6W&FRvFR&V¦V7G2Ö—6ÖF6†VB7V6‚W6‚"Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‡²W6ƒ¢G'VRÒ¢×WFFR†÷F–öç2¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'3¢µÒÒ’À¢fÇ6P¢¢Ò§Ð §FW7B‚%7GVF–ò6ö×ÆWF–öâVæ&÷VæBFW67&—F÷"6ææ÷B66WBf—‡GW&RWF†÷&—G’÷"66W72v—D‡V""Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR‡°¢ââçG&6V&–Æ—G•fÆ–FF÷"å5ETD”õô4ôÕÄUD”ôåôUD„õ$•¤D”ôâÀ¢&Vc¢çVÆÂÀ¢&öG•÷6†#Sc¢çVÆÂÀ¢&V6÷&FVEöC¢çVÆÂÀ¢#¢çVÆÂÀ¢&6U÷6†¢çVÆÀ¢Ò¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ†vFRçfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’ÂfÇ6R¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’Â÷Væ&÷VæB÷R¢ÆWB6ÆÇ2Ò ¢6öç7B&VF&6²ÒvFRæ–ç7V7B†÷F–öç2Â°¢–ç7V7D6öÖÖVçB‚’°¢6ÆÇ2²°¢F‡&÷ræWrW'&÷"‚&×W7Bæ÷BfWF6‚"¢Ð¢Ò¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%Täd”Ä$ÄR"¢76W'BæWVÂ†6ÆÇ2Â¢76W'BæWVÂ†vFRç&WVW7FVB…µÒÂ²†VE÷&Vc¢6öæf–ræ'&æ6‚Ò’ÂG'VR§Ò §FW7B‚%7GVF–ò6ö×ÆWF–öâv—B–ç7V7F÷"&÷fW27GVÂ6VVBÂ†—7F÷'’Âg&÷¦Vâ'—FW2æB&VwVÆ"f–ÆW2"Â‚’Óâ°¢6öç7B²6öæf–rÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢6öç7B&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'7GVF–òÖWF†÷&—¦F–öâÖv—BÒ"’¢6öç7Bv—BÒ‚ââæ&w2’Óà¢W†V4f–ÆU7–æ2‚&v—B"Â&w2Â°¢7vC¢&ö÷BÀ¢Væ6öF–æs¢'WFc‚"À¢Vçc¢°¢ââç&ö6W72æVçbÀ¢t•EôUD„õ%ôDDS¢###bÓ’Ó•C#££³ƒ£"À¢t•Eô4ôÔÔ•EDU%ôDDS¢###bÓ’Ó•C#££³ƒ£ ¢ÒÀ¢7FF–ó¢²&–væ÷&R"Â'—R"Â'—R%Ð¢Ò’çG&–Ò‚¢6öç7Bw&—FRÒ‡ÂfÇVR’Óâ°¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡F‚æ¦ö–â‡&ö÷BÂ’’Â²&V7W'6—fS¢G'VRÒ¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ’ÂfÇVR¢Ð¢6öç7B6öÖÖ—BÒ†ÖW76vR’Óâ°¢v—B‚&FB"Â"ÒÖÆÂ"¢v—B‚&6öÖÖ—B"Â"Ò×V–WB"Â"ÖÒ"ÂÖW76vR¢&WGW&âv—B‚'&Wb×'6R"Â$„TB"¢Ð¢G'’°¢v—B‚&–æ—B"Â"Ò×V–WB"¢v—B‚&6öæf–r"Â'W6W"ææÖR"Â$6öçG&öÆÆVBf—‡GW&R"¢v—B‚&6öæf–r"Â'W6W"æVÖ–Â"Â&f—‡GW&TW†×ÆRçFW7B"¢f÷"†6öç7Böb°¢ââæ6öæf–rç&WV—&VE÷F‡2À¢%$TDÔRæÖB"À¢'7V72öf—‡GW&RæÖB"À¢"æÆö÷öWf–FVæ6R÷CƒRÖg&÷¦Vâæ§6öâ ¢Ò¢w&—FR‡Â&&6UÆâ"¢6öæf–ræ&6U÷6†Ò6öÖÖ—B‚&6öçG&öÆÆVB&6R"¢76W'Bæö²†6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡2æ–æ6ÇVFW2‚&2÷vV"÷6W'fW"ö’÷7GVF–òõ²ââçF…ÒçG2"’¢f÷"†6öç7Böb6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡2’w&—FR‡Â%7GVF–ò6VVEÆâ"¢6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†Ò6öÖÖ—B‚&66WFVB6öçG&öÆÆVB6VVB"¢6öæf–ræ–æ—F–Å÷6VVBçG&VU÷6†Òv—B‚'&Wb×'6R"Â$„TEç·G&VWÒ"¢w&—FR‚'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"Â%$TBf—‡GW&UÆâ"¢6öÖÖ—B‚&6öçG&öÆÆVB$TB"¢w&—FR‚'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"Â$u$TTâf—‡GW&UÆâ"¢6öç7B†VBÒ6öÖÖ—B‚&6öçG&öÆÆVBu$TTâ"¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢6öç7B6æF–FFRÒvFRæ–ç7V7D6æF–FFR‡&ö÷BÂ†VB¢76W'BæWVÂ†6æF–FFRæ†VBÂ†VB¢76W'BæÖF6‚€¢v—B‚&Æör"Â"ÒÖf÷&ÖCÒV’VâV4’"ÂG¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†ÒââG¶†VGÖ’À¢õ²µÓƒ£÷P¢¢76W'BæWVÂ€¢6æF–FFRæ6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâÀ¢G'VRÀ¢&æöâÕUD2WF†÷"æB6öÖÖ—GFW"F–ÖW7F×2 ¢¢76W'BæFVWWVÂ†6æF–FFRæf—'7EöÖVæFÖVçE÷&VçE÷6†2Â¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†Ò¢76W'BæFVWWVÂ†6æF–FFRæf—'7EöÖVæFÖVçEö6†ævVE÷F‡2Â°¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2 ¢Ò¢76W'BæWVÂ†6æF–FFRæ6öÖÖ—Eö6÷VçBÂ"¢76W'BæWVÂ†6æF–FFRæÖW&vUö6öÖÖ—Eö6÷VçBÂ¢f÷"†6öç7B¶W’öb°¢&&6Uöæ6W7F÷""À¢'6VVEöæ6W7F÷""À¢&6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâ"À¢&g&÷¦Våö&Æö'5öÖF6‚"À¢&ÆÆ÷vVE÷F…öÖöFW5öÖF6‚ ¢Ò’°¢76W'BæWVÂ†6æF–FFU¶¶W•ÒÂG'VRÂ¶W’¢Ð¢76W'BæFVWWVÂ†6æF–FFRç6VVEö6†ævVE÷F‡2Â6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡2¢76W'BæFVWWVÂ†6æF–FFRæ†—7F÷'•÷F‡2Â²ââæ6öæf–rç&WV—&VE÷F‡5Òç6÷'B‚’¢w&—FR‚&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"Â&æ÷BWF†÷&—¦VEÆâ"¢6öÖÖ—B‚'VæWF†÷&—¦VB†—7F÷&–6Âw&—FR"¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"’¢6öç7B&WfW'FVBÒvFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚'&VÖ÷fRVç&VÆFVBF‚"’¢76W'BæFVWWVÂ‡&WfW'FVBæ6†ævVE÷F‡2Â6æF–FFRæ6†ævVE÷F‡2¢76W'Bæö²‡&WfW'FVBæ†—7F÷'•÷F‡2æ–æ6ÇVFW2‚&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"’¢w&—FR‚%$TDÔRæÖB"Â&6†ævVBg&÷¦Vâ&V6V—EÆâ"¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚&×WFFRg&÷¦Vâf–ÆR"’’æg&÷¦Våö&Æö'5öÖF6‚À¢fÇ6P¢¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢g2ç7–ÖÆ–æµ7–æ2‚"ââòââòââòââõ$TDÔRæÖB"ÂF‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚'7–ÖÆ–æ²&WV—&VBf–ÆR"’’æÆÆ÷vVE÷F…öÖöFW5öÖF6‚À¢fÇ6P¢¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚&FVÆWFR&WV—&VBf–ÆR"’’æÆÆ÷vVE÷F…öÖöFW5öÖF6‚À¢fÇ6P¢¢6öç7BÖW&vRÒv—B€¢&6öÖÖ—B×G&VR"À¢v—B‚'&Wb×'6R"Â$„TEç·G&VWÒ"’À¢"×"À¢v—B‚'&Wb×'6R"Â$„TB"’À¢"×"À¢6öæf–ræ&6U÷6†À¢"ÖÒ"À¢&6öçG&öÆÆVBÖW&vR ¢¢76W'BæWVÂ†vFRæ–ç7V7D6æF–FFR‡&ö÷BÂÖW&vR’æÖW&vUö6öÖÖ—Eö6÷VçBÂ¢76W'BæWVÂ†vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ"ÒÖÆÂ"’ÂçVÆÂ¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡&ö÷BÂ²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð§Ò §FW7B‚%7GVF–ò6ö×ÆWF–öâ’&VBÖ&6²6VÆV7G2öæÇ’F†R6VÆVB"ö6öÖÖVçBæB6æ—F—¦W2f–ÇW&R"Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢6öç7B6ÆÇ2ÒµÐ¢6öç7BFFW'2Ò°¢–ç7V7D6öÖÖVçB‡&VbÂ÷G2’°¢6ÆÇ2çW6‚‚&6öÖÖVçB"¢76W'BæWVÂ‡&VbÂ6öæf–rç&Vb¢76W'BæWVÂ†÷G2æ—4WF†÷&—¦VE&Vb‡&Vb’ÂG'VR¢76W'BæWVÂ†÷G2æ—4WF†÷&—¦VE&Vb‡&Vb²#"’ÂfÇ6R¢&WGW&â÷F–öç2ç&VF&6²æWF†÷&—¦F–öà¢ÒÀ¢fWF6„§6öâ‡W&Â’°¢6ÆÇ2çW6‚‡W&Â¢&WGW&âW&ÂæVæG5v—F‚‚"ö'&æ6†W2öÖ–â"¢ò÷F–öç2ç&VF&6²ç&÷FV7FVEöÖ–à¢¢÷F–öç2ç&VF&6²çVÆÅ÷&WVW7@¢ÒÀ¢6æF–FFT–ç7V7F÷"‡&ö÷BÂ†VB’°¢76W'BæWVÂ‡&ö÷BÂ&6öçG&öÆÆVB×&ö÷B"¢76W'BæWVÂ††VBÂ÷F–öç2ç&VF&6²çVÆÅ÷&WVW7Bæ†VBç6†¢&WGW&â÷F–öç2ç&VF&6²æ6æF–FFP¢Ð¢Ð¢6öç7B&VF&6²ÒvFRæ–ç7V7B‚&6öçG&öÆÆVB×&ö÷B"ÂFFW'2¢76W'BæFVWWVÂ†6ÆÇ2Â°¢&6öÖÖVçB"À¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÇ2ósb"À¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö'&æ6†W2öÖ–â ¢Ò¢76W'BæWVÂ†vFRçfÆ–FFR‡²ââæ÷F–öç2Â&VF&6²ÂW'&÷'3¢µÒÒ’ÂG'VR¢f÷"†6öç7Bf–ÆVDFFW"öb²&–ç7V7D6öÖÖVçB"Â&fWF6„§6öâ"Â&6æF–FFT–ç7V7F÷"%Ò’°¢6öç7Bf–ÇW&RÒvFRæ–ç7V7B‚&6öçG&öÆÆVB×&ö÷B"Â°¢ââæFFW'2À¢¶f–ÆVDFFW%Ò‚’°¢F‡&÷ræWrW'&÷"‚'6V7&WB×Fö¶VâÖ×W7BÖæ÷BÖÆV²"¢Ð¢Ò¢76W'BæWVÂ†f–ÇW&Rç7FGW2Â%Täd”Ä$ÄR"¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’†f–ÇW&R’Â÷6V7&WB×Fö¶Vâ÷R¢Ð§Ò §FW7B‚%7GVF–ò6ö×ÆWF–öâ&VgW6W2ÖÆf÷&ÖVB–ææVB¥4ôâæBÖ—6ÖF6‚&WGvVVâ6VÂæBF—7F6‚"Â‚’Óâ°¢f÷"†6öç7B&WÆ6Röb°¢†&öG’’Óâ&öG’ç&WÆ6R‚r&FV6—6–öâ#¢rÂr&FV6—6–öâ#¢$D•5D4…ô44UDTB"Â&FV6—6–öâ#¢r’À¢†&öG’’Óâ&öG’ç&WÆ6R‚r&&6U÷6†#¢"r²&""ç&WVBƒC’Âr&&6U÷6†#¢"r²&R"ç&WVBƒC’’À¢†&öG’’Óâ&öG’²%ÆãÂÒÒ7GVF–òÖ6ö×ÆWF–öã¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓâ ¢Ò’°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’Ò&WÆ6R†÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’¢6öæf–ræ&öG•÷6†#SbÒ7&VFT†6‚‚'6†#Sb"¢çWFFR†÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’¢æF–vW7B‚&†W‚"¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'3¢µÒÒ’À¢fÇ6P¢¢Ð§Ò §FW7B‚%7GVF–ò6ö×ÆWF–öâ6–ævÆWFöâæWfW"66WG26ÆÆW"Ö–æ¦V7FVBf7F÷'’6öæf–wW&F–öâ"Â‚’Óâ°¢6öç7B²6öæf–rÂ6öçFW‡BÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢6öçFW‡Bæf—‡GW&Ræ6†ævVEF‡2Ò²ââæ6öæf–rç&WV—&VE÷F‡5Ð¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ÷F–öç2æv—F‡V$7F–öç46öçFW‡B¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†6öçFW‡Bæf—‡GW&RÂ°¢7W'&VçD†VC¢6öçFW‡Bæ†VBÀ¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó•C#££¢"À¢ââæ÷F–öç2À¢7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öå&VF&6³¢6öçFW‡Bç&VF&6²À¢7GVF–ô6ö×ÆWF–öä6öæf–wW&F–öã¢6öæf–p¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç6÷W&6Rç7GVF–õö6ö×ÆWF–öåöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’Âõ7GVF–ò6ö×ÆWF–öâWF†÷&—¦F–öâ÷R§Ò §FW7B‚%7GVF–ò6ö×ÆWF–öâ6VÆVB6–ævÆWFöâ&V6†W2gVÆÂfÆ–FF÷"f÷"G&gBÂ&VG’æB6ÖR×G&VR7V6‚"Â7–æ2‚’Óâ°¢f÷"†6öç7B7FFRöb²&G&gB"Â'&VG’"Â'7V6‚×W6‚%Ò’°¢6öç7BW6‚Ò7FFRÓÓÒ'7V6‚×W6‚ ¢6öç7B²6öæf–rÂ6öçFW‡BÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‡°¢W6‚À¢G&gC¢7FFRÓÓÒ&G&gB ¢Ò¢6öç7BFV×÷&'’Òg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'7GVF–òÖ6ö×ÆWF–öâ×6VÆVBÖÖöGVÆRÒ"’¢G'’°¢g2ç7–ÖÆ–æµ7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ&æöFUöÖöGVÆW2"’À¢F‚æ¦ö–â‡FV×÷&'’Â&æöFUöÖöGVÆW2"’À¢&F—" ¢¢6öç7B6÷W&6RÒg2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"’À¢'WFc‚ ¢¢6öç7B7F'BÒ6÷W&6Ræ–æFW„öb‚&W‡÷'B6öç7B5ETD”õô4ôÕÄUD”ôåôUD„õ$•¤D”ôâÒö&¦V7Bæg&VW¦R‡²"¢6öç7BVæBÒ6÷W&6Ræ–æFW„öb‚%Æâò¢¢6W&FR6Æ÷6VBWF†÷&—G’â"Â7F'B¢76W'Bæö²‡7F'BâbbVæBâ7F'B¢òòF†R6öçG&öÆÆVBÖöGVÆR7V'7F—GWFW2öæÇ’F†RFW67&—F÷"â&öGV7F–öâ†2æò6öæf–r–çWBà¢6öç7Bf—‡GW&TÖöGVÆRÒF‚æ¦ö–â‡FV×÷&'’Â'fÆ–FF÷"æÖ§2"¢g2çw&—FTf–ÆU7–æ2€¢f—‡GW&TÖöGVÆRÀ¢6÷W&6Rç6Æ–6RƒÂ7F'B’°¢&W‡÷'B6öç7B5ETD”õô4ôÕÄUD”ôåôUD„õ$•¤D”ôâÒö&¦V7Bæg&VW¦R‚"°¢¥4ôâç7G&–æv–g’†6öæf–r’°¢"•Æâ"°¢6÷W&6Rç6Æ–6R†VæB¢¢6öç7B²F…Fôf–ÆUU$ÂÒÒv—B–×÷'B‚&æöFS§W&Â"¢6öç7BfÆ–FF÷"Òv—B–×÷'B‡F…Fôf–ÆUU$Â†f—‡GW&TÖöGVÆR’æ‡&Vb¢6öç7B7F–öç2ÒfÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢W6‚ò'W6‚"¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢F‚æ¦ö–â†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ'7GVF–òÖWfVçBæ§6öâ"’À¢t•D…T%õ4„¢W6‚ò6öçFW‡Bæ†VB¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢#"À¢t•D…T%õ$Tc¢W6‚ò'&Vg2ö†VG2öÖ–â"¢&Vg2÷VÆÂòG¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%õ$TeôäÔS¢W6‚ò&Ö–â"¢G¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%ô$4Uõ$Tc¢W6‚ò""¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢W6‚ò""¢6öæf–ræ'&æ6€¢ÒÀ¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–æp¢Ò¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ7F–öç2¢6öç7Bf—‡GW&RÒ6öçFW‡Bæf—‡GW&P¢6öç7BfÆ–FFRÒ†÷fW'&–FW2Ò·Ò’Óà¢fÆ–FF÷"çfÆ–FFUG&6V&–Æ—G’‡°¢&ö÷C¢f—‡GW&Rç&ö÷BÀ¢7W'&VçD†VC¢6öçFW‡Bæ†VBÀ¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó•C#££¢"À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢6†ævT&6UF6·5FW‡C¢f—‡GW&Ræ6†ævT&6UF6·5FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢f—‡GW&Ræ6†ævT&6UG&6V&–Æ—G•FW‡BÀ¢6†ævT&6T6ö×ÆWF–öå&V6V—EFW‡C¢f—‡GW&Ræ6†ævT&6T6ö×ÆWF–öå&V6V—EFW‡BÀ¢66WFVEG&6V&–Æ—G•6†#Sc¢f—‡GW&Ræ66WFVEG&6V&–Æ—G•6†#SbÀ¢66WFVEVæF–æuF6·56†#Sc¢f—‡GW&Ræ66WFVEVæF–æuF6·56†#SbÀ¢66WFVD6ö×ÆWFVEF6·56†#Sc¢f—‡GW&Ræ66WFVD6ö×ÆWFVEF6·56†#SbÀ¢ââæ÷F–öç2À¢v—F‡V$7F–öç46öçFW‡C¢7F–öç2À¢7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öå&VF&6³¢6öçFW‡Bç&VF&6²À¢ââæ÷fW'&–FW0¢Ò¢6öç7B&W÷'BÒfÆ–FFR‚¢76W'BæWVÂ€¢&W÷'Bç6÷W&6Rç7GVF–õö6ö×ÆWF–öåöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÀ¢G'VRÀ¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"¢¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â7FFR²%Æâ"²&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2ÂµÒ¢–b‡7FFRÓÓÒ&G&gB"’°¢f÷"†6öç7Bf–ÇW&Röb²&f÷'G’×6V6öæBF‚"Â'w&öær""Â&Ö—76–ærõtäU"%Ò’°¢6öç7B&VF&6²Ò7G'V7GW&VD6ÆöæR†6öçFW‡Bç&VF&6²¢6öç7B6†ævVEF‡2Ò²ââæ÷F–öç2æ6†ævVEF‡5Ð¢–b†f–ÇW&RÓÓÒ&f÷'G’×6V6öæBF‚"’6†ævVEF‡2çW6‚‚"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"¢–b†f–ÇW&RÓÓÒ'w&öær""’&VF&6²çVÆÅ÷&WVW7BæçVÖ&W"Òs@¢–b†f–ÇW&RÓÓÒ&Ö—76–ærõtäU""’&VF&6²æWF†÷&—¦F–öâÒçVÆÀ¢6öç7B&V¦V7FVBÒfÆ–FFR‡°¢6†ævVEF‡2À¢7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò¢76W'BæWVÂ‡&V¦V7FVBç7FGW2Â$d”Â"Âf–ÇW&R¢76W'BæWVÂ€¢&V¦V7FVBç6÷W&6Rç7GVF–õö6ö×ÆWF–öåöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÀ¢fÇ6RÀ¢f–ÇW&P¢¢76W'BæÖF6‚‡&V¦V7FVBæW'&÷'2æ¦ö–â‚%Æâ"’Âõ7GVF–ò6ö×ÆWF–öâWF†÷&—¦F–öâ÷R¢Ð¢Ð¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡FV×÷&'’Â²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð¢Ð§Ò ¦f÷"†6öç7BVç6fUF‚öb°¢&2÷vV"òââöW66RçG2"À¢&2÷vV"÷6W'fW"òââòââöW66RçG2"À¢"ö2÷vV"÷6W'fW"öW66RçG2"À¢&2÷vV"÷6W'fW%ÅÆW66RçG2 ¥Ò’°¢FW7B†7GVF–ò6ö×ÆWF–öâF‚wV&B&V¦V7G2Vç6fRF‚G·Vç6fUF‡ÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶U7GVF–ôWF†÷&—¦F–öäf—‡GW&R‚¢6öæf–ræ÷F–öæÅ÷F‡2çW6‚‡Vç6fUF‚¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷"æ7&VFU7GVF–ô6ö×ÆWF–öäWF†÷&—¦F–öävFR†6öæf–r’çfÆ–FFR‡°¢ââæ÷F–öç2À¢W'&÷'0¢Ò’À¢fÇ6P¢¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’Âö—2Væ&÷VæB÷R¢Ò§Ð ¢òòV&Æ–6F–öâ66†RW6W26W&FR–ææVBWF†÷&—G“²f—‡GW&RG'W7BæWfW"VçFW'2'Vä6Æ’÷fÆ–FFUG&6V&–Æ—G’à¦gVæ7F–öâÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‡²W6‚ÒfÇ6RÂG&gBÒG'VRÒÒ·Ò’°¢6öç7B6öçFW‡BÒÖ¶UçÕ6V7W&—G”f—‡GW&R‡²W6‚ÂG&gBÒ¢6öç7B6öæf–rÒ°¢&Vc¢&‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#6—77VV6öÖÖVçBÓcs‚"À¢&V6÷&FVEöC¢###bÓ’Ó•CC££¢"À¢#¢s‚À¢'&æ6ƒ¢&f—‚÷V&Æ–6F–öâÖ66†RÖ6ö×ÆWF–öâ"À¢&6U÷6†¢&""ç&WVBƒC’À¢–æ—F–Å÷6VVC¢°¢†VE÷6†¢&2"ç&WVBƒC’À¢G&VU÷6†¢&B"ç&WVBƒC’À¢6†ævVE÷F‡3¢°¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æRöÖVF–ôÖVF–&Wfö6F–öåv÷&¶W$6öæf–wW&F–öâæ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"ô‡GGV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä–çfÆ–FF–öå&÷W'F–W2æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä¦ö$†æFÆW"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öåv÷&¶W$6öæf–wW&F–öâæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâõV&Æ–6F–öå&VÆ–&–Æ—G”•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâö’õV&Æ–6F–öä66WFæ6T”•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"ô‡GGV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷%FW7Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä–çfÆ–FF–öå&÷W'F–W5FW7Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä¦ö$†æFÆW$•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öåv÷&¶W$6öæf–wW&F–öåFW7Bæ¦f"À¢&2÷vV"÷6W'fW"÷&÷WFW2÷6—FVÖç†ÖÂçG2"À¢&2÷vV"÷FW7G2öS&R÷W3Ö'&÷w6RÖ—77VRç7V2çG2"À¢&Fö72öG"ó’×V&Æ–6F–öâÖ66†RÖ–çfÆ–FF–öâæÖB ¢Ð¢ÒÀ¢&WV—&VE÷F‡3¢°¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æRöÖVF–ôÖVF–&Wfö6F–öåv÷&¶W$6öæf–wW&F–öâæ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"ô‡GGV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä–çfÆ–FF–öå&÷W'F–W2æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä¦ö$†æFÆW"æ¦f"À¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öåv÷&¶W$6öæf–wW&F–öâæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâõV&Æ–6F–öå&VÆ–&–Æ—G”•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâö’õV&Æ–6F–öä66WFæ6T”•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"ô‡GGV&Æ–6F–öäW‡FW&æÄ–çfÆ–FF÷%FW7Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä–çfÆ–FF–öå&÷W'F–W5FW7Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä¦ö$†æFÆW$•Bæ¦f"À¢&2ö’÷7&2÷FW7Bö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öåv÷&¶W$6öæf–wW&F–öåFW7Bæ¦f"À¢&2÷vV"÷6W'fW"÷&÷WFW2÷6—FVÖç†ÖÂçG2"À¢&2÷vV"÷FW7G2öS&R÷W3Ö'&÷w6RÖ—77VRç7V2çG2"À¢&Fö72öG"ó’×V&Æ–6F–öâÖ66†RÖ–çfÆ–FF–öâæÖB"À¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"À¢'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2 ¢ÒÀ¢÷F–öæÅ÷F‡3¢µÐ¢Ð¢6öç7BF—7F6‚Ò°¢66†VÖ÷fW'6–öã¢&6÷W'G6–FR×V&Æ–6F–öâÖ66†RÖ÷væW"ÖF—7F6‚÷c"À¢FV6—6–öã¢$D•5D4…ô44UDTB"À¢vFU÷66÷S¢$44„Uô”ÕÄTÔTåDD”ôåôôäÅ’"À¢&VÆV6Uö66WFVC¢fÇ6RÀ¢F6µ÷7FFUö6†ævVC¢fÇ6RÀ¢'VÆW6WEö×WFFVC¢fÇ6RÀ¢&W÷6—F÷'“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢#¢6öæf–rç"À¢'&æ6ƒ¢6öæf–ræ'&æ6‚À¢&6U÷6†¢6öæf–ræ&6U÷6†À¢–æ—F–Å÷6VVC¢7G'V7GW&VD6ÆöæR†6öæf–ræ–æ—F–Å÷6VVB’À¢&WV—&VE÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢÷F–öæÅ÷F‡3¢µÐ¢Ð¢6öç7B&öG’Ð¢#ÂÒÒV&Æ–6F–öâÖ66†S¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓåÆæ§6öåÆâ"°¢¥4ôâç7G&–æv–g’†F—7F6‚’°¢%ÆæÆãÂÒÒV&Æ–6F–öâÖ66†S¦÷væW"ÖF—7F6ƒ§c¦VæBÒÓâ ¢6öæf–ræ&öG•÷6†#SbÒ7&VFT†6‚‚'6†#Sb"’çWFFR†&öG’’æF–vW7B‚&†W‚"¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²æWF†÷&—¦F–öâÂ°¢‡FÖÅ÷W&Ã¢6öæf–rç&VbÀ¢—77VU÷W&Ã¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö—77VW2ó#"À¢&öG’À¢7&VFVEöC¢6öæf–rç&V6÷&FVEöBÀ¢WFFVEöC¢6öæf–rç&V6÷&FVEö@¢Ò¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7BÂ°¢çVÖ&W#¢6öæf–rç"À¢‡FÖÅ÷W&Ã¢‡GG3¢òöv—F‡V"æ6öÒö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÂòG¶6öæf–rç'ÖÀ¢ÖW&vVEöC¢W6‚ò###bÓ’Ó•C#££¢"¢çVÆÀ¢Ò¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&VbÒ6öæf–ræ'&æ6€¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7Bæ&6Rç6†Ò6öæf–ræ&6U÷6†¢6öçFW‡Bç&VF&6²ç&÷FV7FVEöÖ–âÒ°¢æÖS¢&Ö–â"À¢&÷FV7FVC¢G'VRÀ¢6öÖÖ—C¢²6†¢W6‚ò6öçFW‡Bæ†VB¢6öæf–ræ&6U÷6†Ð¢Ð¢ö&¦V7Bæ76–vâ†6öçFW‡Bç&VF&6²æ6æF–FFRÂ°¢&6U÷&VFFW5öWF†÷&—¦F–öã¢G'VRÀ¢g&÷¦Våö&Æö'5öÖF6ƒ¢G'VRÀ¢ÆÆ÷vVE÷F…öÖöFW5öÖF6ƒ¢G'VRÀ¢6VVE÷G&VU÷6†¢6öæf–ræ–æ—F–Å÷6VVBçG&VU÷6†À¢6VVE÷&VçE÷6†3¢¶6öæf–ræ&6U÷6†ÒÀ¢6VVEö6†ævVE÷F‡3¢²ââæ6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡5ÒÀ¢f—'7EöÖVæFÖVçE÷&VçE÷6†3¢¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†ÒÀ¢f—'7EöÖVæFÖVçEö6†ævVE÷F‡3¢²'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2%ÒÀ¢6†ævVE÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢†—7F÷'•÷F‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5Ð¢Ò¢ö&¦V7Bæ76–vâ†6öçFW‡Bæv—D&–æF–ærÂ°¢6†ævUö&6U÷6†¢6öæf–ræ&6U÷6†À¢†VE÷&VçE÷6†¢6öæf–ræ&6U÷6†À¢†VE÷&VçE÷6†3¢¶6öæf–ræ&6U÷6†Ð¢Ò¢6öç7BWfVçEF‚ÒF‚æ¦ö–â†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ'V&Æ–6F–öâÖ66†RÖWfVçBæ§6öâ"¢g2çw&—FTf–ÆU7–æ2€¢WfVçEF‚À¢¥4ôâç7G&–æv–g’€¢W6€¢ò°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢&Vc¢'&Vg2ö†VG2öÖ–â"À¢&Vf÷&S¢6öæf–ræ&6U÷6†À¢gFW#¢6öçFW‡Bæ†V@¢Ð¢¢°¢&W÷6—F÷'“¢²gVÆÅöæÖS¢&'–ææ6’ö6÷W'G6–FR×Gr"ÒÀ¢çVÖ&W#¢6öæf–rç"À¢VÆÅ÷&WVW7C¢6öçFW‡Bç&VF&6²çVÆÅ÷&WVW7@¢Ð¢¢¢6öçFW‡Bæv—F‡V$7F–öç46öçFW‡BÒG&6V&–Æ—G•fÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢W6‚ò'W6‚"¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢WfVçEF‚À¢t•D…T%õ4„¢W6‚ò6öçFW‡Bæ†VB¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢#"À¢t•D…T%õ$Tc¢W6‚ò'&Vg2ö†VG2öÖ–â"¢&Vg2÷VÆÂòG¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%õ$TeôäÔS¢W6‚ò&Ö–â"¢G¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%ô$4Uõ$Tc¢W6‚ò""¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢W6‚ò""¢6öæf–ræ'&æ6€¢ÒÀ¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–æp¢Ò¢&WGW&â°¢6öæf–rÀ¢6öçFW‡BÀ¢÷F–öç3¢°¢&VF&6³¢6öçFW‡Bç&VF&6²À¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–ærÀ¢6†ævVEF‡3¢²ââæ6öæf–rç&WV—&VE÷F‡5ÒÀ¢6†ævT&6U6†¢6öæf–ræ&6U÷6†À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢v—F‡V$7F–öç46öçFW‡C¢6öçFW‡Bæv—F‡V$7F–öç46öçFW‡BÀ¢&WV—&TW†7D†VDWf–FVæ6S¢G'VP¢Ð¢Ð§Ð ¦f÷"†6öç7B7FFRöb²&G&gB"Â'&VG’"Â'7V6‚×W6‚%Ò’°¢FW7B†V&Æ–6F–öâ66†R6W&FRvFR66WG2WF†VçF–6FVBW†7BG·7FFWÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‡°¢W6ƒ¢7FFRÓÓÒ'7V6‚×W6‚"À¢G&gC¢7FFRÓÓÒ&G&gB ¢Ò¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’À¢G'VRÀ¢W'&÷'2æ¦ö–â‚%Æâ"¢¢Ò§Ð ¦6öç7BV&Æ–6F–öä66†TæVvF—fT66W2Ò°¢°¢&&6RæWvW"F†âF—7F6‚"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæ&6U÷&VFFW5öWF†÷&—¦F–öâÒfÇ6P¢Ð¢ÒÀ¢°¢&–×ÆVÖVçFF–öâ&Vf÷&RG&6V&–Æ—G’$TB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæf—'7EöÖVæFÖVçEö6†ævVE÷F‡2Ò°¢&2ö’÷7&2öÖ–âö¦f÷Grö&6¶WF&ÆÂöÖv¦–æR÷V&Æ–6F–öâ÷v÷&¶W"õV&Æ–6F–öä¦ö$†æFÆW"æ¦f ¢Ð¢Ð¢ÒÀ¢°¢&FWF6†VBG&6V&–Æ—G’$TB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæf—'7EöÖVæFÖVçE÷&VçE÷6†2Ò²&b"ç&WVBƒC•Ð¢Ð¢ÒÀ¢°¢&Ö—76–ær÷væW""À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâÒçVÆÀ¢Ð¢ÒÀ¢°¢'Væf–Æ&ÆR’"À¢†ò’Óâ°¢òç&VF&6²ç7FGW2Ò%Täd”Ä$ÄR ¢Ð¢ÒÀ¢°¢'w&öær÷væW""À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâçW6W%öÆöv–âÒ&6öçG&–'WF÷" ¢Ð¢ÒÀ¢°¢'w&öær÷væW"76ö6–F–öâ"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæWF†÷%ö76ö6–F–öâÒ$ÔTÔ$U" ¢Ð¢ÒÀ¢°¢&VF—FVB6öÖÖVçB"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâçWFFVEöBÒ###bÓ’ÓCC££¢ ¢Ð¢ÒÀ¢°¢&6†ævVB&öG’"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ&öG’³Ò" ¢Ð¢ÒÀ¢°¢'w&öær–Ö×WF&ÆR&Vb"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ‡FÖÅ÷W&Â³Ò# ¢Ð¢ÒÀ¢°¢'w&öær—77VR"À¢†ò’Óâ°¢òç&VF&6²æWF†÷&—¦F–öâæ—77VU÷W&Â³Ò# ¢Ð¢ÒÀ¢°¢'7FÆRÖ–â"À¢†ò’Óâ°¢òç&VF&6²ç&÷FV7FVEöÖ–âæ6öÖÖ—Bç6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'Vç&÷FV7FVBÖ–â"À¢†ò’Óâ°¢òç&VF&6²ç&÷FV7FVEöÖ–âç&÷FV7FVBÒfÇ6P¢Ð¢ÒÀ¢°¢&÷F†W""&WÆ’"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæçVÖ&W"ÒsP¢Ð¢ÒÀ¢°¢&÷F†W"'&æ6‚"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&VbÒ&f—‚÷Vç&VÆFVB ¢Ð¢ÒÀ¢°¢&f÷&²†VB"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç&WòægVÆÅöæÖRÒ&÷F†W"ö6÷W'G6–FR×Gr ¢Ð¢ÒÀ¢°¢&†VBG&–gB"À¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7Bæ†VBç6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'G&VRG&–gB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRçG&VU÷6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢&&6RG&–gB"À¢†ò’Óâ°¢òæ6†ævT&6U6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'6VVBG&–gB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRç6VVE÷G&VU÷6†Ò&b"ç&WVBƒC¢Ð¢ÒÀ¢°¢'6VVBæ6W7G'’"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRç6VVEöæ6W7F÷"ÒfÇ6P¢Ð¢ÒÀ¢°¢'&VFFVB–×ÆVÖVçFF–öâ"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæ6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâÒfÇ6P¢Ð¢ÒÀ¢°¢&ÖW&vVB†—7F÷'’"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæÖW&vUö6öÖÖ—Eö6÷VçBÒ¢Ð¢ÒÀ¢°¢&Ö—76–ær&WV—&VBf–ÆR"À¢†ò’Óâ°¢òæ6†ævVEF‡2ç÷‚¢Ð¢ÒÀ¢°¢&W‡G&f–ÆR"À¢†ò’Óâ°¢òæ6†ævVEF‡2çW6‚‚&2÷vV"÷6W'fW"÷Vç&VÆFVBçG2"¢Ð¢ÒÀ¢°¢'G&ç6–VçB66÷RW‡ç6–öâ"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæ†—7F÷'•÷F‡2çW6‚‚%$TDÔRæÖB"¢Ð¢ÒÀ¢°¢&g&÷¦Vâ'—FW26†ævVB"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæg&÷¦Våö&Æö'5öÖF6‚ÒfÇ6P¢Ð¢ÒÀ¢°¢'7–ÖÆ–æ²÷"FVÆWFVBf–ÆR"À¢†ò’Óâ°¢òç&VF&6²æ6æF–FFRæÆÆ÷vVE÷F…öÖöFW5öÖF6‚ÒfÇ6P¢Ð¢ÒÀ¢°¢&F—'G’G&VR"À¢†ò’Óâ°¢òæv—D&–æF–ærç7FGW2Ò$D•%E’ ¢Ð¢ÒÀ¢°¢&æöæW†7B'Vâ"À¢†ò’Óâ°¢òç&WV—&TW†7D†VDWf–FVæ6RÒfÇ6P¢Ð¢ÒÀ¢°¢&f÷&vVB7F–öç2ÖWFFF"À¢†ò’Óâ°¢òæv—F‡V$7F–öç46öçFW‡BÒ¥4ôâç'6R„¥4ôâç7G&–æv–g’†òæv—F‡V$7F–öç46öçFW‡B’¢Ð¢Ð¥Ð¦f÷"†6öç7B¶æÖRÂ×WFFUÒöbV&Æ–6F–öä66†TæVvF—fT66W2’°¢FW7B†V&Æ–6F–öâ66†R6W&FRvFR&V¦V7G2G¶æÖWÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢×WFFR†÷F–öç2¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’À¢fÇ6P¢¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’ÂõV&Æ–6F–öâ66†R÷R¢Ò§Ð ¦f÷"†6öç7B×WFFRöb°¢†ò’Óâ°¢òæv—D&–æF–æræ†VE÷&VçEö6÷VçBÒ ¢ÒÀ¢†ò’Óâ°¢òæv—D&–æF–æræ†VE÷&VçE÷6†2Ò²&b"ç&WVBƒC•Ð¢ÒÀ¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæÖW&vUö6öÖÖ—E÷6†Ò&b"ç&WVBƒC¢ÒÀ¢†ò’Óâ°¢òç&VF&6²çVÆÅ÷&WVW7BæÖW&vVEöBÒ###bÓ’Ó•C3££¢ ¢Ð¥Ò’°¢FW7B‚%V&Æ–6F–öâ66†R6W&FRvFR&V¦V7G2Ö—6ÖF6†VB7V6‚W6‚"Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‡²W6ƒ¢G'VRÒ¢×WFFR†÷F–öç2¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'3¢µÒÒ’À¢fÇ6P¢¢Ò§Ð §FW7B‚%V&Æ–6F–öâ66†RVæ&÷VæBFW67&—F÷"6ææ÷B66WBf—‡GW&RWF†÷&—G’÷"66W72v—D‡V""Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR‡°¢ââçG&6V&–Æ—G•fÆ–FF÷"åT$Ä”4D”ôåô44„UôUD„õ$•¤D”ôâÀ¢&Vc¢çVÆÂÀ¢&öG•÷6†#Sc¢çVÆÂÀ¢&V6÷&FVEöC¢çVÆÂÀ¢#¢çVÆÂÀ¢&6U÷6†¢çVÆÀ¢Ò¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ†vFRçfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’ÂfÇ6R¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’Â÷Væ&÷VæB÷R¢ÆWB6ÆÇ2Ò ¢6öç7B&VF&6²ÒvFRæ–ç7V7B†÷F–öç2Â°¢–ç7V7D6öÖÖVçB‚’°¢6ÆÇ2²°¢F‡&÷ræWrW'&÷"‚&×W7Bæ÷BfWF6‚"¢Ð¢Ò¢76W'BæWVÂ‡&VF&6²ç7FGW2Â%Täd”Ä$ÄR"¢76W'BæWVÂ†6ÆÇ2Â¢76W'BæWVÂ†vFRç&WVW7FVB…µÒÂ²†VE÷&Vc¢6öæf–ræ'&æ6‚Ò’ÂG'VR§Ò §FW7B‚%V&Æ–6F–öâ66†Rv—B–ç7V7F÷"&÷fW27GVÂ6VVBÂ†—7F÷'’Âg&÷¦Vâ'—FW2æB&VwVÆ"f–ÆW2"Â‚’Óâ°¢6öç7B²6öæf–rÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢6öç7B&ö÷BÒg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'V&Æ–6F–öâÖ66†RÖWF†÷&—¦F–öâÖv—BÒ"’¢ÆWBf—‡GW&TFFRÒ###bÓ’Ó•C££³ƒ£ ¢6öç7Bv—BÒ‚ââæ&w2’Óà¢W†V4f–ÆU7–æ2‚&v—B"Â&w2Â°¢7vC¢&ö÷BÀ¢Væ6öF–æs¢'WFc‚"À¢Vçc¢°¢ââç&ö6W72æVçbÀ¢t•EôUD„õ%ôDDS¢f—‡GW&TFFRÀ¢t•Eô4ôÔÔ•EDU%ôDDS¢f—‡GW&TFFP¢ÒÀ¢7FF–ó¢²&–væ÷&R"Â'—R"Â'—R%Ð¢Ò’çG&–Ò‚¢6öç7Bw&—FRÒ‡ÂfÇVR’Óâ°¢g2æÖ¶F—%7–æ2‡F‚æF—&æÖR‡F‚æ¦ö–â‡&ö÷BÂ’’Â²&V7W'6—fS¢G'VRÒ¢g2çw&—FTf–ÆU7–æ2‡F‚æ¦ö–â‡&ö÷BÂ’ÂfÇVR¢Ð¢6öç7B6öÖÖ—BÒ†ÖW76vR’Óâ°¢v—B‚&FB"Â"ÒÖÆÂ"¢v—B‚&6öÖÖ—B"Â"Ò×V–WB"Â"ÖÒ"ÂÖW76vR¢&WGW&âv—B‚'&Wb×'6R"Â$„TB"¢Ð¢G'’°¢v—B‚&–æ—B"Â"Ò×V–WB"¢v—B‚&6öæf–r"Â'W6W"ææÖR"Â$6öçG&öÆÆVBf—‡GW&R"¢v—B‚&6öæf–r"Â'W6W"æVÖ–Â"Â&f—‡GW&TW†×ÆRçFW7B"¢f÷"†6öç7Böb°¢ââæ6öæf–rç&WV—&VE÷F‡2À¢%$TDÔRæÖB"À¢'7V72öf—‡GW&RæÖB"À¢"æÆö÷öWf–FVæ6R÷CƒRÖg&÷¦Vâæ§6öâ ¢Ò¢w&—FR‡Â&&6UÆâ"¢6öæf–ræ&6U÷6†Ò6öÖÖ—B‚&6öçG&öÆÆVB&6R"¢f—‡GW&TFFRÒ###bÓ’Ó•C£3£³ƒ£ ¢f÷"†6öç7Böb6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡2’w&—FR‡Â$&ö÷G7G&6VVEÆâ"¢6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†Ò6öÖÖ—B‚&66WFVB6öçG&öÆÆVB6VVB"¢6öæf–ræ–æ—F–Å÷6VVBçG&VU÷6†Òv—B‚'&Wb×'6R"Â$„TEç·G&VWÒ"¢f—‡GW&TFFRÒ###bÓ’Ó•C#££³ƒ£ ¢w&—FR‚'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2"Â%$TBf—‡GW&UÆâ"¢6öÖÖ—B‚&6öçG&öÆÆVB$TB"¢w&—FR‚'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"Â$u$TTâf—‡GW&UÆâ"¢6öç7B†VBÒ6öÖÖ—B‚&6öçG&öÆÆVBu$TTâ"¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢6öç7B6æF–FFRÒvFRæ–ç7V7D6æF–FFR‡&ö÷BÂ†VB¢76W'BæWVÂ†6æF–FFRæ†VBÂ†VB¢76W'BæÖF6‚€¢v—B‚&Æör"Â"ÒÖf÷&ÖCÒV’VâV4’"ÂG¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†ÒââG¶†VGÖ’À¢õ²µÓƒ£÷P¢¢76W'BæWVÂ€¢6æF–FFRæ6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâÀ¢G'VRÀ¢&æöâÕUD2WF†÷"æB6öÖÖ—GFW"F–ÖW7F×2 ¢¢76W'BæFVWWVÂ†6æF–FFRæf—'7EöÖVæFÖVçE÷&VçE÷6†2Â¶6öæf–ræ–æ—F–Å÷6VVBæ†VE÷6†Ò¢76W'BæFVWWVÂ†6æF–FFRæf—'7EöÖVæFÖVçEö6†ævVE÷F‡2Â°¢'67&—G2÷FW7B÷fÆ–FFR×G&6V&–Æ—G’çFW7BæÖ§2 ¢Ò¢76W'BæWVÂ†6æF–FFRæ6öÖÖ—Eö6÷VçBÂ"¢76W'BæWVÂ†6æF–FFRæÖW&vUö6öÖÖ—Eö6÷VçBÂ¢f÷"†6öç7B¶W’öb°¢&&6U÷&VFFW5öWF†÷&—¦F–öâ"À¢&&6Uöæ6W7F÷""À¢'6VVEöæ6W7F÷""À¢&6öÖÖ—G5÷÷7FFFUöWF†÷&—¦F–öâ"À¢&g&÷¦Våö&Æö'5öÖF6‚"À¢&ÆÆ÷vVE÷F…öÖöFW5öÖF6‚ ¢Ò’°¢76W'BæWVÂ†6æF–FFU¶¶W•ÒÂG'VRÂ¶W’¢Ð¢76W'BæFVWWVÂ†6æF–FFRç6VVEö6†ævVE÷F‡2Â²ââæ6öæf–ræ–æ—F–Å÷6VVBæ6†ævVE÷F‡5Òç6÷'B‚’¢76W'BæFVWWVÂ†6æF–FFRæ†—7F÷'•÷F‡2Â²ââæ6öæf–rç&WV—&VE÷F‡5Òç6÷'B‚’¢w&—FR‚&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"Â&æ÷BWF†÷&—¦VEÆâ"¢6öÖÖ—B‚'VæWF†÷&—¦VB†—7F÷&–6Âw&—FR"¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"’¢6öç7B&WfW'FVBÒvFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚'&VÖ÷fRVç&VÆFVBF‚"’¢76W'BæFVWWVÂ‡&WfW'FVBæ6†ævVE÷F‡2Â6æF–FFRæ6†ævVE÷F‡2¢76W'Bæö²‡&WfW'FVBæ†—7F÷'•÷F‡2æ–æ6ÇVFW2‚&2÷vV"÷G&ç6–VçB×Vç&VÆFVBçG2"’¢w&—FR‚%$TDÔRæÖB"Â&6†ævVBg&÷¦Vâ&V6V—EÆâ"¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚&×WFFRg&÷¦Vâf–ÆR"’’æg&÷¦Våö&Æö'5öÖF6‚À¢fÇ6P¢¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢g2ç7–ÖÆ–æµ7–æ2‚"ââòââòââòââõ$TDÔRæÖB"ÂF‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚'7–ÖÆ–æ²&WV—&VBf–ÆR"’’æÆÆ÷vVE÷F…öÖöFW5öÖF6‚À¢fÇ6P¢¢g2çVæÆ–æµ7–æ2‡F‚æ¦ö–â‡&ö÷BÂ6öæf–rç&WV—&VE÷F‡5³Ò’¢76W'BæWVÂ€¢vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ6öÖÖ—B‚&FVÆWFR&WV—&VBf–ÆR"’’æÆÆ÷vVE÷F…öÖöFW5öÖF6‚À¢fÇ6P¢¢6öç7BÖW&vRÒv—B€¢&6öÖÖ—B×G&VR"À¢v—B‚'&Wb×'6R"Â$„TEç·G&VWÒ"’À¢"×"À¢v—B‚'&Wb×'6R"Â$„TB"’À¢"×"À¢6öæf–ræ&6U÷6†À¢"ÖÒ"À¢&6öçG&öÆÆVBÖW&vR ¢¢76W'BæWVÂ†vFRæ–ç7V7D6æF–FFR‡&ö÷BÂÖW&vR’æÖW&vUö6öÖÖ—Eö6÷VçBÂ¢76W'BæWVÂ†vFRæ–ç7V7D6æF–FFR‡&ö÷BÂ"ÒÖÆÂ"’ÂçVÆÂ¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡&ö÷BÂ²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð§Ò §FW7B‚%V&Æ–6F–öâ66†R’&VBÖ&6²6VÆV7G2öæÇ’F†R6VÆVB"ö6öÖÖVçBæB6æ—F—¦W2f–ÇW&R"Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢6öç7B6ÆÇ2ÒµÐ¢6öç7BFFW'2Ò°¢–ç7V7D6öÖÖVçB‡&VbÂ÷G2’°¢6ÆÇ2çW6‚‚&6öÖÖVçB"¢76W'BæWVÂ‡&VbÂ6öæf–rç&Vb¢76W'BæWVÂ†÷G2æ—4WF†÷&—¦VE&Vb‡&Vb’ÂG'VR¢76W'BæWVÂ†÷G2æ—4WF†÷&—¦VE&Vb‡&Vb²#"’ÂfÇ6R¢&WGW&â÷F–öç2ç&VF&6²æWF†÷&—¦F–öà¢ÒÀ¢fWF6„§6öâ‡W&Â’°¢6ÆÇ2çW6‚‡W&Â¢&WGW&âW&ÂæVæG5v—F‚‚"ö'&æ6†W2öÖ–â"¢ò÷F–öç2ç&VF&6²ç&÷FV7FVEöÖ–à¢¢÷F–öç2ç&VF&6²çVÆÅ÷&WVW7@¢ÒÀ¢6æF–FFT–ç7V7F÷"‡&ö÷BÂ†VB’°¢76W'BæWVÂ‡&ö÷BÂ&6öçG&öÆÆVB×&ö÷B"¢76W'BæWVÂ††VBÂ÷F–öç2ç&VF&6²çVÆÅ÷&WVW7Bæ†VBç6†¢&WGW&â÷F–öç2ç&VF&6²æ6æF–FFP¢Ð¢Ð¢6öç7B&VF&6²ÒvFRæ–ç7V7B‚&6öçG&öÆÆVB×&ö÷B"ÂFFW'2¢76W'BæFVWWVÂ†6ÆÇ2Â°¢&6öÖÖVçB"À¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Gr÷VÆÇ2ós‚"À¢&‡GG3¢òö’æv—F‡V"æ6öÒ÷&W÷2ö'–ææ6’ö6÷W'G6–FR×Grö'&æ6†W2öÖ–â ¢Ò¢76W'BæWVÂ†vFRçfÆ–FFR‡²ââæ÷F–öç2Â&VF&6²ÂW'&÷'3¢µÒÒ’ÂG'VR¢f÷"†6öç7Bf–ÆVDFFW"öb²&–ç7V7D6öÖÖVçB"Â&fWF6„§6öâ"Â&6æF–FFT–ç7V7F÷"%Ò’°¢6öç7Bf–ÇW&RÒvFRæ–ç7V7B‚&6öçG&öÆÆVB×&ö÷B"Â°¢ââæFFW'2À¢¶f–ÆVDFFW%Ò‚’°¢F‡&÷ræWrW'&÷"‚'6V7&WB×Fö¶VâÖ×W7BÖæ÷BÖÆV²"¢Ð¢Ò¢76W'BæWVÂ†f–ÇW&Rç7FGW2Â%Täd”Ä$ÄR"¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’†f–ÇW&R’Â÷6V7&WB×Fö¶Vâ÷R¢Ð§Ò §FW7B‚%V&Æ–6F–öâ66†R&VgW6W2ÖÆf÷&ÖVB–ææVB¥4ôâæBÖ—6ÖF6‚&WGvVVâ6VÂæBF—7F6‚"Â‚’Óâ°¢f÷"†6öç7B&WÆ6Röb°¢†&öG’’Óâ&öG’ç&WÆ6R‚r&FV6—6–öâ#¢rÂr&FV6—6–öâ#¢$D•5D4…ô44UDTB"Â&FV6—6–öâ#¢r’À¢†&öG’’Óâ&öG’ç&WÆ6R‚r&&6U÷6†#¢"r²&""ç&WVBƒC’Âr&&6U÷6†#¢"r²&R"ç&WVBƒC’’À¢†&öG’’Óâ&öG’²%ÆãÂÒÒV&Æ–6F–öâÖ66†S¦÷væW"ÖF—7F6ƒ§c§7F'BÒÓâ ¢Ò’°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’Ò&WÆ6R†÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’¢6öæf–ræ&öG•÷6†#SbÒ7&VFT†6‚‚'6†#Sb"¢çWFFR†÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’¢æF–vW7B‚&†W‚"¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'3¢µÒÒ’À¢fÇ6P¢¢Ð§Ò §FW7B‚%V&Æ–6F–öâ66†R6–ævÆWFöâæWfW"66WG26ÆÆW"Ö–æ¦V7FVBf7F÷'’6öæf–wW&F–öâ"Â‚’Óâ°¢6öç7B²6öæf–rÂ6öçFW‡BÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢6öçFW‡Bæf—‡GW&Ræ6†ævVEF‡2Ò²ââæ6öæf–rç&WV—&VE÷F‡5Ð¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ÷F–öç2æv—F‡V$7F–öç46öçFW‡B¢6öç7B&W÷'BÒ'Vä6ö×ÆWFVDf—‡GW&R†6öçFW‡Bæf—‡GW&RÂ°¢7W'&VçD†VC¢6öçFW‡Bæ†VBÀ¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó•C#££¢"À¢ââæ÷F–öç2À¢V&Æ–6F–öä66†TWF†÷&—¦F–öå&VF&6³¢6öçFW‡Bç&VF&6²À¢V&Æ–6F–öä66†T6öæf–wW&F–öã¢6öæf–p¢Ò¢76W'BæWVÂ‡&W÷'Bç7FGW2Â$d”Â"¢76W'BæWVÂ‡&W÷'Bç6÷W&6RçV&Æ–6F–öåö66†UöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÂfÇ6R¢76W'BæÖF6‚‡&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’ÂõV&Æ–6F–öâ66†RWF†÷&—¦F–öâ÷R§Ò ¦f÷"†6öç7B¶W’öb²'&VÆV6Uö66WFVB"Â'F6µ÷7FFUö6†ævVB"Â''VÆW6WEö×WFFVB%Ò’°¢FW7B†V&Æ–6F–öâ66†R&V¦V7G2F—7F6‚Væ&Æ–ærG¶¶W—ÖÂ‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’Ò÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’ç&WÆ6R€¢"G¶¶W—Ò#¦fÇ6VÀ¢"G¶¶W—Ò#§G'VV ¢¢6öæf–ræ&öG•÷6†#SbÒ7&VFT†6‚‚'6†#Sb"¢çWFFR†÷F–öç2ç&VF&6²æWF†÷&—¦F–öâæ&öG’¢æF–vW7B‚&†W‚"¢76W'BæWVÂ€¢G&6V&–Æ—G•fÆ–FF÷ ¢æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢çfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'3¢µÒÒ’À¢fÇ6P¢¢Ò§Ð §FW7B‚%V&Æ–6F–öâ66†Rf7F÷'’6ææ÷BW‡æBF†R6WfVçFVVâ×F‚6Æ÷7W&R"Â‚’Óâ°¢6öç7B²6öæf–rÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‚¢6öæf–rç&WV—&VE÷F‡2çW6‚‚"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"¢÷F–öç2æ6†ævVEF‡2çW6‚‚"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"¢6öç7BvFRÒG&6V&–Æ—G•fÆ–FF÷"æ7&VFUV&Æ–6F–öä66†TWF†÷&—¦F–öävFR†6öæf–r¢6öç7BW'&÷'2ÒµÐ¢76W'BæWVÂ†vFRçfÆ–FFR‡²ââæ÷F–öç2ÂW'&÷'2Ò’ÂfÇ6R¢76W'BæÖF6‚†W'&÷'2æ¦ö–â‚%Æâ"’Â÷Væ&÷VæB÷R§Ò §FW7B‚%V&Æ–6F–öâ66†R6VÆVB6–ævÆWFöâ&V6†W2gVÆÂfÆ–FF÷"f÷"G&gBÂ&VG’æB6ÖR×G&VR7V6‚"Â7–æ2‚’Óâ°¢f÷"†6öç7B7FFRöb²&G&gB"Â'&VG’"Â'7V6‚×W6‚%Ò’°¢6öç7BW6‚Ò7FFRÓÓÒ'7V6‚×W6‚ ¢6öç7B²6öæf–rÂ6öçFW‡BÂ÷F–öç2ÒÒÖ¶UV&Æ–6F–öä66†TWF†÷&—¦F–öäf—‡GW&R‡°¢W6‚À¢G&gC¢7FFRÓÓÒ&G&gB ¢Ò¢6öç7BFV×÷&'’Òg2æÖ¶GFV×7–æ2‡F‚æ¦ö–â†÷2çF×F—"‚’Â'V&Æ–6F–öâÖ66†R×6VÆVBÖÖöGVÆRÒ"’¢G'’°¢g2ç7–ÖÆ–æµ7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ&æöFUöÖöGVÆW2"’À¢F‚æ¦ö–â‡FV×÷&'’Â&æöFUöÖöGVÆW2"’À¢&F—" ¢¢6öç7B6÷W&6RÒg2ç&VDf–ÆU7–æ2€¢F‚æ¦ö–â‡&W÷6—F÷'•&ö÷BÂ'67&—G2÷fÆ–FFR×G&6V&–Æ—G’æÖ§2"’À¢'WFc‚ ¢¢6öç7B7F'BÒ6÷W&6Ræ–æFW„öb‚&W‡÷'B6öç7BT$Ä”4D”ôåô44„UôUD„õ$•¤D”ôâÒö&¦V7Bæg&VW¦R‡²"¢6öç7BVæBÒ6÷W&6Ræ–æFW„öb‚%Æâò¢¢6W&FR6Æ÷6VBWF†÷&—G’â"Â7F'B¢76W'Bæö²‡7F'BâbbVæBâ7F'B¢òòF†R6öçG&öÆÆVBÖöGVÆR7V'7F—GWFW2öæÇ’F†RFW67&—F÷"â&öGV7F–öâ†2æò6öæf–r–çWBà¢6öç7Bf—‡GW&TÖöGVÆRÒF‚æ¦ö–â‡FV×÷&'’Â'fÆ–FF÷"æÖ§2"¢g2çw&—FTf–ÆU7–æ2€¢f—‡GW&TÖöGVÆRÀ¢6÷W&6Rç6Æ–6RƒÂ7F'B’°¢&W‡÷'B6öç7BT$Ä”4D”ôåô44„UôUD„õ$•¤D”ôâÒö&¦V7Bæg&VW¦R‚"°¢¥4ôâç7G&–æv–g’†6öæf–r’°¢"•Æâ"°¢6÷W&6Rç6Æ–6R†VæB¢¢6öç7B²F…Fôf–ÆUU$ÂÒÒv—B–×÷'B‚&æöFS§W&Â"¢6öç7BfÆ–FF÷"Òv—B–×÷'B‡F…Fôf–ÆUU$Â†f—‡GW&TÖöGVÆR’æ‡&Vb¢6öç7B7F–öç2ÒfÆ–FF÷"æ–ç7V7Dv—D‡V$7F–öç46öçFW‡B‡°¢Vçf—&öæÖVçC¢°¢t•D…T%ô5D”ôå3¢'G'VR"À¢t•D…T%õ$Uõ4•Dõ%“¢&'–ææ6’ö6÷W'G6–FR×Gr"À¢t•D…T%ôUdTåEôäÔS¢W6‚ò'W6‚"¢'VÆÅ÷&WVW7B"À¢t•D…T%ôUdTåEõDƒ¢F‚æ¦ö–â†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ'V&Æ–6F–öâÖ66†RÖWfVçBæ§6öâ"’À¢t•D…T%õ4„¢W6‚ò6öçFW‡Bæ†VB¢f—‡GW&T7F–öç4ÖW&vU6†À¢t•D…T%õtõ$´dÄõs¢$4’"À¢t•D…T%ô¤ô#¢&g&öçFVæBÖ6öçG&7B"À¢t•D…T%õ%Tåô”C¢f—‡GW&T7F–öç5'Vä–BÀ¢t•D…T%õ%TåôåTÔ$U#¢f—‡GW&T7F–öç5'VäçVÖ&W"À¢t•D…T%õ%TåôEDTÕC¢#"À¢t•D…T%õ$Tc¢W6‚ò'&Vg2ö†VG2öÖ–â"¢&Vg2÷VÆÂòG¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%õ$TeôäÔS¢W6‚ò&Ö–â"¢G¶6öæf–rç'ÒöÖW&vVÀ¢t•D…T%ô$4Uõ$Tc¢W6‚ò""¢&Ö–â"À¢t•D…T%ô„TEõ$Tc¢W6‚ò""¢6öæf–ræ'&æ6€¢ÒÀ¢v—D&–æF–æs¢6öçFW‡Bæv—D&–æF–æp¢Ò¢w&—FTW†7D†VDf÷$7F–öç46öçFW‡B†6öçFW‡Bæf—‡GW&Rç&ö÷BÂ7F–öç2¢6öç7Bf—‡GW&RÒ6öçFW‡Bæf—‡GW&P¢6öç7BfÆ–FFRÒ†÷fW'&–FW2Ò·Ò’Óà¢fÆ–FF÷"çfÆ–FFUG&6V&–Æ—G’‡°¢&ö÷C¢f—‡GW&Rç&ö÷BÀ¢7W'&VçD†VC¢6öçFW‡Bæ†VBÀ¢WfÇVFVD†VD6öÖÖ—GFVDC¢###bÓ’Ó•C#££¢"À¢&÷VæFVE66÷T7F—fS¢fÇ6RÀ¢6†ævT&6UF6·5FW‡C¢f—‡GW&Ræ6†ævT&6UF6·5FW‡BÀ¢6†ævT&6UG&6V&–Æ—G•FW‡C¢f—‡GW&Ræ6†ævT&6UG&6V&–Æ—G•FW‡BÀ¢6†ævT&6T6ö×ÆWF–öå&V6V—EFW‡C¢f—‡GW&Ræ6†ævT&6T6ö×ÆWF–öå&V6V—EFW‡BÀ¢66WFVEG&6V&–Æ—G•6†#Sc¢f—‡GW&Ræ66WFVEG&6V&–Æ—G•6†#SbÀ¢66WFVEVæF–æuF6·56†#Sc¢f—‡GW&Ræ66WFVEVæF–æuF6·56†#SbÀ¢66WFVD6ö×ÆWFVEF6·56†#Sc¢f—‡GW&Ræ66WFVD6ö×ÆWFVEF6·56†#SbÀ¢ââæ÷F–öç2À¢v—F‡V$7F–öç46öçFW‡C¢7F–öç2À¢V&Æ–6F–öä66†TWF†÷&—¦F–öå&VF&6³¢6öçFW‡Bç&VF&6²À¢ââæ÷fW'&–FW0¢Ò¢6öç7B&W÷'BÒfÆ–FFR‚¢76W'BæWVÂ€¢&W÷'Bç6÷W&6RçV&Æ–6F–öåö66†UöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÀ¢G'VRÀ¢&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"¢¢76W'BæWVÂ‡&W÷'Bç7FGW2Â%52"Â7FFR²%Æâ"²&W÷'BæW'&÷'2æ¦ö–â‚%Æâ"’¢76W'BæFVWWVÂ‡&W÷'Bç66÷U÷fÆ–FF–öâçVæWF†÷&—¦VE÷F‡2ÂµÒ¢–b‡7FFRÓÓÒ&G&gB"’°¢f÷"†6öç7Bf–ÇW&Röb²&W‡G&F‚"Â'w&öær""Â&Ö—76–ærõtäU"%Ò’°¢6öç7B&VF&6²Ò7G'V7GW&VD6ÆöæR†6öçFW‡Bç&VF&6²¢6öç7B6†ævVEF‡2Ò²ââæ÷F–öç2æ6†ævVEF‡5Ð¢–b†f–ÇW&RÓÓÒ&W‡G&F‚"’6†ævVEF‡2çW6‚‚"æv—F‡V"÷v÷&¶fÆ÷w2ö6’ç–ÖÂ"¢–b†f–ÇW&RÓÓÒ'w&öær""’&VF&6²çVÆÅ÷&WVW7BæçVÖ&W"Òs@¢–b†f–ÇW&RÓÓÒ&Ö—76–ærõtäU""’&VF&6²æWF†÷&—¦F–öâÒçVÆÀ¢6öç7B&V¦V7FVBÒfÆ–FFR‡°¢6†ævVEF‡2À¢V&Æ–6F–öä66†TWF†÷&—¦F–öå&VF&6³¢&VF&6°¢Ò¢76W'BæWVÂ‡&V¦V7FVBç7FGW2Â$d”Â"Âf–ÇW&R¢76W'BæWVÂ€¢&V¦V7FVBç6÷W&6RçV&Æ–6F–öåö66†UöWF†÷&—¦F–öå÷&VF&6²æ66WFVBÀ¢fÇ6RÀ¢f–ÇW&P¢¢76W'BæÖF6‚‡&V¦V7FVBæW'&÷'2æ¦ö–â‚%Æâ"’ÂõV&Æ–6F–öâ66†RWF†÷&—¦F–öâ÷R¢Ð¢Ð¢Òf–æÆÇ’°¢g2ç&Õ7–æ2‡FV×÷&'’Â²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ¢Ð¢Ð§Ò