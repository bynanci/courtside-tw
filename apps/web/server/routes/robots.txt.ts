export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizedSiteUrl(config.public.siteUrl)

  setHeader(event, "content-type", "text/plain; charset=utf-8")
  setHeader(event, "cache-control", "public, max-age=3600, must-revalidate")
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Sitemap: " + siteUrl + "/sitemap.xml",
    ""
  ].join("\n")
})

function normalizedSiteUrl(value: string): string {
  try {
    const url = new URL(value)
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
      return url.origin
    }
  } catch {
    // Fall back to the documented public origin without returning caller input.
  }
  return "https://courtside.tw"
}
