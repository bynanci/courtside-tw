import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

type LifecycleSnapshot = {
  globalListeners: number
  globalListenerTypes: string[]
  intervals: number
  animationFrames: number
  intersectionTargets: number
  creativeIntersectionTargets: number
  detachedIntersectionTargets: number
  resizeTargets: number
  creativeResizeTargets: number
  detachedResizeTargets: number
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
  await expect(page.locator(`link[href$="/${p5Chunk}"]`)).toHaveCount(0)
  expect(requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(false)

  requests.length = 0
  await page.goto(creativeArticlePath, { waitUntil: "networkidle" })
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.locator(`link[href$="/${p5Chunk}"]`)).toHaveCount(0)
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
  await expect(page.locator(`link[href$="/${p5Chunk}"]`)).toHaveCount(0)
  expect(requests.some((pathname) => pathname.endsWith("/" + p5Chunk))).toBe(false)
})

test("twenty client-side article switches leave no positive per-instance creative lifecycle delta", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(ordinaryArticlePath, { waitUntil: "networkidle" })
  await expect(page.locator("canvas")).toHaveCount(0)

  // Import p5 once before taking the per-instance baseline. Its ESM bootstrap
  // installs one immutable set of browser event handlers; modules cannot be
  // unloaded during SPA navigation, so the leak gate must distinguish that
  // one-time module state from listeners owned by each canvas instance.
  await page.getByTestId("article-previous").click()
  await expect(page).toHaveURL(/\/articles\/opening-night/)
  await expect(page.getByTestId("creative-runtime")).toHaveCount(2)
  await expect.poll(async () => (await lifecycleSnapshot(page)).creativeIntersectionTargets).toBe(4)
  await page.getByTestId("generative-canvas").first().scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0)
  await expect
    .poll(async () => (await lifecycleSnapshot(page)).creativeResizeTargets)
    .toBeGreaterThan(0)
  await page.getByTestId("article-next").click()
  await expect(page).toHaveURL(/\/articles\/courtside-notes/)
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.locator("canvas")).toHaveCount(0)
  // NuxtLink may legitimately keep one visibility-prefetch observer on a connected,
  // below-fold footer link. The creative leak gate must reject observer ownership by
  // an unmounted runtime and every detached target without treating that framework
  // observer as a per-canvas leak.
  await expect
    .poll(async () => {
      const snapshot = await lifecycleSnapshot(page)
      return {
        creativeIntersectionTargets: snapshot.creativeIntersectionTargets,
        detachedIntersectionTargets: snapshot.detachedIntersectionTargets,
        creativeResizeTargets: snapshot.creativeResizeTargets,
        detachedResizeTargets: snapshot.detachedResizeTargets
      }
    })
    .toEqual({
      creativeIntersectionTargets: 0,
      detachedIntersectionTargets: 0,
      creativeResizeTargets: 0,
      detachedResizeTargets: 0
    })
  const baseline = await lifecycleSnapshot(page)

  for (let switchIndex = 1; switchIndex <= 20; switchIndex += 1) {
    const enteringCreative = switchIndex % 2 === 1
    await page.getByTestId(enteringCreative ? "article-previous" : "article-next").click()
    await expect(page).toHaveURL(
      enteringCreative ? /\/articles\/opening-night/ : /\/articles\/courtside-notes/
    )
    if (enteringCreative) {
      // The creative hosts exist in the SSR document, but p5 must stay outside the
      // initial route payload and must not mount while the blocks are below the fold.
      await expect(page.getByTestId("creative-runtime")).toHaveCount(2)
      await expect(page.locator("canvas")).toHaveCount(0)

      await page.getByTestId("generative-canvas").first().scrollIntoViewIfNeeded()
      await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0)
      expect(await page.locator("canvas").count()).toBeLessThanOrEqual(2)
      expect(await runningCanvasCount(page)).toBeLessThanOrEqual(1)
    } else {
      await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
      await expect(page.locator("canvas")).toHaveCount(0)
    }
  }

  await expect(page).toHaveURL(/\/articles\/courtside-notes/)
  const baselineListenerCounts = baseline.globalListenerTypes.reduce(
    (counts, type) => counts.set(type, (counts.get(type) ?? 0) + 1),
    new Map<string, number>()
  )
  // A completed cleanup may legitimately release framework observers and queued
  // animation frames that were present in the baseline. A leak is an increase,
  // or any retained creative/detached target, so compare positive deltas rather
  // than requiring transient global scheduler state to remain byte-for-byte equal.
  await expect
    .poll(async () => {
      const snapshot = await lifecycleSnapshot(page)
      const finalListenerCounts = snapshot.globalListenerTypes.reduce(
        (counts, type) => counts.set(type, (counts.get(type) ?? 0) + 1),
        new Map<string, number>()
      )
      const unexpectedListenerTypeDelta = Array.from(finalListenerCounts).reduce(
        (total, [type, count]) =>
          total + Math.max(0, count - (baselineListenerCounts.get(type) ?? 0)),
        0
      )
      return {
        globalListenerDelta: Math.max(0, snapshot.globalListeners - baseline.globalListeners),
        unexpectedListenerTypeDelta,
        intervalDelta: Math.max(0, snapshot.intervals - baseline.intervals),
        animationFrameDelta: Math.max(0, snapshot.animationFrames - baseline.animationFrames),
        intersectionTargetDelta: Math.max(
          0,
          snapshot.intersectionTargets - baseline.intersectionTargets
        ),
        creativeIntersectionTargets: snapshot.creativeIntersectionTargets,
        detachedIntersectionTargets: snapshot.detachedIntersectionTargets,
        resizeTargetDelta: Math.max(0, snapshot.resizeTargets - baseline.resizeTargets),
        creativeResizeTargets: snapshot.creativeResizeTargets,
        detachedResizeTargets: snapshot.detachedResizeTargets
      }
    })
    .toEqual({
      globalListenerDelta: 0,
      unexpectedListenerTypeDelta: 0,
      intervalDelta: 0,
      animationFrameDelta: 0,
      intersectionTargetDelta: 0,
      creativeIntersectionTargets: 0,
      detachedIntersectionTargets: 0,
      resizeTargetDelta: 0,
      creativeResizeTargets: 0,
      detachedResizeTargets: 0
    })
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
    return source.includes("courtside-p5-core-color-shape") && source.includes("createCanvas")
  })
  expect(candidates).toHaveLength(1)
  return candidates[0] ?? "missing-p5-chunk"
}

async function runningCanvasCount(page: Page): Promise<number> {
  return page
    .getByTestId("creative-runtime")
    .evaluateAll(
      (runtimes) =>
        runtimes.filter((runtime) => runtime.getAttribute("data-runtime-status") === "running")
          .length
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
    type GlobalListenerRecord = {
      target: EventTarget
      type: string
      listener: EventListenerOrEventListenerObject | null
      nativeListener: EventListenerOrEventListenerObject
      capture: boolean
      signal: AbortSignal | null
      abortHandler: EventListener | null
    }
    const globalListenerRecords: GlobalListenerRecord[] = []
    const intervalIds = new Set<number>()
    const animationFrameIds = new Set<number>()
    const intersectionTargetCounts = new Map<Element, number>()
    const resizeTargetCounts = new Map<Element, number>()
    let intersectionTargets = 0
    let resizeTargets = 0

    const updateTargetCount = (
      counts: Map<Element, number>,
      target: Element,
      delta: 1 | -1
    ): void => {
      const nextCount = (counts.get(target) ?? 0) + delta
      if (nextCount > 0) {
        counts.set(target, nextCount)
      } else {
        counts.delete(target)
      }
    }

    const matchingTargetCount = (
      counts: Map<Element, number>,
      predicate: (target: Element) => boolean
    ): number =>
      Array.from(counts.entries()).reduce(
        (total, [target, count]) => total + (predicate(target) ? count : 0),
        0
      )

    const originalAddEventListener = EventTarget.prototype.addEventListener
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener
    const removeGlobalListenerRecord = (
      record: GlobalListenerRecord,
      removeNativeListener: boolean
    ): void => {
      const index = globalListenerRecords.indexOf(record)
      if (index < 0) {
        return
      }
      globalListenerRecords.splice(index, 1)
      if (removeNativeListener) {
        originalRemoveEventListener.call(
          record.target,
          record.type,
          record.nativeListener,
          record.capture
        )
      }
      if (record.signal && record.abortHandler) {
        originalRemoveEventListener.call(record.signal, "abort", record.abortHandler)
      }
    }
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void {
      const capture = typeof options === "boolean" ? options : options?.capture === true
      if ((this !== window && this !== document) || listener === null) {
        originalAddEventListener.call(this, type, listener, options)
        return
      }
      const existing = globalListenerRecords.find(
        (record) =>
          record.target === this &&
          record.type === type &&
          record.listener === listener &&
          record.capture === capture
      )
      if (existing) {
        originalAddEventListener.call(this, type, existing.nativeListener, options)
        return
      }
      const once = typeof options !== "boolean" && options?.once === true
      const signal = typeof options !== "boolean" ? (options?.signal ?? null) : null
      if (signal?.aborted) {
        originalAddEventListener.call(this, type, listener, options)
        return
      }
      const record: GlobalListenerRecord = {
        target: this,
        type,
        listener,
        nativeListener: listener,
        capture,
        signal,
        abortHandler: null
      }
      if (once) {
        record.nativeListener = (event: Event) => {
          removeGlobalListenerRecord(record, false)
          if (typeof listener === "function") {
            listener.call(this, event)
          } else {
            listener.handleEvent(event)
          }
        }
      }
      originalAddEventListener.call(this, type, record.nativeListener, options)
      globalListenerRecords.push(record)
      if (signal) {
        record.abortHandler = () => removeGlobalListenerRecord(record, true)
        originalAddEventListener.call(signal, "abort", record.abortHandler, { once: true })
      }
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
        const record = globalListenerRecords[index]
        if (record) {
          removeGlobalListenerRecord(record, true)
        }
        return
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
          updateTargetCount(intersectionTargetCounts, target, 1)
        }
        targets.set(this, observed)
        originalObserve.call(this, target)
      }
      IntersectionObserver.prototype.unobserve = function (target: Element): void {
        const observed = targets.get(this)
        if (observed?.delete(target)) {
          intersectionTargets -= 1
          updateTargetCount(intersectionTargetCounts, target, -1)
        }
        originalUnobserve.call(this, target)
      }
      IntersectionObserver.prototype.disconnect = function (): void {
        const observed = targets.get(this)
        if (observed) {
          intersectionTargets -= observed.size
          for (const target of observed) {
            updateTargetCount(intersectionTargetCounts, target, -1)
          }
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
          updateTargetCount(resizeTargetCounts, target, 1)
        }
        targets.set(this, observed)
        originalObserve.call(this, target, options)
      }
      ResizeObserver.prototype.unobserve = function (target: Element): void {
        const observed = targets.get(this)
        if (observed?.delete(target)) {
          resizeTargets -= 1
          updateTargetCount(resizeTargetCounts, target, -1)
        }
        originalUnobserve.call(this, target)
      }
      ResizeObserver.prototype.disconnect = function (): void {
        const observed = targets.get(this)
        if (observed) {
          resizeTargets -= observed.size
          for (const target of observed) {
            updateTargetCount(resizeTargetCounts, target, -1)
          }
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
        globalListenerTypes: globalListenerRecords
          .map((record) => `${record.target === window ? "window" : "document"}:${record.type}`)
          .sort(),
        intervals: intervalIds.size,
        animationFrames: animationFrameIds.size,
        intersectionTargets,
        creativeIntersectionTargets: matchingTargetCount(
          intersectionTargetCounts,
          (target) => target.getAttribute("data-testid") === "creative-runtime"
        ),
        detachedIntersectionTargets: matchingTargetCount(
          intersectionTargetCounts,
          (target) => !target.isConnected
        ),
        resizeTargets,
        creativeResizeTargets: matchingTargetCount(
          resizeTargetCounts,
          (target) => target.getAttribute("data-testid") === "creative-runtime"
        ),
        detachedResizeTargets: matchingTargetCount(
          resizeTargetCounts,
          (target) => !target.isConnected
        )
      })
    }
  })
}
