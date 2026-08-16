import { defineNuxtPlugin } from "#app"

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const policy = config.public.offlineAppShell

  if (!policy.enabled || !("serviceWorker" in navigator)) {
    return
  }

  void navigator.serviceWorker
    .register(policy.scriptPath, { scope: policy.scope })
    .catch(() => undefined)
})
