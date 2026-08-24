import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"

const accessibilityArtifactDirectory = fileURLToPath(
  new URL("../../../../artifacts/web-e2e/accessibility/", import.meta.url)
)
const arenaVisualArtifactDirectory = fileURLToPath(
  new URL("../../../../artifacts/web-e2e/arena-visual/", import.meta.url)
)
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ")
const coreRoutes = [
  { id: "home", path: "/" },
  { id: "issues", path: "/issues" },
  { id: "issue", path: "/issues/issue-2026-01" },
  { id: "article", path: "/articles/opening-night?issue=issue-2026-01" },
  { id: "library", path: "/library" }
] as const

function writeAccessibilityArtifact(fileName: string, content: string): void {
  mkdirSync(accessibilityArtifactDirectory, { recursive: true })
  writeFileSync(join(accessibilityArtifactDirectory, fileName), content, "utf8")
}

function visualArtifactPath(fileName: string): string {
  mkdirSync(arenaVisualArtifactDirectory, { recursive: true })
  return join(arenaVisualArtifactDirectory, fileName)
}

async function seriousAxeViolations(page: Page) {
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  return report.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  )
}

async function tabUntilFocused(page: Page, target: Locator, maximumTabs = 40): Promise<number> {
  await expect(target).toBeVisible()
  for (let tabCount = 1; tabCount <= maximumTabs; tabCount += 1) {
    await page.keyboard.press("Tab")
    if (await target.evaluate((element) => element.ownerDocument.activeElement === element)) {
      return tabCount
    }
  }
  throw new Error(`Target was not reached within ${maximumTabs} sequential Tab presses`)
}

for (const route of coreRoutes) {
  test(`${route.id} has a keyboard skip target`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(route.path, { waitUntil: "networkidle" })

    const skipLink = page.locator('a.skip-link[href="#main-content"]')
    const main = page.locator("#main-content")
    await expect(skipLink).toHaveCount(1)
    await expect(main).toHaveCount(1)

    await page.keyboard.press("Tab")
    await expect(skipLink).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(main).toBeFocused()
    expect(await seriousAxeViolations(page)).toEqual([])

    const ariaSnapshot = await main.ariaSnapshot()
    expect(ariaSnapshot).toContain("heading")
    if (route.id === "home") {
      expect(ariaSnapshot).not.toContain("\\n")
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /先閱讀，\s*再決定你要記住什麼。/
        })
      ).toBeVisible()
    }
    writeAccessibilityArtifact(`${route.id}.aria.yml`, ariaSnapshot)
  })
}

test("issue hero summary and time retain AA contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" })
  await page.goto("/issues/issue-2026-01", { waitUntil: "networkidle" })

  const samples = await page.locator(".issue-hero").evaluate((hero) => {
    function rgbChannels(value: string): [number, number, number] {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number)
      if (!channels || channels.length !== 3) {
        throw new Error(`Expected an RGB color, received ${value}`)
      }
      return channels as [number, number, number]
    }

    function relativeLuminance(value: string): number {
      const channels = rgbChannels(value).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }

    const background = getComputedStyle(hero).backgroundColor
    return [
      ["summary", ".issue-header__copy > p:not(.eyebrow)"],
      ["time", ".issue-header__copy time"]
    ].map(([name, selector]) => {
      const element = hero.querySelector(selector)
      if (!element) {
        throw new Error(`Missing ${name} contrast target`)
      }
      const foreground = getComputedStyle(element).color
      const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
      const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
      return { name, foreground, background, ratio: (lighter + 0.05) / (darker + 0.05) }
    })
  })

  expect(samples).toEqual([
    expect.objectContaining({
      name: "summary",
      foreground: "rgb(184, 177, 167)",
      background: "rgb(8, 8, 8)"
    }),
    expect.objectContaining({
      name: "time",
      foreground: "rgb(184, 177, 167)",
      background: "rgb(8, 8, 8)"
    })
  ])
  for (const sample of samples) {
    expect(sample.ratio).toBeGreaterThanOrEqual(4.5)
  }
})

test("sequential keyboard path follows Home → Issue → TOC → Article", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/", { waitUntil: "networkidle" })

  const homeIssue = page.getByTestId("home-issue-link")
  const homeTabCount = await tabUntilFocused(page, homeIssue, 16)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)

  const articleLink = page.getByTestId("article-link").first()
  const issueTabCount = await tabUntilFocused(page, articleLink, 20)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/articles\/opening-night\?issue=issue-2026-01$/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  const evidence = {
    route: "Home → Issue → TOC → Article",
    input: "sequential Tab + Enter only",
    homeTabCount,
    issueTabCount,
    result: "pass"
  }
  writeAccessibilityArtifact("keyboard-journey.json", JSON.stringify(evidence, null, 2))
})

test("offline control is reachable in sequential keyboard order", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/issues/issue-2026-01", { waitUntil: "networkidle" })

  const offlineDownload = page.getByTestId("offline-download")
  const tabCount = await tabUntilFocused(page, offlineDownload, 24)
  await expect(offlineDownload).toBeFocused()
  await expect
    .poll(() => offlineDownload.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe("none")

  writeAccessibilityArtifact(
    "keyboard-offline-control.json",
    JSON.stringify(
      {
        input: "sequential Tab only",
        control: "offline-download",
        tabCount,
        focusIndicator: "visible",
        result: "pass"
      },
      null,
      2
    )
  )
})

for (const viewportWidth of [320, 375, 412, 640, 768, 1024, 1440] as const) {
  test(`reader surfaces reflow at ${viewportWidth} CSS px`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 900 })
    await page.emulateMedia({ reducedMotion: "reduce" })

    const routeEvidence: Array<{
      route: string
      clientWidth: number
      scrollWidth: number
      clippedControls: string[]
      screenshot: string | null
    }> = []

    for (const route of coreRoutes) {
      await page.goto(route.path, { waitUntil: "networkidle" })
      const layout = await page.evaluate((selector) => {
        const clippedControls = Array.from(
          document.querySelectorAll<HTMLElement>(selector)
        ).flatMap((element) => {
          const style = getComputedStyle(element)
          if (style.display === "none" || style.visibility === "hidden") {
            return []
          }
          const rectangle = element.getBoundingClientRect()
          if (rectangle.width === 0 || rectangle.height === 0) {
            return []
          }
          if (rectangle.left >= -1 && rectangle.right <= window.innerWidth + 1) {
            return []
          }
          const label =
            element.getAttribute("data-testid") ??
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 80) ??
            element.tagName
          return [label]
        })
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clippedControls
        }
      }, focusableSelector)

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
      expect(layout.clippedControls).toEqual([])

      const screenshot =
        route.id === "home" || route.id === "issue" || route.id === "article"
          ? `${route.id}-${viewportWidth}.png`
          : null
      if (screenshot) {
        await page.screenshot({
          path: visualArtifactPath(screenshot),
          fullPage: true,
          scale: "css",
          animations: "disabled"
        })
      }
      routeEvidence.push({ route: route.id, ...layout, screenshot })
    }

    writeAccessibilityArtifact(
      `reflow-${viewportWidth}.json`,
      JSON.stringify(routeEvidence, null, 2)
    )
  })
}

test("Traditional Chinese typography uses strict emergency wrapping", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "networkidle"
  })

  const typography = await page.locator("#main-content").evaluate((element) => {
    const style = getComputedStyle(element)
    const wrappingProbe = document.createElement("p")
    wrappingProbe.textContent = `https://example.com/${"mixed-script-token".repeat(20)}`
    element.append(wrappingProbe)

    const codeProbe = document.createElement("code")
    codeProbe.textContent = "code-token"
    element.append(codeProbe)
    const codeStyle = getComputedStyle(codeProbe)
    const codeWrapping = {
      overflowWrap: codeStyle.overflowWrap,
      wordBreak: codeStyle.wordBreak
    }

    const layout = {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }
    wrappingProbe.remove()
    codeProbe.remove()

    return {
      language: document.documentElement.lang,
      lineBreak: style.lineBreak,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
      codeOverflowWrap: codeWrapping.overflowWrap,
      codeWordBreak: codeWrapping.wordBreak,
      longTokenFitsViewport: layout.scrollWidth <= layout.clientWidth + 1
    }
  })

  expect(typography.language).toBe("zh-Hant-TW")
  expect(typography.lineBreak).toBe("strict")
  expect(typography.overflowWrap).toBe("anywhere")
  expect(typography.wordBreak).toBe("normal")
  expect(typography.codeOverflowWrap).toBe("normal")
  expect(typography.codeWordBreak).toBe("normal")
  expect(typography.longTokenFitsViewport).toBe(true)
  writeAccessibilityArtifact(
    "traditional-chinese-typography.json",
    JSON.stringify(typography, null, 2)
  )
})

test("reduced motion removes sustained movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "networkidle"
  })

  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "reduced")
  const motionViolations = await page.locator("#main-content").evaluate((main) => {
    const durationInMilliseconds = (value: string): number =>
      value
        .split(",")
        .map((part) => part.trim())
        .reduce((maximum, part) => {
          const duration = part.endsWith("ms")
            ? Number.parseFloat(part)
            : Number.parseFloat(part) * 1000
          return Math.max(maximum, Number.isFinite(duration) ? duration : 0)
        }, 0)

    return Array.from(main.querySelectorAll<HTMLElement>("*")).flatMap((element) => {
      const style = getComputedStyle(element)
      const transitionDuration = durationInMilliseconds(style.transitionDuration)
      const animationDuration = durationInMilliseconds(style.animationDuration)
      const infiniteAnimation = style.animationIterationCount
        .split(",")
        .some((value) => value.trim() === "infinite")
      if (transitionDuration <= 1 && animationDuration <= 1 && !infiniteAnimation) {
        return []
      }
      return [
        {
          element:
            element.getAttribute("data-testid") || String(element.className) || element.tagName,
          transitionDuration,
          animationDuration,
          animationIterationCount: style.animationIterationCount
        }
      ]
    })
  })
  expect(motionViolations).toEqual([])

  await page.getByTestId("creative-enable").first().click()
  const runtimes = page.getByTestId("creative-runtime")
  await expect(runtimes).toHaveCount(2)
  for (let index = 0; index < 2; index += 1) {
    await expect(runtimes.nth(index)).not.toHaveAttribute("data-runtime-status", "running")
  }

  const evidence = { motionViolations, creativeRuntimes: "paused" }
  writeAccessibilityArtifact("reduced-motion.json", JSON.stringify(evidence, null, 2))
})

test("Save-Data disables editorial motion and creative autoload in Chromium", async ({ page }) => {
  await page.addInitScript(() => {
    const connection = new EventTarget()
    Object.defineProperty(connection, "saveData", { configurable: true, value: true })
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection })
  })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "networkidle"
  })

  await expect(page.locator("html")).toHaveAttribute("data-reader-motion", "reduced")
  await expect(page.getByTestId("article-document")).toHaveAttribute("data-motion", "reduced")
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.getByTestId("creative-enable")).toHaveCount(2)

  const evidence = await page.evaluate(() => ({
    saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData,
    readerMotion: document.documentElement.dataset.readerMotion,
    readerMotionCover: document.documentElement.dataset.readerMotionCover,
    readerMotionProgress: document.documentElement.dataset.readerMotionProgress
  }))
  expect(evidence).toEqual({
    saveData: true,
    readerMotion: "reduced",
    readerMotionCover: "disabled",
    readerMotionProgress: "disabled"
  })

  const screenshot = "article-save-data.png"
  await page.screenshot({
    path: visualArtifactPath(screenshot),
    fullPage: true,
    scale: "css",
    animations: "disabled"
  })
  writeAccessibilityArtifact(
    "save-data.json",
    JSON.stringify({ ...evidence, creativeRuntimeCount: 0, screenshot }, null, 2)
  )
})

test("shared issue cover emits one bounded real-browser handoff", async ({ page }) => {
  await page.addInitScript(() => {
    const originalAnimate = Element.prototype.animate
    const evidence: Array<{
      duration: number | null
      keyframeCount: number
      firstTransform: string | null
      lastTransform: string | null
    }> = []
    Object.defineProperty(window, "__courtsideCoverAnimationEvidence", {
      configurable: true,
      value: evidence
    })
    Element.prototype.animate = function (
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ): Animation {
      if (this instanceof HTMLElement && this.dataset.motionPattern === "issue-cover-carry") {
        const frames = Array.isArray(keyframes) ? keyframes : []
        const duration =
          typeof options === "number"
            ? options
            : typeof options?.duration === "number"
              ? options.duration
              : null
        evidence.push({
          duration,
          keyframeCount: frames.length,
          firstTransform:
            frames.length > 0 && typeof frames[0]?.transform === "string"
              ? frames[0].transform
              : null,
          lastTransform:
            frames.length > 0 && typeof frames.at(-1)?.transform === "string"
              ? (frames.at(-1)?.transform ?? null)
              : null
        })
      }
      return originalAnimate.call(this, keyframes, options)
    }
  })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/", { waitUntil: "networkidle" })
  await expect(page.locator("html")).toHaveAttribute("data-reader-motion-cover", "enabled")

  await page.getByTestId("home-issue-link").click()
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __courtsideCoverAnimationEvidence?: unknown[]
            }
          ).__courtsideCoverAnimationEvidence?.length ?? 0
      )
    )
    .toBe(1)

  const evidence = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __courtsideCoverAnimationEvidence: Array<{
            duration: number | null
            keyframeCount: number
            firstTransform: string | null
            lastTransform: string | null
          }>
        }
      ).__courtsideCoverAnimationEvidence[0]
  )
  expect(evidence?.duration).not.toBeNull()
  expect(evidence?.duration ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(360)
  expect(evidence?.keyframeCount ?? 0).toBeGreaterThanOrEqual(2)

  const screenshot = "issue-shared-cover-settled.png"
  await page.screenshot({
    path: visualArtifactPath(screenshot),
    fullPage: true,
    scale: "css",
    animations: "disabled"
  })
  writeAccessibilityArtifact(
    "shared-cover-browser.json",
    JSON.stringify({ ...evidence, screenshot, result: "pass" }, null, 2)
  )
})

test("poster and summary are the single accessible creative fallback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/articles/opening-night?issue=issue-2026-01", {
    waitUntil: "networkidle"
  })

  const generativeSections = page.locator(".article-generative")
  const creativeControls = page.getByTestId("creative-enable")
  await expect(generativeSections).toHaveCount(2)
  await expect(creativeControls).toHaveCount(2)

  const creativeControlNames = await creativeControls.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label") ?? "")
  )
  expect(creativeControlNames).toHaveLength(2)
  expect(new Set(creativeControlNames).size).toBe(2)
  for (const name of creativeControlNames) {
    expect(name).toMatch(/^顯示互動視覺：/)
  }

  await expect(page.getByRole("link", { name: "返回本期目錄", exact: true })).toHaveCount(1)
  await expect(page.getByRole("link", { name: "讀完了，返回本期目錄", exact: true })).toHaveCount(1)

  await creativeControls.first().click()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(2)

  for (let index = 0; index < 2; index += 1) {
    const section = generativeSections.nth(index)
    const poster = section.getByTestId("generative-poster")
    const runtime = section.getByTestId("generative-canvas")

    await expect(poster).toBeVisible()
    await expect(poster.locator("figcaption")).not.toBeEmpty()
    await expect(runtime).toHaveAttribute("aria-hidden", "true")
    await expect(section.getByRole("img")).toHaveCount(1)
  }

  const evidence = {
    fallback: "poster + non-empty data summary",
    runtimeAccessibilityTree: "hidden",
    duplicateImageAnnouncements: 0,
    creativeControlNames,
    contextualFooterReturnLabel: "讀完了，返回本期目錄"
  }
  writeAccessibilityArtifact("creative-fallback.json", JSON.stringify(evidence, null, 2))
})
