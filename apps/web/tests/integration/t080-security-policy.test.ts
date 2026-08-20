import assert from "node:assert/strict"
import test from "node:test"

import { applySecurityHeaders, validateTrustedApiOrigin } from "../../server/security/headers.ts"

test("T080 accepts a configured public HTTPS API origin and strips path/query", () => {
  assert.equal(
    validateTrustedApiOrigin("https://api.courtside.tw/v1?tenant=magazine"),
    "https://api.courtside.tw"
  )
})

test("T080 rejects credential-bearing, local and metadata API origins", () => {
  for (const value of [
    "https://user:pass@api.courtside.tw",
    "https://localhost:8080",
    "http://127.0.0.1:4020",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal"
  ]) {
    assert.equal(validateTrustedApiOrigin(value), undefined, value)
  }
})

test("T080 permits loopback only through an explicit local test opt-in", () => {
  assert.equal(
    validateTrustedApiOrigin("http://127.0.0.1:4020", { allowPrivateNetwork: true }),
    "http://127.0.0.1:4020"
  )
})

test("T080 does not copy an untrusted API origin into CSP", () => {
  const headers = new Map<string, string>()
  applySecurityHeaders(
    { setHeader: (name, value) => headers.set(name, value) },
    undefined,
    "https://localhost:8080"
  )
  assert.doesNotMatch(headers.get("Content-Security-Policy") ?? "", /localhost/u)
})
