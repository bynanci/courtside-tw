import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { readerMotion } from "../../../app/features/motion/reader-motion.ts"
import { readingProgressPercent } from "../../../app/features/reader/reading-progress.ts"
import { performArticleShare } from "../../../app/features/reader/share.ts"

test("reading progress is bounded and its motion has an immediate reduced variant", () => {
  assert.equal(readingProgressPercent(250, 1000, 500), 50)
  assert.equal(readingProgressPercent(500, 1000, 500), 100)
  assert.equal(readingProgressPercent(-10, 1000, 500), 0)
  assert.equal(readingProgressPercent(1000, 1000, 500), 100)
  assert.equal(readerMotion.readingProgress.full.durationMs, 90)
  assert.equal(readerMotion.readingProgress.reduced.durationMs, 0)
})

test("share prefers native share and falls back to clipboard after failure", async () => {
  const calls: string[] = []
  assert.deepEqual(
    await performArticleShare(
      { title: "文章", url: "https://courtside.test/articles/story" },
      {
        share: async () => {
          calls.push("share")
          throw new Error("native failed")
        },
        writeText: async (url) => calls.push(`copy:${url}`)
      }
    ),
    { outcome: "copied", message: "文章連結已複製。" }
  )
  assert.deepEqual(calls, ["share", "copy:https://courtside.test/articles/story"])
})

test("share cancellation does not overwrite the clipboard", async () => {
  const calls: string[] = []
  const cancellation = new Error("share cancelled")
  cancellation.name = "AbortError"

  assert.deepEqual(
    await performArticleShare(
      { title: "文章", url: "https://courtside.test/articles/story" },
      {
        share: async () => {
          calls.push("share")
          throw cancellation
        },
        writeText: async (url) => calls.push(`copy:${url}`)
      }
    ),
    { outcome: "cancelled", message: "已取消分享。" }
  )
  assert.deepEqual(calls, ["share"])
})

test("share has an accessible canonical-link fallback when browser APIs fail", async () => {
  assert.deepEqual(
    await performArticleShare(
      { title: "文章", url: "https://courtside.test/articles/story" },
      {
        share: async () => {
          throw new Error("native failed")
        },
        writeText: async () => {
          throw new Error("clipboard failed")
        }
      }
    ),
    { outcome: "link", message: "分享未完成，請使用文章連結。" }
  )

  const source = await readFile(
    new URL("../../../app/features/reader/components/ShareArticleButton.vue", import.meta.url),
    "utf8"
  )
  assert.match(source, /role="status"/)
  assert.match(source, /data-testid="article-share-fallback"/)
  assert.match(source, /:disabled="!props\.clientReady"/)
  assert.doesNotMatch(source, /v-if="props\.clientReady"/)
})

test("reader hydration preserves header geometry", async () => {
  const page = await readFile(
    new URL("../../../app/pages/articles/[articleSlug].vue", import.meta.url),
    "utf8"
  )

  assert.doesNotMatch(page, /<ReadingProgress\s+v-if="clientReady"/u)
  assert.match(page, /:percent="clientReady \? visibleReadingProgress : 0"/)
})

test("snapshot navigation and heading-only TOC live behind reader components", async () => {
  const [navigation, page] = await Promise.all([
    readFile(
      new URL("../../../app/features/reader/components/ArticleNavigation.vue", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../../../app/pages/articles/[articleSlug].vue", import.meta.url), "utf8")
  ])

  assert.match(navigation, /issueNavigation/)
  assert.match(navigation, /article-previous/)
  assert.match(navigation, /article-next/)
  assert.match(navigation, /#toc/)
  assert.match(page, /ReadingProgress/)
  assert.match(page, /ArticleNavigation/)
  assert.match(page, /ShareArticleButton/)
})

test("article revision changes clear failed media state", async () => {
  const page = await readFile(
    new URL("../../../app/pages/articles/[articleSlug].vue", import.meta.url),
    "utf8"
  )

  assert.match(page, /activeRevisionId = revisionId\s+failedAssets\.value = new Set\(\)/u)
})
