import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"

import { canonicalRoles } from "../../server/auth/config.ts"
import { exchangeAuthorizationCode } from "../../server/auth/oidc-client.ts"
import {
  createAuthSessionService,
  createInMemoryAuthStore,
  type RevokeTokensInput,
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
  transactionTtlSeconds: 300,
  allowInsecureHttp: true
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

  assert.equal(completed.redirectLocation, "/issues/latest")
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
    verifyIdToken: async (input) => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: input.nonce,
      roles: ["READER"]
    })
  })

  await assert.rejects(
    () => service.beginLogin("https://evil.test/steal"),
    /authentication request/i
  )
  await assert.rejects(
    () =>
      service.completeCallback({
        code: "authorization-code",
        state: "attacker-controlled-state",
        stateCookie: "attacker-controlled-state"
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "AUTHORIZATION_REQUEST_INVALID"
  )

  const login = await service.beginLogin("/")
  const state = new URL(login.location).searchParams.get("state")!
  await service.completeCallback({
    code: "authorization-code",
    state,
    stateCookie: login.stateCookie
  })
  await assert.rejects(
    () =>
      service.completeCallback({
        code: "authorization-code",
        state,
        stateCookie: login.stateCookie
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "AUTHORIZATION_REQUEST_INVALID"
  )

  const expiringStore = createInMemoryAuthStore()
  const expiringService = createAuthSessionService({
    config,
    store: expiringStore,
    now: () => 2_000_000,
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async (input) => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: input.nonce,
      roles: ["READER"]
    })
  })
  const expiringLogin = await expiringService.beginLogin("/")
  expiringStore.expirePendingTransactions(2_300_001)
  await assert.rejects(
    () =>
      expiringService.completeCallback({
        code: "authorization-code",
        state: new URL(expiringLogin.location).searchParams.get("state")!,
        stateCookie: expiringLogin.stateCookie
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "AUTHORIZATION_REQUEST_INVALID"
  )
})

test("session rotation, CSRF binding and logout never expose bearer material", async () => {
  const store = createInMemoryAuthStore()
  let revokedInput: RevokeTokensInput | null = null
  const service = createAuthSessionService({
    config,
    store,
    exchangeCode: async () => tokenSet({ refreshToken: "server-only-refresh-token" }),
    revokeTokens: async (input) => {
      revokedInput = input
    },
    verifyIdToken: async (input) => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: input.nonce,
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

  await assert.rejects(
    () => service.logout(rotated.sessionId, "wrong-csrf"),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "CSRF_INVALID"
  )
  await service.logout(rotated.sessionId, rotated.csrfToken)
  assert.deepEqual(revokedInput, {
    accessToken: "server-only-access-token",
    refreshToken: "server-only-refresh-token"
  })
  assert.equal(await store.getSession(rotated.sessionId), null)
})

test("unknown or privilege-shaped roles are rejected instead of escalated", async () => {
  const service = createAuthSessionService({
    config,
    store: createInMemoryAuthStore(),
    exchangeCode: async () => tokenSet(),
    verifyIdToken: async (input) => ({
      issuer: config.issuer,
      subject: "reader-1",
      audience: config.clientId,
      nonce: input.nonce,
      roles: ["ROLE_ADMIN"]
    })
  })
  const login = await service.beginLogin("/")
  await assert.rejects(
    () =>
      service.completeCallback({
        code: "authorization-code",
        state: new URL(login.location).searchParams.get("state")!,
        stateCookie: login.stateCookie
      }),
    /role/i
  )
})

test("missing role claims fail closed instead of becoming an implicit privilege", () => {
  assert.throws(
    () => canonicalRoles(undefined),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "OIDC_ROLE_INVALID"
  )
})

test("OIDC provider outage fails the auth exchange with a safe error", async () => {
  await assert.rejects(
    () =>
      exchangeAuthorizationCode(
        config,
        {
          code: "authorization-code",
          codeVerifier: "verifier",
          redirectUri: config.redirectUri
        },
        async () => {
          throw new Error("provider secret must not cross the public error boundary")
        }
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "OIDC_TOKEN_EXCHANGE_FAILED"
  )
})

test("local OIDC stub verifies JWT/JWKS and exchanges code without browser bearer storage", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256")
  const jwk = await exportJWK(publicKey)
  const keyId = "courtside-stub-key"
  const clientSecret = "local-only-client-secret"
  let expectedNonce = ""
  let receivedTokenRequest: URLSearchParams | null = null
  const revokedTokens: URLSearchParams[] = []

  const server = createServer(async (request, response) => {
    if (request.url === "/jwks") {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ keys: [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }] }))
      return
    }
    if (request.url === "/revoke" && request.method === "POST") {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
      }
      revokedTokens.push(new URLSearchParams(Buffer.concat(chunks).toString("utf8")))
      response.statusCode = 200
      response.end()
      return
    }
    if (request.url !== "/token" || request.method !== "POST") {
      response.statusCode = 404
      response.end()
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk))
    }
    receivedTokenRequest = new URLSearchParams(Buffer.concat(chunks).toString("utf8"))
    const authorization = request.headers.authorization
    assert.equal(
      authorization,
      `Basic ${Buffer.from(`courtside-web:${clientSecret}`).toString("base64")}`
    )
    assert.equal(receivedTokenRequest.get("grant_type"), "authorization_code")
    assert.equal(receivedTokenRequest.get("code"), "authorization-code")
    assert.equal(receivedTokenRequest.get("redirect_uri"), "http://127.0.0.1/auth/callback")
    assert.match(receivedTokenRequest.get("code_verifier") ?? "", /^[A-Za-z0-9._~-]{43,128}$/)

    const idToken = await new SignJWT({ roles: ["READER"], nonce: expectedNonce })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(`http://127.0.0.1:${(server.address() as { port: number }).port}/issuer`)
      .setSubject("stub-reader")
      .setAudience("courtside-web")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey)

    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({
        access_token: "server-only-stub-access-token",
        id_token: idToken,
        token_type: "Bearer",
        refresh_token: "server-only-stub-refresh-token",
        expires_in: 300
      })
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })

  try {
    const port = (server.address() as { port: number }).port
    const localConfig = {
      issuer: `http://127.0.0.1:${port}/issuer`,
      authorizationEndpoint: `http://127.0.0.1:${port}/authorize`,
      tokenEndpoint: `http://127.0.0.1:${port}/token`,
      jwksUri: `http://127.0.0.1:${port}/jwks`,
      revocationEndpoint: `http://127.0.0.1:${port}/revoke`,
      clientId: "courtside-web",
      clientSecret,
      redirectUri: "http://127.0.0.1/auth/callback",
      scope: ["openid", "profile", "email"] as const,
      sessionTtlSeconds: 900,
      transactionTtlSeconds: 300,
      allowInsecureHttp: true
    }
    const service = createAuthSessionService({
      config: localConfig,
      store: createInMemoryAuthStore()
    })
    const login = await service.beginLogin("/")
    expectedNonce = new URL(login.location).searchParams.get("nonce") ?? ""

    const completed = await service.completeCallback({
      code: "authorization-code",
      state: new URL(login.location).searchParams.get("state")!,
      stateCookie: login.stateCookie
    })

    assert.ok(receivedTokenRequest)
    assert.equal(completed.redirectLocation, "/")
    assert.equal(completed.session.subject, "stub-reader")
    assert.deepEqual(completed.session.roles, ["READER"])
    assert.doesNotMatch(JSON.stringify(completed.session), /server-only-stub-access-token/)
    await service.logout(completed.session.sessionId, completed.session.csrfToken)
    assert.deepEqual(
      revokedTokens.map((item) => [item.get("token_type_hint"), item.get("token")]),
      [
        ["refresh_token", "server-only-stub-refresh-token"],
        ["access_token", "server-only-stub-access-token"]
      ]
    )
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
})
