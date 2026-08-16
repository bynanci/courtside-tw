export default function registerOfflineAppShell(): void {
  const config = useRuntimeConfig()
  const policy = config.public.offlineAppShell

  if (!policy.enabled || !("serviceWorker" in navigator)) {
    return
  }

  void navigator.serviceWorker
    .register(policy.scriptPath, { scope: policy.scope })
    .catch(() => undefined)
}
