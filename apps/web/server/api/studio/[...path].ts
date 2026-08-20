import {
  defineEventHandler,
  getHeader,
  getMethod,
  getRequestURL,
  getRouterParam,
  readRawBody,
  setResponseHeader,
  setResponseStatus
} from "h3"
import type { H3Event } from "h3"

import {
  createRuntimeAuthContext,
  toHttpError,
  type RuntimeAuthContext
} from "../../middleware/auth.ts"
import { AuthSessionError } from "../../auth/errors.ts"
import { validateTrustedApiOrigin } from "../../security/headers.ts"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const ALLOWED_PREFIXES = [
  "editor/articles",
  "editor/issues",
  "editor/media",
  "editor/taxonomy",
  "publisher/articles",
  "publisher/issues",
  "publisher/media",
  "editor/audit"
]

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig() as Record<string, unknown> & {
    public?: Record<string, unknown>
  }
  const auth = createRuntimeAuthContext(runtimeConfig)
  try {
    return await proxyStudioRequest(event, auth, runtimeConfig)
  } catch (error) {
    throw toHttpError(error)
  }
})

async function proxyStudioRequest(
  event: H3Event,
  auth: RuntimeAuthContext,
  runtimeConfig: Record<string, unknown> & { public?: Record<string, unknown> }
) {
  if (auth.error) {
    throw auth.error
  }
  if (!auth.service) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }

  const session = await auth.service.readSession(getHeader(event, "cookie"))
  if (!session) {
    throw new AuthSessionError("AUTHENTICATION_REQUIRED", 401)
  }
  if (!SAFE_METHODS.has(getMethod(event))) {
    await auth.service.assertCsrf(session.sessionId, getHeader(event, "x-csrf-token"))
  }

  const routePath = (getRouterParam(event, "path") ?? "").replace(/^\/+|\/+$/gu, "")
  const normalizedPath = routePath.startsWith("api/v1/")
    ? routePath.slice("api/v1/".length)
    : routePath
  if (!isSafeProxyPath(normalizedPath)) {
    setResponseStatus(event, 404)
    return null
  }
  if (!isAllowedStudioPath(normalizedPath)) {
    setResponseStatus(event, 404)
    return null
  }

  const publicConfig = runtimeConfig.public ?? {}
  const apiBaseUrl = publicConfig.apiBaseUrl
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.trim() === "") {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  let target: URL
  try {
    const trustedOrigin = validateTrustedApiOrigin(apiBaseUrl, {
      allowPrivateNetwork: process.env.COURTSIDE_E2E === "1"
    })
    const base = new URL(apiBaseUrl)
    if (!trustedOrigin) {
      throw new Error("unsafe API base URL")
    }
    target = new URL(`/api/v1/${normalizedPath}`, base)
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  const query = getRequestURL(event).search
  target.search = query

  const headers = new Headers({
    accept: getHeader(event, "accept") ?? "application/json",
    authorization: `Bearer ${auth.service.getAccessToken(session.sessionId)}`
  })
  for (const name of ["content-type", "if-match", "idempotency-key", "x-request-id"]) {
    const value = getHeader(event, name)
    if (value) headers.set(name, value)
  }
  const method = getMethod(event)
  const body = SAFE_METHODS.has(method) ? undefined : await readRawBody(event)
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "error"
    })
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }

  setResponseStatus(event, upstream.status)
  for (const name of ["content-type", "etag", "cache-control", "x-request-id"]) {
    const value = upstream.headers.get(name)
    if (value) setResponseHeader(event, name, value)
  }
  if (upstream.status === 204 || method === "HEAD") {
    return null
  }
  return Buffer.from(await upstream.arrayBuffer())
}

/** Keep the BFF allowlist from being bypassed by URL path normalization. */
export function isSafeProxyPath(path: string): boolean {
  if (
    path.includes("\\") ||
    path.includes("%") ||
    [...path].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x1f || codePoint === 0x7f
    })
  ) {
    return false
  }
  return path.split("/").every((segment) => segment !== "." && segment !== "..")
}

/** Exact bounded surface the authenticated Studio BFF may proxy. */
export function isAllowedStudioPath(path: string): boolean {
  return (
    isSafeProxyPath(path) &&
    ALLOWED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}:`)
    )
  )
}
