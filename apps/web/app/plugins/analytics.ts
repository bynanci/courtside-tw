import { defineNuxtPlugin } from "#app"

import { createProductAnalyticsRuntime } from "../features/analytics/runtime"

export default defineNuxtPlugin(() => ({
  provide: {
    analytics: createProductAnalyticsRuntime()
  }
}))
