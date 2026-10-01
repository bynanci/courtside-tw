import { expect, test } from "@playwright/test"

test("offline download stays disabled before hydration while public reading remains available", async ({
  browser,
  baseURL
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(new URL("/issues/issue-2026-01", baseURL).href)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByTestId("offline-download")).toBeDisabled()
  } finally {
    await context.close()
  }
})
