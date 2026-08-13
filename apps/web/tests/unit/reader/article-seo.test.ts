import assert from "node:assert/strict"
import test from "node:test"

import { buildArticleSeo } from "../../../app/features/reader/seo/article-seo.ts"

test("article SEO binds canonical, Open Graph and structured data to the public projection", () => {
  const result = buildArticleSeo({
    siteUrl: "https://courtside.test/editorial-preview",
    slug: "opening-night",
    title: "主場燈光亮起之前",
    description: "從球場入口開始的長文。",
    contributors: [
      { displayName: "Courtside TW 主筆", role: "AUTHOR" },
      { displayName: "Courtside TW 編輯部", role: "EDITOR" }
    ],
    publishedAt: "2026-08-01T00:00:00Z",
    modifiedAt: "2026-08-02T00:00:00Z"
  })

  assert.equal(result.title, "主場燈光亮起之前 — Courtside TW")
  assert.deepEqual(result.link, [
    { rel: "canonical", href: "https://courtside.test/articles/opening-night" }
  ])
  assert.ok(
    result.meta.some(
      (entry) =>
        entry.property === "og:url" &&
        entry.content === "https://courtside.test/articles/opening-night"
    )
  )
  assert.ok(
    result.meta.some(
      (entry) => entry.property === "article:published_time" && entry.content === "2026-08-01T00:00:00Z"
    )
  )

  const structuredData = JSON.parse(result.script[0]?.innerHTML ?? "{}") as Record<
    string,
    unknown
  >
  assert.equal(structuredData["@type"], "Article")
  assert.deepEqual(structuredData.author, [
    { "@type": "Person", name: "Courtside TW 主筆" }
  ])
  assert.equal(structuredData.datePublished, "2026-08-01T00:00:00Z")
  assert.equal(structuredData.dateModified, "2026-08-02T00:00:00Z")
})

test("article SEO serializes hostile projection text without terminating JSON-LD", () => {
  const result = buildArticleSeo({
    siteUrl: "javascript:alert(1)",
    slug: "opening-night",
    title: "</script><img src=x onerror=alert(1)>",
    description: "unsafe & text",
    contributors: []
  })

  assert.equal(result.link[0]?.href, "https://courtside.tw/articles/opening-night")
  assert.equal(result.script[0]?.innerHTML.includes("</script>"), false)
  assert.match(result.script[0]?.innerHTML ?? "", /\\u003c\/script\\u003e/)
  assert.match(result.script[0]?.innerHTML ?? "", /\\u0026/)
})
