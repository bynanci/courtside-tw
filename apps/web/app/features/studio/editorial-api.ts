import { createApiClient, type components } from "@courtside/api-client"

export type EditorialArticle = components["schemas"]["ArticleDraft"]
export type EditorialIssue = components["schemas"]["IssueDraft"]
export type EditorialWorkflowResult = components["schemas"]["WorkflowResult"]
export type MediaUploadIntent = components["schemas"]["MediaUploadIntent"]
export type ContentDocument = components["schemas"]["content-document.schema"]

export type EditorialApiOptions = {
  baseUrl: string
  idempotencyKey?: string
}

export class EditorialApiError extends Error {
  readonly statusCode: number
  readonly code?: string

  constructor(statusCode: number, code?: string) {
    super("The editorial API request was rejected.")
    this.name = "EditorialApiError"
    this.statusCode = statusCode
    this.code = code
  }
}

export function createIdempotencyKey(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return prefix + "-" + suffix
}

export function contentDocument(text: string): ContentDocument {
  const documentId = randomUuid()
  const blockId = randomUuid()
  return {
    schemaVersion: 1,
    documentId,
    blocks: [
      {
        id: blockId,
        type: "paragraph",
        version: 1,
        payload: {
          content: text ? [{ kind: "text", text }] : []
        }
      }
    ]
  } as unknown as ContentDocument
}

export async function createEditorialArticle(
  options: EditorialApiOptions,
  input: { title: string; slug: string; content: ContentDocument }
): Promise<EditorialArticle> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/editor/articles", {
    params: {
      header: {
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("article-create")
      }
    },
    body: input
  })
  return expectResponse(response, data)
}

export async function patchEditorialArticle(
  options: EditorialApiOptions,
  input: { articleId: string; changes: Record<string, unknown> },
  version: number
): Promise<EditorialArticle> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.PATCH("/api/v1/editor/articles", {
    params: {
      header: {
        "If-Match": etag(version),
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("article-patch")
      }
    },
    body: input
  })
  return expectResponse(response, data)
}

export async function submitEditorialArticle(
  options: EditorialApiOptions,
  articleId: string,
  revisionId: string
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/editor/articles/{id}:submit", {
    params: {
      path: { id: articleId },
      header: {
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("article-submit")
      }
    },
    body: { revisionId }
  })
  return expectResponse(response, data)
}

export async function approveEditorialArticle(
  options: EditorialApiOptions,
  articleId: string,
  version: number
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/publisher/articles/{id}:approve", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": etag(version),
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("article-approve")
      }
    }
  })
  return expectResponse(response, data)
}

export async function scheduleEditorialIssue(
  options: EditorialApiOptions,
  issueId: string,
  version: number,
  publishAt: string,
  timezone: string
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/publisher/issues/{id}:schedule", {
    params: {
      path: { id: issueId },
      header: {
        "If-Match": etag(version),
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("issue-schedule")
      }
    },
    body: { publishAt, timezone }
  })
  return expectResponse(response, data)
}

export async function publishEditorialIssue(
  options: EditorialApiOptions,
  issueId: string,
  version: number
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/publisher/issues/{id}:publish", {
    params: {
      path: { id: issueId },
      header: {
        "If-Match": etag(version),
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("issue-publish")
      }
    }
  })
  return expectResponse(response, data)
}

export async function withdrawEditorialArticle(
  options: EditorialApiOptions,
  articleId: string,
  version: number,
  reason: string
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/publisher/articles/{id}:withdraw", {
    params: {
      path: { id: articleId },
      header: {
        "If-Match": etag(version),
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("article-withdraw")
      }
    },
    body: { reason }
  })
  return expectResponse(response, data)
}

export async function createMediaUploadIntent(
  options: EditorialApiOptions,
  input: {
    filename: string
    contentType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4"
    sizeBytes: number
    checksumSha256: string
  }
): Promise<MediaUploadIntent> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/editor/media/uploads", {
    params: {
      header: {
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("media-intent")
      }
    },
    body: input
  })
  return expectResponse(response, data)
}

export async function completeMediaUpload(
  options: EditorialApiOptions,
  assetId: string,
  input: { checksumSha256: string; contentType: string }
): Promise<EditorialWorkflowResult> {
  const client = createApiClient({ baseUrl: normalizedApiBaseUrl(options.baseUrl) })
  const { data, response } = await client.POST("/api/v1/editor/media/{id}:complete", {
    params: {
      path: { id: assetId },
      header: {
        "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("media-complete")
      }
    },
    body: input
  })
  return expectResponse(response, data)
}

export async function uploadMediaFile(
  options: EditorialApiOptions,
  file: File
): Promise<MediaUploadIntent> {
  const checksumSha256 = await sha256Hex(file)
  const contentType = mediaType(file.type)
  const intent = await createMediaUploadIntent(
    { ...options, idempotencyKey: createIdempotencyKey("media-intent") },
    {
      filename: file.name,
      contentType,
      sizeBytes: file.size,
      checksumSha256
    }
  )
  const uploadResponse = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  })
  if (!uploadResponse.ok) {
    throw new EditorialApiError(uploadResponse.status)
  }
  await completeMediaUpload(
    { ...options, idempotencyKey: createIdempotencyKey("media-complete") },
    intent.assetId,
    { checksumSha256, contentType: file.type }
  )
  return intent
}

function expectResponse<T>(response: Response, data: T | undefined): T {
  if (!response.ok || data === undefined) {
    throw new EditorialApiError(response.status)
  }
  return data
}

function etag(version: number): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("editorial version must be a positive integer")
  }
  return '"' + version + '"'
}

function mediaType(value: string): "image/jpeg" | "image/png" | "image/webp" | "video/mp4" {
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "video/mp4"
  ) {
    return value
  }
  throw new EditorialApiError(415, "UNSUPPORTED_MEDIA_TYPE")
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "00000000-0000-4000-8000-000000000001"
}

function normalizedApiBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("editorial API base URL must be an absolute HTTP(S) URL")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("editorial API base URL must use HTTP(S)")
  }
  if (url.username || url.password) {
    throw new Error("editorial API base URL must not contain credentials")
  }
  return url.toString().replace(/\/$/, "")
}
