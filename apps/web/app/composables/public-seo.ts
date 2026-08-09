export function canonicalUrl(siteUrl: string, path: string): string {
  try {
    return new URL(path, normalizedSiteUrl(siteUrl)).toString()
  } catch {
    return new URL(path, "https://courtside.tw").toString()
  }
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function normalizedSiteUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("site URL must use HTTP(S)")
  }
  if (url.username || url.password) {
    throw new Error("site URL must not contain credentials")
  }
  return url.toString()
}
