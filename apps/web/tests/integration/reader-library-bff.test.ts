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

test("passport claims and OIDC wallet links have explicit bounded BFF routes", () => {
  for (const route of [
    "me/passport",
    "me/passport/claims",
    `me/passport/${ARTICLE_ID}/credential`,
    "auth/siwe/challenge",
    "auth/siwe/verify",
    "me/wallets/eip155/0x0000000000000000000000000000000000000001"
  ]) {
    assert.equal(isAllowedReaderPath(route), true, route)
  }
})

test("passport route additions reject arbitrary identity, chain and publisher operations", () => {
  for (const route of [
    "auth/siwe/session",
    "auth/siwe/../admin",
    "me/wallets/eip155:1/0x0000000000000000000000000000000000000001",
    "me/wallets/eip155/not-an-address",
    `publisher/passport/${ARTICLE_ID}/status`,
    `me/passport/${ARTICLE_ID}/status`
  ]) {
    assert.equal(isAllowedReaderPath(route), false, route)
  }
})
