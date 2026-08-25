import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  createConsentAwareAnalytics,
  sanitizeAnalyticsEvent,
  type AnalyticsEvent
} from "../../../app/features/analytics/analytics.ts"

type AnalyticsEventSpec = {
  version: number
  events: Record<string, Record<string, string[]>>
}

const analyticsEventSpec = JSON.parse(
  readFileSync(
    new URL("../../../../../contracts/analytics-event-spec.json", import.meta.url),
    "utf8"
  )
) as AnalyticsEventSpec

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

test("all four event types accept only bounded values", () => {
  const events: AnalyticsEvent[] = [
    {
      type: "public_issue_view",
      properties: { surface: "issue", content_kind: "issue" }
    },
    articleView(),
    {
      type: "public_search_submitted",
      properties: {
        surface: "search",
        query_length_bucket: "3_5",
        result_count_bucket: "1_5"
      }
    },
    {
      type: "public_share_started",
      properties: {
        surface: "share",
        content_kind: "article",
        share_target: "copy_link"
      }
    }
  ]

  for (const event of events) {
    assert.deepEqual(sanitizeAnalyticsEvent(event), event)
  }

  assert.equal(
    sanitizeAnalyticsEvent({
      type: "public_share_started",
      properties: {
        surface: "share",
        content_kind: "article",
        share_target: "unknown_target"
      }
    }),
    null
  )
})

test("frontend policy matches every canonical event property and value", () => {
  assert.equal(analyticsEventSpec.version, 1)

  const allValues = new Set(
    Object.values(analyticsEventSpec.events).flatMap((properties) =>
      Object.values(properties).flat()
    )
  )

  for (const [type, propertySpec] of Object.entries(analyticsEventSpec.events)) {
    const baselineProperties = Object.fromEntries(
      Object.entries(propertySpec).map(([property, values]) => [property, values[0]])
    )

    assert.deepEqual(
      sanitizeAnalyticsEvent({ type, properties: baselineProperties }),
      { type, properties: baselineProperties },
      type
    )

    for (const [property, allowedValues] of Object.entries(propertySpec)) {
      for (const value of allowedValues) {
        assert.notEqual(
          sanitizeAnalyticsEvent({
            type,
            properties: { ...baselineProperties, [property]: value }
          }),
          null,
          `${type}.${property} must accept ${value}`
        )
      }

      for (const value of allValues) {
        if (!allowedValues.includes(value)) {
          assert.equal(
            sanitizeAnalyticsEvent({
              type,
              properties: { ...baselineProperties, [property]: value }
            }),
            null,
            `${type}.${property} must reject cross-contract value ${value}`
          )
        }
      }

      const missingProperty = { ...baselineProperties }
      delete missingProperty[property]
      assert.equal(
        sanitizeAnalyticsEvent({ type, properties: missingProperty }),
        null,
        `${type}.${property} is required`
      )
    }

    assert.equal(
      sanitizeAnalyticsEvent({
        type,
        properties: { ...baselineProperties, unexpected: "value" }
      }),
      null,
      `${type} must reject extra properties`
    )
  }
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

test("prototype property names are not event types", () => {
  for (const type of ["toString", "constructor", "__proto__"]) {
    assert.equal(sanitizeAnalyticsEvent({ type, properties: {} }), null, type)
  }
})

test("consent withdrawal blocks subsequent events", async () => {
  const received: AnalyticsEvent[] = []
  const client = createConsentAwareAnalytics({
    storage: storage(),
    sink: { emit: (event: AnalyticsEvent) => received.push(event) }
  })

  client.setConsent("granted")
  assert.deepEqual(await client.track(articleView()), { sent: true })

  client.setConsent("denied")
  assert.deepEqual(await client.track(articleView()), {
    sent: false,
    reason: "consent_required"
  })
  assert.deepEqual(received, [articleView()])
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

test("consent storage failure is a bounded no-op before the sink", async () => {
  let sinkCalls = 0
  const client = createConsentAwareAnalytics({
    storage: {
      get: () => {
        throw new Error("storage unavailable")
      },
      set: () => undefined
    },
    sink: {
      emit: () => {
        sinkCalls += 1
      }
    }
  })

  assert.deepEqual(await client.track(articleView()), {
    sent: false,
    reason: "consent_required"
  })
  assert.equal(sinkCalls, 0)
})

test("granted consent without a configured sink reports a bounded drop", async () => {
  const client = createConsentAwareAnalytics({ storage: storage("granted") })

  assert.deepEqual(await client.track(articleView()), {
    sent: false,
    reason: "sink_unconfigured"
  })
})
