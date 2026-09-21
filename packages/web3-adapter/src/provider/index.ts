import { isAddress, stringToHex } from "viem"
export {
  validateSiweChallenge,
  type SiweChallenge,
  type ChallengeRequest
} from "./siwe-challenge.ts"

export interface Eip1193Provider {
  request(request: { method: string; params?: readonly unknown[] | object }): Promise<unknown>
  on(event: string, listener: (value: unknown) => void): void
  removeListener(event: string, listener: (value: unknown) => void): void
}

export type WalletConnection = Readonly<{ address: `0x${string}`; chainId: string }>

export type WalletProviderErrorCode =
  | "CHAIN_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "USER_REJECTED"
  | "UNAUTHORIZED"
  | "DISCONNECTED"
  | "WRONG_CHAIN"
  | "UNSUPPORTED_METHOD"
  | "PROVIDER_FAILURE"
  | "INVALID_RESPONSE"
  | "NOT_CONNECTED"
  | "INVALIDATED"
  | "PROVIDER_TIMEOUT"
  | "DISPOSED"
  | "REQUEST_PENDING"

export class WalletProviderError extends Error {
  readonly code: WalletProviderErrorCode
  constructor(code: WalletProviderErrorCode) {
    super(code)
    this.name = "WalletProviderError"
    this.code = code
  }
}

/** All state is memory-only. Construction subscribes to events but makes no RPC requests. */
export function createWalletProvider(
  providerValue: unknown,
  options: { chainId: string; timeoutMs?: number }
) {
  if (
    !/^eip155:[1-9][0-9]{0,15}$/u.test(options.chainId) ||
    BigInt(options.chainId.slice(7)) > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new WalletProviderError("CHAIN_NOT_CONFIGURED")
  }
  if (!isEip1193Provider(providerValue)) throw new WalletProviderError("PROVIDER_UNAVAILABLE")
  const provider = providerValue
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new WalletProviderError("PROVIDER_UNAVAILABLE")
  }
  let connection: WalletConnection | null = null
  let generation = 0
  let disposed = false
  let pending = false
  let requestingInitialAccounts = false
  let initialAccount: string | null = null
  const subscribers = new Set<(reason: string) => void>()
  const eventListeners = new Map<string, (value: unknown) => void>()

  function invalidate(reason: string): void {
    generation += 1
    connection = null
    subscribers.forEach((subscriber) => subscriber(reason))
  }

  function assertCurrent(expected: number): void {
    if (disposed) throw new WalletProviderError("DISPOSED")
    if (generation !== expected) throw new WalletProviderError("INVALIDATED")
  }

  async function request(
    method: string,
    expected: number,
    params?: readonly unknown[]
  ): Promise<unknown> {
    assertCurrent(expected)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => {
          assertCurrent(expected)
          return provider.request({ method, ...(params ? { params } : {}) })
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new WalletProviderError("PROVIDER_TIMEOUT")), timeoutMs)
        })
      ])
      assertCurrent(expected)
      return result
    } catch (error) {
      assertCurrent(expected)
      throw classifyProviderError(error)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async function checkChain(expected: number): Promise<void> {
    const value = await request("eth_chainId", expected)
    if (
      typeof value !== "string" ||
      !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value) ||
      value.length > 16
    ) {
      throw new WalletProviderError("INVALID_RESPONSE")
    }
    if (`eip155:${BigInt(value)}` !== options.chainId) throw new WalletProviderError("WRONG_CHAIN")
  }

  for (const event of ["accountsChanged", "chainChanged", "disconnect"]) {
    const listener = (value: unknown) => {
      // Granting the first explicit permission commonly emits accountsChanged before resolving.
      if (event === "accountsChanged" && requestingInitialAccounts) {
        try {
          const address = validatedAccounts(value)[0]!
          if (initialAccount === null || initialAccount === address) {
            initialAccount = address
            return
          }
        } catch {
          /* Empty or invalid permission still invalidates the pending request. */
        }
      }
      invalidate(event)
    }
    eventListeners.set(event, listener)
    try {
      provider.on(event, listener)
    } catch {
      for (const [name, handler] of eventListeners) {
        try {
          provider.removeListener(name, handler)
        } catch {
          /* Untrusted provider cleanup. */
        }
      }
      throw new WalletProviderError("PROVIDER_UNAVAILABLE")
    }
  }

  return {
    get connection(): WalletConnection | null {
      return connection
    },
    /** Invoke only from an explicit connect action. Never call on mount or route entry. */
    async connect(): Promise<WalletConnection> {
      if (disposed) throw new WalletProviderError("DISPOSED")
      if (pending) throw new WalletProviderError("REQUEST_PENDING")
      pending = true
      connection = null
      const expected = ++generation
      try {
        await checkChain(expected)
        initialAccount = null
        requestingInitialAccounts = true
        const address = validatedAccounts(await request("eth_requestAccounts", expected))[0]!
        requestingInitialAccounts = false
        if (initialAccount !== null && initialAccount !== address) {
          invalidate("accountsChanged")
          throw new WalletProviderError("INVALIDATED")
        }
        await checkChain(expected)
        connection = Object.freeze({ address, chainId: options.chainId })
        return connection
      } catch (error) {
        connection = null
        throw error
      } finally {
        requestingInitialAccounts = false
        initialAccount = null
        pending = false
      }
    },
    /** Signing is a separate explicit action after displaying validated SIWE consent. */
    async signMessage(message: string): Promise<string> {
      if (disposed) throw new WalletProviderError("DISPOSED")
      if (pending) throw new WalletProviderError("REQUEST_PENDING")
      if (!connection) throw new WalletProviderError("NOT_CONNECTED")
      if (!message || message.length > 2000) throw new WalletProviderError("INVALID_RESPONSE")
      pending = true
      const expected = generation
      const address = connection.address
      try {
        await checkChain(expected)
        if (validatedAccounts(await request("eth_accounts", expected))[0] !== address) {
          invalidate("accountsChanged")
          throw new WalletProviderError("INVALIDATED")
        }
        const hexMessage = stringToHex(message)
        const signature = await request("personal_sign", expected, [hexMessage, address])
        if (typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{2}){1,4096}$/u.test(signature)) {
          throw new WalletProviderError("INVALID_RESPONSE")
        }
        return signature
      } catch (error) {
        connection = null
        throw error
      } finally {
        pending = false
      }
    },
    onInvalidated(listener: (reason: string) => void): () => void {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    clear(): void {
      invalidate("cancelled")
    },
    dispose(): void {
      disposed = true
      generation += 1
      connection = null
      subscribers.clear()
      for (const [event, listener] of eventListeners) {
        try {
          provider.removeListener(event, listener)
        } catch {
          /* No provider state is retained. */
        }
      }
      eventListeners.clear()
    }
  }
}

export type WalletProviderAdapter = ReturnType<typeof createWalletProvider>

export function isEip1193Provider(value: unknown): value is Eip1193Provider {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      "request" in value &&
      typeof value.request === "function" &&
      "on" in value &&
      typeof value.on === "function" &&
      "removeListener" in value &&
      typeof value.removeListener === "function"
    )
  } catch {
    return false
  }
}

function validatedAccounts(value: unknown): Array<`0x${string}`> {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100 ||
    value.some((address) => typeof address !== "string" || !isAddress(address, { strict: true }))
  ) {
    throw new WalletProviderError("INVALID_RESPONSE")
  }
  return value.map((address: string) => address.toLowerCase() as `0x${string}`)
}

function classifyProviderError(error: unknown): WalletProviderError {
  if (error instanceof WalletProviderError) return error
  try {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null
    const classification: Record<number, WalletProviderErrorCode> = {
      4001: "USER_REJECTED",
      4100: "UNAUTHORIZED",
      4200: "UNSUPPORTED_METHOD",
      4900: "DISCONNECTED",
      4901: "WRONG_CHAIN"
    }
    return new WalletProviderError(
      typeof code === "number" ? (classification[code] ?? "PROVIDER_FAILURE") : "PROVIDER_FAILURE"
    )
  } catch {
    return new WalletProviderError("PROVIDER_FAILURE")
  }
}
