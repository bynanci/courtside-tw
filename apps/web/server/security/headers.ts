export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
} as const

export function applySecurityHeaders(
  response: { setHeader(name: string, value: string): void },
  nonce?: string,
  apiOrigin?: string
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    let headerValue = value
    if (name === "Content-Security-Policy") {
      if (nonce) {
        headerValue = headerValue
          .replace("script-src 'self'", "script-src 'self' 'nonce-" + nonce + "'")
          .replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'")
      }
      if (apiOrigin) {
        headerValue = headerValue
          .replace("img-src 'self' https: data:", "img-src 'self' https: data: " + apiOrigin)
          .replace("connect-src 'self'", "connect-src 'self' " + apiOrigin)
      }
    }
    response.setHeader(name, headerValue)
  }
}
