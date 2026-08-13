import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  formatMediaAttribution,
  galleryItems,
  mediaFallbackStyle,
  safeInlineHref
} from "../../../app/components/content-blocks/rendering.ts"

test("text rendering keeps Vue escaping and admits only bounded HTTPS or mailto links", async () => {
  assert.equal(safeInlineHref("https://example.test/story"), "https://example.test/story")
  assert.equal(safeInlineHref("mailto:editor@example.test"), "mailto:editor@example.test")
  assert.equal(safeInlineHref("javascript:alert(1)"), null)
  assert.equal(safeInlineHref("https://reader:secret@example.test/story"), null)

  const sources = await Promise.all(
    ["ParagraphBlock.vue", "HeadingBlock.vue", "ListBlock.vue", "QuoteBlock.vue"].map((name) =>
      readFile(
        new URL(`../../../app/components/content-blocks/text/${name}`, import.meta.url),
        "utf8"
      )
    )
  )
  for (const source of sources) {
    assert.doesNotMatch(source, /v-html/)
  }
})

test("public media rights metadata is attributed alongside block credit", () => {
  assert.equal(
    formatMediaAttribution(
      {
        credit: "場邊攝影",
        rightsOwner: "Courtside TW",
        licenseName: "Courtside public editorial license"
      },
      "文章圖片說明攝影"
    ),
    "文章圖片說明攝影 · 場邊攝影 · 權利：Courtside TW · 授權：Courtside public editorial license"
  )
})

test("gallery rendering preserves stable dimensions, caption and credit metadata", () => {
  assert.deepEqual(
    galleryItems(
      [
        {
          assetId: "asset-1",
          altText: "球場",
          caption: "主場",
          credit: "攝影：Courtside"
        }
      ],
      () => 1200,
      () => 800
    ),
    [
      {
        assetId: "asset-1",
        altText: "球場",
        caption: "主場",
        credit: "攝影：Courtside",
        width: 1200,
        height: 800
      }
    ]
  )
})

test("media failure fallback preserves the frozen media aspect ratio", () => {
  assert.deepEqual(mediaFallbackStyle(1600, 900), { aspectRatio: "1600 / 900" })
  assert.deepEqual(mediaFallbackStyle(1200, 800), { aspectRatio: "1200 / 800" })
  assert.deepEqual(mediaFallbackStyle(undefined, undefined), { aspectRatio: "16 / 9" })
})

test("the total renderer delegates canonical blocks to explicit local components", async () => {
  const source = await readFile(
    new URL("../../../app/components/content-blocks/ContentDocumentRenderer.vue", import.meta.url),
    "utf8"
  )

  for (const component of [
    "ParagraphBlock",
    "HeadingBlock",
    "ListBlock",
    "QuoteBlock",
    "DividerBlock",
    "ImageBlock",
    "GalleryBlock",
    "StatBlock",
    "VideoBlock",
    "RelatedReadingBlock",
    "GenerativeCanvasBlock"
  ]) {
    assert.match(source, new RegExp(component))
  }
  assert.doesNotMatch(source, /v-html/)
  assert.doesNotMatch(source, /import\s*\(.*block/u)
  assert.match(source, /getAssetWidth\(fallbackPosterAssetId\(block\), 'wide'\)/)
  assert.match(source, /getAssetHeight\(fallbackPosterAssetId\(block\), 'wide'\)/)
  assert.match(source, /content-block-fallback__poster/)
})
