export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'sha256-SANp7t6MtwJeb5mCCdYepPwPCnE+4hb/1UOdqme+bUQ='; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
} as const

export type TrustedApiOriginOptions = {
  allowPrivateNetwork?: boolean
}

/**
 * Validates the server-side API origin before it is copied into CSP or used by
 * a BFF fetch. Private destinations are reserved for an explicit local E2E
 * opt-in; production configuration must use HTTPS and a public origin.
 */
export function validateTrustedApiOrigin(
  value: unknown,
  options: TrustedApiOriginOptions = {}
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }

  if (
    (url.protocol !== "https:" &&
      !(options.allowPrivateNetwork === true && url.protocol === "http:")) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    hasUnsafeNetworkHost(url.hostname, options.allowPrivateNetwork === true)
  ) {
    return undefined
  }
  return url.origin
}

export function applySecurityHeaders(
  response: { setHeader(name: string, value: string): void },
  nonce?: string,
  apiOrigin?: string
): void {
  const trustedApiOrigin = apiOrigin
    ? validateTrustedApiOrigin(apiOrigin, {
        allowPrivateNetwork: process.env.COURTSIDE_E2E === "1"
      })
    : undefined
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    let headerValue: string = value
    if (name === "Content-Security-Policy") {
      if (nonce) {
        headerValue = headerValue
          .replace("script-src 'self'", "script-src 'self' 'nonce-" + nonce + "'")
          .replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'")
      }
      if (trustedApiOrigin) {
        headerValue = headerValue
          .replace("img-src 'self' https: data:", "img-src 'self' https: data: " + trustedApiOrigin)
          .replace("connect-src 'self'", "connect-src 'self' " + trustedApiOrigin)
      }
    }
    response.setHeader(name, headerValue)
  }
}

function hasUnsafeNetworkHost(hostname: string, allowPrivateNetwork: boolean): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "")
  if (
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return true
  }

  const isLoopbackName = host === "localhost" || host.endsWith(".localhost")
  if (isLoopbackName) {
    return !allowPrivateNetwork
  }

  if (host.includes(":")) {
    return isBlockedIpv6(host, allowPrivateNetwork)
  }
  if (/^\d+$/.test(host)) {
    return true
  }
  if (!/^[0-9.]+$/.test(host)) {
    return false
  }

  const octets = host.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true
  }
  const first = octets[0] ?? -1
  const second = octets[1] ?? -1
  if (allowPrivateNetwork && first === 127) {
    return false
  }
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

function isBlockedIpv6(host: string, allowPrivateNetwork: boolean): boolean {
  const normalized = host.toLowerCase()
  if (allowPrivateNetwork && (normalized === "::1" || normalized.startsWith("::ffff:127."))) {
    return false
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  )
}
