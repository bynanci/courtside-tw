import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import {
  evaluateLighthouseAssertions,
  validateLighthouseConfig
} from "../../../scripts/run-lighthouse-budgets.mjs"

const require = createRequire(import.meta.url)
const lighthouseConfig = require("../../../lighthouserc.cjs")

test("mobile Lighthouse config preserves all T079 public reader workloads and budgets", () => {
  const { assertions, collect, outputDir } = validateLighthouseConfig(lighthouseConfig)

  assert.equal(collect.startServerCommand, "node ../../tests/performance/start-server.mjs")
  assert.equal(collect.startServerReadyPattern, "Performance fixture listening")
  assert.deepEqual(collect.url, [
    "http://127.0.0.1:4173/issues/performance-issue",
    "http://127.0.0.1:4173/articles/performance-article-01?issue=performance-issue",
    "http://127.0.0.1:4173/articles/performance-article-20?issue=performance-issue"
  ])
  assert.equal(collect.numberOfRuns, 3)
  assert.equal(collect.settings.formFactor, "mobile")
  assert.equal(outputDir, "artifacts/lighthouse")
  assert.equal(assertions["categories:performance"][1].minScore, 0.8)
  assert.equal(assertions["largest-contentful-paint"][1].maxNumericValue, 2_500)
  assert.equal(assertions["cumulative-layout-shift"][1].maxNumericValue, 0.1)
  assert.equal(assertions["total-blocking-time"][1].maxNumericValue, 200)
  assert.equal(assertions["total-byte-weight"][1].maxNumericValue, 1_500 * 1_024)
  assert.deepEqual(assertions["categories:accessibility"], ["error", { minScore: 1 }])
})

test("budget evaluation applies median numeric limits and category minimums", () => {
  const reports = [2_300, 2_600, 2_400].map((largestContentfulPaint, index) => ({
    audits: {
      "largest-contentful-paint": { numericValue: largestContentfulPaint, score: 0.9 },
      "unsized-images": { numericValue: 0, score: index === 1 ? 0 : 1 }
    },
    categories: {
      accessibility: { score: index === 1 ? 0.98 : 1 }
    }
  }))
  const results = evaluateLighthouseAssertions(reports, {
    "categories:accessibility": ["error", { minScore: 1 }],
    "largest-contentful-paint": ["error", { aggregationMethod: "median", maxNumericValue: 2_500 }],
    "unsized-images": "error"
  })

  assert.deepEqual(
    results.map(({ actual, auditId, passed }) => ({ actual, auditId, passed })),
    [
      { actual: 1, auditId: "categories:accessibility", passed: true },
      { actual: 2_400, auditId: "largest-contentful-paint", passed: true },
      { actual: 1, auditId: "unsized-images", passed: true }
    ]
  )
})

test("missing audits fail closed instead of silently skipping a budget", () => {
  const results = evaluateLighthouseAssertions([{ audits: {}, categories: {} }], {
    "largest-contentful-paint": ["error", { maxNumericValue: 2_500 }]
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].passed, false)
  assert.equal(results[0].severity, "error")
})

test("one non-finite run fails the whole assertion instead of aggregating fewer runs", () => {
  const numericResults = evaluateLighthouseAssertions(
    [2_300, Number.NaN, 2_400].map((numericValue) => ({
      audits: { "largest-contentful-paint": { numericValue, score: 1 } },
      categories: {}
    })),
    {
      "largest-contentful-paint": ["error", { aggregationMethod: "median", maxNumericValue: 2_500 }]
    }
  )
  const scoreResults = evaluateLighthouseAssertions(
    [1, null, 1].map((score) => ({
      audits: { "unsized-images": { numericValue: 0, score } },
      categories: {}
    })),
    { "unsized-images": "error" }
  )

  assert.equal(numericResults[0].passed, false)
  assert.equal(numericResults[0].expected, "finite numericValue in every run")
  assert.equal(scoreResults[0].passed, false)
  assert.equal(scoreResults[0].expected, "finite score in every run")
})

test("config validation rejects ambiguous or invalid threshold values", () => {
  const withAssertion = (assertion) => ({
    ...structuredClone(lighthouseConfig),
    ci: {
      ...structuredClone(lighthouseConfig.ci),
      assert: { assertions: { example: assertion } }
    }
  })

  assert.throws(
    () =>
      validateLighthouseConfig(withAssertion(["error", { maxNumericValue: 100, minScore: 0.9 }])),
    /cannot combine/u
  )
  for (const maximum of [Number.NaN, Number.POSITIVE_INFINITY, -1, "100"]) {
    assert.throws(
      () => validateLighthouseConfig(withAssertion(["error", { maxNumericValue: maximum }])),
      /finite non-negative/u
    )
  }
  for (const minimum of [Number.NaN, Number.NEGATIVE_INFINITY, -0.01, 1.01, "1"]) {
    assert.throws(
      () => validateLighthouseConfig(withAssertion(["error", { minScore: minimum }])),
      /between 0 and 1/u
    )
  }

  assert.doesNotThrow(() => validateLighthouseConfig(withAssertion("error")))
})
