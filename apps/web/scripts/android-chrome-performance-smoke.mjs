import { spawnSync } from "node:child_process"

import { chromium, expect } from "@playwright/test"

import {
  boundedAndroidPollDelay,
  calibrateBrowserClockToHost,
  classifyAndroidActivityLine,
  evaluateAndroidBackgroundTimeline,
  normalizeBrowserRuntimeSnapshot,
  requireAndroidActivityAtBoundary,
  retainFirstPausedSnapshot
} from "./android-creative-timeline.mjs"

const ARTICLE_URL = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
const ANDROID_ACTIVITY_POLL_MILLISECONDS = 25
const ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS = 250
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

  await markPhase(page, "foreground-frame-observation")
  const foregroundFrameReady = await waitForFrameAdvance(page, 0, 5_000)
  const foregroundFrames = {
    ...(await observeFrameDelta(page, 0, BUDGETS.foregroundObservationMilliseconds)),
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

async function waitForFrameAdvance(page, targetIndex, timeoutMilliseconds) {
  const initialSnapshot = await captureRuntimeSnapshot(page, targetIndex)
  assertActiveRuntimeSnapshot(initialSnapshot, "Android frame readiness")
  const startedAt = performance.now()
  const deadline = performance.now() + timeoutMilliseconds

  while (performance.now() < deadline) {
    const currentSnapshot = await captureRuntimeSnapshot(page, targetIndex)
    assertActiveRuntimeSnapshot(currentSnapshot, "Android frame readiness")
    if (currentSnapshot.frame > initialSnapshot.frame) {
      return {
        timeoutMilliseconds,
        startupMilliseconds: performance.now() - startedAt,
        frameBefore: initialSnapshot.frame,
        frameAfter: currentSnapshot.frame
      }
    }
    const remainingMilliseconds = deadline - performance.now()
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, remainingMilliseconds)))
  }

  throw new Error(`Android creative frame counter did not advance within ${timeoutMilliseconds} ms`)
}

async function observeFrameDelta(page, targetIndex, observationMilliseconds) {
  const before = await captureRuntimeSnapshot(page, targetIndex)
  assertActiveRuntimeSnapshot(before, "Android foreground observation start")
  await new Promise((resolve) => setTimeout(resolve, observationMilliseconds))
  const after = await captureRuntimeSnapshot(page, targetIndex)
  assertActiveRuntimeSnapshot(after, "Android foreground observation end")
  return {
    observationMilliseconds,
    frameBefore: before.frame,
    frameAfter: after.frame,
    frameDelta: Math.max(0, after.frame - before.frame),
    runningCountBefore: before.runningCount,
    runningCountAfter: after.runningCount,
    status: after.targetStatus
  }
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
  const hostEpochBeforeArm = Date.now()
  const rawActiveSnapshot = await armOperatingSystemPauseObservation(page, targetIndex)
  const hostEpochAfterArm = Date.now()
  const clockCalibration = calibrateBrowserClockToHost({
    browserEpochAtArm: rawActiveSnapshot.at,
    hostEpochBeforeArm,
    hostEpochAfterArm
  })
  const activeSnapshot = normalizeBrowserRuntimeSnapshot(rawActiveSnapshot, clockCalibration)
  const homeSignal = { at: Date.now(), signal: "Android KEYCODE_HOME" }
  const commandStartedAt = performance.now()
  adb("shell", "input", "keyevent", "KEYCODE_HOME")
  const commandMilliseconds = performance.now() - commandStartedAt
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
  const result = spawnSync("adb", ["shell", "dumpsys", "activity", "activities"], {
    encoding: "utf8",
    timeout: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS
  })
  if (result.error?.code === "ETIMEDOUT") {
    return ""
  }
  if (result.status !== 0) {
    throw new Error(
      `adb shell dumpsys activity activities failed: ` +
        `${result.stderr || result.stdout || result.error?.message || result.status}`
    )
  }
  const output = result.stdout
  return (
    output
      .split("\n")
      .find((line) => /mResumedActivity|topResumedActivity/u.test(line))
      ?.trim() ?? ""
  )
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
