import type { ChallengeRequest, SiweChallenge, WalletApi, WalletLink } from "./wallet-link.ts"

const BASE = "/api/reader"

/** OIDC-backed same-origin BFF only. Neither addresses nor signatures enter durable browser state. */
export function createWalletApi(
  options: { fetch?: typeof fetch; cookie?: () => string } = {}
): WalletApi {
  const requestFetch = options.fetch ?? globalThis.fetch
  const cookie = options.cookie ?? (() => (typeof document === "undefined" ? "" : document.cookie))

  async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
    const headers = new Headers({ accept: "application/json" })
    if (method !== "GET") {
      headers.set("Idempotency-Key", crypto.randomUUID())
      const value = cookie()
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-courtside_csrf="))
        ?.slice("__Host-courtside_csrf=".length)
      if (value) {
        try {
          headers.set("X-CSRF-Token", decodeURIComponent(value))
        } catch {
          throw new Error("INVALID_CSRF")
        }
      }
    }
    if (body !== undefined) headers.set("content-type", "application/json")
    const response = await requestFetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) throw new Error("WALLET_SERVICE_UNAVAILABLE")
    return response
  }

  return {
    async challenge(input: ChallengeRequest): Promise<SiweChallenge> {
      const value: unknown = await (await request("/auth/siwe/challenge", "POST", input)).json()
      if (
        !isRecord(value) ||
        ["nonce", "domain", "chainId", "expiresAt", "message"].some(
          (key) => typeof value[key] !== "string"
        )
      ) {
        throw new Error("INVALID_CHALLENGE")
      }
      return value as SiweChallenge
    },
    async verify(input) {
      const value: unknown = await (await request("/auth/siwe/verify", "POST", input)).json()
      if (
        !isRecord(value) ||
        typeof value.verified !== "boolean" ||
        typeof value.sessionLinked !== "boolean"
      ) {
        throw new Error("VERIFICATION_FAILED")
      }
      return { verified: value.verified, sessionLinked: value.sessionLinked }
    },
    async list(): Promise<WalletLink[]> {
      const value: unknown = await (await request("/me/passport")).json()
      if (!isRecord(value) || !Array.isArray(value.wallets) || value.wallets.length > 100)
        throw new Error("INVALID_WALLET_LIST")
      return value.wallets.map((link: unknown) => {
        if (
          !isRecord(link) ||
          link.chainNamespace !== "eip155" ||
          !validAddress(link.address) ||
          typeof link.linkedAt !== "string" ||
          !Number.isFinite(Date.parse(link.linkedAt))
        ) {
          throw new Error("INVALID_WALLET_LIST")
        }
        return {
          chainNamespace: link.chainNamespace,
          address: link.address.toLowerCase(),
          linkedAt: link.linkedAt
        }
      })
    },
    async unlink(chainNamespace, address): Promise<void> {
      if (chainNamespace !== "eip155" || !validAddress(address))
        throw new Error("INVALID_WALLET_LINK")
      await request(`/me/wallets/eip155/${address.toLowerCase()}`, "DELETE")
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value)
}
