import {
  buildAuthorizationUrl,
  createIdTokenVerifier,
  exchangeAuthorizationCode,
  revokeOidcTokens,
  type ExchangeCodeInput,
  type OidcTokenSet,
  type RevokeTokensInput,
  type VerifiedIdToken
} from "./oidc-client.ts"
import {
  canonicalRoles,
  COOKIE_NAMES,
  createOidcClientConfig,
  type CanonicalRole,
  type OidcClientConfig
} from "./config.ts"
import { constantTimeEqual, pkceChallenge, randomToken } from "./crypto.ts"
import { parseCookieHeader, serializeCookie, parseSetCookieValue, deleteCookie } from "./cookies.ts"
import { AuthSessionError } from "./errors.ts"
import type { AuthStore, PendingLoginTransaction, StoredSession } from "./store.ts"

export type { OidcTokenSet, RevokeTokensInput }
export { createInMemoryAuthStore } from "./store.ts"

export type AuthSessionView = {
  sessionId: string
  subject: string
  issuer: string
  roles: readonly CanonicalRole[]
  csrfToken: string
  createdAt: number
  rotatedAt: number
  expiresAt: number
}

export type AuthSessionService = ReturnType<typeof createAuthSessionService>

export type AuthSessionServiceOptions = {
  config: OidcClientConfig
  store: AuthStore
  now?: () => number
  exchangeCode?: (input: ExchangeCodeInput) => Promise<OidcTokenSet>
  verifyIdToken?: (input: { idToken: string; nonce: string }) => Promise<VerifiedIdToken>
  revokeTokens?: (input: RevokeTokensInput) => Promise<void>
}

export function createAuthSessionService(options: AuthSessionServiceOptions) {
  const config = createOidcClientConfig(options.config)
  const now = options.now ?? Date.now
  const exchangeCode =
    options.exchangeCode ?? ((input: ExchangeCodeInput) => exchangeAuthorizationCode(config, input))
  const verifyIdToken = options.verifyIdToken ?? createIdTokenVerifier(config)
  const revokeTokens =
    options.revokeTokens ?? ((input: RevokeTokensInput) => revokeOidcTokens(config, input))

  return {
    async beginLogin(returnTo: string = "/") {
      const normalizedReturnTo = normalizeReturnPath(returnTo, config.redirectUri)
      const state = randomToken(32)
      const nonce = randomToken(32)
      const codeVerifier = randomToken(32)
      const transaction: PendingLoginTransaction = {
        state,
        nonce,
        codeVerifier,
        returnTo: normalizedReturnTo,
        createdAt: now(),
        expiresAt: now() + config.transactionTtlSeconds * 1000
      }
      options.store.saveTransaction(transaction)
      return {
        location: buildAuthorizationUrl(config, {
          state,
          nonce,
          codeChallenge: pkceChallenge(codeVerifier)
        }),
        state,
        stateCookie: serializeCookie(COOKIE_NAMES.authState, state, {
          httpOnly: true,
          maxAge: config.transactionTtlSeconds
        })
      }
    },

    async completeCallback(input: {
      code: string
      state: string
      stateCookie: string | undefined
    }) {
      const code = boundedInput(input.code)
      const state = boundedInput(input.state)
      const cookieState = parseCookieHeader(input.stateCookie, COOKIE_NAMES.authState)
      if (!cookieState || !constantTimeEqual(cookieState, state)) {
        throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
      }

      const transaction = options.store.consumeTransaction(state, now())
      if (!transaction) {
        throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
      }

      let tokenSet: OidcTokenSet
      let claims: VerifiedIdToken
      try {
        tokenSet = await exchangeCode({
          code,
          codeVerifier: transaction.codeVerifier,
          redirectUri: config.redirectUri
        })
        claims = await verifyIdToken({ idToken: tokenSet.idToken, nonce: transaction.nonce })
      } catch (error) {
        if (error instanceof AuthSessionError) {
          throw error
        }
        throw new AuthSessionError("OIDC_ID_TOKEN_INVALID", 502)
      }

      if (
        claims.issuer !== config.issuer ||
        claims.audience !== config.clientId ||
        claims.nonce !== transaction.nonce ||
        claims.subject.length < 1 ||
        claims.subject.length > 512 ||
        [...claims.subject].some((character) => character.codePointAt(0)! < 0x20)
      ) {
        throw new AuthSessionError("OIDC_ID_TOKEN_INVALID", 502)
      }

      const createdAt = now()
      const stored: StoredSession = {
        sessionId: randomToken(32),
        subject: claims.subject,
        issuer: claims.issuer,
        roles: canonicalRoles(claims.roles),
        accessToken: tokenSet.accessToken,
        ...(tokenSet.refreshToken ? { refreshToken: tokenSet.refreshToken } : {}),
        createdAt,
        rotatedAt: createdAt,
        expiresAt: createdAt + tokenSet.expiresIn * 1000,
        csrfToken: randomToken(32)
      }
      options.store.createSession(stored)

      return {
        redirectLocation: transaction.returnTo,
        session: toView(stored),
        sessionCookie: serializeCookie(COOKIE_NAMES.session, stored.sessionId, {
          httpOnly: true,
          maxAge: config.sessionTtlSeconds
        }),
        csrfCookie: serializeCookie(COOKIE_NAMES.csrf, stored.csrfToken, {
          httpOnly: false,
          maxAge: config.sessionTtlSeconds
        }),
        stateCookieCleared: deleteCookie(COOKIE_NAMES.authState)
      }
    },

    async readSession(cookieHeader: string | undefined): Promise<AuthSessionView | null> {
      const sessionId = parseCookieHeader(cookieHeader, COOKIE_NAMES.session)
      if (!sessionId) {
        return null
      }
      const stored = options.store.getSession(sessionId)
      if (!stored) {
        return null
      }
      if (stored.expiresAt <= now()) {
        options.store.deleteSession(sessionId)
        return null
      }
      return toView(stored)
    },

    async rotateSession(sessionId: string): Promise<AuthSessionView> {
      const current = requireSession(sessionId, options.store, now())
      const rotatedAt = now()
      const rotated: StoredSession = {
        ...current,
        sessionId: randomToken(32),
        rotatedAt,
        csrfToken: randomToken(32)
      }
      options.store.createSession(rotated)
      options.store.deleteSession(sessionId)
      return toView(rotated)
    },

    async logout(sessionId: string, csrfToken: string | undefined): Promise<void> {
      const session = requireSession(sessionId, options.store, now())
      assertCsrf(session, csrfToken)
      try {
        await revokeTokens({
          accessToken: session.accessToken,
          ...(session.refreshToken ? { refreshToken: session.refreshToken } : {})
        })
      } finally {
        options.store.deleteSession(sessionId)
      }
    },

    async assertCsrf(sessionId: string, csrfToken: string | undefined): Promise<void> {
      const session = requireSession(sessionId, options.store, now())
      assertCsrf(session, csrfToken)
    },

    getSessionCookieValue(setCookieHeader: string): string {
      return parseSetCookieValue(setCookieHeader, COOKIE_NAMES.session)
    },

    getCsrfCookieValue(setCookieHeader: string): string {
      return parseSetCookieValue(setCookieHeader, COOKIE_NAMES.csrf)
    }
  }
}

function requireSession(sessionId: string, store: AuthStore, now: number): StoredSession {
  const session = store.getSession(sessionId)
  if (!session || session.expiresAt <= now) {
    if (session) {
      store.deleteSession(sessionId)
    }
    throw new AuthSessionError("SESSION_INVALID", 401)
  }
  return session
}

function assertCsrf(session: StoredSession, csrfToken: string | undefined): void {
  if (!csrfToken || !constantTimeEqual(session.csrfToken, csrfToken)) {
    throw new AuthSessionError("CSRF_INVALID", 403)
  }
}

function toView(session: StoredSession): AuthSessionView {
  return {
    sessionId: session.sessionId,
    subject: session.subject,
    issuer: session.issuer,
    roles: [...session.roles],
    csrfToken: session.csrfToken,
    createdAt: session.createdAt,
    rotatedAt: session.rotatedAt,
    expiresAt: session.expiresAt
  }
}

function boundedInput(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > 4096 ||
    [...value].some((character) => character.codePointAt(0)! < 0x20)
  ) {
    throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
  }
  return value
}

function normalizeReturnPath(value: string, redirectUri: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    [...value].some((character) => character.codePointAt(0)! < 0x20)
  ) {
    throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
  }
  const base = new URL(redirectUri)
  const candidate = new URL(value, base)
  if (candidate.origin !== base.origin) {
    throw new AuthSessionError("AUTHORIZATION_REQUEST_INVALID", 400)
  }
  return `${candidate.pathname}${candidate.search}`
}
