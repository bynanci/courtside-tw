import { equal, throws } from "node:assert/strict"
import { test } from "node:test"

import { publicMediaUrl } from "../../app/features/issues/public-issue-api.ts"

test("public cover URLs stay on the configured API origin", () => {
  equal(
    publicMediaUrl("https://api.courtside.test/", "/media/issues/issue-2026-01/cover.webp"),
    "https://api.courtside.test/media/issues/issue-2026-01/cover.webp"
  )
})

test("public cover URLs reject arbitrary origins and traversal-shaped paths", () => {
  for (const path of [
    "https://untrusted.example/cover.webp",
    "/media/issues/../draft.webp",
    "/media//issues/cover.webp",
    "/media/issues/./cover.webp",
    "/media/issues/"
  ]) {
    throws(() => publicMediaUrl("https://api.courtside.test", path), /public media path/i)
  }
})
