export type BrowserStorageEstimate = {
  usage: number
  quota: number
  available: number
}

export async function readBrowserStorageEstimate(): Promise<BrowserStorageEstimate | null> {
  const storage = globalThis.navigator?.storage
  if (!storage || typeof storage.estimate !== "function") {
    return null
  }

  try {
    const estimate = await storage.estimate()
    if (
      typeof estimate.usage !== "number" ||
      !Number.isFinite(estimate.usage) ||
      estimate.usage < 0 ||
      typeof estimate.quota !== "number" ||
      !Number.isFinite(estimate.quota) ||
      estimate.quota <= 0
    ) {
      return null
    }
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      available: Math.max(0, estimate.quota - estimate.usage)
    }
  } catch {
    return null
  }
}

export function formatStorageBytes(bytes: number): string {
  const bounded = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const units = [
    { threshold: 1024 ** 3, divisor: 1024 ** 3, suffix: "GB" },
    { threshold: 1024 ** 2, divisor: 1024 ** 2, suffix: "MB" },
    { threshold: 1024, divisor: 1024, suffix: "KB" }
  ]
  const unit = units.find((candidate) => bounded >= candidate.threshold)
  if (!unit) {
    return `${Math.round(bounded)} B`
  }
  const value = bounded / unit.divisor
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "")
  return `${formatted} ${unit.suffix}`
}

export function formatOfflineExpiry(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt)
  if (!Number.isFinite(timestamp)) {
    return "期限未知"
  }
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Taipei"
  }).format(new Date(timestamp))
}
