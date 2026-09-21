import assert from "node:assert/strict"
import test from "node:test"
import {
  createWalletLinkController,
  validateSiweChallenge,
  type WalletApi,
  type SiweChallenge
} from "../../../app/features/wallet/wallet-link.ts"

const ADDRESS = "0x0000000000000000000000000000000000000001"
const NOW = Date.parse("2026-09-12T12:00:00Z")
const context = {
  domain: "courtside.tw",
  uri: "https://courtside.tw",
  address: ADDRESS,
  chainId: "eip155:1"
}
function challenge(): SiweChallenge {
  return {
    nonce: "0123456789abcdef",
    domain: context.domain,
    chainId: context.chainId,
    expiresAt: "2026-09-12T12:05:00Z",
    message: `${context.domain} wants you to sign in with your Ethereum account:\n${ADDRESS}\n\nLink this wallet to your Courtside reader profile.\n\nURI: ${context.uri}\nVersion: 1\nChain ID: 1\nNonce: 0123456789abcdef\nIssued At: 2026-09-12T12:00:00Z\nExpiration Time: 2026-09-12T12:05:00Z`
  }
}

function fixture() {
  const methods: string[] = []
  const apiCalls: string[] = []
  const listeners = new Map<string, (value: unknown) => void>()
  let serverChallenge = challenge()
  const api: WalletApi = {
    async challenge(input) {
      assert.deepEqual(input, context)
      apiCalls.push("challenge")
      return serverChallenge
    },
    async verify(input) {
      apiCalls.push("verify")
      assert.equal(input.message, serverChallenge.message)
      return { verified: true, sessionLinked: true }
    },
    async list() {
      apiCalls.push("list")
      return [{ chainNamespace: "eip155", address: ADDRESS, linkedAt: "2026-09-12T12:00:00Z" }]
    },
    async unlink(namespace, address) {
      apiCalls.push(`unlink:${namespace}:${address}`)
    }
  }
  const provider = {
    async request({ method }: { method: string }) {
      methods.push(method)
      if (method === "eth_chainId") return "0x1"
      if (method === "personal_sign") return `0x${"11".repeat(65)}`
      return [ADDRESS]
    },
    on(event: string, listener: (value: unknown) => void) {
      listeners.set(event, listener)
    },
    removeListener(event: string) {
      listeners.delete(event)
    }
  }
  const controller = createWalletLinkController({
    provider: () => provider,
    origin: context.uri,
    chainId: context.chainId,
    api,
    now: () => NOW
  })
  return {
    controller,
    methods,
    apiCalls,
    api,
    listeners,
    setChallenge(value: SiweChallenge) {
      serverChallenge = value
    }
  }
}

test("controller construction and loading existing links never touch provider; signing needs a second consent action", async () => {
  const f = fixture()
  await f.controller.refreshLinks()
  assert.deepEqual(f.methods, [])
  await f.controller.connect()
  assert.equal(f.controller.state.status, "consent")
  assert.equal(f.methods.includes("personal_sign"), false)
  await f.controller.sign(false)
  assert.equal(f.methods.includes("personal_sign"), false)
  await f.controller.sign(true)
  assert.equal(f.controller.state.status, "linked")
  assert.equal(f.apiCalls.filter((call) => call === "verify").length, 1)
  f.controller.dispose()
})

test("valid SIWE message binds displayed domain, URI, address, chain, nonce and time", () => {
  assert.doesNotThrow(() => validateSiweChallenge(challenge(), context, NOW))
})

for (const [field, from, to] of [
  ["domain", "courtside.tw wants", "phishing.example wants"],
  ["uri", "URI: https://courtside.tw", "URI: https://phishing.example"],
  ["chain", "Chain ID: 1", "Chain ID: 2"],
  ["address", ADDRESS, "0x0000000000000000000000000000000000000002"],
  ["nonce", "Nonce: 0123456789abcdef", "Nonce: different12345678"],
  ["expiry", "Expiration Time: 2026-09-12T12:05:00Z", "Expiration Time: 2026-09-12T11:59:00Z"],
  ["future issued", "Issued At: 2026-09-12T12:00:00Z", "Issued At: 2026-09-12T12:01:00Z"],
  ["duplicate field", "Chain ID: 1", "Chain ID: 1\nChain ID: 2"]
] as const) {
  test(`tampered ${field} challenge fails before signature request`, async () => {
    const f = fixture()
    const value = challenge()
    value.message = value.message.replace(from, to)
    f.setChallenge(value)
    await f.controller.connect()
    assert.equal(f.controller.state.status, "error")
    assert.equal(f.controller.state.error, "INVALID_CHALLENGE")
    await f.controller.sign(true)
    assert.equal(f.methods.includes("personal_sign"), false)
    assert.equal(f.apiCalls.includes("verify"), false)
    f.controller.dispose()
  })
}

test("cancelling consent clears challenge and does not unlink an existing durable link", async () => {
  const f = fixture()
  await f.controller.connect()
  f.controller.cancel()
  assert.equal(f.controller.state.challenge, null)
  assert.equal(f.controller.state.connection, null)
  assert.equal(f.controller.state.status, "idle")
  assert.equal(
    f.apiCalls.some((call) => call.startsWith("unlink:")),
    false
  )
  f.controller.dispose()
})

test("wallet event during verify drops local verification while retaining discoverable durable links", async () => {
  const f = fixture()
  let finish: (value: { verified: boolean; sessionLinked: boolean }) => void = () => {}
  f.api.verify = async () =>
    new Promise((resolve) => {
      finish = resolve
    })
  await f.controller.connect()
  const signing = f.controller.sign(true)
  for (let tick = 0; tick < 100 && f.controller.state.status !== "verifying"; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.equal(f.controller.state.status, "verifying")
  f.listeners.get("accountsChanged")?.([])
  finish({ verified: true, sessionLinked: true })
  await signing
  assert.equal(f.controller.state.status, "invalidated")
  assert.equal(f.controller.state.connection, null)
  assert.equal(f.controller.state.challenge, null)
  assert.equal(f.controller.state.links.length, 1)
  assert.equal(
    f.apiCalls.some((call) => call.startsWith("unlink:")),
    false
  )
  f.controller.dispose()
})

test("unlink after reload uses OIDC API without connecting provider and requires explicit consent", async () => {
  const f = fixture()
  await f.controller.refreshLinks()
  const link = f.controller.state.links[0]!
  await f.controller.unlink(link, false)
  assert.equal(
    f.apiCalls.some((call) => call.startsWith("unlink:")),
    false
  )
  await f.controller.unlink(link, true)
  assert.equal(f.apiCalls.includes(`unlink:eip155:${ADDRESS}`), true)
  assert.deepEqual(f.methods, [])
  f.controller.dispose()
})

test("failed or unlinked verification never displays linked success", async () => {
  for (const result of [
    { verified: false, sessionLinked: false },
    { verified: true, sessionLinked: false }
  ]) {
    const f = fixture()
    f.api.verify = async () => result
    await f.controller.connect()
    await f.controller.sign(true)
    assert.equal(f.controller.state.status, "error")
    f.controller.dispose()
  }
})

test("SIWE expiry is rechecked on the separate signing action", async () => {
  let now = NOW
  const f = fixture()
  const controller = createWalletLinkController({
    provider: () => ({
      async request({ method }: { method: string }) {
        f.methods.push(method)
        return method === "eth_chainId" ? "0x1" : [ADDRESS]
      },
      on() {},
      removeListener() {}
    }),
    origin: context.uri,
    chainId: context.chainId,
    api: f.api,
    now: () => now
  })
  await controller.connect()
  now += 301_000
  await controller.sign(true)
  assert.equal(controller.state.error, "INVALID_CHALLENGE")
  assert.equal(f.methods.includes("personal_sign"), false)
  controller.dispose()
  f.controller.dispose()
})
