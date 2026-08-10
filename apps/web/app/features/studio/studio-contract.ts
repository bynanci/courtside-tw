export type StudioRole = "EDITOR" | "PUBLISHER"

export type StudioArticleState =
  "DRAFT" | "IN_REVIEW" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "WITHDRAWN" | "ARCHIVED"

export type StudioMediaState = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "REVOKED"

export type StudioSessionRole = "READER" | "EDITOR" | "PUBLISHER" | "ADMIN"

export interface StudioReadinessBlocker {
  assetId?: string
  code: string
  rightsRecordId?: string
  rightsRecordVersion?: number
}

export interface StudioReadiness {
  ready: boolean
  blockingCodes: string[]
  blockers: StudioReadinessBlocker[]
}

export interface StudioArticleDraft {
  articleId: string
  revisionId: string
  revisionNumber: number
  version: number
  title: string
  slug: string
  dek?: string
  content?: unknown
  state: StudioArticleState
  scheduledAt?: string
  readiness: StudioReadiness
}

export function parseStudioRole(value: unknown): StudioRole {
  return value === "PUBLISHER" ? "PUBLISHER" : "EDITOR"
}

/** A URL role is only a view preference; the OIDC session remains authoritative. */
export function resolveStudioRole(
  sessionRoles: readonly string[],
  requestedRole: unknown,
  preferredRole: StudioRole
): StudioRole | null {
  const available = new Set<StudioRole>(
    sessionRoles.filter((role): role is StudioRole => role === "EDITOR" || role === "PUBLISHER")
  )
  const requested =
    requestedRole === "EDITOR" || requestedRole === "PUBLISHER" ? requestedRole : null
  if (requested && available.has(requested)) {
    return requested
  }
  if (available.has(preferredRole)) {
    return preferredRole
  }
  const fallback = preferredRole === "EDITOR" ? "PUBLISHER" : "EDITOR"
  return available.has(fallback) ? fallback : null
}

/** Route-level role binding; a URL query must never select another API scope. */
export function resolveRequiredStudioRole(
  sessionRoles: readonly string[],
  requiredRole: StudioRole
): StudioRole | null {
  return sessionRoles.includes(requiredRole) ? requiredRole : null
}

export function readinessLabel(readiness: StudioReadiness): string {
  return readiness.ready ? "RIGHTS_ALLOWED" : readiness.blockingCodes.join(", ") || "NOT_READY"
}

export function roleLabel(role: StudioRole): string {
  return role === "PUBLISHER" ? "Publisher" : "Editor"
}

export function articleStateLabel(state: StudioArticleState): string {
  return {
    DRAFT: "草稿",
    IN_REVIEW: "審核中",
    APPROVED: "已核准",
    SCHEDULED: "已排程",
    PUBLISHED: "已發布",
    WITHDRAWN: "已撤回",
    ARCHIVED: "已封存"
  }[state]
}

export function mediaStateLabel(state: StudioMediaState): string {
  return {
    PENDING: "等待上傳",
    PROCESSING: "處理中",
    READY: "可發布",
    FAILED: "處理失敗",
    REVOKED: "權利已撤回"
  }[state]
}
