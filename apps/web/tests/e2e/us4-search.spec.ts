import { expect, test } from "@playwright/test"

test("mixed Chinese and English search preserves the query and shows published results", async ({
  page
}) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" })

  await expect(page.getByRole("heading", { level: 1, name: /搜尋/ })).toBeVisible()
  await page.getByTestId("search-input").fill("台籃 Courtside")
  await page.getByTestId("search-submit").click()

  await expect(page).toHaveURL(/\/search\?q=%E5%8F%B0%E7%B1%83(?:%20|\+)Courtside/)
  await expect(page.getByTestId("search-result").first()).toBeVisible()
  await expect(page.getByTestId("search-result").first()).toContainText("Courtside")
  await expect(page.getByTestId("search-result")).not.toContainText("撤回")
})

test("punctuation-only search renders the explicit empty state", async ({ page }) => {
  await page.goto("/search?q=%21%3F%E3%80%81", { waitUntil: "domcontentloaded" })

  await expect(page.getByTestId("search-empty")).toBeVisible()
  await expect(page.getByTestId("search-result")).toHaveCount(0)
})
