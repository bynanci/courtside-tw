import { spawnSync } from "node:child_process"

import { chromium, expect } from "@playwright/test"

const ARTICLE_URL = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
const ANDROID_ACTIVITY_POLL_MILLISECONDS = 25
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

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222")
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

  const initialRunningCanvases = await runningCanvasCount(page)
  assertAtMost(
    initialRunningCanvases,
    BUDGETS.maximumRunningCanvases,
    "Android running canvas count"
  )

  await markPhase(page, "offscreen-reaction")
  const offscreen = await measureOffscreenPause(firstRuntime)
  assertAtMost(
    offscreen.reactionMilliseconds,
    BUDGETS.offscreenPauseMilliseconds,
    "Android offscreen reaction"
  )

  await firstRuntime.scrollIntoViewIfNeeded()
  await expect
    .poll(() => firstRuntime.getAttribute("data-runtime-status"), { timeout: 10_000 })
    .toBe("running")

  await markPhase(page, "background-event-reaction")
  const backgroundEvent = await measureBackgroundEventPause(firstRuntime)
  assertAtMost(
    backgroundEvent.reactionMilliseconds,
    BUDGETS.backgroundEventPauseMilliseconds,
    "Android background-event reaction"
  )
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect
    .poll(() => firstRuntime.getAttribute("data-runtime-status"), { timeout: 10_000 })
    .toBe("running")

  await markPhase(page, "foreground-frame-observation")
  const foregroundFrameReady = await waitForFrameAdvance(firstRuntime, 5_000)
  const foregroundFrames = {
    ...(await observeFrameDelta(firstRuntime, BUDGETS.foregroundObservationMilliseconds)),
    readiness: foregroundFrameReady
  }
  assertAtLeast(
    foregroundFrames.frameDelta,
    BUDGETS.minimumForegroundFrames,
    "Android foreground creative frames"
  )

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
  const operatingSystemBackground = await verifyAndroidOperatingSystemBackground(page, firstRuntime)
  process.stdout.write(
    `${JSON.stringify({ phase: "T079 Android OS background", operatingSystemBackground }, null, 2)}\n`
  )
  assertAtMost(
    operatingSystemBackground.activityTransitionMilliseconds,
    BUDGETS.operatingSystemBackgroundMilliseconds,
    "Android operating-system background transition"
  )
  assertAtMost(
    operatingSystemBackground.frameDelta,
    BUDGETS.maximumBackgroundFrames,
    "Android background creative frames"
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

function measureOffscreenPause(locator) {
  return locator.evaluate(
    (element) =>
      new Promise((resolve, reject) => {
        if (element.getAttribute("data-runtime-status") !== "running") {
          reject(new Error("Creative runtime must be running before offscreen measurement"))
          return
        }

        document.documentElement.style.scrollBehavior = "auto"
        const commandAt = performance.now()
        let offscreenAt = null
        let pausedAt = null
        let settled = false

        const cleanup = () => {
          observer.disconnect()
          window.removeEventListener("scroll", inspect)
          clearTimeout(timeout)
        }
        const finish = () => {
          if (settled || offscreenAt === null || pausedAt === null) return
          settled = true
          cleanup()
          resolve({
            commandToOffscreenMilliseconds: Math.max(0, offscreenAt - commandAt),
            reactionMilliseconds: Math.max(0, pausedAt - offscreenAt),
            totalMilliseconds: Math.max(0, pausedAt - commandAt),
            finalStatus: element.getAttribute("data-runtime-status")
          })
        }
        const inspect = () => {
          const rectangle = element.getBoundingClientRect()
          const outside = rectangle.bottom <= 0 || rectangle.top >= window.innerHeight
          if (outside && offscreenAt === null) {
            offscreenAt = performance.now()
          }
          if (element.getAttribute("data-runtime-status") !== "running" && pausedAt === null) {
            pausedAt = performance.now()
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
              `Creative runtime did not pause after becoming offscreen; status=${element.getAttribute("data-runtime-status")}`
            )
          )
        }, 10_000)

        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-runtime-status"]
        })
        window.addEventListener("scroll", inspect, { passive: true })
        window.scrollTo({ top: 0, left: 0, behavior: "auto" })
        inspect()
        requestAnimationFrame(inspect)
      })
  )
}

function measureBackgroundEventPause(locator) {
  return locator.evaluate(
    (element) =>
      new Promise((resolve, reject) => {
        if (element.getAttribute("data-runtime-status") !== "running") {
          reject(new Error("Creative runtime must be running before background-event measurement"))
          return
        }

        const signalAt = performance.now()
        let settled = false

        const cleanup = () => {
          observer.disconnect()
          clearTimeout(timeout)
        }
        const inspect = () => {
          if (settled || element.getAttribute("data-runtime-status") === "running") return
          settled = true
          const pausedAt = performance.now()
          cleanup()
          resolve({
            signal: "window.blur test event",
            reactionMilliseconds: Math.max(0, pausedAt - signalAt),
            finalStatus: element.getAttribute("data-runtime-status")
          })
        }
        const observer = new MutationObserver(inspect)
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(
            new Error(
              `Android background-event handler did not pause; status=${element.getAttribute("data-runtime-status")}`
            )
          )
        }, 10_000)

        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-runtime-status"]
        })
        window.dispatchEvent(new Event("blur"))
        inspect()
      })
  )
}

async function waitForFrameAdvance(locator, timeoutMilliseconds) {
  const frameBefore = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  const startedAt = performance.now()
  const deadline = Date.now() + timeoutMilliseconds

  while (Date.now() < deadline) {
    const frameAfter = numberAttribute(await locator.getAttribute("data-runtime-frame"))
    if (frameAfter > frameBefore) {
      return {
        timeoutMilliseconds,
        startupMilliseconds: performance.now() - startedAt,
        frameBefore,
        frameAfter
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Android creative frame counter did not advance within ${timeoutMilliseconds} ms`)
}

async function observeFrameDelta(locator, observationMilliseconds) {
  const frameBefore = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  await new Promise((resolve) => setTimeout(resolve, observationMilliseconds))
  const frameAfter = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  return {
    observationMilliseconds,
    frameBefore,
    frameAfter,
    frameDelta: Math.max(0, frameAfter - frameBefore),
    status: await locator.getAttribute("data-runtime-status")
  }
}

async function verifyAndroidOperatingSystemBackground(page, locator) {
  const frameBeforeTransition = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  const startedAt = performance.now()
  const commandStartedAt = performance.now()
  adb("shell", "input", "keyevent", "KEYCODE_HOME")
  const commandMilliseconds = performance.now() - commandStartedAt
  const activity = await waitForChromeBackground(startedAt)
  const activityTransitionMilliseconds = performance.now() - startedAt
  const frameAtBackground = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  const statusAtBackground = await locator.getAttribute("data-runtime-status")

  await new Promise((resolve) => setTimeout(resolve, BUDGETS.backgroundObservationMilliseconds))

  const frameAfter = numberAttribute(await locator.getAttribute("data-runtime-frame"))
  const statusAfter = await locator.getAttribute("data-runtime-status")
  const documentState = await page.evaluate(() => ({
    hidden: document.hidden,
    hasFocus: document.hasFocus()
  }))
  const activityAfterObservation = resumedActivityLine()
  const chromeForegroundAfterObservation = /com\.android\.chrome/u.test(activityAfterObservation)

  if (chromeForegroundAfterObservation) {
    throw new Error(
      `Android Chrome returned to the foreground during frame observation: ${activityAfterObservation}`
    )
  }

  return {
    signal: "Android KEYCODE_HOME",
    commandMilliseconds,
    activityTransitionMilliseconds,
    backgroundActivity: activity,
    activityAfterObservation,
    chromeForeground: false,
    observationMilliseconds: BUDGETS.backgroundObservationMilliseconds,
    frameBeforeTransition,
    frameAtBackground,
    transitionFrameDelta: Math.max(0, frameAtBackground - frameBeforeTransition),
    statusAtBackground,
    frameBefore: frameAtBackground,
    frameAfter,
    frameDelta: Math.max(0, frameAfter - frameAtBackground),
    statusAfter,
    documentHidden: documentState.hidden,
    documentHasFocus: documentState.hasFocus,
    workSuspended: Math.max(0, frameAfter - frameAtBackground) <= BUDGETS.maximumBackgroundFrames
  }
}

async function waitForChromeBackground(startedAt) {
  const deadline = performance.now() + BUDGETS.operatingSystemBackgroundMilliseconds
  let activity = ""

  while (performance.now() < deadline) {
    activity = resumedActivityLine()
    if (activity.length > 0 && !/com\.android\.chrome/u.test(activity)) {
      return activity
    }
    const remainingMilliseconds = deadline - performance.now()
    if (remainingMilliseconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(ANDROID_ACTIVITY_POLL_MILLISECONDS, remainingMilliseconds))
      )
    }
  }

  throw new Error(
    `Android Chrome remained foregrounded after ${Math.round(performance.now() - startedAt)} ms; activity=${activity || "unknown"}`
  )
}

function adb(...arguments_) {
  const result = spawnSync("adb", arguments_, { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `adb ${arguments_.join(" ")} failed: ${result.stderr || result.stdout || result.status}`
    )
  }
  return result.stdout
}

function resumedActivityLine() {
  const output = adb("shell", "dumpsys", "activity", "activities")
  return (
    output
      .split("\n")
      .find((line) => /mResumedActivity|topResumedActivity/u.test(line))
      ?.trim() ?? ""
  )
}

async function runningCanvasCount(page) {
  return page
    .getByTestId("creative-runtime")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => element.getAttribute("data-runtime-status") === "running")
          .length
    )
}

function numberAttribute(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric runtime attribute, received ${String(value)}`)
  }
  return number
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

function assertAtLeast(actual, minimum, label) {
  if (!Number.isFinite(actual) || actual < minimum) {
    throw new Error(`${label}: expected >= ${minimum}, received ${actual}`)
  }
}
