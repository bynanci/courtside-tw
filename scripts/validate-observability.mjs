/* eslint-disable no-console */
import fs from "node:fs"
import path from "node:path"

import YAML from "yaml"

const root = process.cwd()
const paths = {
  contract: "infra/observability/slo-contract.yml",
  dashboard: "infra/observability/dashboards/courtside-slo.json",
  alerts: "infra/observability/alerts/courtside-slo.rules.yml",
  runbook: "docs/operations/incident-response.md"
}
const expectedSurfaces = [
  "public-read",
  "publication-jobs",
  "withdrawal",
  "search-freshness",
  "media-processing",
  "cache-purge",
  "dead-letters"
]
const requiredForbiddenLabels = [
  "article_id",
  "article_slug",
  "content",
  "email",
  "ip_address",
  "query",
  "request_id",
  "storage_key",
  "trace_id",
  "user_id",
  "wallet_address"
]
const expectedAllowedLabels = [
  "budget",
  "environment",
  "event_type",
  "le",
  "objective",
  "outcome",
  "surface"
]
const expectedLatencyBuckets = ["0.05", "0.1", "0.2", "0.3", "0.5", "1", "2.5", "5", "+Inf"]
const expectedDeadLetterEventTypes = [
  "media.asset.process",
  "publication.article.command",
  "publication.issue.command",
  "unknown"
]
const expectedSeriesPerEnvironment = {
  heartbeat: 7,
  observations: 42,
  latency_buckets: 9,
  latency_sum: 1,
  latency_count: 1,
  dead_letter_events: 12
}
const expectedRequiredSeriesCounts = {
  "public-read": {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 6,
    courtside_slo_latency_seconds_bucket: 9
  },
  "publication-jobs": {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 6
  },
  withdrawal: {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 12
  },
  "search-freshness": {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 6
  },
  "media-processing": {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 6
  },
  "cache-purge": {
    courtside_observability_source_up: 1,
    courtside_slo_observations_total: 6
  },
  "dead-letters": {
    courtside_observability_source_up: 1,
    courtside_outbox_handler_events_total: 12
  }
}
const errors = []

function fail(message) {
  errors.push(message)
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    fail(`missing required T083 artifact: ${relativePath}`)
    return null
  }
  return fs.readFileSync(absolutePath, "utf8")
}

function parseYaml(text, relativePath) {
  if (text === null) return null
  try {
    return YAML.parse(text)
  } catch (error) {
    fail(`${relativePath} is not valid YAML: ${error.message}`)
    return null
  }
}

function parseJson(text, relativePath) {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`)
    return null
  }
}

function sorted(values) {
  return [...values].sort()
}

function sameMembers(actual, expected, label) {
  const normalizedActual = sorted(new Set(actual ?? []))
  const normalizedExpected = sorted(new Set(expected))
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${label} must be exactly ${normalizedExpected.join(", ")}; found ${normalizedActual.join(", ")}`
    )
  }
}

function objective(surface, name) {
  return surface?.objectives?.find((item) => item.name === name)
}

function requireObjective(surface, name, expected) {
  const item = objective(surface, name)
  if (!item) {
    fail(`${surface?.id ?? "unknown"} is missing objective ${name}`)
    return
  }
  for (const [key, value] of Object.entries(expected)) {
    if (item[key] !== value) {
      fail(
        `${surface.id}.${name}.${key} must be ${JSON.stringify(value)}; found ${JSON.stringify(item[key])}`
      )
    }
  }
}

const contractText = read(paths.contract)
const dashboardText = read(paths.dashboard)
const alertsText = read(paths.alerts)
const runbookText = read(paths.runbook)

const contract = parseYaml(contractText, paths.contract)
const dashboard = parseJson(dashboardText, paths.dashboard)
const alerts = parseYaml(alertsText, paths.alerts)

if (contract) {
  if (contract.schema_version !== "courtside-observability-slo/v1") {
    fail("slo-contract schema_version must be courtside-observability-slo/v1")
  }
  if (contract.status !== "configuration_ready_activation_gated") {
    fail("slo-contract status must preserve the provider activation gate")
  }
  if (contract?.scope?.issue !== "https://github.com/bynanci/courtside-tw/issues/137") {
    fail("slo-contract must bind dispatch issue #137")
  }
  if (contract?.scope?.base_sha !== "c2ed57cfe88814958e597bd6dfce5b8050af8255") {
    fail("slo-contract must bind the authorized protected-main base SHA")
  }
  if (contract?.scope?.provider_activation !== false) {
    fail("provider activation must remain false")
  }
  if (contract?.scope?.receiver_activation !== false) {
    fail("receiver activation must remain false")
  }
  if (contract?.scope?.synthetic_probe_activation !== false) {
    fail("synthetic probe activation must remain false")
  }
  if (contract?.missing_signal?.policy !== "page_and_hold") {
    fail("missing_signal.policy must be page_and_hold")
  }
  if (contract?.missing_signal?.max_sample_age_seconds !== 300) {
    fail("missing telemetry must become stale after 300 seconds")
  }
  if (contract?.evaluation?.environment_scope !== "single_environment_rule_evaluator") {
    fail("alerts must be evaluated in exactly one environment per rule evaluator")
  }
  if (contract?.evaluation?.zero_denominator_policy !== "hold_without_page") {
    fail("zero-denominator windows must HOLD without paging or reporting an achieved SLO")
  }
  sameMembers(contract?.privacy?.allowed_labels, expectedAllowedLabels, "privacy.allowed_labels")
  sameMembers(
    contract?.canonical_inputs?.latency?.bounded_values?.le,
    expectedLatencyBuckets,
    "latency bucket boundaries"
  )
  sameMembers(
    contract?.canonical_inputs?.existing_dead_letters?.bounded_values?.event_type,
    expectedDeadLetterEventTypes,
    "dead-letter event_type values"
  )
  if (contract?.cardinality_limits?.scope !== "per_environment") {
    fail("cardinality limits must be scoped per environment")
  }
  if (contract?.cardinality_limits?.environments_per_evaluator !== 1) {
    fail("each alert evaluator must contain exactly one environment")
  }
  for (const [family, expected] of Object.entries(expectedSeriesPerEnvironment)) {
    if (contract?.cardinality_limits?.series_per_environment?.[family] !== expected) {
      fail(`cardinality ${family} must be exactly ${expected} series per environment`)
    }
  }
  const expectedHardLimit = Object.values(expectedSeriesPerEnvironment).reduce(
    (total, value) => total + value,
    0
  )
  if (contract?.cardinality_limits?.hard_series_limit !== expectedHardLimit) {
    fail(`cardinality hard_series_limit must be exactly ${expectedHardLimit}`)
  }
  if (contract?.cardinality_limits?.breach_policy !== "page_and_hold") {
    fail("cardinality breaches must page and HOLD")
  }
  sameMembers(
    contract?.canonical_inputs?.heartbeat?.required_labels,
    ["surface", "environment"],
    "heartbeat required_labels"
  )
  if (
    contract?.canonical_inputs?.heartbeat?.cardinality !==
    "exactly_one_series_per_surface_environment"
  ) {
    fail("heartbeat must have exactly one series per surface and environment")
  }
  sameMembers(
    contract?.privacy?.forbidden_labels,
    requiredForbiddenLabels,
    "privacy.forbidden_labels"
  )
  const labelOverlap = (contract?.privacy?.allowed_labels ?? []).filter((label) =>
    requiredForbiddenLabels.includes(label)
  )
  if (labelOverlap.length > 0) {
    fail(`privacy label allowlist overlaps forbidden labels: ${labelOverlap.join(", ")}`)
  }
  sameMembers(
    contract?.surfaces?.map((surface) => surface.id),
    expectedSurfaces,
    "contract surfaces"
  )

  const byId = new Map((contract.surfaces ?? []).map((surface) => [surface.id, surface]))
  requireObjective(byId.get("public-read"), "availability", {
    kind: "ratio",
    objective: 0.999,
    window: "30d"
  })
  requireObjective(byId.get("public-read"), "origin-latency", {
    kind: "latency",
    quantile: 0.95,
    threshold_seconds: 0.3
  })
  requireObjective(byId.get("publication-jobs"), "completion", {
    kind: "threshold-ratio",
    objective: 0.99,
    threshold_seconds: 60
  })
  requireObjective(byId.get("withdrawal"), "origin-denial-30s", {
    kind: "threshold-ratio",
    objective: 0.99,
    threshold_seconds: 30
  })
  requireObjective(byId.get("withdrawal"), "origin-denial-60s", {
    kind: "safety-invariant",
    objective: 1,
    threshold_seconds: 60
  })
  requireObjective(byId.get("search-freshness"), "visible-in-search", {
    kind: "threshold-ratio",
    objective: 0.99,
    threshold_seconds: 60
  })
  requireObjective(byId.get("media-processing"), "ready", {
    kind: "threshold-ratio",
    objective: 0.99,
    threshold_seconds: 300
  })
  requireObjective(byId.get("cache-purge"), "withdrawal-purge", {
    kind: "safety-invariant",
    objective: 1,
    threshold_seconds: 60
  })
  requireObjective(byId.get("dead-letters"), "new-dead-letters", {
    kind: "safety-invariant",
    allowed_events: 0
  })

  for (const surface of contract.surfaces ?? []) {
    if (!surface.owner_role || !surface.runbook_anchor || !surface.dashboard_panel) {
      fail(`${surface.id} must declare owner_role, runbook_anchor and dashboard_panel`)
    }
    if (surface?.source?.heartbeat_metric !== "courtside_observability_source_up") {
      fail(`${surface.id} must use the canonical source heartbeat`)
    }
    if (surface?.source?.activation !== "separately_gated") {
      fail(`${surface.id} source activation must remain separately_gated`)
    }
    if (!(surface?.source?.required_series?.length > 0)) {
      fail(`${surface.id} must enumerate every fail-closed required series`)
    }
    const expectedCounts = expectedRequiredSeriesCounts[surface.id]
    sameMembers(
      Object.keys(surface?.source?.required_series_counts ?? {}),
      surface?.source?.required_series ?? [],
      `${surface.id} required_series_counts keys`
    )
    for (const [metric, expected] of Object.entries(expectedCounts ?? {})) {
      if (surface?.source?.required_series_counts?.[metric] !== expected) {
        fail(`${surface.id} must require exactly ${expected} ${metric} series`)
      }
    }
    if (!surface?.alerts?.missing || !(surface?.alerts?.paging?.length > 0)) {
      fail(`${surface.id} must declare one missing-signal alert and at least one paging alert`)
    }
  }
}

const alertRules = (alerts?.groups ?? []).flatMap((group) => group.rules ?? [])
const alertByName = new Map(
  alertRules.filter((rule) => rule.alert).map((rule) => [rule.alert, rule])
)
if (alerts) {
  sameMembers(Object.keys(alerts), ["groups"], "Prometheus alert-rule root keys")
  if (!(alerts.groups?.length > 0)) {
    fail("Prometheus alert rules must contain at least one group")
  }
  if (alerts.groups.some((group) => group.interval !== "30s")) {
    fail("every Prometheus alert group must evaluate every 30 seconds")
  }
  const alertNames = alertRules.map((rule) => rule.alert).filter(Boolean)
  if (new Set(alertNames).size !== alertNames.length) {
    fail("Prometheus alert names must be unique")
  }
  for (const rule of alertRules) {
    const expression = String(rule.expr ?? "")
    if (
      rule.alert?.endsWith("FastBurn") &&
      !(expression.includes("[5m]") && expression.includes("[1h]"))
    ) {
      fail(`${rule.alert} must use both 5-minute and 1-hour burn windows`)
    }
    if (
      rule.alert?.endsWith("SlowBurn") &&
      !(expression.includes("[30m]") && expression.includes("[6h]"))
    ) {
      fail(`${rule.alert} must use both 30-minute and 6-hour burn windows`)
    }
    if (rule.alert?.endsWith("FastBurn") || rule.alert?.endsWith("SlowBurn")) {
      const guards =
        expression.match(
          /sum\(rate\(courtside_slo_observations_total\{[^}]+\}\[(?:5m|1h|30m|6h)\]\)\) > 0/g
        ) ?? []
      if (guards.length !== 2 || guards.some((guard) => guard.includes('budget="met"'))) {
        fail(`${rule.alert} must have one total-denominator > 0 guard for each burn window`)
      }
      if (expression.includes("clamp_min")) {
        fail(`${rule.alert} must not convert a zero denominator into a 100% failure ratio`)
      }
    }
  }

  for (const surface of contract?.surfaces ?? []) {
    const namedAlerts = [surface.alerts.missing, ...(surface.alerts.paging ?? [])]
    for (const alertName of namedAlerts) {
      const rule = alertByName.get(alertName)
      if (!rule) {
        fail(`${surface.id} references missing alert rule ${alertName}`)
        continue
      }
      if (rule?.labels?.surface !== surface.id)
        fail(`${alertName} must label surface=${surface.id}`)
      if (rule?.labels?.owner !== surface.owner_role)
        fail(`${alertName} must label owner=${surface.owner_role}`)
      if (!["warning", "page", "critical"].includes(rule?.labels?.severity)) {
        fail(`${alertName} must declare a bounded severity`)
      }
      for (const field of ["summary", "description", "runbook_url"]) {
        if (!rule?.annotations?.[field]) fail(`${alertName} is missing annotation ${field}`)
      }
      if (!rule?.annotations?.runbook_url?.endsWith(`#${surface.runbook_anchor}`)) {
        fail(`${alertName} runbook_url must bind #${surface.runbook_anchor}`)
      }
    }
    const missingRule = alertByName.get(surface.alerts.missing)
    if (missingRule && !String(missingRule.expr).includes("absent(")) {
      fail(`${surface.alerts.missing} must fail closed with absent()`)
    }
    if (
      missingRule &&
      !(String(missingRule.expr).includes("time()") && String(missingRule.expr).includes("> 300"))
    ) {
      fail(`${surface.alerts.missing} must detect samples stale beyond 300 seconds`)
    }
    for (const metric of surface?.source?.required_series ?? []) {
      if (missingRule && !String(missingRule.expr).includes(`absent(${metric}`)) {
        fail(`${surface.alerts.missing} must detect absent ${metric}`)
      }
      const expected = surface?.source?.required_series_counts?.[metric]
      if (
        missingRule &&
        (!String(missingRule.expr).includes(`count(${metric}`) ||
          !String(missingRule.expr).includes(`!= ${expected}`))
      ) {
        fail(`${surface.alerts.missing} must enforce exactly ${expected} ${metric} series`)
      }
    }
    if (
      missingRule &&
      surface.id !== "dead-letters" &&
      !String(missingRule.expr).includes('budget=~"met|missed"')
    ) {
      fail(`${surface.alerts.missing} must cover both bounded budget values`)
    }
    if (
      missingRule &&
      surface.id !== "dead-letters" &&
      !String(missingRule.expr).includes('outcome=~"completed|explicitly_blocked|failed"')
    ) {
      fail(`${surface.alerts.missing} must cover all bounded observation outcomes`)
    }
    if (
      missingRule &&
      surface.id === "dead-letters" &&
      !String(missingRule.expr).includes("publication[.]article[.]command")
    ) {
      fail("dead-letter telemetry must enforce the fixed current-main event_type set")
    }
  }
}

if (dashboard) {
  if (dashboard.uid !== "courtside-slo-v1") fail("dashboard uid must be courtside-slo-v1")
  if (dashboard?.templating?.list?.[0]?.name !== "DS_PROMETHEUS") {
    fail("dashboard must use a replaceable DS_PROMETHEUS data source")
  }
  if (!(dashboard?.templating?.list ?? []).some((item) => item.name === "environment")) {
    fail("dashboard must require one explicit environment selection")
  }
  const environmentVariable = (dashboard?.templating?.list ?? []).find(
    (item) => item.name === "environment"
  )
  if (environmentVariable?.includeAll !== false || environmentVariable?.multi !== false) {
    fail("dashboard environment selection must be single-value with no all-environments option")
  }
  const coveragePanel = (dashboard.panels ?? []).find(
    (panel) => panel.kind === "telemetry-coverage"
  )
  sameMembers(
    coveragePanel?.targets?.map((target) => target.refId),
    ["A", "B", "C", "D", "E"],
    "telemetry-coverage target refs"
  )
  for (const target of coveragePanel?.targets ?? []) {
    if (!String(target.expr).includes('environment="$environment"')) {
      fail(`telemetry-coverage target ${target.refId} must filter one environment`)
    }
    if (!String(target.expr).includes("== bool")) {
      fail(`telemetry-coverage target ${target.refId} must expose an exact 1/0 contract result`)
    }
  }
  if (!String(coveragePanel?.description ?? "").includes("72")) {
    fail("telemetry-coverage panel must state the 72-series hard limit")
  }

  const surfacePanels = (dashboard.panels ?? []).filter((panel) => panel.surface)
  sameMembers(
    surfacePanels.map((panel) => panel.surface),
    expectedSurfaces,
    "dashboard surface panels"
  )
  for (const panel of surfacePanels) {
    if (!(panel.targets?.length > 0) || panel.targets.some((target) => !target.expr)) {
      fail(`dashboard panel ${panel.surface} must have non-empty PromQL targets`)
    }
    if (
      panel.targets.some((target) => !String(target.expr).includes('environment="$environment"'))
    ) {
      fail(`dashboard panel ${panel.surface} must filter one explicit environment`)
    }
    if (panel.targets.some((target) => String(target.expr).includes("clamp_min"))) {
      fail(`dashboard panel ${panel.surface} must render a zero denominator as no data`)
    }
  }
  const panelIds = (dashboard.panels ?? []).map((panel) => panel.id)
  if (new Set(panelIds).size !== panelIds.length) fail("dashboard panel IDs must be unique")
  if (!(dashboard.panels ?? []).some((panel) => panel.kind === "telemetry-coverage")) {
    fail("dashboard must include a telemetry-coverage panel")
  }
}

if (runbookText !== null) {
  for (const surface of contract?.surfaces ?? []) {
    if (!runbookText.includes(`<a id="${surface.runbook_anchor}"></a>`)) {
      fail(`runbook is missing deterministic anchor ${surface.runbook_anchor}`)
    }
    if (!runbookText.includes(surface.alerts.missing)) {
      fail(`runbook does not cover missing-signal alert ${surface.alerts.missing}`)
    }
    for (const alertName of surface.alerts.paging ?? []) {
      if (!runbookText.includes(alertName)) fail(`runbook does not cover alert ${alertName}`)
    }
  }
  for (const section of ["Evidence capture", "Containment and rollback", "Closure criteria"]) {
    if (!runbookText.includes(`## ${section}`)) fail(`runbook is missing ${section}`)
  }
}

const expressionText = [
  ...alertRules.map((rule) => String(rule.expr ?? "")),
  ...(dashboard?.panels ?? []).flatMap((panel) =>
    (panel.targets ?? []).map((target) => String(target.expr ?? ""))
  )
]
  .join("\n")
  .toLowerCase()
for (const forbidden of requiredForbiddenLabels) {
  if (expressionText.includes(forbidden)) fail(`PromQL must not use forbidden label ${forbidden}`)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`observability contract: ${error}`)
  process.exit(1)
}

console.log("observability contract: pass (7 surfaces, fail-closed telemetry, bounded labels)")
