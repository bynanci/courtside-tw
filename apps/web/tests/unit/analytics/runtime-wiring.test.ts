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
  await analytics.trackSearchSubmitted("台籃 Courtside", 20, true)
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

test("query and result buckets cover privacy boundaries without raw values", async () => {
  const { queryLengthBucket, resultCountBucket } = await runtimeModule()

  assert.deepEqual(
    ["", "台", "台籃", "台灣籃", "一二三四五", "一二三四五六"].map(queryLengthBucket),
    ["empty", "1_2", "1_2", "3_5", "3_5", "6_plus"]
  )
  assert.deepEqual(
    [
      resultCountBucket(0, false),
      resultCountBucket(1, false),
      resultCountBucket(5, false),
      resultCountBucket(6, false),
      resultCountBucket(20, false),
      resultCountBucket(20, true)
    ],
    ["zero", "1_5", "1_5", "6_20", "6_20", "21_plus"]
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
