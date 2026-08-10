export const STUDIO_AUDIT_TARGET_TYPES = ["ARTICLE", "ISSUE", "MEDIA_ASSET"] as const

export type StudioAuditTargetType = (typeof STUDIO_AUDIT_TARGET_TYPES)[number]

export interface StudioAuditTarget {
  targetType: StudioAuditTargetType
  targetId: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export function parseAuditTarget(type: unknown, id: unknown): StudioAuditTarget | null {
  if (typeof type !== "string" || typeof id !== "string") return null
  const normalizedType = type.trim().toUpperCase()
  const targetType = STUDIO_AUDIT_TARGET_TYPES.find((candidate) => candidate === normalizedType)
  const targetId = id.trim()
  if (!targetType || !UUID_PATTERN.test(targetId)) return null
  return { targetType, targetId }
}
