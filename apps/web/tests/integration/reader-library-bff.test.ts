import assert from "node:assert/strict"
import test from "node:test"

import { isAllowedReaderPath, isSafeReaderPath } from "../../server/api/reader/[...path].ts"

const ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"

test("reader BFF exposes only the bounded self-service surface", () => {
  assert.equal(isAllowedReaderPath("me"), true)
  assert.equal(isAllowedReaderPath("me/export"), true)
  assert.equal(isAllowedReaderPath("me/bookmarks"), true)
  assert.equal(isAllowedReaderPath(`me/bookmarks/${ARTICLE_ID}`), true)
  assert.equal(isAllowedReaderPath("me/progress"), true)
  assert.equal(isAllowedReaderPath(`me/progress/${ARTICLE_ID}`), true)
  assert.equal(isAllowedReaderPath("me/progress:merge"), true)
})

test("reader BFF rejects traversal, arbitrary self paths and privileged routes", () => {
  assert.equal(isSafeReaderPath("me/../admin"), false)
  assert.equal(isAllowedReaderPath("me/%2e%2e/admin"), false)
  assert.equal(isAllowedReaderPath("me/roles"), false)
  assert.equal(isAllowedReaderPath("editor/articles"), false)
  assert.equal(isAllowedReaderPath("admin/users"), false)
  assert.equal(isAllowedReaderPath("me/bookmarks/not-a-uuid"), false)
})
