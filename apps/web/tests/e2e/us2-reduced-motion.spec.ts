import { expect, test } from "@playwright/test"

test("reduced motion keeps content visible and creative runtime bounded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "reduced")
  const creative = page.getByTestId("generative-canvas")
  await expect(creative).toHaveAttribute("data-seed", "20260807")
  await expect(page.getByTestId("generative-poster")).toBeVisible()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)

  await creative.scrollIntoViewIfNeeded()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(1)
  const firstRenderHash = await creative.getAttribute("data-render-hash")
  expect(firstRenderHash).toBeTruthy()

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(creative).toHaveAttribute("data-runtime-state", "paused")

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(creative).toHaveAttribute("data-runtime-state", "running")

  await page.reload({ waitUntil: "domcontentloaded" })
  await creative.scrollIntoViewIfNeeded()
  await expect(creative).toHaveAttribute("data-render-hash", firstRenderHash ?? "")

  await page.goto("/articles/courtside-notes?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
})
