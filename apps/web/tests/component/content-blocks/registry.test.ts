import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  getSafeFallbackPosterAssetId,
  getSafeFallbackSummary,
  resolveContentBlockRenderer,
  type ContentBlock
} from "../../../app/components/content-blocks/registry.ts"

function block(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "paragraph",
    version: 1,
    payload: { content: [{ kind: "text", text: "內容" }] },
    ...overrides
  }
}

test("registry resolves every canonical v1 block through an explicit renderer key", () => {
  const types = [
    "paragraph",
    "heading",
    "list",
    "quote",
    "divider",
    "image",
    "gallery",
    "stat",
    "video",
    "related-reading",
    "generative-canvas"
  ] as const

  for (const type of types) {
    const result = resolveContentBlockRenderer(
      block({
        type,
        payload: type === "generative-canvas" ? { presetId: "court-pulse-v1" } : { content: [] }
      })
    )
    assert.deepEqual(result, { kind: "renderer", renderer: type })
  }
})

test("unknown block types fail closed with an attributable telemetry code", () => {
  assert.deepEqual(resolveContentBlockRenderer(block({ type: "remote-widget" })), {
    kind: "fallback",
    reason: "unknown-block-type",
    telemetryCode: "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
  })
})

test("unsupported block and preset versions fail closed", () => {
  assert.deepEqual(resolveContentBlockRenderer(block({ version: 2 })), {
    kind: "fallback",
    reason: "unsupported-block-version",
    telemetryCode: "CONTENT_BLOCK_RENDERER_UNSUPPORTED_VERSION"
  })
  assert.deepEqual(
    resolveContentBlockRenderer(
      block({ type: "generative-canvas", payload: { presetId: "court-pulse-v2" } })
    ),
    {
      kind: "fallback",
      reason: "unknown-preset-version",
      telemetryCode: "CONTENT_BLOCK_RENDERER_UNKNOWN_PRESET"
    }
  )
})

test("fallback summary accepts only bounded plain text and has a safe default", () => {
  assert.equal(
    getSafeFallbackSummary({
      summary: "  摘要\n含有換行  ",
      dataSummary: "不應優先使用"
    }),
    "摘要 含有換行"
  )
  assert.equal(getSafeFallbackSummary({}), "此內容區塊版本尚未支援，已保留摘要。")
  assert.equal(
    getSafeFallbackSummary({ summary: "\u0000<script>alert(1)</script>" }),
    "scriptalert(1)/script"
  )
})

test("fallback poster accepts an asset identity only, never a content-supplied URL", () => {
  assert.equal(getSafeFallbackPosterAssetId({ posterAssetId: "asset-123" }), "asset-123")
  assert.equal(
    getSafeFallbackPosterAssetId({ posterAssetId: "https://attacker.example/poster.png" }),
    null
  )
})

test("renderer is registry-driven and never resolves modules or components from content", async () => {
  const rendererSource = await readFile(
    new URL("../../../app/components/content-blocks/ContentDocumentRenderer.vue", import.meta.url),
    "utf8"
  )
  const pageSource = await readFile(
    new URL("../../../app/pages/articles/[articleSlug].vue", import.meta.url),
    "utf8"
  )

  assert.match(rendererSource, /resolveContentBlockRenderer/)
  assert.match(rendererSource, /telemetryCode/)
  assert.doesNotMatch(rendererSource, /import\s*\(/)
  assert.doesNotMatch(rendererSource, /:is=["']\s*\{?\s*block\.(type|version)/)
  assert.match(pageSource, /ContentDocumentRenderer/)
})
