export type WalletLink = { chainNamespace: string; address: string; linkedAt: string }
export type WalletApi = {
  challenge(input: ChallengeRequest): Promise<SiweChallenge>
  verify(input: {
    message: string
    signature: string
  }): Promise<{ verified: boolean; sessionLinked: boolean }>
  list(): Promise<WalletLink[]>
  unlink(chainNamespace: string, address: string): Promise<void>
}

export type WalletState = {
  status:
    | "idle"
    | "connecting"
    | "consent"
    | "signing"
    | "verifying"
    | "linked"
    | "invalidated"
    | "error"
    | "unlinking"
  error: string | null
  challenge: SiweChallenge | null
  connection: WalletConnection | null
  links: WalletLink[]
  linksError: boolean
}

export function createWalletLinkController(options: {
  provider: () => unknown
  origin: string
  chainId: string
  api: WalletApi
  now?: () => number
}) {
  const origin = new URL(options.origin)
  if (
    origin.origin !== options.origin ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  ) {
    throw new Error("INVALID_ORIGIN")
  }
  const now = options.now ?? Date.now
  let state: WalletState = {
    status: "idle",
    error: null,
    challenge: null,
    connection: null,
    links: [],
    linksError: false
  }
  let adapter: WalletProviderAdapter | null = null
  let generation = 0
  let disposed = false
  const listeners = new Set<(state: WalletState) => void>()
  const snapshot = (): WalletState => ({ ...state, links: [...state.links] })
  function update(patch: Partial<WalletState>): void {
    if (disposed) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(snapshot()))
  }
  function current(expected: number): boolean {
    return !disposed && generation === expected
  }
  function requestContext(connection: WalletConnection): ChallengeRequest {
    return {
      domain: origin.host,
      uri: origin.origin,
      address: connection.address,
      chainId: connection.chainId
    }
  }
  function errorCode(error: unknown): string {
    if (error instanceof WalletProviderError) return error.code
    if (
      error instanceof Error &&
      ["INVALID_CHALLENGE", "VERIFICATION_FAILED", "LINK_NOT_CREATED"].includes(error.message)
    )
      return error.message
    return "WALLET_SERVICE_UNAVAILABLE"
  }
  function busy(): boolean {
    return ["connecting", "signing", "verifying", "unlinking"].includes(state.status)
  }
  async function refreshLinks(): Promise<void> {
    try {
      update({ links: await options.api.list(), linksError: false })
    } catch {
      update({ linksError: true })
    }
  }

  return {
    get state(): WalletState {
      return snapshot()
    },
    subscribe(listener: (state: WalletState) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refreshLinks,
    async connect(): Promise<void> {
      if (disposed || busy()) return
      const expected = ++generation
      adapter?.dispose()
      adapter = null
      update({ status: "connecting", error: null, challenge: null, connection: null })
      try {
        adapter = createWalletProvider(options.provider(), { chainId: options.chainId })
        adapter.onInvalidated(() => {
          generation += 1
          update({
            status: "invalidated",
            error: "WALLET_CHANGED",
            challenge: null,
            connection: null
          })
        })
        const connection = await adapter.connect()
        if (!current(expected)) return
        const input = requestContext(connection)
        const challenge = await options.api.challenge(input)
        if (!current(expected)) return
        validateSiweChallenge(challenge, input, now())
        update({ status: "consent", connection, challenge })
      } catch (error) {
        if (current(expected))
          update({ status: "error", error: errorCode(error), challenge: null, connection: null })
      }
    },
    async sign(consent: boolean): Promise<void> {
      if (
        disposed ||
        state.status !== "consent" ||
        !state.challenge ||
        !state.connection ||
        !adapter
      )
        return
      if (!consent) {
        update({ error: "CONSENT_REQUIRED" })
        return
      }
      const expected = generation
      const challenge = state.challenge
      try {
        validateSiweChallenge(challenge, requestContext(state.connection), now())
        update({ status: "signing", error: null })
        const signature = await adapter.signMessage(challenge.message)
        if (!current(expected)) return
        update({ status: "verifying" })
        const result = await options.api.verify({ message: challenge.message, signature })
        if (!current(expected)) {
          await refreshLinks()
          return
        }
        if (result.verified !== true) throw new Error("VERIFICATION_FAILED")
        if (result.sessionLinked !== true) throw new Error("LINK_NOT_CREATED")
        update({ status: "linked", challenge: null })
        await refreshLinks()
      } catch (error) {
        if (current(expected))
          update({ status: "error", error: errorCode(error), challenge: null, connection: null })
      }
    },
    async unlink(link: WalletLink, consent: boolean): Promise<void> {
      if (
        !consent ||
        disposed ||
        busy() ||
        !state.links.some(
          (existing) =>
            existing.chainNamespace === link.chainNamespace && existing.address === link.address
        )
      )
        return
      const expected = ++generation
      adapter?.dispose()
      adapter = null
      update({ status: "unlinking", error: null, challenge: null, connection: null })
      try {
        await options.api.unlink(link.chainNamespace, link.address)
        if (!current(expected)) return
        update({
          status: "idle",
          links: state.links.filter(
            (existing) =>
              existing.chainNamespace !== link.chainNamespace || existing.address !== link.address
          )
        })
      } catch {
        if (current(expected)) update({ status: "error", error: "UNLINK_FAILED" })
      }
    },
    cancel(): void {
      // Once verification is submitted the persisted link may exist; it must remain discoverable.
      if (disposed || state.status === "verifying" || state.status === "unlinking") return
      generation += 1
      adapter?.dispose()
      adapter = null
      update({ status: "idle", error: null, challenge: null, connection: null })
    },
    dispose(): void {
      generation += 1
      disposed = true
      adapter?.dispose()
      adapter = null
      state = {
        status: "idle",
        error: null,
        challenge: null,
        connection: null,
        links: [],
        linksError: false
      }
      listeners.clear()
    }
  }
}

export type WalletLinkController = ReturnType<typeof createWalletLinkController>
import {
  createWalletProvider,
  validateSiweChallenge,
  type SiweChallenge,
  type ChallengeRequest,
  WalletProviderError,
  type WalletConnection,
  type WalletProviderAdapter
} from "@courtside/web3-adapter/provider"

export { validateSiweChallenge }
export type { SiweChallenge, ChallengeRequest }
