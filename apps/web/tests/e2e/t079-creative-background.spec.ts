import { expect, test, type Page } from "@playwright/test"

const creativeArticlePath = "/articles/opening-night?issue=issue-2026-01"

test("foreground lifecycle events pause and resume only the preferred creative loop", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(creativeArticlePath, { waitUntil: "networkidle" })

  const runtimes = page.getByTestId("creative-runtime")
  await expect(runtimes).toHaveCount(2)
  const runtime = runtimes.first()
  await runtime.scrollIntoViewIfNeeded()
  await expect
    .poll(() => runtime.getAttribute("data-runtime-status"), { timeout: 10_000 })
    .toBe("running")
  expect(await runningCanvasCount(page)).toBe(1)

  for (const [backgroundEvent, foregroundEvent] of [
    ["blur", "focus"],
    ["pagehide", "pageshow"],
    ["freeze", "resume"]
  ] as const) {
    await page.evaluate((type) => {
      const target = type === "freeze" || type === "resume" ? document : window
      target.dispatchEvent(new Event(type))
    }, backgroundEvent)
    await expect
      .poll(() => runtime.getAttribute("data-runtime-status"), { timeout: 5_000 })
      .toBe("paused")
    expect(await runningCanvasCount(page)).toBe(0)

    await page.evaluate((type) => {
      const target = type === "freeze" || type === "resume" ? document : window
      target.dispatchEvent(new Event(type))
    }, foregroundEvent)
    await expect
      .poll(() => runtime.getAttribute("data-runtime-status"), { timeout: 5_000 })
      .toBe("running")
    expect(await runningCanvasCount(page)).toBe(1)
  }
})

async function runningCanvasCount(page: Page): Promise<number> {
  return page
    .getByTestId("creative-runtime")
    .evaluateAll(
      (runtimes) =>
        runtimes.filter((runtime) => runtime.getAttribute("data-runtime-status") === "running")
          .length
    )
}
