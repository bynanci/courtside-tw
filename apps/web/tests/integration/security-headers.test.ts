import { strictEqual, match } from "node:assert/strict"
import { test } from "node:test"

import { applySecurityHeaders, SECURITY_HEADERS } from "../../server/security/headers.ts"

test("only private Studio pages allow image blobs and exclude storage and indexing", () => {
  for (const path of [
    "/studio/articles/one",
    "/articles/one",
    "/studio-public",
    "/api/studio/api/v1/editor/articles"
  ]) {
    const headers = new Map<string, string>()
    applySecurityHeaders(
      { setHeader: (name, value) => headers.set(name, value) },
      undefined,
      undefined,
      path
    )
    strictEqual(
      (headers.get("Content-Security-Policy") ?? "").includes("blob:"),
      path.startsWith("/studio/")
    )
    strictEqual(
      headers.get("Cache-Control"),
      path.startsWith("/studio/") || path.startsWith("/api/studio/")
        ? "private, no-store"
        : undefined
    )
  }
})

test("CSP and browser security headers deny code execution and remote modules", () => {
  const csp = SECURITY_HEADERS["Content-Security-Policy"]

  match(csp, /default-src 'self'/)
  match(csp, /script-src 'self'/)
  match(csp, /object-src 'none'/)
  match(csp, /frame-ancestors 'none'/)
  match(csp, /connect-src 'self'/)
  strictEqual(csp.includes("unsafe-inline"), false)
  strictEqual(csp.includes("unsafe-eval"), false)
  strictEqual(csp.includes("remote-module"), false)
  strictEqual(SECURITY_HEADERS["X-Frame-Options"], "DENY")
  strictEqual(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff")
  strictEqual(SECURITY_HEADERS["Referrer-Policy"], "no-referrer")
})
