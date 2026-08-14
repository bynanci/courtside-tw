import { createApiClient, type components } from "@courtside/api-client"

import {
  parsePublicArticleSlug,
  parsePublicIssueSlug
} from "../../app/features/issues/public-issue-contract"

const MAXIMUM_CONCURRENT_ISSUE_READS = 4
type IssueSummary = components["schemas"]["IssueSummary"]

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizedSiteUrl(config.public.siteUrl)
  const paths = ["/", "/issues"]

  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(config.public.apiBaseUrl) })
    const issues: IssueSummary[] = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    while (true) {
      const { data, response } = await client.GET("/api/v1/public/issues", {
        params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } }
      })
      if (!response.ok || !data) break
      issues.push(...data.items)
      const nextCursor = data.page.nextCursor ?? undefined
      if (!nextCursor || seenCursors.has(nextCursor)) break
      seenCursors.add(nextCursor)
      cursor = nextCursor
    }
    if (issues.length > 0) {
      for (const issue of issues) {
        paths.push("/issues/" + parsePublicIssueSlug(issue.slug))
      }
      const details = await mapWithConcurrency(
        issues,
        MAXIMUM_CONCURRENT_ISSUE_READS,
        async (issue) => {
          const issueSlug = parsePublicIssueSlug(issue.slug)
          const result = await client.GET("/api/v1/public/issues/{issueSlug}", {
            params: { path: { issueSlug } }
          })
          return result.response.ok && result.data ? result.data : null
        }
      )
      for (const detail of details) {
        if (!detail) continue
        for (const section of detail.sections) {
          for (const article of section.articles) {
            paths.push("/articles/" + parsePublicArticleSlug(article.slug))
          }
        }
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

async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>
): Promise<Array<Output | null>> {
  const results: Array<Output | null> = Array.from({ length: values.length }, () => null)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        const value = values[index]
        if (value !== undefined) results[index] = await mapper(value)
      } catch {
        // One unavailable issue must not remove the remaining public sitemap entries.
      }
    }
  })
  await Promise.all(workers)
  return results
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
