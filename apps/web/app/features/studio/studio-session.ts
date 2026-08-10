import type { StudioSessionRole } from "./studio-contract"

export interface StudioSession {
  authenticated: boolean
  subject?: string
  issuer?: string
  roles: readonly StudioSessionRole[]
  expiresAt?: number
}

export async function readStudioSession(): Promise<StudioSession> {
  const response = await fetch("/auth/session", {
    credentials: "include",
    headers: { accept: "application/json" }
  })
  if (!response.ok) {
    throw new Error(`session lookup failed (${response.status})`)
  }
  const value: unknown = await response.json()
  if (!isRecord(value) || typeof value.authenticated !== "boolean") {
    throw new Error("session response is invalid")
  }
  const roles = Array.isArray(value.roles) ? value.roles.filter(isStudioSessionRole) : []
  return {
    authenticated: value.authenticated,
    ...(typeof value.subject === "string" ? { subject: value.subject } : {}),
    ...(typeof value.issuer === "string" ? { issuer: value.issuer } : {}),
    roles,
    ...(typeof value.expiresAt === "number" ? { expiresAt: value.expiresAt } : {})
  }
}

export function loginPath(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}

function isStudioSessionRole(value: unknown): value is StudioSessionRole {
  return value === "READER" || value === "EDITOR" || value === "PUBLISHER" || value === "ADMIN"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
