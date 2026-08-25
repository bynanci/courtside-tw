import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import type { AnalyticsEvent, ConsentState } from "../../../app/features/analytics/analytics.ts"

const sourceRoot = new URL("../../../app/", import.meta.url)

function source(path: string): string {
  return readFileSync(new URL(path, sourceRoot), "utf8")
}

function storage(initial: ConsentState = "granted") {
  let consent = initial
  return {
    get: () => consent,
    set: (next: ConsentState) => {
      consent = next
    }
  }
}

async function runtimeModule() {
  return import("../../../app/features/analytics/runtime.ts")
}

async function searchCorrelationModule() {
  return import("../../../app/features/analytics/search-correlation.ts")
}

test("all four public interaction surfaces call the Nuxt analytics runtime", () => {
  const plugin = source("plugins/analytics.ts")
  const issuePage = source("pages/issues/[issueSlug].vue")
  const articlePage = source("pages/articles/[articleSlug].vue")
  const searchPage = source("pages/search.vue")
  const shareButton = source("features/reader/components/ShareArticleButton.vue")

  assert.match(plugin, /createProductAnalyticsRuntime/)
  assert.match(plugin, /provide:\s*\{\s*analytics/)
  assert.match(issuePage, /void \$analytics\.trackIssueView\(\)/)
  assert.match(articlePage, /void \$analytics\.trackArticleView\(\)/)
  assert.match(searchPage, /void \$analytics\.trackSearchSubmitted\(/)
  assert.match(shareButton, /void \$analytics\.trackShareStarted\(/)
  assert.match(searchPage, /beginSubmission\(submissionKey, Array\.from\(query\)\.length\)/)

  const shareStartIndex = shareButton.indexOf("const sharePromise = performArticleShare(")
  const analyticsStartIndex = shareButton.indexOf("void $analytics.trackShareStarted(")
  assert.ok(shareStartIndex >= 0, "the browser share adapter call is missing")
  assert.ok(analyticsStartIndex >= 0, "the share analytics call is missing")
  assert.ok(shareStartIndex < analyticsStartIndex, "the share adapter must start before analytics")

  for (const runtimeSource of [issuePage, articlePage, searchPage, shareButton]) {
    assert.doesNotMatch(runtimeSource, /await \$analytics\./)
  }
})

test("runtime producers emit exactly four bounded events after explicit consent", async () => {
  const { createProductAnalyticsRuntime } = await runtimeModule()
  const received: AnalyticsEvent[] = []
  const analytics = createProductAnalyticsRuntime({
    storage: storage(),
    sink: { emit: (event: AnalyticsEvent) => received.push(event) }
  })

  await analytics.trackIssueView()
  await analytics.trackArticleView()
  await analytics.trackSearchSubmitted(Array.from("台籃 Courtside").length, 20, true)
  await analytics.trackShareStarted("article", "native_share")

  assert.deepEqual(received, [
    {
      type: "public_issue_view",
      properties: { content_kind: "issue", surface: "issue" }
    },
    {
      type: "public_article_view",
      properties: { content_kind: "article", surface: "article" }
    },
    {
      type: "public_search_submitted",
      properties: {
        query_length_bucket: "6_plus",
        result_count_bucket: "21_plus",
        surface: "search"
      }
    },
    {
      type: "public_share_started",
      properties: {
        content_kind: "article",
        share_target: "native_share",
        surface: "share"
      }
    }
  ])
  assert.doesNotMatch(JSON.stringify(received), /台籃|Courtside|slug|title|https?:/)
})

test("default runtime remains inert without an explicit consent store or sink", async () => {
  const { createProductAnalyticsRuntime } = await runtimeModule()
  const analytics = createProductAnalyticsRuntime()

  assert.deepEqual(
    await Promise.all([
      analytics.trackIssueView(),
      analytics.trackArticleView(),
      analytics.trackSearchSubmitted(6, 20, true),
      analytics.trackShareStarted("article", "copy_link")
    ]),
    Array.from({ length: 4 }, () => ({ sent: false, reason: "consent_required" }))
  )
})

test("numeric query and result buckets cover privacy boundaries without raw values", async () => {
  const { queryLengthBucket, resultCountBucket } = await runtimeModule()

  assert.deepEqual([Number.NaN, -1, 0, 1, 2, 3, 5, 6].map(queryLengthBucket), [
    "empty",
    "empty",
    "empty",
    "1_2",
    "1_2",
    "3_5",
    "3_5",
    "6_plus"
  ])
  assert.deepEqual(
    [
      resultCountBucket(0, false),
      resultCountBucket(1, false),
      resultCountBucket(5, false),
      resultCountBucket(6, false),
      resultCountBucket(20, false),
      resultCountBucket(20, true),
      resultCountBucket(21, false)
    ],
    ["zero", "1_5", "1_5", "6_20", "6_20", "21_plus", "21_plus"]
  )
})

test("sink rejection stays bounded and cannot block the calling interaction", async () => {
  const { createProductAnalyticsRuntime } = await runtimeModule()
  const analytics = createProductAnalyticsRuntime({
    storage: storage(),
    sink: { emit: () => Promise.reject(new Error("provider unavailable")) }
  })

  assert.deepEqual(await analytics.trackArticleView(), {
    sent: false,
    reason: "sink_failure"
  })
})

test("same-route resubmission consumes one previously successful exact result", async () => {
  const { createSearchAnalyticsCorrelation } = await searchCorrelationModule()
  const dispatched: unknown[] = []
  const correlation = createSearchAnalyticsCorrelation("A", (event) => dispatched.push(event))

  assert.equal(correlation.seedResolved("A", { resultCount: 5, hasNextPage: false }), true)
  const submission = correlation.beginSubmission("A", 2)
  assert.equal(correlation.confirmSubmission(submission, "A"), true)
  assert.equal(correlation.confirmSubmission(submission, "A"), false)
  assert.deepEqual(dispatched, [{ queryLength: 2, resultCount: 5, hasNextPage: false }])
})

test("A to B to A navigation cannot reuse a historical A result", async () => {
  const { createSearchAnalyticsCorrelation } = await searchCorrelationModule()
  const dispatched: unknown[] = []
  const correlation = createSearchAnalyticsCorrelation("A", (event) => dispatched.push(event))

  correlation.seedResolved("A", { resultCount: 1, hasNextPage: false })
  correlation.routeChanged("B")
  const requestB = correlation.beginRequest("B")
  correlation.routeChanged("A")
  const submissionA = correlation.beginSubmission("A", 1)
  correlation.confirmSubmission(submissionA, "A")

  assert.equal(correlation.resolveRequest(requestB, { resultCount: 20, hasNextPage: true }), false)
  assert.deepEqual(dispatched, [])

  const freshRequestA = correlation.beginRequest("A")
  assert.equal(
    correlation.resolveRequest(freshRequestA, { resultCount: 3, hasNextPage: false }),
    true
  )
  assert.deepEqual(dispatched, [{ queryLength: 1, resultCount: 3, hasNextPage: false }])
})

test("stale, rejected, route-away, and superseded searches never dispatch", async () => {
  const { createSearchAnalyticsCorrelation } = await searchCorrelationModule()
  const dispatched: unknown[] = []
  const correlation = createSearchAnalyticsCorrelation("A", (event) => dispatched.push(event))

  const firstSubmission = correlation.beginSubmission("A", 1)
  correlation.confirmSubmission(firstSubmission, "A")
  const staleRequest = correlation.beginRequest("A")
  const latestRequest = correlation.beginRequest("A")
  assert.equal(
    correlation.resolveRequest(staleRequest, { resultCount: 1, hasNextPage: false }),
    false
  )
  assert.equal(correlation.rejectRequest(latestRequest), true)

  const routeAwaySubmission = correlation.beginSubmission("A", 2)
  correlation.confirmSubmission(routeAwaySubmission, "A")
  const routeAwayRequest = correlation.beginRequest("A")
  correlation.routeChanged("B")
  assert.equal(
    correlation.resolveRequest(routeAwayRequest, { resultCount: 2, hasNextPage: false }),
    false
  )

  correlation.routeChanged("A")
  correlation.seedResolved("A", { resultCount: 4, hasNextPage: false })
  const superseded = correlation.beginSubmission("A", 3)
  const latest = correlation.beginSubmission("A", 4)
  assert.equal(correlation.confirmSubmission(superseded, "A"), false)
  assert.equal(correlation.confirmSubmission(latest, "A"), true)

  assert.deepEqual(dispatched, [{ queryLength: 4, resultCount: 4, hasNextPage: false }])
})
