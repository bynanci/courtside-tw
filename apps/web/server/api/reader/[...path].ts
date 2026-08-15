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

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const EXACT_PATHS = new Set(["me", "me/export", "me/bookmarks", "me/progress", "me/progress:merge"])
const ARTICLE_PATH =
  /^me\/(?:bookmarks|progress)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig() as Record<string, unknown> & {
    public?: Record<string, unknown>
  }
  const auth = createRuntimeAuthContext(runtimeConfig)
  try {
    return await proxyReaderRequest(event, auth, runtimeConfig)
  } catch (error) {
    throw toHttpError(error)
  }
})

async function proxyReaderRequest(
  event: H3Event,
  auth: RuntimeAuthContext,
  runtimeConfig: Record<string, unknown> & { public?: Record<string, unknown> }
) {
  if (auth.error) throw auth.error
  if (!auth.service) throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)

  const session = await auth.service.readSession(getHeader(event, "cookie"))
  if (!session) throw new AuthSessionError("AUTHENTICATION_REQUIRED", 401)
  const method = getMethod(event)
  if (!SAFE_METHODS.has(method)) {
    await auth.service.assertCsrf(session.sessionId, getHeader(event, "x-csrf-token"))
  }

  const routePath = (getRouterParam(event, "path") ?? "").replace(/^\/+|\/+$/gu, "")
  const normalizedPath = routePath.startsWith("api/v1/")
    ? routePath.slice("api/v1/".length)
    : routePath
  if (!isAllowedReaderPath(normalizedPath)) {
    setResponseStatus(event, 404)
    return null
  }

  const apiBaseUrl = runtimeConfig.public?.apiBaseUrl
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.trim() === "") {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  let target: URL
  try {
    const base = new URL(apiBaseUrl)
    if (
      (base.protocol !== "https:" && base.protocol !== "http:") ||
      base.username ||
      base.password
    ) {
      throw new Error("unsafe API base URL")
    }
    target = new URL(`/api/v1/${normalizedPath}`, base)
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }
  target.search = getRequestURL(event).search

  const headers = new Headers({
    accept: getHeader(event, "accept") ?? "application/json",
    authorization: `Bearer ${auth.service.getAccessToken(session.sessionId)}`
  })
  for (const name of ["content-type", "idempotency-key", "x-request-id"]) {
    const value = getHeader(event, name)
    if (value) headers.set(name, value)
  }
  const body = SAFE_METHODS.has(method) ? undefined : await readRawBody(event)
  let upstream: Response
  try {
    upstream = await fetch(target, { method, headers, body, redirect: "error" })
  } catch {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }

  setResponseStatus(event, upstream.status)
  setResponseHeader(event, "cache-control", "no-store")
  for (const name of ["content-type", "content-disposition", "x-request-id"]) {
    const value = upstream.headers.get(name)
    if (value) setResponseHeader(event, name, value)
  }
  if (upstream.status === 204 || method === "HEAD") return null
  return Buffer.from(await upstream.arrayBuffer())
}

/** Exact fail-closed reader surface; no editor/admin path can be normalized into it. */
export function isAllowedReaderPath(path: string): boolean {
  return isSafeReaderPath(path) && (EXACT_PATHS.has(path) || ARTICLE_PATH.test(path))
}

export function isSafeReaderPath(path: string): boolean {
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
