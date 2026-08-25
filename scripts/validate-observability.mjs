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
  if (contract?.missing_signal?.policy !== "page_and_hold") {
    fail("missing_signal.policy must be page_and_hold")
  }
  if (contract?.missing_signal?.max_sample_age_seconds !== 300) {
    fail("missing telemetry must become stale after 300 seconds")
  }
  sameMembers(
    contract?.privacy?.forbidden_labels,
    requiredForbiddenLabels,
    "privacy.forbidden_labels"
  )
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
  }
}

if (dashboard) {
  if (dashboard.uid !== "courtside-slo-v1") fail("dashboard uid must be courtside-slo-v1")
  if (dashboard?.templating?.list?.[0]?.name !== "DS_PROMETHEUS") {
    fail("dashboard must use a replaceable DS_PROMETHEUS data source")
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
  }
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
