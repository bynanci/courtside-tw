import { AuthSessionError } from "./errors.ts"

export const COOKIE_NAMES = {
  session: "__Host-courtside_session",
  authState: "__Host-courtside_auth_state",
  csrf: "__Host-courtside_csrf"
} as const

export const CANONICAL_ROLES = ["READER", "EDITOR", "PUBLISHER", "ADMIN"] as const

export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

export type OidcClientConfig = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  revocationEndpoint?: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  scope: readonly string[]
  sessionTtlSeconds: number
  transactionTtlSeconds: number
  allowInsecureHttp?: boolean
}

export function createOidcClientConfig(input: OidcClientConfig): OidcClientConfig {
  const allowInsecureHttp = input.allowInsecureHttp === true
  const config: OidcClientConfig = {
    issuer: validateEndpoint(input.issuer, allowInsecureHttp, true),
    authorizationEndpoint: validateEndpoint(input.authorizationEndpoint, allowInsecureHttp, false),
    tokenEndpoint: validateEndpoint(input.tokenEndpoint, allowInsecureHttp, false),
    jwksUri: validateEndpoint(input.jwksUri, allowInsecureHttp, false),
    ...(input.revocationEndpoint !== undefined
      ? { revocationEndpoint: validateEndpoint(input.revocationEndpoint, allowInsecureHttp, false) }
      : {}),
    clientId: boundedText(input.clientId, 256),
    redirectUri: validateRedirectUri(input.redirectUri, allowInsecureHttp),
    scope: validateScope(input.scope),
    sessionTtlSeconds: boundedInteger(input.sessionTtlSeconds, 60, 86_400),
    transactionTtlSeconds: boundedInteger(input.transactionTtlSeconds, 60, 900),
    allowInsecureHttp
  }

  if (input.clientSecret !== undefined) {
    config.clientSecret = boundedText(input.clientSecret, 4096)
  }

  return config
}

export function oidcConfigFromRuntime(
  runtimeConfig: Record<string, unknown>
): OidcClientConfig | null {
  const raw = runtimeConfig.oidc
  if (!isRecord(raw)) {
    return null
  }

  const requiredKeys = [
    "issuer",
    "authorizationEndpoint",
    "tokenEndpoint",
    "jwksUri",
    "clientId",
    "redirectUri"
  ] as const
  if (requiredKeys.some((key) => typeof raw[key] !== "string" || raw[key].trim() === "")) {
    return null
  }

  const scope =
    typeof raw.scope === "string"
      ? raw.scope.split(" ").filter(Boolean)
      : ["openid", "profile", "email"]

  return createOidcClientConfig({
    issuer: raw.issuer as string,
    authorizationEndpoint: raw.authorizationEndpoint as string,
    tokenEndpoint: raw.tokenEndpoint as string,
    jwksUri: raw.jwksUri as string,
    revocationEndpoint:
      typeof raw.revocationEndpoint === "string" && raw.revocationEndpoint !== ""
        ? raw.revocationEndpoint
        : undefined,
    clientId: raw.clientId as string,
    clientSecret:
      typeof raw.clientSecret === "string" && raw.clientSecret !== ""
        ? raw.clientSecret
        : undefined,
    redirectUri: raw.redirectUri as string,
    scope,
    sessionTtlSeconds: numberFromRuntime(raw.sessionTtlSeconds, 900),
    transactionTtlSeconds: numberFromRuntime(raw.transactionTtlSeconds, 300),
    allowInsecureHttp: booleanFromRuntime(raw.allowInsecureHttp)
  })
}

export function canonicalRoles(value: unknown): CanonicalRole[] {
  if (!Array.isArray(value)) {
    throw new AuthSessionError("OIDC_ROLE_INVALID", 502)
  }

  const roles = value.map((role) => {
    if (typeof role !== "string" || !CANONICAL_ROLES.includes(role as CanonicalRole)) {
      throw new AuthSessionError("OIDC_ROLE_INVALID", 502)
    }
    return role as CanonicalRole
  })

  return [...new Set(roles)]
}

function validateEndpoint(value: string, allowInsecureHttp: boolean, rejectQuery: boolean): string {
  const text = boundedText(value, 2048)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }

  const isHttp = url.protocol === "http:"
  const isHttps = url.protocol === "https:"
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    (rejectQuery && url.search !== "") ||
    (!isHttp && !isHttps) ||
    (isHttp && !allowInsecureHttp)
  ) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  return url.toString()
}

function validateRedirectUri(value: string, allowInsecureHttp: boolean): string {
  const text = boundedText(value, 2048)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  const isAllowedScheme =
    url.protocol === "https:" || (allowInsecureHttp && url.protocol === "http:")
  if (
    !isAllowedScheme ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.search !== "" ||
    url.pathname === "/"
  ) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  return url.toString()
}

function validateScope(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  const scope = value.map((item) => boundedText(item, 64))
  if (!scope.includes("openid")) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  return [...new Set(scope)]
}

function boundedText(value: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maxLength ||
    [...value].some((character) => character.codePointAt(0)! < 0x20 || character === "\u007f")
  ) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  return value
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  return value
}

function numberFromRuntime(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value)
  }
  return fallback
}

function booleanFromRuntime(value: unknown): boolean {
  return value === true || value === "true"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
