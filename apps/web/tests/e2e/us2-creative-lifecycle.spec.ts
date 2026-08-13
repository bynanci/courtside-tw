import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

type LifecycleSnapshot = {
  globalListeners: number
  intervals: number
  animationFrames: number
  intersectionTargets: number
  resizeTargets: number
}

const ordinaryArticlePath = "/articles/courtside-notes?issue=issue-2026-01"
const creativeArticlePath = "/articles/opening-night?issue=issue-2026-01"

test.beforeEach(async ({ page }) => {
  await installLifecycleCounters(page)
})

test("ordinary and reduced-motion reads transfer zero p5 bytes until explicit enable", async ({
  page
}) => {
  const p5Chunk = findP5ChunkName()
  const requests: string[] = []
  page.on("request", (request) => requests.push(new URL(request.url()).pathname))

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ordinaryArticlePath, { waitUntil: "networkidle" })
  expect(requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(false)

  requests.length = 0
  await page.goto(creativeArticlePath, { waitUntil: "networkidle" })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  expect(requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(false)

  await page.getByTestId("creative-enable").first().click()
  await expect(page.getByTestId("creative-runtime")).toHaveCount(2)
  await expect.poll(() => requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(true)
})

test("Save-Data keeps the creative reader poster-only and transfers zero p5 bytes", async ({
  page
}) => {
  const p5Chunk = findP5ChunkName()
  const requests: string[] = []
  page.on("request", (request) => requests.push(new URL(request.url()).pathname))
  await page.addInitScript(() => {
    const connection = {
      saveData: true,
      effectiveType: "3g",
      downlink: 1.5,
      rtt: 150,
      addEventListener() {},
      removeEventListener() {}
    }
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection })
  })
  await page.emulateMedia({ reducedMotion: "no-preference" })

  await page.goto(creativeArticlePath, { waitUntil: "networkidle" })

  await expect(page.getByTestId("generative-poster")).toHaveCount(2)
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  expect(requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(false)
})

test("twenty client-side article switches leave zero creative lifecycle delta", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(ordinaryArticlePath, { waitUntil: "networkidle" })
  await expect(page.locator("canvas")).toHaveCount(0)
  const baseline = await lifecycleSnapshot(page)

  for (let switchIndex = 1; switchIndex <= 20; switchIndex += 1) {
    const enteringCreative = switchIndex % 2 === 1
    await page
      .getByTestId(enteringCreative ? "article-previous" : "article-next")
      .click()
    await expect(page).toHaveURL(
      enteringCreative ? /\/articles\/opening-night/ : /\/articles\/courtside-notes/
    )
    if (enteringCreative) {
      await expect(page.getByTestId("creative-runtime")).toHaveCount(2)
      await expect(page.locator("canvas")).toHaveCount(2)
      expect(await runningCanvasCount(page)).toBeLessThanOrEqual(1)
    } else {
      await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
      await expect(page.locator("canvas")).toHaveCount(0)
    }
  }

  await expect(page).toHaveURL(/\/articles\/courtside-notes/)
  await expect.poll(() => lifecycleSnapshot(page)).toEqual(baseline)
})

test("an interrupted reduced-motion route change never hides the completed article DOM", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ordinaryArticlePath, { waitUntil: "domcontentloaded" })

  await page.getByTestId("article-previous").click()
  await expect(page.getByTestId("article-document")).toBeVisible()
  await page.getByTestId("article-next").click()

  await expect(page).toHaveURL(/\/articles\/courtside-notes/)
  await expect(page.getByTestId("article-document")).toBeVisible()
  await expect(page.getByTestId("article-content")).toContainText("看台的聲音")
  await expect(page.locator("canvas")).toHaveCount(0)
})

function findP5ChunkName(): string {
  const assetDirectory = fileURLToPath(new URL("../../.output/public/_nuxt/", import.meta.url))
  if (!existsSync(assetDirectory)) {
    throw new Error("Nuxt production assets are required before the creative transfer gate")
  }
  const candidates = readdirSync(assetDirectory).filter((fileName) => {
    if (!fileName.endsWith(".js")) {
      return false
    }
    const source = readFileSync(assetDirectory + fileName, "utf8")
    return source.includes("p5.Geometry") && source.includes("createCanvas")
  })
  expect(candidates).toHaveLength(1)
  return candidates[0] ?? "missing-p5-chunk"
}

async function runningCanvasCount(page: Page): Promise<number> {
  return page.getByTestId("creative-runtime").evaluateAll(
    (runtimes) =>
      runtimes.filter((runtime) => runtime.getAttribute("data-runtime-status") === "running").length
  )
}

async function lifecycleSnapshot(page: Page): Promise<LifecycleSnapshot> {
  return page.evaluate(() => {
    const lifecycle = (
      window as unknown as {
        __courtsideT041Lifecycle: { snapshot: () => LifecycleSnapshot }
      }
    ).__courtsideT041Lifecycle
    return lifecycle.snapshot()
  })
}

async function installLifecycleCounters(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const globalListenerRecords: Array<{
      target: EventTarget
      type: string
      listener: EventListenerOrEventListenerObject | null
      capture: boolean
    }> = []
    const intervalIds = new Set<number>()
    const animationFrameIds = new Set<number>()
    let intersectionTargets = 0
    let resizeTargets = 0

    const originalAddEventListener = EventTarget.prototype.addEventListener
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void {
      const capture = typeof options === "boolean" ? options : options?.capture === true
      if (
        (this === window || this === document) &&
        !globalListenerRecords.some(
          (record) =>
            record.target === this &&
            record.type === type &&
            record.listener === listener &&
            record.capture === capture
        )
      ) {
        globalListenerRecords.push({ target: this, type, listener, capture })
      }
      originalAddEventListener.call(this, type, listener, options)
    }
    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ): void {
      const capture = typeof options === "boolean" ? options : options?.capture === true
      const index = globalListenerRecords.findIndex(
        (record) =>
          record.target === this &&
          record.type === type &&
          record.listener === listener &&
          record.capture === capture
      )
      if (index >= 0) {
        globalListenerRecords.splice(index, 1)
      }
      originalRemoveEventListener.call(this, type, listener, options)
    }

    const originalSetInterval = window.setInterval.bind(window)
    const originalClearInterval = window.clearInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => {
      const id = originalSetInterval(handler, timeout, ...arguments_)
      intervalIds.add(id)
      return id
    }) as typeof window.setInterval
    window.clearInterval = ((id?: number) => {
      if (typeof id === "number") {
        intervalIds.delete(id)
      }
      originalClearInterval(id)
    }) as typeof window.clearInterval

    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
    const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      let id = 0
      id = originalRequestAnimationFrame((time) => {
        animationFrameIds.delete(id)
        callback(time)
      })
      animationFrameIds.add(id)
      return id
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((id: number) => {
      animationFrameIds.delete(id)
      originalCancelAnimationFrame(id)
    }) as typeof window.cancelAnimationFrame

    if (typeof IntersectionObserver !== "undefined") {
      const targets = new WeakMap<IntersectionObserver, Set<Element>>()
      const originalObserve = IntersectionObserver.prototype.observe
      const originalUnobserve = IntersectionObserver.prototype.unobserve
      const originalDisconnect = IntersectionObserver.prototype.disconnect
      IntersectionObserver.prototype.observe = function (target: Element): void {
        const observed = targets.get(this) ?? new Set<Element>()
        if (!observed.has(target)) {
          observed.add(target)
          intersectionTargets += 1
        }
        targets.set(this, observed)
        originalObserve.call(this, target)
      }
      IntersectionObserver.prototype.unobserve = function (target: Element): void {
        const observed = targets.get(this)
        if (observed?.delete(target)) {
          intersectionTargets -= 1
        }
        originalUnobserve.call(this, target)
      }
      IntersectionObserver.prototype.disconnect = function (): void {
        const observed = targets.get(this)
        if (observed) {
          intersectionTargets -= observed.size
          observed.clear()
        }
        originalDisconnect.call(this)
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      const targets = new WeakMap<ResizeObserver, Set<Element>>()
      const originalObserve = ResizeObserver.prototype.observe
      const originalUnobserve = ResizeObserver.prototype.unobserve
      const originalDisconnect = ResizeObserver.prototype.disconnect
      ResizeObserver.prototype.observe = function (
        target: Element,
        options?: ResizeObserverOptions
      ): void {
        const observed = targets.get(this) ?? new Set<Element>()
        if (!observed.has(target)) {
          observed.add(target)
          resizeTargets += 1
        }
        targets.set(this, observed)
        originalObserve.call(this, target, options)
      }
      ResizeObserver.prototype.unobserve = function (target: Element): void {
        const observed = targets.get(this)
        if (observed?.delete(target)) {
          resizeTargets -= 1
        }
        originalUnobserve.call(this, target)
      }
      ResizeObserver.prototype.disconnect = function (): void {
        const observed = targets.get(this)
        if (observed) {
          resizeTargets -= observed.size
          observed.clear()
        }
        originalDisconnect.call(this)
      }
    }

    ;(
      window as unknown as {
        __courtsideT041Lifecycle: { snapshot: () => LifecycleSnapshot }
      }
    ).__courtsideT041Lifecycle = {
      snapshot: () => ({
        globalListeners: globalListenerRecords.length,
        intervals: intervalIds.size,
        animationFrames: animationFrameIds.size,
        intersectionTargets,
        resizeTargets
      })
    }
  })
}
