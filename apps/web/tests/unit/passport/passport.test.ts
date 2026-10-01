import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  createPassportApi,
  PassportError,
  type PassportApi,
  type ReaderStamp
} from "../../../app/features/passport/passport-api.ts"
import {
  createPassportController,
  stampStatusLabel
} from "../../../app/features/passport/passport-controller.ts"

const ISSUE = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const STAMP = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const stamp: ReaderStamp = {
  id: STAMP,
  season: "2026",
  credentialType: "READER_STAMP",
  status: "CLAIMED",
  issuedAt: "2026-09-12T00:00:00Z",
  expiresAt: "2028-01-01T00:00:00Z",
  version: 0
}
const issue = { issueId: ISSUE, slug: "issue-2026-01", title: "場邊誌", season: "2026" }
function fakeApi(overrides: Partial<PassportApi> = {}): PassportApi {
  return {
    list: async () => [],
    issues: async () => ({ items: [issue], nextCursor: null }),
    claim: async () => stamp,
    ...overrides
  }
}

test("the existing signed-in settings page exposes passport independently from optional wallet", async () => {
  const page = await readFile(
    new URL("../../../app/pages/settings/privacy.vue", import.meta.url),
    "utf8"
  )
  assert.match(page, /<PassportPanel\s+:api-base-url="runtimeConfig\.public\.apiBaseUrl"/u)
  assert.match(page, /<template v-else-if="signedIn">[\s\S]*<PassportPanel/u)
  assert.doesNotMatch(page, /<PassportPanel[^>]*walletEnabled/u)
})

test("private claims bind exact body, same retry key and CSRF without exposing an OIDC token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const api = createPassportApi({
    apiBaseUrl: "https://api.courtside.test",
    cookie: () => "__Host-courtside_csrf=token%20value",
    fetch: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json(
        String(url).endsWith("/claims") ? stamp : { items: [stamp], wallets: [] }
      )
    }) as typeof fetch
  })
  assert.deepEqual(await api.list(), [stamp])
  await api.claim({ issueId: ISSUE, season: "2026" }, "retry-key-000000000001")
  await api.claim({ issueId: ISSUE, season: "2026" }, "retry-key-000000000001")
  for (const call of calls) {
    assert.equal(call.init.credentials, "same-origin")
    assert.equal(call.init.cache, "no-store")
    assert.equal(call.init.redirect, "error")
    assert.equal(new Headers(call.init.headers).has("authorization"), false)
  }
  for (const call of calls.slice(1)) {
    assert.equal(call.url, "/api/reader/me/passport/claims")
    assert.equal(new Headers(call.init.headers).get("Idempotency-Key"), "retry-key-000000000001")
    assert.equal(new Headers(call.init.headers).get("X-CSRF-Token"), "token value")
    assert.deepEqual(JSON.parse(String(call.init.body)), { issueId: ISSUE, season: "2026" })
  }
})

test("public issue choices use publication UTC year, cursor encoding and no private credentials", async () => {
  let url = ""
  let init: RequestInit = {}
  const api = createPassportApi({
    apiBaseUrl: "https://api.courtside.test/",
    fetch: (async (input, options) => {
      url = String(input)
      init = options ?? {}
      return Response.json({
        items: [
          {
            issueId: ISSUE,
            slug: "issue-2026-01",
            title: "場邊誌",
            publishedAt: "2027-01-01T00:30:00+08:00"
          }
        ],
        page: { nextCursor: "next+cursor", limit: 20 }
      })
    }) as typeof fetch
  })
  assert.deepEqual(await api.issues("a&b"), { items: [issue], nextCursor: "next+cursor" })
  assert.equal(new URL(url).searchParams.get("cursor"), "a&b")
  assert.equal(init.credentials, "omit")
  assert.equal(new Headers(init.headers).has("X-CSRF-Token"), false)
})

test("API rejects malformed identity payloads and never reflects private error details", async () => {
  const malformed = createPassportApi({
    apiBaseUrl: "https://api.courtside.test",
    fetch: (async () =>
      Response.json({ items: [{ ...stamp, status: "TOKEN_OWNER" }], wallets: [] })) as typeof fetch
  })
  await assert.rejects(
    malformed.list(),
    (error: unknown) => error instanceof PassportError && error.code === "INVALID_RESPONSE"
  )
  const rejected = createPassportApi({
    apiBaseUrl: "https://api.courtside.test",
    fetch: (async () =>
      Response.json({ detail: "private email secret" }, { status: 401 })) as typeof fetch
  })
  await assert.rejects(
    rejected.list(),
    (error: unknown) =>
      error instanceof PassportError &&
      error.code === "AUTH_REQUIRED" &&
      !error.message.includes("secret")
  )
})

test("claim never fires on load or without deliberate selection and consent", async () => {
  let writes = 0
  const controller = createPassportController({
    api: fakeApi({
      claim: async () => {
        writes++
        return stamp
      }
    })
  })
  await controller.load()
  assert.equal(writes, 0)
  await controller.claim()
  assert.equal(writes, 0)
  controller.select(ISSUE)
  await controller.claim()
  assert.equal(writes, 0)
  controller.consent(true)
  await controller.claim()
  assert.equal(writes, 1)
  assert.equal(controller.getState().items[0]?.status, "CLAIMED")
})

test("uncertain response retries reuse the key and duplicate clicks issue one in-flight request", async () => {
  const keys: string[] = []
  let release: (() => void) | undefined
  const controller = createPassportController({
    api: fakeApi({
      claim: async (_input, key) => {
        keys.push(key)
        if (keys.length === 1) throw new PassportError("UNAVAILABLE")
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return stamp
      }
    }),
    key: () => "stable-command-key-0001"
  })
  await controller.load()
  controller.select(ISSUE)
  controller.consent(true)
  await controller.claim()
  assert.equal(controller.getState().items.length, 0)
  const retry = controller.claim()
  await controller.claim()
  release?.()
  await retry
  assert.deepEqual(keys, ["stable-command-key-0001", "stable-command-key-0001"])
  assert.equal(controller.getState().items.length, 1)
})

test("selection change resets consent and binds a different command to the new issue", async () => {
  const second = { ...issue, issueId: STAMP, season: "2025" }
  const payloads: unknown[] = []
  let key = 0
  const controller = createPassportController({
    api: fakeApi({
      issues: async () => ({ items: [issue, second], nextCursor: null }),
      claim: async (input, command) => {
        payloads.push({ input, command })
        return stamp
      }
    }),
    key: () => "key-" + ++key
  })
  await controller.load()
  controller.select(ISSUE)
  controller.consent(true)
  await controller.claim()
  controller.select(STAMP)
  assert.equal(controller.getState().consent, false)
  controller.consent(true)
  await controller.claim()
  assert.deepEqual(payloads, [
    { input: { issueId: ISSUE, season: "2026" }, command: "key-1" },
    { input: { issueId: STAMP, season: "2025" }, command: "key-2" }
  ])
})

test("server terminal status and rights withdrawal replace the displayed claim after refresh", async () => {
  let status: ReaderStamp["status"] = "CLAIMED"
  const controller = createPassportController({
    api: fakeApi({
      list: async () => [{ ...stamp, status }],
      claim: async () => ({ ...stamp, status: "REVOKED" })
    })
  })
  await controller.load()
  status = "REVOKED"
  await controller.load()
  assert.equal(controller.getState().items[0]?.status, "REVOKED")
  controller.select(ISSUE)
  controller.consent(true)
  await controller.claim()
  assert.equal(controller.getState().result?.status, "REVOKED")
  for (const [value, label] of [
    ["CLAIMABLE", "可領取"],
    ["CLAIMED", "已領取"],
    ["REVOKED", "已撤銷"],
    ["SUPERSEDED", "已由新版取代"],
    ["EXPIRED", "已到期"]
  ] as const) {
    assert.equal(stampStatusLabel({ ...stamp, status: value }, Date.parse("2026-09-12")), label)
  }
  assert.equal(stampStatusLabel(stamp, Date.parse("2028-01-02")), "已到期")
})

test("expired OIDC session clears private stamps and offers reauthentication without wallet fallback", async () => {
  const controller = createPassportController({
    api: fakeApi({
      list: async () => [stamp],
      claim: async () => {
        throw new PassportError("AUTH_REQUIRED")
      }
    })
  })
  await controller.load()
  controller.select(ISSUE)
  controller.consent(true)
  await controller.claim()
  assert.equal(controller.getState().error, "AUTH_REQUIRED")
  assert.equal(controller.getState().items.length, 0)
  assert.equal(controller.getState().consent, false)
})

test("catalog failure retains readable stamps and failed pagination preserves previous choices", async () => {
  let fail = false
  const controller = createPassportController({
    api: fakeApi({
      list: async () => [stamp],
      issues: async (cursor) => {
        if (fail || cursor) throw new PassportError("UNAVAILABLE")
        return { items: [issue], nextCursor: "next" }
      }
    })
  })
  await controller.load()
  await controller.moreIssues()
  assert.equal(controller.getState().issues.length, 1)
  assert.equal(controller.getState().items.length, 1)
  fail = true
  await controller.load()
  assert.equal(controller.getState().items.length, 1)
  assert.equal(controller.getState().issuesError, true)
})

test("dispose prevents late private response updates", async () => {
  let release: ((value: ReaderStamp[]) => void) | undefined
  const controller = createPassportController({
    api: fakeApi({
      list: () =>
        new Promise((resolve) => {
          release = resolve
        })
    })
  })
  const loading = controller.load()
  controller.dispose()
  release?.([stamp])
  await loading
  assert.equal(controller.getState().items.length, 0)
})
