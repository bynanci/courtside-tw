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

test("taxonomy filter is accessible and synchronized with the URL", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" })

  await page.getByTestId("search-taxonomy").fill("team-formosa")
  await page.getByTestId("search-submit").click()

  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("taxonomy"))
    .toEqual(["team-formosa"])
  await expect(page.getByTestId("search-result")).toContainText("分類篩選結果")
})

test("search follows the opaque cursor to the next result page", async ({ page }) => {
  await page.goto("/search?q=%E5%88%86%E9%A0%81&taxonomy=team-formosa", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("search-result")).toContainText("第一頁")
  await page.getByTestId("search-next").click()

  await expect(page).toHaveURL(/cursor=cGFnZS0y/)
  expect(new URL(page.url()).searchParams.getAll("taxonomy")).toEqual(["team-formosa"])
  await expect(page.getByTestId("search-result")).toContainText("第二頁")
})
