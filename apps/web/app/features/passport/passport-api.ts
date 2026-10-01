import type { components } from "@courtside/api-client"

export type ReaderStamp = components["schemas"]["ReaderStamp"]
export type ClaimInput = components["schemas"]["ReaderStampClaim"]
export type IssueChoice = { issueId: string; title: string; slug: string; season: string }
export type IssueChoices = { items: IssueChoice[]; nextCursor: string | null }
export type PassportErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_ELIGIBLE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
export class PassportError extends Error {
  readonly code: PassportErrorCode
  constructor(code: PassportErrorCode) {
    super(code)
    this.name = "PassportError"
    this.code = code
  }
}
export interface PassportApi {
  list(): Promise<ReaderStamp[]>
  issues(cursor?: string): Promise<IssueChoices>
  claim(input: ClaimInput, key: string): Promise<ReaderStamp>
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const STATUSES = new Set(["CLAIMABLE", "CLAIMED", "REVOKED", "SUPERSEDED", "EXPIRED"])

/** Only the BFF receives account cookies; catalog reads carry no private credentials. */
export function createPassportApi(options: {
  apiBaseUrl: string
  fetch?: typeof fetch
  cookie?: () => string
}): PassportApi {
  const requestFetch = options.fetch ?? globalThis.fetch
  const cookie = options.cookie ?? (() => (typeof document === "undefined" ? "" : document.cookie))
  const base = new URL(options.apiBaseUrl)
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
    throw new PassportError("UNAVAILABLE")

  async function request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response
    try {
      response = await requestFetch(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000)
      })
    } catch {
      throw new PassportError("UNAVAILABLE")
    }
    if (!response.ok) {
      const code =
        response.status === 401
          ? "AUTH_REQUIRED"
          : response.status === 403
            ? "FORBIDDEN"
            : [400, 404, 409, 422].includes(response.status)
              ? "NOT_ELIGIBLE"
              : response.status === 429
                ? "RATE_LIMITED"
                : "UNAVAILABLE"
      throw new PassportError(code)
    }
    try {
      return await response.json()
    } catch {
      throw new PassportError("INVALID_RESPONSE")
    }
  }
  return {
    async list() {
      const value = await request("/api/reader/me/passport", {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      })
      if (
        !record(value) ||
        !Array.isArray(value.items) ||
        value.items.length > 500 ||
        !Array.isArray(value.wallets)
      )
        throw new PassportError("INVALID_RESPONSE")
      return value.items.map(parseStamp)
    },
    async issues(cursor) {
      const url = new URL("/api/v1/public/issues", base)
      url.searchParams.set("limit", "20")
      if (cursor) url.searchParams.set("cursor", cursor)
      const value = await request(url.toString(), {
        credentials: "omit",
        headers: { accept: "application/json" }
      })
      if (
        !record(value) ||
        !Array.isArray(value.items) ||
        value.items.length > 100 ||
        !record(value.page) ||
        !(
          value.page.nextCursor === null ||
          (typeof value.page.nextCursor === "string" && value.page.nextCursor.length <= 2048)
        )
      )
        throw new PassportError("INVALID_RESPONSE")
      const items = value.items.map((item: unknown): IssueChoice => {
        if (
          !record(item) ||
          typeof item.issueId !== "string" ||
          !UUID.test(item.issueId) ||
          typeof item.title !== "string" ||
          !item.title ||
          item.title.length > 250 ||
          typeof item.slug !== "string" ||
          !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(item.slug) ||
          !date(item.publishedAt)
        )
          throw new PassportError("INVALID_RESPONSE")
        const season = String(new Date(item.publishedAt).getUTCFullYear())
        if (!/^[0-9]{4}$/u.test(season)) throw new PassportError("INVALID_RESPONSE")
        return { issueId: item.issueId, title: item.title, slug: item.slug, season }
      })
      return { items, nextCursor: value.page.nextCursor }
    },
    async claim(input, key) {
      if (
        !UUID.test(input.issueId) ||
        !/^[0-9]{4}$/u.test(input.season) ||
        !/^[A-Za-z0-9_-]{16,128}$/u.test(key)
      )
        throw new PassportError("NOT_ELIGIBLE")
      const headers = new Headers({
        accept: "application/json",
        "content-type": "application/json",
        "Idempotency-Key": key
      })
      const encoded = cookie()
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-courtside_csrf="))
        ?.slice("__Host-courtside_csrf=".length)
      if (encoded) {
        try {
          headers.set("X-CSRF-Token", decodeURIComponent(encoded))
        } catch {
          throw new PassportError("FORBIDDEN")
        }
      }
      return parseStamp(
        await request("/api/reader/me/passport/claims", {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({ issueId: input.issueId, season: input.season })
        })
      )
    }
  }
}
function parseStamp(value: unknown): ReaderStamp {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.season !== "string" ||
    !/^[0-9]{4}$/u.test(value.season) ||
    value.credentialType !== "READER_STAMP" ||
    typeof value.status !== "string" ||
    !STATUSES.has(value.status) ||
    !date(value.issuedAt) ||
    !date(value.expiresAt) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 0
  )
    throw new PassportError("INVALID_RESPONSE")
  return {
    id: value.id,
    season: value.season,
    credentialType: "READER_STAMP",
    status: value.status as ReaderStamp["status"],
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    version: Number(value.version)
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function date(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))
}
