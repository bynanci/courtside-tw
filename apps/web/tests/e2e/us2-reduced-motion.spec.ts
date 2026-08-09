import { expect, test } from "@playwright/test"

test("reduced motion keeps content visible and creative runtime bounded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "reduced")
  const creative = page.getByTestId("generative-canvas")
  await expect(creative).toHaveAttribute("data-seed", "20260807")
  await expect(
    page.getByTestId("generative-poster-image").or(page.getByTestId("generative-poster"))
  ).toBeVisible()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.getByTestId("creative-enable")).toBeVisible()

  await page.getByTestId("creative-enable").click()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(1)
  await expect(page.getByTestId("creative-runtime")).toHaveAttribute("data-runtime-engine", "p5")
  await expect(page.getByTestId("creative-runtime canvas")).toHaveCount(1)
  await expect(creative).toHaveAttribute("data-runtime-state", "paused")
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
  await expect(creative).toHaveAttribute("data-runtime-state", "paused")

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("generative-canvas")).toHaveAttribute(
    "data-render-hash",
    firstRenderHash ?? ""
  )

  await page.goto("/articles/courtside-notes?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
})

test("p5 loops only while visible and is removed on route change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "full")
  const creative = page.getByTestId("generative-canvas")
  const runtime = page.getByTestId("creative-runtime")
  await expect(runtime).toHaveCount(1)
  await expect(runtime.locator("canvas")).toHaveCount(1)

  await creative.scrollIntoViewIfNeeded()
  await expect(creative).toHaveAttribute("data-runtime-state", "running")
  await expect(runtime).toHaveAttribute("data-runtime-status", "running")
  const firstFrame = Number(await runtime.getAttribute("data-runtime-frame"))
  await page.waitForTimeout(250)
  const secondFrame = Number(await runtime.getAttribute("data-runtime-frame"))
  expect(secondFrame).toBeGreaterThan(firstFrame)

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(creative).toHaveAttribute("data-runtime-state", "paused")
  await expect(runtime).toHaveAttribute("data-runtime-status", "paused")

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(creative).toHaveAttribute("data-runtime-state", "running")
  await expect(runtime).toHaveAttribute("data-runtime-status", "running")

  await page.goto("/articles/courtside-notes?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
})
