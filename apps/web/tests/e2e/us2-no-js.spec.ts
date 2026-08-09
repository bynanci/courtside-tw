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
  await expect(page.locator("canvas")).toHaveCount(0)
  await expect(page.getByTestId("article-toc")).toBeVisible()

  await page.getByTestId("article-issue-link").click()
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)

  await context.close()
})
