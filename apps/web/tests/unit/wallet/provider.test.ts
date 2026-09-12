import assert from "node:assert/strict"
import test from "node:test"

import {
  createWalletProvider,
  WalletProviderError,
  type Eip1193Provider
} from "../../../../../packages/web3-adapter/src/provider/index.ts"

const ADDRESS = "0x0000000000000000000000000000000000000001"
const SIGNATURE = `0x${"11".repeat(65)}`

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; params?: readonly unknown[] | object }> = []
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  const provider: Eip1193Provider = {
    async request(request) {
      calls.push(request)
      const response = overrides[request.method]
      if (response instanceof Error) throw response
      if (typeof response === "function") return response()
      return (
        response ??
        {
          eth_chainId: "0x1",
          eth_requestAccounts: [ADDRESS],
          eth_accounts: [ADDRESS],
          personal_sign: SIGNATURE
        }[request.method]
      )
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
    }
  }
  return {
    provider,
    calls,
    listeners,
    emit(event: string, value: unknown) {
      listeners.get(event)?.forEach((listener) => listener(value))
    }
  }
}

test("provider constructor never requests accounts; explicit connect binds a configured chain", async () => {
  const wallet = fixture()
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
  assert.deepEqual(wallet.calls, [])
  assert.deepEqual(await adapter.connect(), { address: ADDRESS, chainId: "eip155:1" })
  assert.equal(wallet.calls.filter((call) => call.method === "eth_requestAccounts").length, 1)
  assert.equal(
    wallet.calls.some((call) => call.method === "personal_sign"),
    false
  )
  adapter.dispose()
})

test("initial permission accountsChanged event can establish the explicitly requested connection", async () => {
  const wallet = fixture({
    eth_requestAccounts: () => {
      wallet.emit("accountsChanged", [ADDRESS])
      return [ADDRESS]
    }
  })
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
  assert.equal((await adapter.connect()).address, ADDRESS)
  adapter.dispose()
})

test("unconfigured chain and malformed provider fail before requesting accounts", () => {
  const wallet = fixture()
  assert.throws(
    () => createWalletProvider(wallet.provider, { chainId: "" }),
    /CHAIN_NOT_CONFIGURED/u
  )
  assert.throws(
    () => createWalletProvider({ request() {} }, { chainId: "eip155:1" }),
    /PROVIDER_UNAVAILABLE/u
  )
  assert.deepEqual(wallet.calls, [])
})

for (const [code, expected] of [
  [4001, "USER_REJECTED"],
  [4100, "UNAUTHORIZED"],
  [4900, "DISCONNECTED"],
  [4901, "WRONG_CHAIN"]
] as const) {
  test(`provider RPC error ${code} is classified without exposing provider text`, async () => {
    const adapter = createWalletProvider(
      fixture({
        eth_requestAccounts: Object.assign(new Error("private address payload"), { code })
      }).provider,
      { chainId: "eip155:1" }
    )
    await assert.rejects(
      adapter.connect(),
      (error: unknown) =>
        error instanceof WalletProviderError &&
        error.code === expected &&
        !error.message.includes("private")
    )
    assert.equal(adapter.connection, null)
    adapter.dispose()
  })
}

for (const chain of ["0x2", "1", "0xnot-a-chain", {}, "0x0001"]) {
  test(`wrong or malformed chain ${JSON.stringify(chain)} is never signed`, async () => {
    const wallet = fixture({ eth_chainId: chain })
    const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
    await assert.rejects(adapter.connect(), WalletProviderError)
    assert.equal(
      wallet.calls.some((call) => call.method === "personal_sign"),
      false
    )
    adapter.dispose()
  })
}

for (const accounts of [[], ["0x0"], [ADDRESS, "invalid"], { address: ADDRESS }]) {
  test(`untrusted accounts ${JSON.stringify(accounts)} fail closed`, async () => {
    const adapter = createWalletProvider(fixture({ eth_requestAccounts: accounts }).provider, {
      chainId: "eip155:1"
    })
    await assert.rejects(adapter.connect(), WalletProviderError)
    assert.equal(adapter.connection, null)
    adapter.dispose()
  })
}

test("sign requires connected state and explicit call; rechecks account/chain before personal_sign", async () => {
  const wallet = fixture()
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
  await assert.rejects(adapter.signMessage("message"), /NOT_CONNECTED/u)
  await adapter.connect()
  assert.equal(await adapter.signMessage("message"), SIGNATURE)
  assert.deepEqual(wallet.calls.at(-1), {
    method: "personal_sign",
    params: ["0x6d657373616765", ADDRESS]
  })
  adapter.dispose()
})

for (const event of ["accountsChanged", "chainChanged", "disconnect"] as const) {
  test(`${event} invalidates connection and pending response without reconnecting`, async () => {
    let finish: (value: string) => void = () => {}
    const wallet = fixture({
      personal_sign: () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    })
    const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
    const reasons: string[] = []
    adapter.onInvalidated((reason) => reasons.push(reason))
    await adapter.connect()
    const pending = adapter.signMessage("message")
    while (!wallet.calls.some((call) => call.method === "personal_sign"))
      await new Promise((resolve) => setImmediate(resolve))
    wallet.emit(event, event === "accountsChanged" ? [] : "0x2")
    finish(SIGNATURE)
    await assert.rejects(pending, /INVALIDATED/u)
    assert.equal(adapter.connection, null)
    assert.deepEqual(reasons, [event])
    assert.equal(wallet.calls.filter((call) => call.method === "eth_requestAccounts").length, 1)
    adapter.dispose()
    assert.equal(
      [...wallet.listeners.values()].reduce((count, listeners) => count + listeners.size, 0),
      0
    )
  })
}

test("silent account change is rejected before signature", async () => {
  const wallet = fixture({ eth_accounts: ["0x0000000000000000000000000000000000000002"] })
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
  await adapter.connect()
  await assert.rejects(adapter.signMessage("message"), /INVALIDATED/u)
  assert.equal(
    wallet.calls.some((call) => call.method === "personal_sign"),
    false
  )
  adapter.dispose()
})

test("hung provider is bounded and disposed provider cannot reconnect", async () => {
  const wallet = fixture({ eth_requestAccounts: () => new Promise(() => {}) })
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1", timeoutMs: 5 })
  await assert.rejects(adapter.connect(), /PROVIDER_TIMEOUT/u)
  adapter.dispose()
  await assert.rejects(adapter.connect(), /DISPOSED/u)
})

test("disposing before the request microtask prevents any provider call", async () => {
  const wallet = fixture()
  const adapter = createWalletProvider(wallet.provider, { chainId: "eip155:1" })
  const connecting = adapter.connect()
  adapter.dispose()
  await assert.rejects(connecting, /DISPOSED/u)
  assert.deepEqual(wallet.calls, [])
})
