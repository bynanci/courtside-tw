import { createApiClient, type components } from "@courtside/api-client"

export type ArticleDraftPage = components["schemas"]["ArticleDraftPage"]
export type ArticleDraft = components["schemas"]["ArticleDraft"]
export type IssueDraftPage = components["schemas"]["IssueDraftPage"]
export type IssueDraft = components["schemas"]["IssueDraft"]
export type IssueSection = components["schemas"]["IssueSection"]
export type IssueSectionCollection = components["schemas"]["IssueSectionCollection"]
export type AuditEventPage = components["schemas"]["AuditEventPage"]
export type AuditEvent = components["schemas"]["AuditEvent"]
export type WorkflowResult = components["schemas"]["WorkflowResult"]
export type MediaCompleteResult = WorkflowResult
export type MediaMetadata = components["schemas"]["MediaMetadata"]
export type MediaMetadataUpdate = components["schemas"]["MediaMetadataUpdate"]
export type MediaUploadIntent = components["schemas"]["MediaUploadIntent"]
export type MediaUploadRequest = components["schemas"]["MediaUploadRequest"]
export type ProblemDetails = components["schemas"]["ProblemDetails"]

export type EditorialAuditTargetType = "ARTICLE" | "ISSUE" | "MEDIA_ASSET"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const STUDIO_BFF_BASE = "/api/studio"

export class StudioApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly details: unknown

  constructor(status: number, message: string, code: string | null, details: unknown) {
    super(message)
    this.name = "StudioApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export function createStudioApiClient() {
  return createApiClient({
    baseUrl: STUDIO_BFF_BASE,
    fetch: studioFetch
  })
}

export async function listEditorArticles(limit = 100): Promise<ArticleDraftPage> {
  const result = await createStudioApiClient().GET("/api/v1/editor/articles", {
    params: { query: { limit } }
  })
  return unwrap(result)
}

export async function getEditorArticle(articleId: string): Promise<ArticleDraft> {
  const result = await createStudioApiClient().GET("/api/v1/editor/articles/{id}", {
    params: { path: { id: articleId } }
  })
  return unwrap(result)
}

export async function listEditorIssues(limit = 100): Promise<IssueDraftPage> {
  const result = await createStudioApiClient().GET("/api/v1/editor/issues", {
    params: { query: { limit } }
  })
  return unwrap(result)
}

export async function listEditorIssueSections(issueId: string): Promise<IssueSectionCollection> {
  const result = await createStudioApiClient().GET("/api/v1/editor/issues/{issueId}/sections", {
    params: { path: { issueId } }
  })
  return unwrap(result)
}

export async function createEditorIssueSection(
  issueId: string,
  version: number,
  title: string,
  position?: number
): Promise<IssueSectionCollection> {
  const result = await createStudioApiClient().POST("/api/v1/editor/issues/{issueId}/sections", {
    params: {
      path: { issueId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    },
    body: { title, ...(position === undefined ? {} : { position }) }
  })
  return unwrap(result)
}

export async function reorderEditorIssueSections(
  issueId: string,
  version: number,
  sections: Array<{ sectionId: string; position: number }>
): Promise<IssueSectionCollection> {
  const result = await createStudioApiClient().PATCH("/api/v1/editor/issues/{issueId}/sections", {
    params: {
      path: { issueId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    },
    body: { sections }
  })
  return unwrap(result)
}

export async function patchEditorIssueSection(
  issueId: string,
  sectionId: string,
  version: number,
  title: string
): Promise<IssueSectionCollection> {
  const result = await createStudioApiClient().PATCH(
    "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
    {
      params: {
        path: { issueId, sectionId },
        header: {
          "If-Match": ifMatch(version),
          "Idempotency-Key": crypto.randomUUID()
        }
      },
      body: { title }
    }
  )
  return unwrap(result)
}

export async function deleteEditorIssueSection(
  issueId: string,
  sectionId: string,
  version: number
): Promise<IssueSectionCollection> {
  const result = await createStudioApiClient().DELETE(
    "/api/v1/editor/issues/{issueId}/sections/{sectionId}",
    {
      params: {
        path: { issueId, sectionId },
        header: {
          "If-Match": ifMatch(version),
          "Idempotency-Key": crypto.randomUUID()
        }
      }
    }
  )
  return unwrap(result)
}

export async function patchEditorIssue(
  issueId: string,
  version: number,
  changes: Record<string, unknown>
): Promise<IssueDraft> {
  const result = await createStudioApiClient().PATCH("/api/v1/editor/issues", {
    params: {
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    },
    body: { issueId, changes }
  })
  return unwrap(result)
}

export async function listEditorialAudit(
  targetType: EditorialAuditTargetType,
  targetId: string,
  limit = 50
): Promise<AuditEventPage> {
  const result = await createStudioApiClient().GET("/api/v1/editor/audit", {
    params: { query: { targetType, targetId, limit } }
  })
  return unwrap(result)
}

export async function listPublisherArticles(limit = 100): Promise<ArticleDraftPage> {
  const result = await createStudioApiClient().GET("/api/v1/publisher/articles", {
    params: { query: { limit } }
  })
  return unwrap(result)
}

export async function getPublisherArticle(articleId: string): Promise<ArticleDraft> {
  const result = await createStudioApiClient().GET("/api/v1/publisher/articles/{id}", {
    params: { path: { id: articleId } }
  })
  return unwrap(result)
}

export async function patchEditorArticle(
  articleId: string,
  version: number,
  changes: Record<string, unknown>
): Promise<ArticleDraft> {
  const result = await createStudioApiClient().PATCH("/api/v1/editor/articles", {
    params: {
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    },
    body: { articleId, changes }
  })
  return unwrap(result)
}

export async function submitArticle(
  articleId: string,
  revisionId: string
): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/editor/articles/{id}:submit", {
    params: {
      path: { id: articleId },
      header: { "Idempotency-Key": crypto.randomUUID() }
    },
    body: { revisionId }
  })
  return unwrap(result)
}

export async function approveArticle(articleId: string, version: number): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/publisher/articles/{id}:approve", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    }
  })
  return unwrap(result)
}

export async function requestChangesArticle(
  articleId: string,
  version: number,
  reason: string
): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST(
    "/api/v1/publisher/articles/{id}:request-changes",
    {
      params: {
        path: { id: articleId },
        header: {
          "If-Match": ifMatch(version),
          "Idempotency-Key": crypto.randomUUID()
        }
      },
      body: { reason }
    }
  )
  return unwrap(result)
}

export async function scheduleArticle(
  articleId: string,
  version: number,
  publishAt: string,
  timezone: string,
  idempotencyKey: string = crypto.randomUUID()
): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/publisher/articles/{id}:schedule", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": idempotencyKey
      }
    },
    body: { publishAt, timezone }
  })
  return unwrap(result)
}

export async function publishArticle(articleId: string, version: number): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/publisher/articles/{id}:publish", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    }
  })
  return unwrap(result)
}

export async function withdrawArticle(
  articleId: string,
  version: number,
  reason: string
): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/publisher/articles/{id}:withdraw", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    },
    body: { reason }
  })
  return unwrap(result)
}

export async function archiveArticle(articleId: string, version: number): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/publisher/articles/{id}:archive", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": ifMatch(version),
        "Idempotency-Key": crypto.randomUUID()
      }
    }
  })
  return unwrap(result)
}

export async function requestUploadIntent(
  request: MediaUploadRequest,
  idempotencyKey: string
): Promise<MediaUploadIntent> {
  const result = await createStudioApiClient().POST("/api/v1/editor/media/uploads", {
    params: { header: { "Idempotency-Key": idempotencyKey } },
    body: request
  })
  return unwrap(result)
}

export async function completeUpload(
  assetId: string,
  checksumSha256: string,
  contentType: string,
  idempotencyKey: string
): Promise<WorkflowResult> {
  const result = await createStudioApiClient().POST("/api/v1/editor/media/{id}:complete", {
    params: {
      path: { id: assetId },
      header: { "Idempotency-Key": idempotencyKey }
    },
    body: { checksumSha256, contentType }
  })
  return unwrap(result)
}

export async function getMediaMetadata(assetId: string): Promise<MediaMetadata> {
  const result = await createStudioApiClient().GET("/api/v1/editor/media/{id}", {
    params: { path: { id: assetId } }
  })
  return unwrap(result)
}

export async function updateMediaMetadata(
  assetId: string,
  version: number,
  body: MediaMetadataUpdate
): Promise<MediaMetadata> {
  const result = await createStudioApiClient().PATCH("/api/v1/editor/media/{id}", {
    params: { path: { id: assetId }, header: { "If-Match": ifMatch(version) } },
    body
  })
  return unwrap(result)
}

function ifMatch(version: number): string {
  return `"${version}"`
}

async function studioFetch(input: Request): Promise<Response> {
  const headers = new Headers(input.headers)
  if (!SAFE_METHODS.has(input.method.toUpperCase())) {
    const csrf = cookieValue("__Host-courtside_csrf")
    if (csrf) headers.set("X-CSRF-Token", csrf)
  }
  return fetch(new Request(input, { headers, credentials: "include" }))
}

function cookieValue(name: string): string | null {
  const encoded = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

async function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): Promise<T> {
  if (result.response.ok && result.data !== undefined) {
    return result.data
  }
  const details = result.error ?? (await responseDetails(result.response))
  const record = isRecord(details) ? details : null
  const code = typeof record?.code === "string" ? record.code : null
  const message =
    typeof record?.detail === "string"
      ? record.detail
      : `Studio API request failed (${result.response.status})`
  throw new StudioApiError(result.response.status, message, code, details)
}

async function responseDetails(response: Response): Promise<unknown> {
  try {
    return await response.clone().json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
