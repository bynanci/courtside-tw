import assert from "node:assert/strict"
import test from "node:test"

import {
  createConsentAwareAnalytics,
  sanitizeAnalyticsEvent,
  type AnalyticsEvent
} from "../../../app/features/analytics/analytics.ts"

function storage(initial: "unknown" | "denied" | "granted" = "unknown") {
  let value = initial
  return {
    get: () => value,
    set: (next: "unknown" | "denied" | "granted") => {
      value = next
    }
  }
}

function articleView(): AnalyticsEvent {
  return {
    type: "public_article_view",
    properties: {
      surface: "article",
      content_kind: "article"
    }
  }
}

test("unknown and denied consent are strict no-ops", async () => {
  const received: AnalyticsEvent[] = []
  const sink = { emit: (event: AnalyticsEvent) => received.push(event) }

  const unknown = createConsentAwareAnalytics({ storage: storage("unknown"), sink })
  const denied = createConsentAwareAnalytics({ storage: storage("denied"), sink })

  assert.deepEqual(await unknown.track(articleView()), {
    sent: false,
    reason: "consent_required"
  })
  assert.deepEqual(await denied.track(articleView()), {
    sent: false,
    reason: "consent_required"
  })
  assert.deepEqual(received, [])
})

test("explicit granted consent emits only an allowlisted event", async () => {
  const received: AnalyticsEvent[] = []
  const client = createConsentAwareAnalytics({
    storage: storage(),
    sink: { emit: (event: AnalyticsEvent) => received.push(event) }
  })

  client.setConsent("granted")

  assert.deepEqual(await client.track(articleView()), { sent: true })
  assert.deepEqual(received, [articleView()])
})

test("raw query and unknown properties fail closed before the sink", () => {
  assert.equal(
    sanitizeAnalyticsEvent({
      type: "public_search_submitted",
      properties: {
        surface: "search",
        query: "秘密搜尋詞",
        query_length_bucket: "6_plus",
        result_count_bucket: "zero"
      }
    }),
    null
  )
})

test("sink failure is non-blocking and observable as a bounded drop", async () => {
  const client = createConsentAwareAnalytics({
    storage: storage("granted"),
    sink: {
      emit: () => {
        throw new Error("provider unavailable")
      }
    }
  })

  assert.deepEqual(await client.track(articleView()), {
    sent: false,
    reason: "sink_failure"
  })
})
