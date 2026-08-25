export type ConsentState = "unknown" | "denied" | "granted"

export type AnalyticsEventType =
  | "public_issue_view"
  | "public_article_view"
  | "public_search_submitted"
  | "public_share_started"

export type AnalyticsEvent = {
  type: AnalyticsEventType
  properties: Record<string, string>
}

export type AnalyticsSink = {
  emit: (event: AnalyticsEvent) => void | Promise<void>
}

export type ConsentStore = {
  get: () => ConsentState
  set: (consent: ConsentState) => void
}

export type AnalyticsTrackResult =
  | { sent: true }
  | { sent: false; reason: "consent_required" | "invalid_event" | "sink_failure" }

type EventSpec = {
  properties: readonly string[]
  values: Record<string, readonly string[]>
}

const EVENT_SPECS: Record<AnalyticsEventType, EventSpec> = {
  public_issue_view: {
    properties: ["content_kind", "surface"],
    values: {
      content_kind: ["issue"],
      surface: ["issue"]
    }
  },
  public_article_view: {
    properties: ["content_kind", "surface"],
    values: {
      content_kind: ["article"],
      surface: ["article"]
    }
  },
  public_search_submitted: {
    properties: ["query_length_bucket", "result_count_bucket", "surface"],
    values: {
      query_length_bucket: ["empty", "1_2", "3_5", "6_plus"],
      result_count_bucket: ["zero", "1_5", "6_20", "21_plus"],
      surface: ["search"]
    }
  },
  public_share_started: {
    properties: ["content_kind", "share_target", "surface"],
    values: {
      content_kind: ["article", "issue", "none"],
      share_target: ["copy_link", "native_share"],
      surface: ["share"]
    }
  }
}

const CONSENT_STATES: readonly ConsentState[] = ["unknown", "denied", "granted"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isConsentState(value: unknown): value is ConsentState {
  return typeof value === "string" && CONSENT_STATES.includes(value as ConsentState)
}

function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === "string" && value in EVENT_SPECS
}

function defaultConsentStore(): ConsentStore {
  let consent: ConsentState = "unknown"

  return {
    get: () => consent,
    set: (nextConsent) => {
      consent = nextConsent
    }
  }
}

function defaultSink(): AnalyticsSink {
  return {
    emit: () => undefined
  }
}

export function sanitizeAnalyticsEvent(input: unknown): AnalyticsEvent | null {
  if (!isRecord(input) || !isAnalyticsEventType(input.type) || !isRecord(input.properties)) {
    return null
  }

  const spec = EVENT_SPECS[input.type]
  const properties = input.properties
  const keys = Object.keys(properties).sort()
  const expectedKeys = [...spec.properties].sort()

  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return null
  }

  const sanitizedProperties: Record<string, string> = {}

  for (const key of expectedKeys) {
    const value = properties[key]
    const allowedValues = spec.values[key]

    if (
      typeof value !== "string" ||
      !allowedValues ||
      !allowedValues.includes(value)
    ) {
      return null
    }

    sanitizedProperties[key] = value
  }

  return {
    type: input.type,
    properties: sanitizedProperties
  }
}

export function createConsentAwareAnalytics(options: {
  storage?: ConsentStore
  sink?: AnalyticsSink
} = {}) {
  const storage = options.storage ?? defaultConsentStore()
  const sink = options.sink ?? defaultSink()

  const getConsent = (): ConsentState => {
    const consent = storage.get()
    return isConsentState(consent) ? consent : "unknown"
  }

  return {
    getConsent,
    setConsent: (consent: ConsentState) => {
      storage.set(consent)
    },
    async track(input: unknown): Promise<AnalyticsTrackResult> {
      if (getConsent() !== "granted") {
        return { sent: false, reason: "consent_required" }
      }

      const event = sanitizeAnalyticsEvent(input)
      if (!event) {
        return { sent: false, reason: "invalid_event" }
      }

      try {
        await sink.emit(event)
        return { sent: true }
      } catch {
        return { sent: false, reason: "sink_failure" }
      }
    }
  }
}
