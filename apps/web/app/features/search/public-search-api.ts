import { createApiClient, type components } from "@courtside/api-client"

export type PublicSearchPage = components["schemas"]["SearchResultPage"]
export type PublicSearchResult = components["schemas"]["SearchResult"]

export type PublicSearchOptions = {
  limit?: number
  type?: "article" | "issue"
  taxonomy?: string[]
  signal?: AbortSignal
}

export class PublicSearchApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number) {
    super("The public search projection is unavailable.")
    this.name = "PublicSearchApiError"
    this.statusCode = statusCode
  }
}

export async function fetchPublicSearch(
  baseUrl: string,
  query: string,
  options: PublicSearchOptions = {}
): Promise<PublicSearchPage> {
  const limit = options.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("public search limit must be between 1 and 100")
  }
  try {
    const client = createApiClient({ baseUrl: normalizedApiBaseUrl(baseUrl) })
    const { data, response } = await client.GET("/api/v1/public/search", {
      params: {
        query: {
          q: query,
          limit,
          type: options.type,
          taxonomy: options.taxonomy
        }
      },
      signal: options.signal
    })
    if (!response.ok || !data) {
      throw new PublicSearchApiError(response.status)
    }
    return data
  } catch (error) {
    if (error instanceof PublicSearchApiError || isAbortError(error)) {
      throw error
    }
    throw new PublicSearchApiError(503)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
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
