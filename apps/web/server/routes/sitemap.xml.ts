import { createApiClient } from "@courtside/api-client"

import { parsePublicIssueSlug } from "../../app/features/issues/public-issue-contract"

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizedSiteUrl(config.public.siteUrl)
  const paths = ["/", "/issues"]

  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(config.public.apiBaseUrl) })
    const { data, response } = await client.GET("/api/v1/public/issues", {
      params: { query: { limit: 100 } }
    })
    if (response.ok && data) {
      for (const issue of data.items) {
        paths.push("/issues/" + parsePublicIssueSlug(issue.slug))
      }
    }
  } catch {
    // Static routes remain crawlable while the public API is temporarily unavailable.
  }

  const urls = Array.from(new Set(paths)).map((path) => {
    const location = escapeXml(new URL(path, siteUrl).toString())
    return "  <url><loc>" + location + "</loc></url>"
  })
  setHeader(event, "content-type", "application/xml; charset=utf-8")
  setHeader(event, "cache-control", "public, max-age=300, must-revalidate")
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>\n"
  )
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

function normalizedApiBaseUrl(value: string): string {
  const url = new URL(value)
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("public API base URL must be a credential-free HTTP(S) origin")
  }
  return url.toString().replace(/\/$/, "")
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
