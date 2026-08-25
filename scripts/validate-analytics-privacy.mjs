/* eslint-disable no-console */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { sanitizeAnalyticsEvent } from "../apps/web/app/features/analytics/analytics.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const analyticsPath = path.join(root, "apps/web/app/features/analytics/analytics.ts")
const policyPath = path.join(
  root,
  "apps/api/src/main/java/tw/basketball/magazine/analytics/AnalyticsEventPolicy.java"
)
const eventSpecPath = path.join(root, "contracts/analytics-event-spec.json")
const frontendTestPath = path.join(root, "apps/web/tests/unit/analytics/analytics.test.ts")
const apiTestPath = path.join(
  root,
  "apps/api/src/test/java/tw/basketball/magazine/analytics/AnalyticsEventPolicyTest.java"
)
const inventoryPath = path.join(root, "docs/privacy/data-inventory.md")

const requiredEvents = [
  "public_issue_view",
  "public_article_view",
  "public_search_submitted",
  "public_share_started"
]
const consentLiterals = ["unknown", "denied", "granted"]
const forbiddenData = [
  "raw query",
  "slug",
  "title",
  "bodies",
  "URL",
  "user/session/device identifier",
  "IP addresses",
  "email addresses",
  "wallet addresses",
  "request IDs",
  "trace IDs"
]

assert.ok(fs.existsSync(analyticsPath), "frontend analytics contract is missing")
assert.ok(fs.existsSync(policyPath), "API analytics policy is missing")
assert.ok(fs.existsSync(eventSpecPath), "canonical analytics event spec is missing")
assert.ok(fs.existsSync(inventoryPath), "analytics privacy inventory is missing")

const analyticsSource = fs.readFileSync(analyticsPath, "utf8")
const policySource = fs.readFileSync(policyPath, "utf8")
const frontendTestSource = fs.readFileSync(frontendTestPath, "utf8")
const apiTestSource = fs.readFileSync(apiTestPath, "utf8")
const eventSpec = JSON.parse(fs.readFileSync(eventSpecPath, "utf8"))
const inventory = fs.readFileSync(inventoryPath, "utf8")

assert.equal(eventSpec.version, 1, "analytics event spec version must be 1")
assert.deepEqual(
  Object.keys(eventSpec.events).sort(),
  [...requiredEvents].sort(),
  "analytics event spec must define exactly four events"
)
const allValues = new Set(
  Object.values(eventSpec.events).flatMap((properties) => Object.values(properties).flat())
)

for (const [eventType, properties] of Object.entries(eventSpec.events)) {
  assert.ok(analyticsSource.includes(eventType), "frontend event is missing: " + eventType)
  assert.ok(policySource.includes(eventType), "API event is missing: " + eventType)
  assert.ok(inventory.includes(eventType), "inventory event is missing: " + eventType)

  assert.ok(Object.keys(properties).length > 0, eventType + " must define bounded properties")
  const baselineProperties = Object.fromEntries(
    Object.entries(properties).map(([property, values]) => [property, values[0]])
  )
  assert.deepEqual(
    sanitizeAnalyticsEvent({ type: eventType, properties: baselineProperties }),
    { type: eventType, properties: baselineProperties },
    eventType + " must accept its canonical shape"
  )

  for (const [property, values] of Object.entries(properties)) {
    assert.ok(values.length > 0, `${eventType}.${property} must define allowed values`)
    assert.equal(new Set(values).size, values.length, `${eventType}.${property} has duplicates`)
    assert.ok(inventory.includes(property), "inventory property is missing: " + property)
    for (const value of values) {
      assert.ok(inventory.includes(value), "inventory value is missing: " + value)
      assert.notEqual(
        sanitizeAnalyticsEvent({
          type: eventType,
          properties: { ...baselineProperties, [property]: value }
        }),
        null,
        `${eventType}.${property} must accept ${value}`
      )
    }

    for (const value of allValues) {
      if (!values.includes(value)) {
        assert.equal(
          sanitizeAnalyticsEvent({
            type: eventType,
            properties: { ...baselineProperties, [property]: value }
          }),
          null,
          `${eventType}.${property} must reject cross-contract value ${value}`
        )
      }
    }

    const missingProperty = { ...baselineProperties }
    delete missingProperty[property]
    assert.equal(
      sanitizeAnalyticsEvent({ type: eventType, properties: missingProperty }),
      null,
      `${eventType}.${property} is required`
    )
  }

  assert.equal(
    sanitizeAnalyticsEvent({
      type: eventType,
      properties: { ...baselineProperties, unexpected: "value" }
    }),
    null,
    eventType + " must reject extra properties"
  )
}

for (const literal of consentLiterals) {
  assert.ok(analyticsSource.includes(literal), "frontend consent value is missing: " + literal)
}

assert.ok(frontendTestSource.includes("analytics-event-spec.json"))
assert.ok(apiTestSource.includes("analytics-event-spec.json"))
assert.equal(sanitizeAnalyticsEvent({ type: "unknown_event", properties: {} }), null)

for (const forbidden of forbiddenData) {
  assert.ok(inventory.includes(forbidden), "inventory must name forbidden data: " + forbidden)
}

assert.ok(analyticsSource.includes("consent_required"), "consent rejection result is required")
assert.ok(analyticsSource.includes("sink_failure"), "bounded sink failure result is required")
assert.ok(
  analyticsSource.includes('return { sent: false, reason: "consent_required" }'),
  "consent rejection must be bounded"
)
assert.ok(
  analyticsSource.includes('if (getConsent() !== "granted")'),
  "only explicit granted consent may reach the sink"
)
assert.ok(!analyticsSource.includes("fetch("), "T084 must not configure an HTTP endpoint")
assert.ok(!analyticsSource.includes("sendBeacon"), "T084 must not configure a receiver")
assert.ok(!analyticsSource.includes("localStorage"), "T084 must not create provider persistence")
assert.ok(inventory.includes("30 days"), "future retention ceiling must be 30 days")
assert.ok(inventory.includes("no configured external sink"))
assert.ok(inventory.includes("does not create retention jobs"))
assert.ok(inventory.includes("secrets"))

console.log("analytics privacy contract: pass (4 events, explicit consent, bounded fields)")
