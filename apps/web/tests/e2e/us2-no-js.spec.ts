import { expect, test } from "@playwright/test"

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
  await expect(page.getByTestId("article-content")).toBeVisible()
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
  await expect(page.getByTestId("article-toc")).toBeVisible()

  await page.getByTestId("article-issue-link").click()
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)

  await context.close()
})
