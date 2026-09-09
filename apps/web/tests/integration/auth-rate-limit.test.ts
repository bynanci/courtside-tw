import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"

import { createApp, defineEventHandler, toNodeListener } from "h3"

import authMiddleware from "../../server/middleware/auth.ts"

const oidc = {
  issuer: "https://oidc.test/issuer",
  authorizationEndpoint: "https://oidc.test/authorize",
  tokenEndpoint: "https://oidc.test/token",
  jwksUri: "https://oidc.test/jwks",
  clientId: "courtside-web",
  redirectUri: "https://courtside.test/auth/callback"
}

test("the actual auth middleware throttles socket peers before OIDC work and ignores spoofed forwarding", async () => {
  let configReads = 0
  const runtimeGlobals = globalThis as typeof globalThis & { useRuntimeConfig?: () => unknown }
  const originalRuntimeConfig = runtimeGlobals.useRuntimeConfig
  runtimeGlobals.useRuntimeConfig = () => {
    configReads += 1
    return { oidc }
  }
  const app = createApp()
  app.use(
    defineEventHandler((event) => {
      event.context.observability = { requestId: "auth-limit-request-1" }
    })
  )
  app.use(authMiddleware)
  const server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`
  try {
    for (let index = 0; index < 12; index += 1) {
      assert.equal((await fetch(`${origin}/auth/session`)).status, 200)
      assert.equal((await fetch(`${origin}/auth/logout`, { method: "POST" })).status, 204)
    }
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await fetch(`${origin}/auth/login`, { redirect: "manual" })).status, 302)
    }
    const readsBeforeRejection = configReads
    const rejected = await fetch(`${origin}/auth/login?returnTo=/issues`, {
      redirect: "manual",
      headers: {
        "x-forwarded-for": "203.0.113.99",
        forwarded: "for=203.0.113.98",
        "x-real-ip": "203.0.113.97"
      }
    })
    assert.equal(rejected.status, 429)
    assert.equal(configReads, readsBeforeRejection, "rejection must precede runtime/provider setup")
    assert.equal(rejected.headers.get("content-type"), "application/problem+json")
    assert.equal(rejected.headers.get("x-request-id"), "auth-limit-request-1")
    assert.equal(rejected.headers.get("cache-control"), "no-store")
    assert.ok(Number(rejected.headers.get("retry-after")) >= 1)
    assert.ok(Number(rejected.headers.get("retry-after")) <= 60)
    assert.deepEqual(await rejected.json(), {
      type: "https://courtside.tw/problems/rate_limited",
      title: "Too many requests",
      status: 429,
      detail: "The request rate is limited.",
      instance: "/auth/login",
      requestId: "auth-limit-request-1",
      code: "RATE_LIMITED"
    })
    // Invalid callbacks still consume their own budget before any token exchange.
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await fetch(`${origin}/auth/callback`)).status, 400)
    }
    const readsBeforeCallbackRejection = configReads
    assert.equal((await fetch(`${origin}/auth/callback?code=secret&state=secret`)).status, 429)
    assert.equal(configReads, readsBeforeCallbackRejection)
    assert.equal((await fetch(`${origin}/auth/session`)).status, 200)
    assert.equal((await fetch(`${origin}/auth/logout`, { method: "POST" })).status, 204)
  } finally {
    runtimeGlobals.useRuntimeConfig = originalRuntimeConfig
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("auth limits use separate route and peer budgets and recover exactly at rolling expiry", async () => {
  const { createAuthRateLimiter } = await import("../../server/auth/rate-limit.ts")
  let now = 1000
  const limiter = createAuthRateLimiter({ now: () => now })
  for (let index = 0; index < 10; index += 1) {
    assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
  }
  assert.deepEqual(limiter.consume("/auth/login", "192.0.2.1"), {
    allowed: false,
    retryAfterSeconds: 60
  })
  assert.equal(limiter.consume("/auth/callback", "192.0.2.1").allowed, true)
  assert.equal(limiter.consume("/auth/login", "192.0.2.2").allowed, true)
  now = 60_999
  assert.deepEqual(limiter.consume("/auth/login", "192.0.2.1"), {
    allowed: false,
    retryAfterSeconds: 1
  })
  now = 61_000
  assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
})

test("rolling admission prevents boundary bursts and clock rollback from resetting an active budget", async () => {
  const { createAuthRateLimiter } = await import("../../server/auth/rate-limit.ts")
  let now = 0
  const limiter = createAuthRateLimiter({ now: () => now })
  assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
  now = 59_000
  for (let index = 0; index < 9; index += 1) {
    assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
  }
  now = 60_000
  assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
  assert.deepEqual(limiter.consume("/auth/login", "192.0.2.1"), {
    allowed: false,
    retryAfterSeconds: 59
  })
  now = 0
  assert.deepEqual(limiter.consume("/auth/login", "192.0.2.1"), {
    allowed: false,
    retryAfterSeconds: 59
  })
})

test("concurrent auth requests cannot exceed the ten-admission budget", async () => {
  const { createAuthRateLimiter } = await import("../../server/auth/rate-limit.ts")
  const limiter = createAuthRateLimiter({ now: () => 1000 })
  const results = await Promise.all(
    Array.from({ length: 100 }, async () => {
      await Promise.resolve()
      return limiter.consume("/auth/login", "192.0.2.1")
    })
  )
  assert.equal(results.filter((result) => result.allowed).length, 10)
  assert.equal(results.filter((result) => !result.allowed).length, 90)
})

test("capacity denies new identities without evicting active budgets and expired entries are reclaimed", async () => {
  const { createAuthRateLimiter } = await import("../../server/auth/rate-limit.ts")
  let now = 0
  const limiter = createAuthRateLimiter({ now: () => now, maximumBuckets: 2 })
  for (let index = 0; index < 10; index += 1) {
    assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, true)
    assert.equal(limiter.consume("/auth/login", "192.0.2.2").allowed, true)
  }
  assert.deepEqual(limiter.consume("/auth/login", "192.0.2.3"), {
    allowed: false,
    retryAfterSeconds: 60
  })
  assert.equal(limiter.consume("/auth/login", "192.0.2.1").allowed, false)
  now = 60_000
  assert.equal(limiter.consume("/auth/login", "192.0.2.3").allowed, true)
})

test("unavailable or invalid peer addresses share a bounded fail-closed identity", async () => {
  const { createAuthRateLimiter } = await import("../../server/auth/rate-limit.ts")
  const limiter = createAuthRateLimiter({ now: () => 0 })
  for (let index = 0; index < 10; index += 1) {
    assert.equal(limiter.consume("/auth/callback", undefined).allowed, true)
  }
  assert.equal(limiter.consume("/auth/callback", "not-an-ip").allowed, false)
  assert.equal(limiter.consume("/auth/callback", "x".repeat(10_000)).allowed, false)
  assert.equal(limiter.consume("/auth/session", undefined).allowed, true)
  assert.equal(limiter.consume("/auth/logout", undefined).allowed, true)
})
