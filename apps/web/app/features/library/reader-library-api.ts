const READER_BFF_BASE = "/api/reader/api/v1"
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export type ReaderSession = {
  authenticated: boolean
  canSync: boolean
  expiresAt?: number
}

export type BookmarkItem = {
  articleId: string
  createdAt: string
  available: boolean
  unavailableReason: string | null
  slug: string | null
  title: string | null
}

export type ReadingProgress = {
  articleId: string
  revisionId: string
  blockId: string
  percent: number
  updatedAt: string
}

export type ProgressMergeResult = {
  mode: "preview" | "apply"
  accepted: ReadingProgress[]
  conflicts: unknown[]
}

export type AccountExport = {
  issuer: string
  subject: string
  bookmarks: Array<Record<string, unknown>>
  progress: Array<Record<string, unknown>>
  generatedAt: string
}

export type DeletionWorkflow = {
  requestId: string
  status: "QUEUED" | "PROCESSING" | "COMPLETED"
}

type Page<T> = {
  items: T[]
  page: { nextCursor: string | null; limit: number }
}

export class ReaderLibraryApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, message: string, code: string | null) {
    super(message)
    this.name = "ReaderLibraryApiError"
    this.status = status
    this.code = code
  }
}

export async function readReaderSession(): Promise<ReaderSession> {
  const response = await fetch("/auth/session", {
    credentials: "include",
    headers: { accept: "application/json" }
  })
  if (!response.ok) throw new ReaderLibraryApiError(response.status, "session lookup failed", null)
  const value: unknown = await response.json()
  if (!isRecord(value) || typeof value.authenticated !== "boolean") {
    throw new ReaderLibraryApiError(502, "session response is invalid", null)
  }
  const roles = Array.isArray(value.roles) ? value.roles : []
  return {
    authenticated: value.authenticated,
    canSync: value.authenticated && roles.includes("READER"),
    ...(typeof value.expiresAt === "number" ? { expiresAt: value.expiresAt } : {})
  }
}

export async function listBookmarks(): Promise<Page<BookmarkItem>> {
  return readerJson<Page<BookmarkItem>>("/me/bookmarks")
}

export async function putBookmark(articleId: string): Promise<void> {
  await readerRequest(`/me/bookmarks/${encodeURIComponent(articleId)}`, {
    method: "PUT",
    headers: { "Idempotency-Key": crypto.randomUUID() }
  })
}

export async function deleteBookmark(articleId: string): Promise<void> {
  await readerRequest(`/me/bookmarks/${encodeURIComponent(articleId)}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": crypto.randomUUID() }
  })
}

export async function listProgress(): Promise<Page<ReadingProgress>> {
  return readerJson<Page<ReadingProgress>>("/me/progress")
}

export async function putProgress(
  articleId: string,
  input: Pick<ReadingProgress, "revisionId" | "blockId" | "percent">
): Promise<ReadingProgress> {
  return readerJson<ReadingProgress>(`/me/progress/${encodeURIComponent(articleId)}`, {
    method: "PUT",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input)
  })
}

export async function mergeProgress(
  mode: "preview" | "apply",
  items: ReadingProgress[]
): Promise<ProgressMergeResult> {
  return readerJson<ProgressMergeResult>("/me/progress:merge", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ mode, items })
  })
}

export async function exportAccountData(): Promise<AccountExport> {
  return readerJson<AccountExport>("/me/export")
}

export async function deleteAccount(): Promise<DeletionWorkflow> {
  return readerJson<DeletionWorkflow>("/me", {
    method: "DELETE",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ confirm: true })
  })
}

async function readerJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await readerRequest(path, init)
  return (await response.json()) as T
}

async function readerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set("accept", "application/json")
  if (init.body !== undefined) headers.set("content-type", "application/json")
  const method = (init.method ?? "GET").toUpperCase()
  if (!SAFE_METHODS.has(method)) {
    const csrf = cookieValue("__Host-courtside_csrf")
    if (csrf) headers.set("X-CSRF-Token", csrf)
  }
  const response = await fetch(`${READER_BFF_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include"
  })
  if (!response.ok) {
    const details = await responseDetails(response)
    const record = isRecord(details) ? details : null
    throw new ReaderLibraryApiError(
      response.status,
      typeof record?.detail === "string"
        ? record.detail
        : `Reader library request failed (${response.status})`,
      typeof record?.code === "string" ? record.code : null
    )
  }
  return response
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null
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
