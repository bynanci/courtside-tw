import { spawnSync } from "node:child_process"

import { chromium, expect } from "@playwright/test"

import {
  androidCommandTimeoutMilliseconds,
  boundedAndroidPollDelay,
  captureChromeSurfaceProbeBoundaryWithActivityAcquisition,
  classifyAndroidActivityLine,
  classifyAndroidActivityProbeResult,
  classifyChromeAutomationSurface,
  acquireChromeForegroundActivityAtBoundary,
  connectNativeAndroidBrowser,
  establishNativeAndroidBackgroundBoundary,
  evaluateAndroidBackgroundTimeline,
  evaluateAndroidForegroundFrameTimeline,
  executeBoundChromeSurfaceTap,
  normalizeChromeAutomationSurfaceWithinDeadline,
  normalizeBrowserRuntimeSnapshot,
  parseAndroidDisplaySize,
  readBoundChromeSurfaceActivityReceipt,
  requireAndroidActivityAtBoundary,
  retainFirstPausedSnapshot
} from "./android-creative-timeline.mjs"

const ARTICLE_URL = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
const ANDROID_ACTIVITY_POLL_MILLISECONDS = 25
const ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS = 250
const ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT = 64
const ANDROID_GUEST_QUIESCENCE_TIMEOUT_MILLISECONDS = 30_000
const ANDROID_GUEST_PACKAGE_HANDLER_TIMEOUT_MILLISECONDS = 15_000
const BROWSER_QUIESCENCE_TIMEOUT_MILLISECONDS = 10_000
const BROWSER_QUIESCENCE_MAX_FRAME_GAP_MILLISECONDS = 200
const BROWSER_QUIESCENCE_CONSECUTIVE_FRAMES = 5
const CHROME_AUTOMATION_POLL_MILLISECONDS = 100
const CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS = 5_000
const CHROME_AUTOMATION_SETTLE_TIMEOUT_MILLISECONDS = 10_000
const EXPECTED_ANDROID_DISPLAY = Object.freeze({ width: 1080, height: 2400 })
const BUDGETS = Object.freeze({
  domContentLoadedMilliseconds: 5_000,
  creativeFirstRunningMilliseconds: 3_500,
  offscreenPauseMilliseconds: 2_000,
  backgroundEventPauseMilliseconds: 2_500,
  operatingSystemBackgroundMilliseconds: 5_000,
  foregroundObservationMilliseconds: 500,
  backgroundObservationMilliseconds: 1_500,
  minimumForegroundFrames: 5,
  maximumBackgroundFrames: 2,
  maximumRunningCanvases: 1,
  maximumLongTaskMilliseconds: 500,
  maximumTotalLongTaskMilliseconds: 1_800
})

const browser = await connectNativeAndroidBrowser(
  chromium.connectOverCDP.bind(chromium),
  "http://127.0.0.1:9222"
)
let phase = "connect"

try {
  const context = browser.contexts()[0]
  if (!context) throw new Error("Android Chrome did not expose a browser context")

  if (typeof context.unrouteAll === "function") {
    await context.unrouteAll({ behavior: "ignoreErrors" })
  }

  await context.addInitScript(() => {
    window.__courtsideT079AndroidLongTasks = []
    if (typeof PerformanceObserver === "undefined") return

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__courtsideT079AndroidLongTasks.push({
            duration: entry.duration,
            startTime: entry.startTime
          })
        }
      })
      observer.observe({ type: "longtask", buffered: true })
    } catch {
      // The optional Long Task API may be unavailable in a particular Chrome build.
    }
  })

  phase = "navigate"
  const page = context.pages()[0] ?? (await context.newPage())
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(ARTICLE_URL, { waitUntil: "networkidle", timeout: 60_000 })

  const device = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints
  }))

  if (!/Android/i.test(device.userAgent)) {
    throw new Error(`T079 must run in Android Chrome, received: ${device.userAgent}`)
  }

  await markPhase(page, "initial-native-surface")
  const initialNativeSurface = await normalizeChromeContentSurface()
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0]
    if (!entry) throw new Error("Android NavigationTiming entry is missing")

    return {
      domContentLoadedMilliseconds: entry.domContentLoadedEventEnd,
      loadMilliseconds: entry.loadEventEnd,
      resourceCount: performance.getEntriesByType("resource").length,
      transferBytes: performance
        .getEntriesByType("resource")
        .reduce((total, resource) => total + (resource.transferSize || 0), 0)
    }
  })

  assertAtMost(
    navigation.domContentLoadedMilliseconds,
    BUDGETS.domContentLoadedMilliseconds,
    "Android DOMContentLoaded"
  )

  const runtimes = page.getByTestId("creative-runtime")
  await expect(runtimes).toHaveCount(2)
  const firstRuntime = runtimes.first()

  await markPhase(page, "creative-preload")
  const creativePreload = await preloadCreativeRuntime(page, firstRuntime)
  process.stdout.write(
    `${JSON.stringify({ phase: "T079 Android creative preload", creativePreload }, null, 2)}\n`
  )

  await markPhase(page, "android-guest-quiescence")
  const androidGuestQuiescence = waitForAndroidGuestQuiescence()
  process.stdout.write(
    `${JSON.stringify(
      { phase: "T079 Android guest quiescence", androidGuestQuiescence },
      null,
      2
    )}\n`
  )

  await markPhase(page, "browser-quiescence")
  const browserQuiescence = await waitForBrowserMainThreadQuiescence(page)
  process.stdout.write(
    `${JSON.stringify({ phase: "T079 Android browser quiescence", browserQuiescence }, null, 2)}\n`
  )

  const preCreativeLongTasks = await page.evaluate(
    () => window.__courtsideT079AndroidLongTasks ?? []
  )
  const creativeLongTaskWindowStartedAt = await page.evaluate(() => {
    window.__courtsideT079AndroidLongTasks = []
    window.__courtsideT079AndroidPhaseTimeline = []
    return performance.now()
  })

  await markPhase(page, "creative-first-running")
  const creativeStart = performance.now()
  await firstRuntime.scrollIntoViewIfNeeded()
  await expect
    .poll(() => firstRuntime.getAttribute("data-runtime-status"), { timeout: 10_000 })
    .toBe("running")
  const creativeFirstRunningMilliseconds = performance.now() - creativeStart

  assertAtMost(
    creativeFirstRunningMilliseconds,
    BUDGETS.creativeFirstRunningMilliseconds,
    "Android creative first running"
  )

  const initialRuntimeSnapshot = await captureRuntimeSnapshot(page, 0)
  assertActiveRuntimeSnapshot(initialRuntimeSnapshot, "Android initial runtime")
  const initialRunningCanvases = initialRuntimeSnapshot.runningCount

  await markPhase(page, "offscreen-reaction")
  const offscreen = await measureOffscreenPause(page, 0)
  assertAtMost(
    offscreen.reactionMilliseconds,
    BUDGETS.offscreenPauseMilliseconds,
    "Android offscreen reaction"
  )

  await firstRuntime.scrollIntoViewIfNeeded()
  await waitForActiveRuntimeSnapshot(page, 0, 10_000)

  await markPhase(page, "background-event-reaction")
  const backgroundEvent = await measureBackgroundEventPause(page, 0)
  assertAtMost(
    backgroundEvent.reactionMilliseconds,
    BUDGETS.backgroundEventPauseMilliseconds,
    "Android background-event reaction"
  )
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await waitForActiveRuntimeSnapshot(page, 0, 10_000)

  await markPhase(page, "foreground-native-surface")
  const foregroundNativeSurface = await normalizeChromeContentSurface()
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await waitForActiveRuntimeSnapshot(page, 0, 10_000)

  await markPhase(page, "foreground-frame-observation")
  const foregroundFrameTimeline = await observeForegroundFrameTimeline(
    page,
    0,
    5_000,
    BUDGETS.foregroundObservationMilliseconds
  )
  const foregroundNativeSurfaceBoundary = await requireClearChromeContentSurface()
  const foregroundFrames = evaluateAndroidForegroundFrameTimeline(foregroundFrameTimeline, BUDGETS)

  await markPhase(page, "creative-long-task-budget")
  const creativeMeasurement = await page.evaluate(() => ({
    longTasks: window.__courtsideT079AndroidLongTasks ?? [],
    phaseTimeline: window.__courtsideT079AndroidPhaseTimeline ?? []
  }))
  const creativeLongTasks = creativeMeasurement.longTasks
  const longestLongTaskMilliseconds = creativeLongTasks.reduce(
    (maximum, entry) => Math.max(maximum, Number(entry.duration) || 0),
    0
  )
  const totalLongTaskMilliseconds = creativeLongTasks.reduce(
    (total, entry) => total + (Number(entry.duration) || 0),
    0
  )

  const longTaskWindows = {
    preCreative: summarizeLongTasks(preCreativeLongTasks),
    creative: {
      windowStartedAt: creativeLongTaskWindowStartedAt,
      phaseTimeline: creativeMeasurement.phaseTimeline,
      ...summarizeLongTasks(creativeLongTasks, creativeMeasurement.phaseTimeline)
    }
  }
  process.stdout.write(
    `${JSON.stringify({ phase: "T079 Android long-task windows", longTaskWindows }, null, 2)}\n`
  )

  assertAtMost(
    longestLongTaskMilliseconds,
    BUDGETS.maximumLongTaskMilliseconds,
    "Android longest long task"
  )
  assertAtMost(
    totalLongTaskMilliseconds,
    BUDGETS.maximumTotalLongTaskMilliseconds,
    "Android total long-task time"
  )

  phase = "android-os-background"
  const operatingSystemBackground = await verifyAndroidOperatingSystemBackground(page, 0)
  process.stdout.write(
    `${JSON.stringify({ phase: "T079 Android OS background", operatingSystemBackground }, null, 2)}\n`
  )
  assertAtMost(
    operatingSystemBackground.activityTransitionMilliseconds,
    BUDGETS.operatingSystemBackgroundMilliseconds,
    "Android operating-system background transition"
  )
  assertAtMost(
    operatingSystemBackground.postPauseFrames,
    BUDGETS.maximumBackgroundFrames,
    "Android post-pause creative frames"
  )

  phase = "complete"
  const result = {
    result: "PASS",
    environment: {
      browser: "Android Chrome",
      emulatorProfile: "Pixel 7",
      apiLevel: 35,
      device
    },
    budgets: BUDGETS,
    navigation,
    creative: {
      firstRunningMilliseconds: creativeFirstRunningMilliseconds,
      initialRunningCanvases,
      offscreenPauseMilliseconds: offscreen.reactionMilliseconds,
      offscreenTransitionMilliseconds: offscreen.commandToOffscreenMilliseconds,
      offscreenTotalMilliseconds: offscreen.totalMilliseconds,
      offscreenScrollBehavior: "auto",
      offscreenMeasurementClock: "window.performance",
      backgroundPauseMilliseconds: backgroundEvent.reactionMilliseconds,
      backgroundSignal: backgroundEvent.signal,
      backgroundEvent,
      androidGuestQuiescence,
      browserQuiescence,
      creativePreload,
      initialNativeSurface,
      foregroundNativeSurface,
      foregroundNativeSurfaceBoundary,
      foregroundFrames,
      operatingSystemBackground,
      longTasks: {
        windowStartedAt: creativeLongTaskWindowStartedAt,
        count: creativeLongTasks.length,
        longestMilliseconds: longestLongTaskMilliseconds,
        totalMilliseconds: totalLongTaskMilliseconds,
        entries: creativeLongTasks
      },
      preCreativeLongTasks: longTaskWindows.preCreative
    }
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  const failure = {
    result: "FAIL",
    phase,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null
  }
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`)
  throw error
} finally {
  await browser.close()
}

function waitForAndroidGuestQuiescence() {
  const startedAt = performance.now()
  const deadlineAt = startedAt + ANDROID_GUEST_QUIESCENCE_TIMEOUT_MILLISECONDS
  const steps = [
    {
      name: "package-main-before-barriers",
      arguments: ["shell", "pm", "wait-for-handler"],
      packageHandler: true
    },
    {
      name: "package-background-before-barriers",
      arguments: ["shell", "pm", "wait-for-background-handler"],
      packageHandler: true
    },
    {
      name: "broadcast-barrier",
      arguments: [
        "shell",
        "am",
        "wait-for-broadcast-barrier",
        "--flush-broadcast-loopers",
        "--flush-application-threads"
      ],
      packageHandler: false
    },
    {
      name: "application-barrier",
      arguments: ["shell", "am", "wait-for-application-barrier"],
      packageHandler: false
    },
    {
      name: "package-main-after-barriers",
      arguments: ["shell", "pm", "wait-for-handler"],
      packageHandler: true
    },
    {
      name: "package-background-after-barriers",
      arguments: ["shell", "pm", "wait-for-background-handler"],
      packageHandler: true
    },
    {
      name: "closing-broadcast-barrier",
      arguments: [
        "shell",
        "am",
        "wait-for-broadcast-barrier",
        "--flush-broadcast-loopers",
        "--flush-application-threads"
      ],
      packageHandler: false
    },
    {
      name: "closing-application-barrier",
      arguments: ["shell", "am", "wait-for-application-barrier"],
      packageHandler: false
    }
  ]
  const receipts = []

  for (const step of steps) {
    const maximumMilliseconds = step.packageHandler
      ? ANDROID_GUEST_PACKAGE_HANDLER_TIMEOUT_MILLISECONDS
      : ANDROID_GUEST_QUIESCENCE_TIMEOUT_MILLISECONDS
    const timeoutMilliseconds = androidCommandTimeoutMilliseconds(
      deadlineAt,
      performance.now(),
      maximumMilliseconds
    )
    if (timeoutMilliseconds <= 1_000) {
      throw new Error(
        `Android guest quiescence exhausted its shared deadline before ${step.name}: ` +
          `${JSON.stringify({ startedAt, deadlineAt, receipts })}`
      )
    }

    const arguments_ = step.packageHandler
      ? [
          ...step.arguments,
          "--timeout",
          String(
            Math.min(
              ANDROID_GUEST_PACKAGE_HANDLER_TIMEOUT_MILLISECONDS,
              timeoutMilliseconds - 1_000
            )
          )
        ]
      : step.arguments
    const commandStartedAt = performance.now()
    const output = adbWithTimeout(timeoutMilliseconds, ...arguments_).trim()
    const completedAt = performance.now()
    if (completedAt >= deadlineAt) {
      throw new Error(
        `Android guest quiescence completed ${step.name} after its shared deadline: ` +
          `${JSON.stringify({ startedAt, deadlineAt, completedAt, receipts })}`
      )
    }
    receipts.push({
      name: step.name,
      arguments: arguments_,
      startedAt: commandStartedAt,
      completedAt,
      durationMilliseconds: completedAt - commandStartedAt,
      timeoutMilliseconds,
      output
    })
  }

  const completedAt = performance.now()
  return {
    startedAt,
    completedAt,
    deadlineAt,
    durationMilliseconds: completedAt - startedAt,
    timeoutMilliseconds: ANDROID_GUEST_QUIESCENCE_TIMEOUT_MILLISECONDS,
    steps: receipts
  }
}

function waitForBrowserMainThreadQuiescence(page) {
  return page.evaluate(
    ({ timeoutMilliseconds, maximumFrameGapMilliseconds, requiredConsecutiveFrames }) =>
      new Promise((resolve, reject) => {
        const startedAt = performance.now()
        const deadlineAt = startedAt + timeoutMilliseconds
        const frameGaps = []
        let previousFrameAt = null
        let consecutiveFrames = 0
        let animationFrame = null
        let settled = false

        const cleanup = () => {
          clearTimeout(timeout)
          if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        }
        const fail = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(
            new Error(
              `Android browser main thread did not become quiescent: ` +
                `${JSON.stringify({ deadlineAt, frameGaps, consecutiveFrames })}`
            )
          )
        }
        const timeout = setTimeout(fail, timeoutMilliseconds)
        const sample = (frameAt) => {
          if (settled) return
          if (previousFrameAt !== null) {
            const frameGap = frameAt - previousFrameAt
            frameGaps.push(frameGap)
            if (frameGaps.length > 64) frameGaps.shift()
            consecutiveFrames = frameGap <= maximumFrameGapMilliseconds ? consecutiveFrames + 1 : 0
            if (consecutiveFrames >= requiredConsecutiveFrames) {
              settled = true
              cleanup()
              resolve({
                startedAt,
                completedAt: frameAt,
                deadlineAt,
                durationMilliseconds: frameAt - startedAt,
                maximumFrameGapMilliseconds,
                requiredConsecutiveFrames,
                consecutiveFrames,
                frameGaps
              })
              return
            }
          }
          previousFrameAt = frameAt
          if (frameAt >= deadlineAt) {
            fail()
            return
          }
          animationFrame = requestAnimationFrame(sample)
        }

        animationFrame = requestAnimationFrame(sample)
      }),
    {
      timeoutMilliseconds: BROWSER_QUIESCENCE_TIMEOUT_MILLISECONDS,
      maximumFrameGapMilliseconds: BROWSER_QUIESCENCE_MAX_FRAME_GAP_MILLISECONDS,
      requiredConsecutiveFrames: BROWSER_QUIESCENCE_CONSECUTIVE_FRAMES
    }
  )
}

function measureOffscreenPause(page, targetIndex) {
  return page.evaluate(
    ({ index }) =>
      new Promise((resolve, reject) => {
        const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
        const target = runtimes[index]
        if (!target) {
          reject(new Error(`Creative runtime ${index} is missing`))
          return
        }
        const snapshot = () => ({
          at: Date.now(),
          frame: Number(target.getAttribute("data-runtime-frame")),
          runningCount: runtimes.filter(
            (runtime) => runtime.getAttribute("data-runtime-status") === "running"
          ).length,
          targetStatus: target.getAttribute("data-runtime-status") ?? "missing"
        })
        const activeSnapshot = snapshot()
        if (activeSnapshot.runningCount !== 1 || activeSnapshot.targetStatus !== "running") {
          reject(
            new Error(
              `Creative runtime must be the only running canvas before offscreen measurement; ` +
                `snapshot=${JSON.stringify(activeSnapshot)}`
            )
          )
          return
        }

        document.documentElement.style.scrollBehavior = "auto"
        const commandAt = performance.now()
        let offscreenAt = null
        let pauseSnapshot = null
        let settled = false

        const cleanup = () => {
          observer.disconnect()
          window.removeEventListener("scroll", inspect)
          clearTimeout(timeout)
        }
        const finish = () => {
          if (settled || offscreenAt === null || pauseSnapshot === null) return
          settled = true
          cleanup()
          resolve({
            activeSnapshot,
            pauseSnapshot,
            commandToOffscreenMilliseconds: Math.max(0, offscreenAt - commandAt),
            reactionMilliseconds: Math.max(0, pauseSnapshot.performanceAt - offscreenAt),
            totalMilliseconds: Math.max(0, pauseSnapshot.performanceAt - commandAt),
            finalStatus: pauseSnapshot.targetStatus
          })
        }
        const inspect = () => {
          const rectangle = target.getBoundingClientRect()
          const outside = rectangle.bottom <= 0 || rectangle.top >= window.innerHeight
          if (outside && offscreenAt === null) {
            offscreenAt = performance.now()
          }
          if (outside && pauseSnapshot === null) {
            const observed = snapshot()
            if (observed.runningCount === 0 && observed.targetStatus === "paused") {
              pauseSnapshot = { ...observed, performanceAt: performance.now() }
            }
          }
          finish()
        }
        const observer = new MutationObserver(inspect)
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(
            new Error(
              `Creative runtimes did not fully pause after the target became offscreen; ` +
                `snapshot=${JSON.stringify(snapshot())}`
            )
          )
        }, 10_000)

        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-runtime-status"],
          subtree: true
        })
        window.addEventListener("scroll", inspect, { passive: true })
        window.scrollTo({ top: 0, left: 0, behavior: "auto" })
        inspect()
        requestAnimationFrame(inspect)
      }),
    { index: targetIndex }
  )
}

async function preloadCreativeRuntime(page, runtime) {
  const placement = await runtime.evaluate((element) => {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const rectangle = element.getBoundingClientRect()
    const originalInlineTransform = element.style.transform
    const originalComputedTransform = getComputedStyle(element).transform
    if (originalComputedTransform !== "none") {
      throw new Error(
        `Android creative preload requires an untransformed host, received: ${originalComputedTransform}`
      )
    }
    const preloadGap = Math.max(32, Math.min(96, Math.floor(viewportHeight / 8)))
    const translateY = viewportHeight + preloadGap - rectangle.top
    element.style.transform = `translateY(${translateY}px)`
    return {
      originalInlineTransform,
      originalComputedTransform,
      originalTop: rectangle.top,
      preloadGap,
      translateY
    }
  })

  let receipt
  try {
    await expect
      .poll(() => runtime.getAttribute("data-runtime-near-viewport"), { timeout: 10_000 })
      .toBe("true")
    await expect
      .poll(() => runtime.getAttribute("data-runtime-status"), { timeout: 10_000 })
      .toBe("paused")

    receipt = await captureCreativePreloadReceipt(runtime, placement)
    if (
      receipt.nearViewport !== "true" ||
      receipt.status !== "paused" ||
      receipt.visibleHeight !== 0 ||
      receipt.top < receipt.viewportHeight ||
      receipt.top >= receipt.viewportHeight * 2 ||
      receipt.canvasCount !== 0 ||
      receipt.runningCount !== 0
    ) {
      throw new Error(`Android creative preload boundary is invalid: ${JSON.stringify(receipt)}`)
    }
  } finally {
    await runtime.evaluate((element, placement) => {
      element.style.transform = placement.originalInlineTransform
    }, placement)
  }

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
  )
  const restored = await captureCreativePreloadReceipt(runtime, placement)
  if (
    restored.inlineTransform !== placement.originalInlineTransform ||
    restored.visibleHeight !== 0 ||
    restored.canvasCount !== 0 ||
    restored.runningCount !== 0
  ) {
    throw new Error(`Android creative preload restoration is invalid: ${JSON.stringify(restored)}`)
  }

  return { ...receipt, restored }
}

function captureCreativePreloadReceipt(runtime, placement) {
  return runtime.evaluate((element, requestedPlacement) => {
    const rectangle = element.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const visibleHeight = Math.max(
      0,
      Math.min(rectangle.bottom, viewportHeight) - Math.max(rectangle.top, 0)
    )
    return {
      ...requestedPlacement,
      viewportHeight,
      top: rectangle.top,
      bottom: rectangle.bottom,
      visibleHeight,
      nearViewport: element.getAttribute("data-runtime-near-viewport"),
      status: element.getAttribute("data-runtime-status"),
      inlineTransform: element.style.transform,
      canvasCount: element.querySelectorAll("canvas").length,
      runningCount: document.querySelectorAll(
        '[data-testid="creative-runtime"][data-runtime-status="running"]'
      ).length
    }
  }, placement)
}

function measureBackgroundEventPause(page, targetIndex) {
  return page.evaluate(
    ({ index }) =>
      new Promise((resolve, reject) => {
        const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
        const target = runtimes[index]
        if (!target) {
          reject(new Error(`Creative runtime ${index} is missing`))
          return
        }
        const snapshot = () => ({
          at: Date.now(),
          frame: Number(target.getAttribute("data-runtime-frame")),
          runningCount: runtimes.filter(
            (runtime) => runtime.getAttribute("data-runtime-status") === "running"
          ).length,
          targetStatus: target.getAttribute("data-runtime-status") ?? "missing"
        })
        const activeSnapshot = snapshot()
        if (activeSnapshot.runningCount !== 1 || activeSnapshot.targetStatus !== "running") {
          reject(
            new Error(
              `Creative runtime must be the only running canvas before blur measurement; ` +
                `snapshot=${JSON.stringify(activeSnapshot)}`
            )
          )
          return
        }

        const signalAt = performance.now()
        let settled = false

        const cleanup = () => {
          observer.disconnect()
          clearTimeout(timeout)
        }
        const inspect = () => {
          if (settled) return
          const pauseSnapshot = snapshot()
          if (pauseSnapshot.runningCount !== 0 || pauseSnapshot.targetStatus !== "paused") return
          settled = true
          const pausedAt = performance.now()
          cleanup()
          resolve({
            activeSnapshot,
            pauseSnapshot,
            signal: "window.blur test event",
            reactionMilliseconds: Math.max(0, pausedAt - signalAt),
            finalStatus: pauseSnapshot.targetStatus
          })
        }
        const observer = new MutationObserver(inspect)
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(
            new Error(
              `Android background-event handler did not pause every runtime; ` +
                `snapshot=${JSON.stringify(snapshot())}`
            )
          )
        }, 10_000)

        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-runtime-status"],
          subtree: true
        })
        window.dispatchEvent(new Event("blur"))
        inspect()
      }),
    { index: targetIndex }
  )
}

async function captureRuntimeSnapshot(page, targetIndex) {
  return page.evaluate((index) => {
    const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
    const target = runtimes[index]
    if (!target) throw new Error(`Creative runtime ${index} is missing`)
    return {
      at: Date.now(),
      frame: Number(target.getAttribute("data-runtime-frame")),
      runningCount: runtimes.filter(
        (runtime) => runtime.getAttribute("data-runtime-status") === "running"
      ).length,
      targetStatus: target.getAttribute("data-runtime-status") ?? "missing"
    }
  }, targetIndex)
}

function assertActiveRuntimeSnapshot(snapshot, label) {
  if (
    snapshot.runningCount !== BUDGETS.maximumRunningCanvases ||
    BUDGETS.maximumRunningCanvases !== 1 ||
    snapshot.targetStatus !== "running"
  ) {
    throw new Error(`${label} must contain exactly one running canvas: ${JSON.stringify(snapshot)}`)
  }
}

function assertPausedRuntimeSnapshot(snapshot, label) {
  if (snapshot.runningCount !== 0 || snapshot.targetStatus !== "paused") {
    throw new Error(`${label} must contain zero running canvases: ${JSON.stringify(snapshot)}`)
  }
}

async function waitForActiveRuntimeSnapshot(page, targetIndex, timeoutMilliseconds) {
  const deadline = performance.now() + timeoutMilliseconds
  let snapshot = await captureRuntimeSnapshot(page, targetIndex)
  while (
    performance.now() < deadline &&
    (snapshot.runningCount !== 1 || snapshot.targetStatus !== "running")
  ) {
    const remainingMilliseconds = deadline - performance.now()
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        boundedAndroidPollDelay(remainingMilliseconds, ANDROID_ACTIVITY_POLL_MILLISECONDS)
      )
    )
    snapshot = await captureRuntimeSnapshot(page, targetIndex)
  }
  assertActiveRuntimeSnapshot(snapshot, "Android active runtime")
  return snapshot
}

function requireRemainingAutomationMilliseconds(deadline, maximumMilliseconds, label) {
  const timeoutMilliseconds = androidCommandTimeoutMilliseconds(
    deadline,
    performance.now(),
    maximumMilliseconds
  )
  if (timeoutMilliseconds === 0) {
    throw new Error(`Android Chrome ${label} exceeded the shared automation deadline`)
  }
  return timeoutMilliseconds
}

function probeChromeContentSurface(deadline) {
  const startedAt = performance.now()
  const displaySize = requireExpectedAndroidDisplaySize(deadline)
  const probeTimeoutMilliseconds = requireRemainingAutomationMilliseconds(
    deadline,
    CHROME_AUTOMATION_SETTLE_TIMEOUT_MILLISECONDS,
    "UIAutomator probe"
  )
  const result = spawnSync("adb", ["exec-out", "uiautomator", "dump", "/dev/tty"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: probeTimeoutMilliseconds
  })
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(
      `Android Chrome UIAutomator probe timed out after ${probeTimeoutMilliseconds} ms`
    )
  }
  if (result.status !== 0) {
    throw new Error(
      `Android Chrome UIAutomator probe failed: ` +
        `${result.stderr || result.stdout || result.error?.message || result.status}`
    )
  }
  const hierarchy = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  return {
    ...classifyChromeAutomationSurface(hierarchy, displaySize),
    probeMilliseconds: performance.now() - startedAt,
    hierarchyBytes: Buffer.byteLength(hierarchy),
    displaySize
  }
}

function requireExpectedAndroidDisplaySize(deadline) {
  const displaySize = parseAndroidDisplaySize(
    adbWithTimeout(
      requireRemainingAutomationMilliseconds(
        deadline,
        CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS,
        "display probe"
      ),
      "shell",
      "wm",
      "size"
    )
  )
  if (
    displaySize.width !== EXPECTED_ANDROID_DISPLAY.width ||
    displaySize.height !== EXPECTED_ANDROID_DISPLAY.height
  ) {
    throw new Error(
      `Android display does not match the pinned Pixel 7 profile: ` +
        `${displaySize.width}x${displaySize.height}`
    )
  }
  return displaySize
}

function acquireChromeSurfaceActivityWithinDeadline(deadline, label) {
  return acquireChromeForegroundActivityAtBoundary({
    readActivityReceipt: (timeoutMilliseconds) =>
      readBoundChromeSurfaceActivityReceipt({
        deadlineAt: deadline,
        maximumMilliseconds: timeoutMilliseconds,
        label,
        remainingMilliseconds: requireRemainingAutomationMilliseconds,
        readActivityReceipt: resumedActivityReceipt
      }),
    deadlineAt: deadline,
    now: () => performance.now(),
    maximumReadMilliseconds: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS,
    maximumPollMilliseconds: CHROME_AUTOMATION_POLL_MILLISECONDS,
    maximumAttempts: ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT,
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  })
}

function probeChromeContentSurfaceAtActivityBoundary(deadline) {
  return captureChromeSurfaceProbeBoundaryWithActivityAcquisition({
    acquireActivity: (label) => acquireChromeSurfaceActivityWithinDeadline(deadline, label),
    probeSurface: () => probeChromeContentSurface(deadline)
  })
}

function surfaceReceipt(surface) {
  if (surface.status === "activity-unresolved") {
    return {
      status: surface.status,
      stage: surface.stage,
      activityBefore: surface.activityBefore ?? null,
      activityAfter: null,
      activityProbe: surface.activityProbe
    }
  }
  return {
    status: surface.status,
    reason: surface.reason ?? null,
    probeMilliseconds: surface.probeMilliseconds,
    hierarchyBytes: surface.hierarchyBytes,
    displaySize: surface.displaySize,
    activityBefore: surface.activityBefore,
    activityAfter: surface.activityAfter,
    activityBeforeAttempts: surface.activityBeforeAttempts ?? null,
    activityAfterAttempts: surface.activityAfterAttempts ?? null
  }
}

async function normalizeChromeContentSurface() {
  const deadline = performance.now() + CHROME_AUTOMATION_SETTLE_TIMEOUT_MILLISECONDS
  const normalization = await normalizeChromeAutomationSurfaceWithinDeadline({
    deadlineAt: deadline,
    now: () => performance.now(),
    maximumPollMilliseconds: CHROME_AUTOMATION_POLL_MILLISECONDS,
    probeSurface: () => probeChromeContentSurfaceAtActivityBoundary(deadline),
    tap: (dismissTap, label) =>
      executeBoundChromeSurfaceTap({
        deadlineAt: deadline,
        maximumMilliseconds: CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS,
        dismissTap,
        label,
        remainingMilliseconds: requireRemainingAutomationMilliseconds,
        runAdb: adbWithTimeout
      }),
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  })
  requireRemainingAutomationMilliseconds(deadline, 1, "surface acceptance")
  const dismissedPromptStatuses = new Set(normalization.dismissedPrompts)
  return {
    status: normalization.surface.status,
    dismissedKnownPrompt: dismissedPromptStatuses.has("known-notification-prompt"),
    dismissTap: normalization.dismissedTaps["known-notification-prompt"] ?? null,
    dismissedPixelLauncherAnr: dismissedPromptStatuses.has("known-pixel-launcher-anr"),
    pixelLauncherAnrWaitTap: normalization.dismissedTaps["known-pixel-launcher-anr"] ?? null,
    normalizationActivity: normalization.normalizationActivity,
    activityBefore: normalization.surface.activityBefore,
    activityAfter: normalization.surface.activityAfter,
    attempts: normalization.attempts.map(surfaceReceipt)
  }
}

async function requireClearChromeContentSurface() {
  const deadline = performance.now() + CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS
  const attempts = []
  while (performance.now() < deadline) {
    const surface = await probeChromeContentSurfaceAtActivityBoundary(deadline)
    attempts.push(surfaceReceipt(surface))
    if (surface.status === "activity-unresolved") {
      const pollRemainingMilliseconds = deadline - performance.now()
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          boundedAndroidPollDelay(pollRemainingMilliseconds, CHROME_AUTOMATION_POLL_MILLISECONDS)
        )
      )
      continue
    }
    if (surface.status !== "clear") {
      throw new Error(
        `Android Chrome content surface was not clear at the foreground observation boundary; ` +
          `status=${surface.status}`
      )
    }
    requireRemainingAutomationMilliseconds(deadline, 1, "surface acceptance")
    return { ...surfaceReceipt(surface), attempts }
  }
  throw new Error(
    `Android Chrome activity identity did not resolve at the foreground observation boundary ` +
      `within ${CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS} ms; ` +
      `attempts=${JSON.stringify(attempts)}`
  )
}

function observeForegroundFrameTimeline(
  page,
  targetIndex,
  readinessTimeoutMilliseconds,
  observationMilliseconds
) {
  return page.evaluate(
    ({ index, readinessTimeout, observationDuration }) =>
      new Promise((resolve, reject) => {
        const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
        const target = runtimes[index]
        if (!target) {
          reject(new Error(`Creative runtime ${index} is missing`))
          return
        }
        const snapshot = () => ({
          at: performance.now(),
          frame: Number(target.getAttribute("data-runtime-frame")),
          runningCount: runtimes.filter(
            (runtime) => runtime.getAttribute("data-runtime-status") === "running"
          ).length,
          targetStatus: target.getAttribute("data-runtime-status") ?? "missing"
        })
        const armedSnapshot = snapshot()
        const samples = []
        let observationTimer = null
        let settled = false

        const cleanup = () => {
          observer.disconnect()
          clearTimeout(readinessTimer)
          if (observationTimer !== null) clearTimeout(observationTimer)
        }
        const finish = (captureBoundary) => {
          if (settled) return
          settled = true
          const boundarySnapshot = snapshot()
          if (captureBoundary) retainChangedSnapshot(boundarySnapshot)
          cleanup()
          resolve({
            armedSnapshot,
            readinessTimeoutMilliseconds: readinessTimeout,
            samples,
            boundarySnapshot
          })
        }
        const retainChangedSnapshot = (observed) => {
          const previous = samples.at(-1)
          if (
            !previous ||
            previous.frame !== observed.frame ||
            previous.runningCount !== observed.runningCount ||
            previous.targetStatus !== observed.targetStatus
          ) {
            samples.push(observed)
          }
        }
        const inspect = () => {
          const observed = snapshot()
          if (samples.length === 0) {
            if (observed.frame <= armedSnapshot.frame) return
            retainChangedSnapshot(observed)
            clearTimeout(readinessTimer)
            observationTimer = setTimeout(() => finish(true), observationDuration)
            return
          }
          retainChangedSnapshot(observed)
        }
        const observer = new MutationObserver(inspect)
        const readinessTimer = setTimeout(() => finish(false), readinessTimeout)
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-runtime-frame", "data-runtime-status"],
          subtree: true
        })
        inspect()
      }),
    {
      index: targetIndex,
      readinessTimeout: readinessTimeoutMilliseconds,
      observationDuration: observationMilliseconds
    }
  )
}

async function armOperatingSystemPauseObservation(page, targetIndex) {
  return page.evaluate((index) => {
    window.__courtsideT079AndroidBackgroundObserver?.disconnect()
    const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
    const target = runtimes[index]
    if (!target) throw new Error(`Creative runtime ${index} is missing`)
    const snapshot = () => ({
      at: Date.now(),
      frame: Number(target.getAttribute("data-runtime-frame")),
      runningCount: runtimes.filter(
        (runtime) => runtime.getAttribute("data-runtime-status") === "running"
      ).length,
      targetStatus: target.getAttribute("data-runtime-status") ?? "missing"
    })
    const activeSnapshot = snapshot()
    if (activeSnapshot.runningCount !== 1 || activeSnapshot.targetStatus !== "running") {
      throw new Error(
        `Creative runtime must be the only running canvas before HOME; ` +
          `snapshot=${JSON.stringify(activeSnapshot)}`
      )
    }
    window.__courtsideT079AndroidBackgroundState = {
      activeSnapshot,
      pauseSnapshot: null
    }
    const inspect = () => {
      const observed = snapshot()
      if (observed.runningCount === 0 && observed.targetStatus === "paused") {
        window.__courtsideT079AndroidBackgroundState.pauseSnapshot ??= observed
      }
    }
    const observer = new MutationObserver(inspect)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-runtime-status"],
      subtree: true
    })
    window.__courtsideT079AndroidBackgroundObserver = observer
    inspect()
    return activeSnapshot
  }, targetIndex)
}

function readOperatingSystemPauseSnapshot(page, targetIndex) {
  return page.evaluate((index) => {
    const observed = window.__courtsideT079AndroidBackgroundState?.pauseSnapshot
    if (observed?.runningCount === 0 && observed.targetStatus === "paused") {
      return { ...observed, source: "lifecycle-observer" }
    }

    const runtimes = Array.from(document.querySelectorAll('[data-testid="creative-runtime"]'))
    const target = runtimes[index]
    if (!target) throw new Error(`Creative runtime ${index} is missing`)
    return {
      at: Date.now(),
      frame: Number(target.getAttribute("data-runtime-frame")),
      runningCount: runtimes.filter(
        (runtime) => runtime.getAttribute("data-runtime-status") === "running"
      ).length,
      targetStatus: target.getAttribute("data-runtime-status") ?? "missing",
      source: "live-atomic-fallback",
      observerSnapshot: observed ?? null
    }
  }, targetIndex)
}

function recordActivityTransition(transitions, activity, at) {
  const classified = classifyAndroidActivityLine(activity)
  if (!classified) return
  const transition = {
    at,
    ...classified
  }
  const previous = transitions.at(-1)
  if (
    !previous ||
    previous.chromeForeground !== transition.chromeForeground ||
    previous.activity !== transition.activity
  ) {
    transitions.push(transition)
  }
}

async function waitForBackgroundConvergence(page, homeSignal, targetIndex) {
  const deadline = performance.now() + BUDGETS.operatingSystemBackgroundMilliseconds
  const activityTransitions = []
  let pauseSnapshot = null
  let liveSnapshot = null

  while (performance.now() < deadline) {
    recordActivityTransition(activityTransitions, resumedActivityLine(), Date.now())
    liveSnapshot = await readOperatingSystemPauseSnapshot(page, targetIndex)
    pauseSnapshot = retainFirstPausedSnapshot(pauseSnapshot, liveSnapshot)
    const backgroundActivity = activityTransitions.find(
      (transition) => transition.at >= homeSignal.at && !transition.chromeForeground
    )
    if (backgroundActivity && pauseSnapshot) {
      return {
        activityTransitions,
        backgroundActivity,
        pauseSnapshot,
        observerSnapshot: liveSnapshot?.observerSnapshot ?? null
      }
    }
    const remainingMilliseconds = deadline - performance.now()
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        boundedAndroidPollDelay(remainingMilliseconds, ANDROID_ACTIVITY_POLL_MILLISECONDS)
      )
    )
  }

  throw new Error(
    `Android background convergence was not observed within ` +
      `${BUDGETS.operatingSystemBackgroundMilliseconds} ms; ` +
      `activityTransitions=${JSON.stringify(activityTransitions)}, ` +
      `pauseSnapshot=${JSON.stringify(pauseSnapshot)}, ` +
      `liveSnapshot=${JSON.stringify(liveSnapshot)}`
  )
}

async function observeBackgroundActivity(activityTransitions) {
  const deadline = performance.now() + BUDGETS.backgroundObservationMilliseconds
  let activity = resumedActivityLine()
  recordActivityTransition(activityTransitions, activity, Date.now())

  while (performance.now() < deadline) {
    const remainingMilliseconds = deadline - performance.now()
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        boundedAndroidPollDelay(remainingMilliseconds, ANDROID_ACTIVITY_POLL_MILLISECONDS)
      )
    )
    activity = resumedActivityLine()
    recordActivityTransition(activityTransitions, activity, Date.now())
  }
  const boundary = requireAndroidActivityAtBoundary(resumedActivityLine())
  const boundaryObservedAt = Date.now()
  recordActivityTransition(activityTransitions, boundary.activity, boundaryObservedAt)
  return { ...boundary, observedAt: boundaryObservedAt }
}

async function verifyAndroidOperatingSystemBackground(page, targetIndex) {
  const boundary = await establishNativeAndroidBackgroundBoundary({
    bringToFront: () => page.bringToFront(),
    readBrowserForeground: () =>
      page.evaluate(() => ({
        url: window.location.href,
        visibilityState: document.visibilityState,
        hidden: document.hidden,
        hasFocus: document.hasFocus()
      })),
    expectedUrl: ARTICLE_URL,
    readChromeForegroundActivity: () =>
      acquireChromeForegroundActivityAtBoundary({
        readActivityReceipt: (timeoutMilliseconds) => resumedActivityReceipt(timeoutMilliseconds),
        deadlineAt: performance.now() + CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS,
        now: () => performance.now(),
        maximumReadMilliseconds: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS,
        maximumPollMilliseconds: CHROME_AUTOMATION_POLL_MILLISECONDS,
        maximumAttempts: ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT,
        delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
      }),
    armRuntimeObservation: () => armOperatingSystemPauseObservation(page, targetIndex),
    epochNow: () => Date.now(),
    monotonicNow: () => performance.now(),
    sendHome: () => adb("shell", "input", "keyevent", "KEYCODE_HOME")
  })
  const {
    activeSnapshot,
    browserForeground,
    clockCalibration,
    commandMilliseconds,
    foregroundActivity,
    foregroundActivityAttempts,
    homeSignal
  } = boundary
  const convergence = await waitForBackgroundConvergence(page, homeSignal, targetIndex)
  const activityBoundary = await observeBackgroundActivity(convergence.activityTransitions)
  const pauseSnapshot = normalizeBrowserRuntimeSnapshot(convergence.pauseSnapshot, clockCalibration)
  const observationSnapshot = normalizeBrowserRuntimeSnapshot(
    await captureRuntimeSnapshot(page, targetIndex),
    clockCalibration
  )
  const documentState = await page.evaluate(() => ({
    hidden: document.hidden,
    hasFocus: document.hasFocus()
  }))
  const timeline = {
    clockMaximumUncertaintyMilliseconds: clockCalibration.maximumUncertaintyMilliseconds,
    homeSignal,
    activeSnapshot,
    activityTransitions: convergence.activityTransitions,
    pauseSnapshot,
    observationSnapshot,
    observerSnapshot: convergence.observerSnapshot
  }
  const evaluation = evaluateAndroidBackgroundTimeline(timeline, BUDGETS)
  assertPausedRuntimeSnapshot(pauseSnapshot, "Android runtime pause")
  assertPausedRuntimeSnapshot(observationSnapshot, "Android background observation")

  return {
    signal: homeSignal.signal,
    browserForeground,
    foregroundActivityBeforeHome: {
      activity: foregroundActivity.activity,
      recordId: foregroundActivity.recordId,
      taskId: foregroundActivity.taskId,
      attempts: foregroundActivityAttempts
    },
    commandMilliseconds,
    clockCalibration: {
      ...clockCalibration,
      normalizedClock: "host epoch milliseconds"
    },
    activityTransitionMilliseconds: evaluation.activityTransitionMilliseconds,
    runtimePauseMilliseconds: evaluation.runtimePauseMilliseconds,
    runtimePauseUpperBoundMilliseconds: evaluation.runtimePauseUpperBoundMilliseconds,
    transitionOrder: evaluation.transitionOrder,
    backgroundActivity: evaluation.backgroundActivity,
    activityAfterObservation: activityBoundary.activity,
    activityBoundaryObservedAt: activityBoundary.observedAt,
    activityTransitions: evaluation.activityTransitions,
    chromeForeground: activityBoundary.chromeForeground,
    observationMilliseconds: BUDGETS.backgroundObservationMilliseconds,
    frameBeforeTransition: activeSnapshot.frame,
    frameAtPause: evaluation.frameAtPause,
    transitionFrameDelta: Math.max(0, evaluation.frameAtPause - activeSnapshot.frame),
    statusAtPause: evaluation.statusAtPause,
    pauseObservationSource: evaluation.pauseObservationSource,
    pauseObserverDiagnostic: convergence.observerSnapshot,
    frameBefore: evaluation.frameAtPause,
    frameAfter: evaluation.frameAfterObservation,
    frameDelta: evaluation.postPauseFrames,
    postPauseFrames: evaluation.postPauseFrames,
    statusAfter: evaluation.statusAfterObservation,
    pausedRunningCount: pauseSnapshot.runningCount,
    observedRunningCount: observationSnapshot.runningCount,
    documentHidden: documentState.hidden,
    documentHasFocus: documentState.hasFocus,
    timeline,
    workSuspended: true
  }
}

function adbWithTimeout(timeoutMilliseconds, ...arguments_) {
  const result = spawnSync("adb", arguments_, {
    encoding: "utf8",
    timeout: timeoutMilliseconds
  })
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`adb ${arguments_.join(" ")} timed out after ${timeoutMilliseconds} ms`)
  }
  if (result.status !== 0) {
    throw new Error(
      `adb ${arguments_.join(" ")} failed: ` +
        `${result.stderr || result.stdout || result.error?.message || result.status}`
    )
  }
  return result.stdout
}

function adb(...arguments_) {
  return adbWithTimeout(CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS, ...arguments_)
}

function resumedActivityReceipt(timeoutMilliseconds = ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS) {
  const result = spawnSync("adb", ["shell", "dumpsys", "activity", "activities"], {
    encoding: "utf8",
    timeout: timeoutMilliseconds
  })
  try {
    return classifyAndroidActivityProbeResult({
      errorCode: result.error?.code ?? null,
      status: result.status,
      stdout: result.stdout ?? ""
    })
  } catch (error) {
    throw new Error(
      `adb shell dumpsys activity activities failed: ` +
        `${result.stderr || result.stdout || result.error?.message || result.status}; ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

function resumedActivityLine() {
  const receipt = resumedActivityReceipt()
  return receipt.status === "resolved" ? receipt.activity : ""
}

async function markPhase(page, nextPhase) {
  phase = nextPhase
  await page.evaluate((phaseName) => {
    window.__courtsideT079AndroidPhaseTimeline ??= []
    window.__courtsideT079AndroidPhaseTimeline.push({
      phase: phaseName,
      startedAt: performance.now()
    })
  }, nextPhase)
}

function summarizeLongTasks(entries, phaseTimeline = []) {
  const attributedEntries = entries.map((entry) => ({
    ...entry,
    phase:
      phaseTimeline.findLast((phaseMark) => phaseMark.startedAt <= entry.startTime)?.phase ?? null
  }))

  return {
    count: attributedEntries.length,
    longestMilliseconds: attributedEntries.reduce(
      (maximum, entry) => Math.max(maximum, Number(entry.duration) || 0),
      0
    ),
    totalMilliseconds: attributedEntries.reduce(
      (total, entry) => total + (Number(entry.duration) || 0),
      0
    ),
    entries: attributedEntries
  }
}

function assertAtMost(actual, maximum, label) {
  if (!Number.isFinite(actual) || actual > maximum) {
    throw new Error(`${label}: expected <= ${maximum}, received ${actual}`)
  }
}
