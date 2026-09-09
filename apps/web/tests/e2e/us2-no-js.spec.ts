import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/content-document-v1.json", import.meta.url), "utf8")
) as { blocks: Array<{ id: string; type: string; payload: Record<string, unknown> }> }

test("SSR renders article blocks and generative poster without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce"
  })
  const page = await context.newPage()

  await page.goto("http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-document")).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("主場燈光亮起之前")
  await expect(page.locator(".article-dek")).toHaveText(
    "一篇從球場入口開始，記錄主場如何成為共同記憶的長文。"
  )
  await expect(page.getByTestId("article-byline")).toContainText("Courtside TW 編輯部")
  await expect(page.getByTestId("article-credit")).toHaveCount(3)
  await expect(page.getByTestId("article-reading-time")).toHaveText("6 分鐘閱讀")
  await expect(page.getByTestId("article-content")).toContainText(
    "這是一份涵蓋台籃雜誌 MVP 內容區塊的固定 fixture。"
  )
  expect(new Set(fixture.blocks.map((block) => block.type)).size).toBe(11)
  for (const block of fixture.blocks) {
    await expect(page.locator(`[data-block-id="${block.id}"]`)).toBeVisible()
  }
  for (const block of fixture.blocks.filter((block) => block.type === "generative-canvas")) {
    const fallback = page.locator(`[data-block-id="${block.id}"]`)
    await expect(fallback.getByTestId("generative-poster-image")).toHaveAttribute(
      "alt",
      String(block.payload.altText)
    )
    await expect(fallback.getByTestId("generative-poster")).toContainText(
      String(block.payload.dataSummary)
    )
  }
  await expect(page.getByTestId("article-reading-progress")).toBeVisible()
  await expect(page.getByTestId("article-share")).toBeDisabled()
  await expect(page.getByTestId("article-share-fallback")).toHaveAttribute(
    "href",
    "https://courtside.test/articles/opening-night"
  )
  await expect(page.getByTestId("generative-poster")).toHaveCount(2)
  await expect(page.getByTestId("generative-poster").first()).toHaveAttribute(
    "data-fallback",
    "true"
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://courtside.test/articles/opening-night"
  )
  await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute(
    "content",
    "2026-08-01T00:00:00Z"
  )
  await expect(page.getByTestId("article-published-at")).toHaveAttribute(
    "datetime",
    "2026-08-01T00:00:00Z"
  )
  await expect(page.getByTestId("article-updated-at")).toHaveAttribute(
    "datetime",
    "2026-08-02T00:00:00Z"
  )
  await expect(page.getByTestId("article-media-attribution")).toHaveCount(5)
  await expect(page.getByTestId("article-media-attribution").first()).toContainText(
    "權利：Courtside TW"
  )
  const unstableServerRenderedMedia = await page
    .locator('[data-testid="article-document"] img')
    .evaluateAll((images) =>
      images.flatMap((image) => {
        const width = Number(image.getAttribute("width"))
        const height = Number(image.getAttribute("height"))
        const aspectRatio = getComputedStyle(image).aspectRatio
        return (width > 0 && height > 0) || (aspectRatio !== "auto" && aspectRatio !== "")
          ? []
          : [image.getAttribute("src") ?? "unknown"]
      })
    )
  expect(unstableServerRenderedMedia).toEqual([])
  await expect(page.locator("canvas")).toHaveCount(0)
  const tocLink = page.getByTestId("article-toc").getByRole("link", { name: "本期觀察" })
  const anchor = "#block-00000000-0000-4000-8000-000000000003"
  await expect(tocLink).toHaveAttribute("href", anchor)
  await tocLink.click()
  await expect(page).toHaveURL(new RegExp(anchor + "$"))
  await expect(page.locator(anchor)).toBeInViewport()

  await expect(page.getByTestId("article-previous")).toBeDisabled()
  await page.getByTestId("article-next").click()
  await expect(page).toHaveURL(/\/articles\/courtside-notes\?issue=issue-2026-01$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("看台上的第二種節奏")
  await expect(page.getByTestId("article-content")).toContainText("看台的聲音")
  await expect(page.getByTestId("article-next")).toBeDisabled()
  await page.getByTestId("article-previous").click()
  await expect(page).toHaveURL(/\/articles\/opening-night\?issue=issue-2026-01$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("主場燈光亮起之前")
  await expect(page.getByTestId("article-return-issue-toc")).toHaveAttribute(
    "href",
    "/issues/issue-2026-01#toc"
  )

  await page.getByTestId("article-issue-link").click()
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)

  await context.close()
})
