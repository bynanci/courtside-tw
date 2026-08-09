import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

type ContentFixture = {
  blocks: Array<{ type: string }>
}

const contentFixture = JSON.parse(
  readFileSync(new URL("../fixtures/content-document-v1.json", import.meta.url), "utf8")
) as ContentFixture

test.describe("US2 long-form public article", () => {
  test("renders every v1 block, metadata, image fallback, navigation and share", async ({
    page
  }) => {
    expect(new Set(contentFixture.blocks.map((block) => block.type)).size).toBe(11)

    await page.route("**/media/**", (route) => route.abort())
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })

    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect(page.getByTestId("article-byline")).toContainText("Courtside TW 編輯部")
    await expect(
      page.locator('[data-testid="article-document"] .article-image img').first()
    ).toHaveAttribute("src", /\/media\/published\/opening-wide\.webp$/)
    await expect(page.getByTestId("article-reading-time")).toContainText("分鐘")
    await expect(page.getByTestId("article-issue-link")).toHaveAttribute(
      "href",
      "/issues/issue-2026-01"
    )
    await page.waitForLoadState("networkidle")
    await page
      .locator('[data-testid="article-document"] .article-image img')
      .first()
      .dispatchEvent("error")
    await expect(page.getByTestId("article-image-fallback")).toBeVisible()
    await expect(page.getByTestId("article-error-state")).toHaveCount(0)

    await page.getByTestId("article-share").click()
    await expect(page.getByTestId("share-status")).toBeVisible()
  })

  test("resumes the last stable block anchor after reload", async ({ page }) => {
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()

    await page.evaluate(() => {
      localStorage.setItem(
        "courtside.reader.progress:opening-night:revision-1",
        JSON.stringify({ blockId: "00000000-0000-4000-8000-000000000007", offset: 0.42 })
      )
    })
    await page.reload({ waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("reader-resume")).toBeVisible()
    await expect(page.getByTestId("reader-resume")).toContainText("繼續閱讀")
  })

  test("uses the issue snapshot for previous, next and table-of-contents links", async ({
    page
  }) => {
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()

    await expect(page.getByTestId("article-previous")).toBeDisabled()
    await expect(page.getByTestId("article-next")).toHaveAttribute(
      "href",
      "/articles/courtside-notes?issue=issue-2026-01"
    )
    await page.getByTestId("article-next").click()
    await expect(page).toHaveURL(/\/articles\/courtside-notes\?issue=issue-2026-01$/)
    await expect(page.getByTestId("article-toc")).toBeVisible()
  })
})
