import assert from "node:assert/strict"
import test from "node:test"

import {
  allowsLoopbackApiOrigin,
  applySecurityHeaders,
  validateTrustedApiOrigin
} from "../../server/security/headers.ts"

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
  assert.equal(
    validateTrustedApiOrigin("http://api.courtside.tw", { allowPrivateNetwork: true }),
    undefined
  )
  assert.equal(
    validateTrustedApiOrigin("http://10.0.0.1:4020", { allowPrivateNetwork: true }),
    undefined
  )
})

test("the bounded reader demo opt-in admits only the configured loopback origin into CSP", () => {
  const previousDemo = process.env.COURTSIDE_LOCAL_DEMO
  const previousE2e = process.env.COURTSIDE_E2E
  try {
    process.env.COURTSIDE_LOCAL_DEMO = "1"
    delete process.env.COURTSIDE_E2E
    const headers = new Map<string, string>()

    assert.equal(allowsLoopbackApiOrigin(), true)
    applySecurityHeaders(
      { setHeader: (name, value) => headers.set(name, value) },
      undefined,
      "http://127.0.0.1:4010"
    )

    const csp = headers.get("Content-Security-Policy") ?? ""
    assert.match(csp, /img-src[^;]*http:\/\/127\.0\.0\.1:4010/u)
    assert.match(csp, /connect-src[^;]*http:\/\/127\.0\.0\.1:4010/u)
  } finally {
    restoreEnvironment("COURTSIDE_LOCAL_DEMO", previousDemo)
    restoreEnvironment("COURTSIDE_E2E", previousE2e)
  }
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

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
