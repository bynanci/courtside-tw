import { createApiClient, type components } from "@courtside/api-client"

import {
  parsePublicArticleSlug,
  parsePublicIssueSlug,
  publicIssueApiPath
} from "./public-issue-contract.ts"
import { readCachedOfflineArticle } from "../offline/services/OfflineIssueManager.ts"

export type PublicIssuePage = components["schemas"]["IssueSummaryPage"]
export type PublicIssueDetail = components["schemas"]["IssueDetail"]
export type PublicIssueSummary = components["schemas"]["IssueSummary"]
export type PublicArticleProjection = components["schemas"]["ArticleProjection"]

export class PublicArticleApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number) {
    super("The public Article projection is unavailable.")
    this.name = "PublicArticleApiError"
    this.statusCode = statusCode
  }
}

export class PublicIssueApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number) {
    super("The public Issue projection is unavailable.")
    this.name = "PublicIssueApiError"
    this.statusCode = statusCode
  }
}

export async function fetchPublicIssuePage(baseUrl: string, limit = 20): Promise<PublicIssuePage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("public Issue page limit must be between 1 and 100")
  }
  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(baseUrl) })
    const { data, response } = await client.GET("/api/v1/public/issues", {
      params: { query: { limit } }
    })
    if (!response.ok || !data) {
      throw new PublicIssueApiError(response.status)
    }
    return data
  } catch (error) {
    if (error instanceof PublicIssueApiError) {
      throw error
    }
    throw new PublicIssueApiError(503)
  }
}

export async function fetchPublicIssue(
  baseUrl: string,
  issueSlug: string
): Promise<PublicIssueDetail> {
  const slug = parsePublicIssueSlug(issueSlug)
  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(baseUrl) })
    const { data, response } = await client.GET("/api/v1/public/issues/{issueSlug}", {
      params: { path: { issueSlug: slug } }
    })
    if (!response.ok || !data) {
      throw new PublicIssueApiError(response.status)
    }
    return data
  } catch (error) {
    if (error instanceof PublicIssueApiError) {
      throw error
    }
    throw new PublicIssueApiError(503)
  }
}

export async function fetchPublicArticle(
  baseUrl: string,
  articleSlug: string,
  issueSlug?: string | null
): Promise<PublicArticleProjection> {
  const slug = parsePublicArticleSlug(articleSlug)
  let statusCode = 503
  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(baseUrl) })
    const { data, response } = await client.GET("/api/v1/public/articles/{articleSlug}", {
      params: { header: {}, path: { articleSlug: slug } }
    })
    if (!response.ok || !data) {
      throw new PublicArticleApiError(response.status)
    }
    return data
  } catch (error) {
    if (error instanceof PublicArticleApiError) {
      statusCode = error.statusCode
      if (statusCode < 500) {
        throw error
      }
    }
  }

  if (issueSlug) {
    try {
      const cached = await readCachedOfflineArticle(baseUrl, issueSlug, slug)
      if (cached) {
        return cached
      }
    } catch {
      // A malformed or unavailable local package must never mask the API failure.
    }
  }
  throw new PublicArticleApiError(statusCode)
}

export function apiPathForPublicIssue(issueSlug: string): string {
  return publicIssueApiPath(issueSlug)
}

export function publicMediaUrl(baseUrl: string, path: string): string {
  if (
    !/^\/media\/[a-z0-9][a-z0-9._/-]{0,255}$/.test(path) ||
    path.includes("..") ||
    path.includes("//") ||
    path.includes("/./") ||
    path.endsWith("/")
  ) {
    throw new Error("public media path must be a safe server-selected path")
  }
  return new URL(path, normalizedApiBaseUrl(baseUrl)).toString()
}

function normalizedApiBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("public API base URL must be an absolute HTTP(S) URL")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("public API base URL must use HTTP(S)")
  }
  if (url.username || url.password) {
    throw new Error("public API base URL must not contain credentials")
  }
  return url.toString().replace(/\/$/, "")
}
