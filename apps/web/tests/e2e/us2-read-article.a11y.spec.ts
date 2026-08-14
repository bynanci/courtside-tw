import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const articlePath = "/articles/opening-night?issue=issue-2026-01"
const EVENT_TIMING_REPORTING_THRESHOLD_MS = 16

test("public article has no serious WCAG 2.2 AA axe violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(articlePath, { waitUntil: "domcontentloaded" })

  await expect(page.getByTestId("article-document")).toBeVisible()
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const blockers = report.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  )

  expect(blockers).toEqual([])
})

test("article SEO, keyboard controls and media geometry survive progressive enhancement", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(articlePath, { waitUntil: "domcontentloaded" })

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://courtside.test/articles/opening-night"
  )
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article")
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://courtside.test/articles/opening-night"
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "http://127.0.0.1:4010/media/published/opening-wide.webp"
  )
  await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute(
    "content",
    "2026-08-01T00:00:00Z"
  )
  await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
    "content",
    "2026-08-02T00:00:00Z"
  )
  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}"
  ) as {
    "@type"?: string
    author?: unknown
    datePublished?: string
    dateModified?: string
    image?: string
    url?: string
  }
  expect(structuredData["@type"]).toBe("Article")
  expect(structuredData.author).toEqual([{ "@type": "Person", name: "Courtside TW 主筆" }])
  expect(structuredData.datePublished).toBe("2026-08-01T00:00:00Z")
  expect(structuredData.dateModified).toBe("2026-08-02T00:00:00Z")
  expect(structuredData.url).toBe("https://courtside.test/articles/opening-night")
  expect(structuredData.image).toBe("http://127.0.0.1:4010/media/published/opening-wide.webp")

  const mediaAttributions = page.getByTestId("article-media-attribution")
  await expect(mediaAttributions).toHaveCount(5)
  await expect(mediaAttributions.first()).toContainText("場邊攝影")
  await expect(mediaAttributions.first()).toContainText("權利：Courtside TW")
  await expect(mediaAttributions.first()).toContainText("授權：Courtside public editorial license")

  const controls = [
    page.getByTestId("article-share"),
    page.getByTestId("article-issue-link"),
    page.getByTestId("article-next")
  ]
  for (const control of controls) {
    await control.focus()
    await expect(control).toBeFocused()
    await expect
      .poll(() => control.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none")
  }

  const unstableMedia = await page
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
  expect(unstableMedia).toEqual([])
})

test("unavailable public article remains an accessible recovery state", async ({ page }) => {
  await page.goto("/articles/withdrawn-article?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-error-state")).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: "找不到這篇文章" })).toBeVisible()
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(
    report.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([])
})

test("representative reader interaction stays within the 200 ms INP budget", async ({ page }) => {
  await page.addInitScript((reportingThreshold) => {
    const durations: number[] = []
    const supported = PerformanceObserver.supportedEntryTypes.includes("event")
    ;(
      window as unknown as {
        __courtsideSupportsEventTiming: boolean
      }
    ).__courtsideSupportsEventTiming = supported
    if (!supported) {
      return
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration)
      }
    })
    // Chrome reports EventTiming entries only at or above this threshold. An
    // empty result therefore proves the interaction was <16 ms, not 0 ms.
    observer.observe({ type: "event", buffered: true, durationThreshold: reportingThreshold })
    ;(
      window as unknown as {
        __courtsideInteractionDurations: number[]
      }
    ).__courtsideInteractionDurations = durations
  }, EVENT_TIMING_REPORTING_THRESHOLD_MS)
  await page.goto(articlePath, { waitUntil: "networkidle" })

  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __courtsideSupportsEventTiming: boolean
          }
        ).__courtsideSupportsEventTiming
    ),
    "Chromium must expose PerformanceEventTiming for the INP evidence lane"
  ).toBe(true)

  await page.getByTestId("article-share").click()
  await expect(page.getByTestId("share-status")).toBeVisible()
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))
      )
  )

  const interactionDurations = await page.evaluate(
    () =>
      (
        window as unknown as {
          __courtsideInteractionDurations: number[]
        }
      ).__courtsideInteractionDurations
  )
  const worstInteraction =
    interactionDurations.length > 0
      ? Math.max(...interactionDurations)
      : EVENT_TIMING_REPORTING_THRESHOLD_MS
  expect(worstInteraction).toBeLessThanOrEqual(200)
})

test("ordinary article hydration stays within the CLS budget", async ({ page }) => {
  await page.addInitScript(() => {
    let cumulativeLayoutShift = 0
    const layoutShiftSources: string[] = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number
          hadRecentInput: boolean
          sources?: Array<{ node?: Node }>
        }
        if (shift.hadRecentInput) continue
        cumulativeLayoutShift += shift.value
        for (const source of shift.sources ?? []) {
          if (source.node instanceof Element) layoutShiftSources.push(source.node.className)
        }
      }
    })
    observer.observe({ type: "layout-shift", buffered: true })
    Object.defineProperty(window, "__courtsideReaderCls", {
      get: () => cumulativeLayoutShift
    })
    Object.defineProperty(window, "__courtsideReaderClsSources", {
      get: () => [...layoutShiftSources]
    })
  })

  await page.goto("/articles/courtside-notes?issue=issue-2026-01")
  await expect(page.getByTestId("article-document")).toHaveAttribute("data-client-ready", "true")
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
  })

  const hydrationLayoutShift = await page.evaluate(() => {
    const evidence = window as Window & {
      __courtsideReaderCls: number
      __courtsideReaderClsSources: string[]
    }
    return { value: evidence.__courtsideReaderCls, sources: evidence.__courtsideReaderClsSources }
  })
  expect(hydrationLayoutShift.value).toBeLessThanOrEqual(0.01)
  expect(hydrationLayoutShift.sources).not.toContain("article-header")
})
