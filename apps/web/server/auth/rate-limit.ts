import { isIP } from "node:net"

import { setResponseHeader, setResponseStatus, type H3Event } from "h3"

const AUTH_PATHS = new Set(["/auth/login", "/auth/callback"])
const MAXIMUM_REQUESTS = 10
const WINDOW_MILLISECONDS = 60_000
const MAXIMUM_BUCKETS = 4096
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

type Admission = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Process-local rolling limits for the socket peer, before OIDC/session work.
 * No trusted-proxy policy exists in the deployment contract: forwarded headers
 * cannot select an identity. A reverse proxy therefore shares its peer budget;
 * replicas have independent budgets. Distributed/per-client production quotas
 * require a separately configured trusted ingress and shared limiter.
 */
export function createAuthRateLimiter(
  options: {
    now?: () => number
    maximumBuckets?: number
  } = {}
) {
  const now = options.now ?? Date.now
  const maximumBuckets = options.maximumBuckets ?? MAXIMUM_BUCKETS
  if (!Number.isInteger(maximumBuckets) || maximumBuckets < 1 || maximumBuckets > MAXIMUM_BUCKETS) {
    throw new RangeError("Auth rate-limit capacity must be between 1 and 4096 buckets.")
  }
  const buckets = new Map<string, number[]>()
  let lastNow = 0
  let nextExpiry = Number.POSITIVE_INFINITY

  function retryAfter(expiry: number, current: number): Admission {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((expiry - current) / 1000)) }
  }

  return {
    consume(path: string, remoteAddress: string | undefined): Admission {
      if (!AUTH_PATHS.has(path)) return { allowed: true }
      const current = Math.max(lastNow, now())
      lastNow = current
      const cutoff = current - WINDOW_MILLISECONDS
      if (current >= nextExpiry) {
        nextExpiry = Number.POSITIVE_INFINITY
        for (const [key, timestamps] of buckets) {
          const expiry = timestamps[timestamps.length - 1]! + WINDOW_MILLISECONDS
          if (expiry <= current) buckets.delete(key)
          else nextExpiry = Math.min(nextExpiry, expiry)
        }
      }
      const key = `${path}:${peerIdentity(remoteAddress)}`
      let timestamps = buckets.get(key)
      if (!timestamps) {
        if (buckets.size >= maximumBuckets) {
          // Retain every active budget. Eviction would let identity churn reset it.
          return retryAfter(nextExpiry, current)
        }
        timestamps = []
        buckets.set(key, timestamps)
      }
      while (timestamps.length > 0 && timestamps[0]! <= cutoff) timestamps.shift()
      if (timestamps.length >= MAXIMUM_REQUESTS) {
        return retryAfter(timestamps[0]! + WINDOW_MILLISECONDS, current)
      }
      // Admission contains no await: concurrent requests cannot interleave this
      // check and append in the Node process. Each bucket stores at most ten times.
      timestamps.push(current)
      nextExpiry = Math.min(nextExpiry, current + WINDOW_MILLISECONDS)
      return { allowed: true }
    }
  }
}

function peerIdentity(value: string | undefined): string {
  if (!value || value.length > 45 || isIP(value) === 0) return "unknown-socket-peer"
  const mappedIpv4 = value.startsWith("::ffff:") ? value.slice(7) : ""
  return isIP(mappedIpv4) === 4 ? mappedIpv4 : value
}

const authRateLimiter = createAuthRateLimiter()

export function enforceAuthRateLimit(event: H3Event, path: string) {
  const admission = authRateLimiter.consume(path, event.node.req.socket.remoteAddress)
  if (admission.allowed) return undefined
  const candidate = event.context.observability?.requestId
  const requestId =
    typeof candidate === "string" && SAFE_REQUEST_ID.test(candidate)
      ? candidate
      : crypto.randomUUID()
  setResponseStatus(event, 429)
  setResponseHeader(event, "content-type", "application/problem+json")
  setResponseHeader(event, "retry-after", admission.retryAfterSeconds)
  setResponseHeader(event, "x-request-id", requestId)
  setResponseHeader(event, "cache-control", "no-store")
  return {
    type: "https://courtside.tw/problems/rate_limited",
    title: "Too many requests",
    status: 429,
    detail: "The request rate is limited.",
    instance: path,
    requestId,
    code: "RATE_LIMITED"
  }
}
