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
  nonce?: string
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    const headerValue =
      name === "Content-Security-Policy" && nonce
        ? value
            .replace("script-src 'self'", "script-src 'self' 'nonce-" + nonce + "'")
            .replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'")
        : value
    response.setHeader(name, headerValue)
  }
}
