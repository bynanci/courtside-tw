/* eslint-disable no-console */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const analyticsPath = path.join(root, "apps/web/app/features/analytics/analytics.ts")
const policyPath = path.join(
  root,
  "apps/api/src/main/java/tw/basketball/magazine/analytics/AnalyticsEventPolicy.java"
)
const inventoryPath = path.join(root, "docs/privacy/data-inventory.md")

const expectedEvents = [
  "public_issue_view",
  "public_article_view",
  "public_search_submitted",
  "public_share_started"
]
const consentLiterals = ["unknown", "denied", "granted"]
const boundedLiterals = [
  "content_kind",
  "surface",
  "query_length_bucket",
  "result_count_bucket",
  "share_target",
  "empty",
  "1_2",
  "3_5",
  "6_plus",
  "zero",
  "1_5",
  "6_20",
  "21_plus",
  "copy_link",
  "native_share"
]
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
assert.ok(fs.existsSync(inventoryPath), "analytics privacy inventory is missing")

const analyticsSource = fs.readFileSync(analyticsPath, "utf8")
const policySource = fs.readFileSync(policyPath, "utf8")
const inventory = fs.readFileSync(inventoryPath, "utf8")

for (const eventType of expectedEvents) {
  assert.ok(analyticsSource.includes(eventType), "frontend event is missing: " + eventType)
  assert.ok(policySource.includes(eventType), "API event is missing: " + eventType)
  assert.ok(inventory.includes(eventType), "inventory event is missing: " + eventType)
}

for (const literal of consentLiterals) {
  assert.ok(analyticsSource.includes(literal), "frontend consent value is missing: " + literal)
}

for (const literal of boundedLiterals) {
  assert.ok(analyticsSource.includes(literal), "frontend bound value is missing: " + literal)
  assert.ok(policySource.includes(literal), "API bound value is missing: " + literal)
}

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
