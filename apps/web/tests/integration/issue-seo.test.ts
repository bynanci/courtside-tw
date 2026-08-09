import assert from "node:assert/strict"
import test from "node:test"

import { canonicalUrl, jsonLd } from "../../app/composables/public-seo.ts"

test("public Issue SEO uses an origin-bound canonical URL and never preserves credentials", () => {
  assert.equal(
    canonicalUrl("https://courtside.test/editorial-preview", "/issues/issue-2026-01"),
    "https://courtside.test/issues/issue-2026-01"
  )
  assert.equal(
    canonicalUrl("https://reader:secret@courtside.test", "/issues/issue-2026-01"),
    "https://courtside.tw/issues/issue-2026-01"
  )
})

test("public Issue JSON-LD cannot terminate its script context", () => {
  const serialized = jsonLd({ description: "</script><img src=x onerror=alert(1)>&" })

  assert.equal(serialized.includes("</script>"), false)
  assert.equal(serialized.includes("<img"), false)
  assert.match(serialized, /\\u003c\/script\\u003e/)
  assert.match(serialized, /\\u0026/)
})
