import assert from "node:assert/strict"
import test from "node:test"
import { createWalletApi } from "../../../app/features/wallet/wallet-api.ts"

const ADDRESS = "0x0000000000000000000000000000000000000001"

test("wallet API uses existing OIDC BFF, CSRF, fresh idempotency and the exact contract payload", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const api = createWalletApi({
    cookie: () => "unrelated=1; __Host-courtside_csrf=nonce%20value",
    fetch: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).endsWith("/challenge"))
        return Response.json({
          nonce: "0123456789abcdef",
          domain: "courtside.tw",
          chainId: "eip155:1",
          expiresAt: "2026-09-12T12:05:00Z",
          message: "validated by controller"
        })
      if (String(url).endsWith("/verify"))
        return Response.json({ verified: true, sessionLinked: true })
      if (String(url).endsWith("/passport"))
        return Response.json({
          wallets: [
            { chainNamespace: "eip155", address: ADDRESS, linkedAt: "2026-09-12T12:00:00Z" }
          ]
        })
      return new Response(null, { status: 204 })
    }) as typeof fetch
  })
  const input = {
    domain: "courtside.tw",
    uri: "https://courtside.tw",
    address: ADDRESS,
    chainId: "eip155:1"
  }
  await api.challenge(input)
  await api.verify({ message: "message", signature: "0x11" })
  await api.list()
  await api.unlink("eip155", ADDRESS)
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "/api/reader/auth/siwe/challenge",
      "/api/reader/auth/siwe/verify",
      "/api/reader/me/passport",
      `/api/reader/me/wallets/eip155/${ADDRESS}`
    ]
  )
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), input)
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    message: "message",
    signature: "0x11"
  })
  const writeCalls = calls.filter((call) => call.init.method !== "GET")
  assert.equal(
    new Set(writeCalls.map((call) => new Headers(call.init.headers).get("Idempotency-Key"))).size,
    3
  )
  for (const call of writeCalls)
    assert.equal(new Headers(call.init.headers).get("X-CSRF-Token"), "nonce value")
  for (const call of calls) {
    assert.equal(call.init.credentials, "same-origin")
    assert.equal(call.init.cache, "no-store")
    assert.equal(call.init.redirect, "error")
    assert.equal(new Headers(call.init.headers).has("authorization"), false)
  }
})

test("unknown server payload and unlink path injection fail closed", async () => {
  let requests = 0
  const api = createWalletApi({
    fetch: (async () => {
      requests += 1
      return Response.json({
        wallets: [{ chainNamespace: "eip155", address: "../../admin", linkedAt: "now" }]
      })
    }) as typeof fetch
  })
  await assert.rejects(api.list(), /INVALID_WALLET_LIST/u)
  await assert.rejects(api.unlink("../../admin", ADDRESS), /INVALID_WALLET_LINK/u)
  await assert.rejects(api.unlink("eip155", "../../admin"), /INVALID_WALLET_LINK/u)
  assert.equal(requests, 1)
})
