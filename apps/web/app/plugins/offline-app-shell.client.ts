import { defineNuxtPlugin } from "#app"

import { disableOfflineAppShell } from "../service-worker/offline-app-shell"

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const policy = config.public.offlineAppShell

  if (!policy.enabled) {
    if ("serviceWorker" in navigator && "caches" in window) {
      void disableOfflineAppShell(navigator.serviceWorker, window.caches).catch(() => undefined)
    }
    return
  }

  if (!("serviceWorker" in navigator)) {
    return
  }

  void navigator.serviceWorker
    .register(policy.scriptPath, { scope: policy.scope })
    .catch(() => undefined)
})
