import assert from "node:assert/strict"
import test from "node:test"

import {
  createAuthSessionService,
  createInMemoryAuthStore,
  type OidcTokenSet
} from "../../server/auth/session-service.ts"

const config = {
  issuer: "http://oidc.test/issuer",
  authorizationEndpoint: "http://oidc.test/authorize",
  tokenEndpoint: "http://oidc.test/token",
  jwksUri: "http://oidc.test/jwks",
  clientId: "courtside-web",
  redirectUri: "https://courtside.test/auth/callback",
  scope: ["openid", "profile", "email"] as const,
  sessionTtlSeconds: 900,
  transactionTtlSeconds: 300
}

function tokenSet(overrides: Partial<OidcTokenSet> = {}): OidcTokenSet {
  return {
    accessToken: "server-only-access-token",
    idToken: "signed-id-token",
    tokenType: "Bearer",
    expiresIn: 300,
    ...overrides
  }
}

test("authorization code flow binds state, nonce and PKCE to one browser transaction", async () => {
  const service = createAuthSessionService({
    config,
    store: createInMemoryAuthStore(),
    exchangeCode: async (input) => {
      assert.equal(input.code, "authorization-code")
      assert.match(input.codeVerifier, /^[A-Za-z0-9._~-]{43,128}$/)
      return tokenSet()
    },
    verifyIdToken: async (input) => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: input.nonce,
      roles: ["READER"]
    })
  })

  const login = await service.beginLogin("/issues/latest")
  const authorizationUrl = new URL(login.location)

  assert.equal(authorizationUrl.origin, "http://oidc.test")
  assert.equal(authorizationUrl.pathname, "/authorize")
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code")
  assert.equal(authorizationUrl.searchParams.get("client_id"), config.clientId)
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), config.redirectUri)
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256")
  assert.ok(authorizationUrl.searchParams.get("state"))
  assert.ok(authorizationUrl.searchParams.get("nonce"))
  assert.ok(authorizationUrl.searchParams.get("code_challenge"))

  const completed = await service.completeCallback({
    code: "authorization-code",
    state: authorizationUrl.searchParams.get("state")!,
    stateCookie: login.stateCookie
  })

  assert.equal(completed.redirectLocation, "https://courtside.test/issues/latest")
  assert.match(completed.sessionCookie, /HttpOnly/)
  assert.match(completed.sessionCookie, /Secure/)
  assert.match(completed.sessionCookie, /SameSite=Lax/)
  assert.doesNotMatch(completed.sessionCookie, /server-only-access-token/)
  assert.match(completed.csrfCookie, /SameSite=Lax/)
})

test("state replay, fixation, open redirect and expired transactions fail closed", async () => {
  const store = createInMemoryAuthStore()
  const service = createAuthSessionService({
    config,
    store,
    now: () => 1_000_000,
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async () => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: "nonce",
      roles: ["READER"]
    })
  })

  await assert.rejects(() => service.beginLogin("https://evil.test/steal"), /return path/i)
  await assert.rejects(() => service.completeCallback({
    code: "authorization-code",
    state: "attacker-controlled-state",
    stateCookie: "attacker-controlled-state"
  }), /transaction/i)

  const login = await service.beginLogin("/")
  const state = new URL(login.location).searchParams.get("state")!
  await service.completeCallback({ code: "authorization-code", state, stateCookie: login.stateCookie })
  await assert.rejects(() => service.completeCallback({ code: "authorization-code", state, stateCookie: login.stateCookie }), /transaction/i)

  const expiringStore = createInMemoryAuthStore()
  const expiringService = createAuthSessionService({
    config,
    store: expiringStore,
    now: () => 2_000_000,
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async () => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: "nonce",
      roles: ["READER"]
    })
  })
  const expiringLogin = await expiringService.beginLogin("/")
  expiringStore.expirePendingTransactions(2_000_301)
  await assert.rejects(() => expiringService.completeCallback({
    code: "authorization-code",
    state: new URL(expiringLogin.location).searchParams.get("state")!,
    stateCookie: expiringLogin.stateCookie
  }), /transaction/i)
})

test("session rotation, CSRF binding and logout never expose bearer material", async () => {
  const store = createInMemoryAuthStore()
  const service = createAuthSessionService({
    config,
    store,
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async () => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: "nonce",
      roles: ["READER"]
    })
  })
  const login = await service.beginLogin("/")
  const completed = await service.completeCallback({
    code: "authorization-code",
    state: new URL(login.location).searchParams.get("state")!,
    stateCookie: login.stateCookie
  })

  const firstSession = await service.readSession(completed.sessionCookie)
  assert.equal(firstSession?.subject, "reader-1")
  assert.equal(firstSession?.roles[0], "READER")
  assert.ok(firstSession?.csrfToken)
  assert.doesNotMatch(JSON.stringify(firstSession), /server-only-access-token/)

  const rotated = await service.rotateSession(firstSession!.sessionId)
  assert.notEqual(rotated.sessionId, firstSession!.sessionId)
  assert.equal(await store.getSession(firstSession!.sessionId), null)
  assert.equal((await store.getSession(rotated.sessionId))?.subject, "reader-1")

  await assert.rejects(() => service.logout(rotated.sessionId, "wrong-csrf"), /csrf/i)
  await service.logout(rotated.sessionId, rotated.csrfToken)
  assert.equal(await store.getSession(rotated.sessionId), null)
})

test("unknown or privilege-shaped roles are rejected instead of escalated", async () => {
  const service = createAuthSessionService({
    config,
    store: createInMemoryAuthStore(),
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async () => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: "nonce",
      roles: ["ROLE_ADMIN"]
    })
  })
  const login = await service.beginLogin("/")
  await assert.rejects(() => service.completeCallback({
    code: "authorization-code",
    state: new URL(login.location).searchParams.get("state")!,
    stateCookie: login.stateCookie
  }), /role/i)
})
