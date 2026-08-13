const MOBILE_CORE_WEB_VITALS = Object.freeze({
  lcpMilliseconds: 2500,
  inpMilliseconds: 200,
  cls: 0.1
})

module.exports = {
  ci: {
    collect: {
      startServerCommand: "node tests/e2e/start-server.mjs",
      startServerReadyPattern: "Listening on",
      startServerReadyTimeout: 120000,
      url: [
        "http://127.0.0.1:4173/articles/courtside-notes?issue=issue-2026-01",
        "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
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
