const MOBILE_CORE_WEB_VITALS = Object.freeze({
  lcpMilliseconds: 2500,
  inpMilliseconds: 200,
  cls: 0.1
})
const MOBILE_PERFORMANCE_BUDGETS = Object.freeze({
  performanceScore: 0.8,
  totalByteWeightBytes: 1500 * 1024
})

module.exports = {
  ci: {
    collect: {
      startServerCommand: "node ../../tests/performance/start-server.mjs",
      startServerReadyPattern: "Performance fixture listening",
      startServerReadyTimeout: 120000,
      url: [
        "http://127.0.0.1:4173/issues/performance-issue",
        "http://127.0.0.1:4173/articles/performance-article-01?issue=performance-issue",
        "http://127.0.0.1:4173/articles/performance-article-20?issue=performance-issue"
      ],
      numberOfRuns: 3,
      settings: {
        formFactor: "mobile",
        throttlingMethod: "simulate",
        throttling: {
          rttMs: 150,
          throughputKbps: 1536,
          cpuSlowdownMultiplier: 4
        },
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 915,
          deviceScaleFactor: 2.625,
          disabled: false
        },
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
      }
    },
    assert: {
      assertions: {
        "categories:performance": [
          "error",
          { minScore: MOBILE_PERFORMANCE_BUDGETS.performanceScore, aggregationMethod: "median" }
        ],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": [
          "error",
          {
            maxNumericValue: MOBILE_CORE_WEB_VITALS.lcpMilliseconds,
            aggregationMethod: "median"
          }
        ],
        "cumulative-layout-shift": [
          "error",
          { maxNumericValue: MOBILE_CORE_WEB_VITALS.cls, aggregationMethod: "median" }
        ],
        // Navigation Lighthouse cannot produce field INP. TBT is the deterministic
        // lab responsiveness guard; the <=200 ms interaction gate is exercised by
        // us2-read-article.a11y.spec.ts using PerformanceEventTiming.
        "total-blocking-time": [
          "error",
          {
            maxNumericValue: MOBILE_CORE_WEB_VITALS.inpMilliseconds,
            aggregationMethod: "median"
          }
        ],
        "total-byte-weight": [
          "error",
          {
            maxNumericValue: MOBILE_PERFORMANCE_BUDGETS.totalByteWeightBytes,
            aggregationMethod: "median"
          }
        ],
        "image-size-responsive": "error",
        "unsized-images": "error"
      }
    },
    upload: {
      target: "filesystem",
      outputDir: "artifacts/lighthouse"
    }
  }
}
