import {
  createError,
  defineEventHandler,
  deleteCookie,
  getHeader,
  getMethod,
  getQuery,
  getRequestURL,
  sendRedirect,
  setCookie,
  setResponseStatus
} from "h3"
import type { H3Event } from "h3"

import { COOKIE_NAMES, oidcConfigFromRuntime, type OidcClientConfig } from "../auth/config.ts"
import { parseSetCookieValue } from "../auth/cookies.ts"
import { AuthSessionError, isAuthSessionError } from "../auth/errors.ts"
import { createAuthSessionService } from "../auth/session-service.ts"
import { createInMemoryAuthStore, type InMemoryAuthStore } from "../auth/store.ts"

const PROTECTED_PREFIXES = [
  "/api/v1/me",
  "/api/v1/editor",
  "/api/v1/publisher",
  "/api/v1/admin"
] as const

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

type AuthRuntimeConfig = Record<string, unknown> & {
  oidc?: Record<string, unknown>
}

type GlobalAuthState = typeof globalThis & {
  __courtsideAuthStore?: InMemoryAuthStore
}

type RuntimeAuthService = ReturnType<typeof createAuthSessionService>

type RuntimeAuthContext = {
  service: RuntimeAuthService | null
  config: OidcClientConfig | null
  error: unknown | null
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  const runtimeConfig = useRuntimeConfig() as AuthRuntimeConfig
  const auth = createRuntimeAuthContext(runtimeConfig)

  try {
    const authResponse = await handleAuthRoute(event, path, auth)
    if (authResponse !== undefined) {
      return authResponse
    }

    if (!isProtectedPath(path)) {
      return
    }
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
    event.context.authSession = session
  } catch (error) {
    throw toHttpError(error)
  }
})

async function handleAuthRoute(event: H3Event, path: string, auth: RuntimeAuthContext) {
  if (!path.startsWith("/auth/")) {
    return undefined
  }

  if (!["/auth/session", "/auth/login", "/auth/callback", "/auth/logout"].includes(path)) {
    return undefined
  }

  if (path === "/auth/session") {
    if (getMethod(event) !== "GET") {
      throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 405)
    }
    if (auth.error) {
      throw auth.error
    }
    const session = auth.service ? await auth.service.readSession(getHeader(event, "cookie")) : null
    return {
      authenticated: session !== null,
      ...(session
        ? {
            subject: session.subject,
            issuer: session.issuer,
            roles: session.roles,
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt
          }
        : {})
    }
  }

  if (auth.error) {
    throw auth.error
  }
  if (!auth.service || !auth.config) {
    throw new AuthSessionError("AUTHENTICATION_UNAVAILABLE", 503)
  }

  const service = auth.service
  const config = auth.config

  if (path === "/auth/login") {
    if (getMethod(event) !== "GET") {
      throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 405)
    }
    const query = getQuery(event)
    const returnTo = typeof query.returnTo === "string" ? query.returnTo : "/"
    const login = await service.beginLogin(returnTo)
    setCookie(
      event,
      COOKIE_NAMES.authState,
      parseSetCookieValue(login.stateCookie, COOKIE_NAMES.authState),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: config.transactionTtlSeconds
      }
    )
    return sendRedirect(event, login.location, 302)
  }

  if (path === "/auth/callback") {
    if (getMethod(event) !== "GET") {
      throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 405)
    }
    const query = getQuery(event)
    const code = singleQueryValue(query.code)
    const state = singleQueryValue(query.state)
    if (!code || !state) {
      throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
    }
    const completed = await service.completeCallback({
      code,
      state,
      stateCookie: getHeader(event, "cookie")
    })
    setCookie(event, COOKIE_NAMES.session, service.getSessionCookieValue(completed.sessionCookie), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlSeconds
    })
    setCookie(event, COOKIE_NAMES.csrf, service.getCsrfCookieValue(completed.csrfCookie), {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlSeconds
    })
    deleteCookie(event, COOKIE_NAMES.authState, { path: "/" })
    return sendRedirect(event, completed.redirectLocation, 302)
  }

  if (path === "/auth/logout") {
    if (getMethod(event) !== "POST") {
      throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 405)
    }
    const session = await service.readSession(getHeader(event, "cookie"))
    try {
      if (session) {
        await service.logout(session.sessionId, getHeader(event, "x-csrf-token"))
      }
    } finally {
      deleteCookie(event, COOKIE_NAMES.session, { path: "/", secure: true, sameSite: "lax" })
      deleteCookie(event, COOKIE_NAMES.csrf, { path: "/", secure: true, sameSite: "lax" })
    }
    setResponseStatus(event, 204)
    return null
  }

  return undefined
}

function createRuntimeAuthContext(runtimeConfig: AuthRuntimeConfig): RuntimeAuthContext {
  const configResult = readOidcConfig(runtimeConfig)
  const config = configResult.config
  if (configResult.error) {
    return { service: null, config: null, error: configResult.error }
  }
  if (!config) {
    return { service: null, config: null, error: null }
  }

  try {
    const rawOidc = runtimeConfig.oidc ?? {}
    const sessionStore = typeof rawOidc.sessionStore === "string" ? rawOidc.sessionStore : "memory"
    if (sessionStore !== "memory" || process.env.NODE_ENV === "production") {
      throw new AuthSessionError("SESSION_STORE_UNAVAILABLE", 503)
    }
    const globalState = globalThis as GlobalAuthState
    globalState.__courtsideAuthStore ??= createInMemoryAuthStore()
    return {
      service: createAuthSessionService({ config, store: globalState.__courtsideAuthStore }),
      config,
      error: null
    }
  } catch (error) {
    return { service: null, config, error }
  }
}

function readOidcConfig(runtimeConfig: AuthRuntimeConfig): {
  config: OidcClientConfig | null
  error: unknown | null
} {
  try {
    return { config: oidcConfigFromRuntime(runtimeConfig), error: null }
  } catch (error) {
    return { config: null, error }
  }
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function singleQueryValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }
  return null
}

function toHttpError(error: unknown) {
  if (isAuthSessionError(error)) {
    return createError({
      statusCode: error.status,
      statusMessage: error.publicMessage,
      data: { code: error.code }
    })
  }
  return createError({
    statusCode: 503,
    statusMessage: "Authentication is temporarily unavailable.",
    data: { code: "AUTHENTICATION_UNAVAILABLE" }
  })
}
