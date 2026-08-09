import { expect, test } from "@playwright/test"

test("reduced motion keeps content visible and creative runtime bounded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "reduced")
  await expect(page.getByTestId("article-document")).toHaveAttribute("data-client-ready", "true")
  const creatives = page.getByTestId("generative-canvas")
  await expect(creatives).toHaveCount(2)
  const firstCreative = creatives.nth(0)
  const firstRuntime = firstCreative.getByTestId("creative-runtime")
  const firstPoster = page.locator(".article-generative").nth(0).getByTestId("generative-poster")
  await expect(firstCreative).toHaveAttribute("data-seed", "20260807")
  await expect(firstPoster).toHaveAttribute("data-fallback", "true")
  await expect(firstCreative.locator("img")).toHaveAttribute(
    "src",
    /\/media\/published\/opening-generative-wide\.webp$/
  )
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.getByTestId("creative-enable")).toHaveCount(2)
  await page.getByTestId("creative-enable").first().click()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(2)
  await expect(firstRuntime).toHaveAttribute("data-runtime-engine", "p5")
  await expect(firstRuntime).toHaveAttribute("data-runtime-status", "paused", { timeout: 15000 })
  await expect(firstRuntime.locator("canvas")).toHaveCount(1)
  await expect(creatives.nth(1).getByTestId("creative-runtime")).toHaveAttribute(
    "data-runtime-status",
    "paused"
  )
  const firstRenderHash = await firstCreative.getAttribute("data-render-hash")
  expect(firstRenderHash).toBeTruthy()

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(firstCreative).toHaveAttribute("data-runtime-state", "paused")
  await expect(creatives.nth(1)).toHaveAttribute("data-runtime-state", "paused")

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(firstCreative).toHaveAttribute("data-runtime-state", "paused")

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("generative-canvas").first()).toHaveAttribute(
    "data-render-hash",
    firstRenderHash ?? ""
  )

  await page.goto("/articles/courtside-notes?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
})

test("tracks visibility independently for multiple generative blocks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  const creatives = page.getByTestId("generative-canvas")
  await expect(creatives).toHaveCount(2)
  const firstCreative = creatives.nth(0)
  const secondCreative = creatives.nth(1)
  const firstRuntime = firstCreative.getByTestId("creative-runtime")
  const secondRuntime = secondCreative.getByTestId("creative-runtime")
  await expect(firstRuntime).toHaveCount(1)
  await expect(secondRuntime).toHaveCount(1)

  await firstCreative.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "auto" })
  )
  await expect(firstCreative).toHaveAttribute("data-runtime-state", "running")
  await expect(secondCreative).toHaveAttribute("data-runtime-state", "paused")
  const firstFrame = Number(await firstRuntime.getAttribute("data-runtime-frame"))
  await page.waitForTimeout(250)
  const secondFrame = Number(await firstRuntime.getAttribute("data-runtime-frame"))
  expect(secondFrame).toBeGreaterThan(firstFrame)

  await secondCreative.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "auto" })
  )
  await expect(secondCreative).toHaveAttribute("data-runtime-state", "running")
  await expect(firstCreative).toHaveAttribute("data-runtime-state", "paused")
  const secondCanvasFrame = Number(await secondRuntime.getAttribute("data-runtime-frame"))
  await page.waitForTimeout(250)
  expect(Number(await secondRuntime.getAttribute("data-runtime-frame"))).toBeGreaterThan(
    secondCanvasFrame
  )

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(firstCreative).toHaveAttribute("data-runtime-state", "paused")
  await expect(secondCreative).toHaveAttribute("data-runtime-state", "paused")

  await page.goto("/articles/courtside-notes?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
})
