import { deepEqual, doesNotMatch, equal, match, rejects, throws } from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import * as timelineHelpers from "../../scripts/android-creative-timeline.mjs"
import * as environmentHelpers from "../../scripts/android-emulator-environment.mjs"

import {
  boundedAndroidPollDelay,
  calibrateBrowserClockToHost,
  captureChromeSurfaceProbeBoundary,
  classifyAndroidActivityLine,
  classifyChromeAutomationSurface,
  evaluateAndroidBackgroundTimeline,
  evaluateAndroidForegroundFrameTimeline,
  normalizeBrowserRuntimeSnapshot,
  parseAndroidDisplaySize,
  requireAndroidActivityAtBoundary,
  requireChromeForegroundActivityAtBoundary,
  retainFirstPausedSnapshot
} from "../../scripts/android-creative-timeline.mjs"

const BUDGETS = Object.freeze({
  maximumBackgroundFrames: 2,
  operatingSystemBackgroundMilliseconds: 5_000
})

const FOREGROUND_BUDGETS = Object.freeze({
  foregroundObservationMilliseconds: 500,
  minimumForegroundFrames: 5,
  maximumRunningCanvases: 1
})

const PIXEL_7_DISPLAY = Object.freeze({ width: 1080, height: 2400 })
const ANDROID_AVD_NAME = "courtside-api35-pixel7"
const ANDROID_PROFILE = "pixel_7"
const EXACT_HEAD_SHA = "1234567890abcdef1234567890abcdef12345678"

const ATTEMPT_1_ACTIVITY_DUMP_PREFIX = `ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
Display #0 (activities from top to bottom):
  * Task{23c61e9 #9 type=standard A=10146:com.android.chrome U=0 visible=true visibleRequested=true mode=fullscreen translucent=false sz=1}
    mLastNonFullscreenBounds=Rect(276, 696 - 805, 1776)
    isSleeping=false
    topResumedActivity=ActivityRecord{6cf73ed u0 com.android.chrome/com.google.android.apps.chrome.Main t9}
    * Hist  #0: ActivityRecord{6cf73ed u0 com.android.chrome/com.google.android.apps.chrome.Main t9}`

const ATTEMPT_1_RESUMED_ACTIVITY =
  "topResumedActivity=ActivityRecord{6cf73ed u0 com.android.chrome/com.google.android.apps.chrome.Main t9}"

const ATTEMPT_2_CHROME_MODAL_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="com.android.chrome:id/modal_dialog_view" package="com.android.chrome" bounds="[28,615][1052,1858]">
    <node text="Chrome notifications make things easier" resource-id="" class="android.widget.TextView" package="com.android.chrome" bounds="[70,1364][1010,1522]" />
    <node text="No thanks" resource-id="com.android.chrome:id/negative_button" class="android.widget.Button" package="com.android.chrome" clickable="true" enabled="true" bounds="[477,1690][708,1816]" />
  </node>
</hierarchy>`

const ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" package="android" bounds="[28,983][1052,1489]">
    <node text="" resource-id="android:id/parentPanel" class="android.widget.LinearLayout" package="android" bounds="[70,1025][1010,1447]">
      <node text="Pixel Launcher isn't responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="android" bounds="[133,1072][947,1135]" />
      <node text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1174][1010,1300]" />
      <node text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1300][1010,1426]" />
    </node>
  </node>
</hierarchy>`

type ActivityTransition = {
  at: number
  chromeForeground: boolean
  activity: string
}

type TimelineFixtureOptions = {
  activeAt?: number
  activeRunningCount?: number
  activityAt?: number
  activityTransitions?: ActivityTransition[]
  clockMaximumUncertaintyMilliseconds?: number
  observationAt?: number
  observationFrame?: number
  observationRunningCount?: number
  pauseAt?: number
  pauseFrame?: number
  pauseRunningCount?: number
  pauseSnapshot?: null
}

function timeline({
  activeAt = 90,
  activeRunningCount = 1,
  activityAt = 120,
  activityTransitions,
  clockMaximumUncertaintyMilliseconds = 0,
  observationAt = 1_640,
  observationFrame = 42,
  observationRunningCount = 0,
  pauseAt = 140,
  pauseFrame = 40,
  pauseRunningCount = 0,
  pauseSnapshot
}: TimelineFixtureOptions = {}) {
  return {
    clockMaximumUncertaintyMilliseconds,
    homeSignal: { at: 100, signal: "Android KEYCODE_HOME" },
    activeSnapshot: {
      at: activeAt,
      frame: 35,
      runningCount: activeRunningCount,
      targetStatus: "running"
    },
    activityTransitions: activityTransitions ?? [
      { at: activityAt, chromeForeground: false, activity: "Launcher" }
    ],
    pauseSnapshot:
      pauseSnapshot === undefined
        ? {
            at: pauseAt,
            frame: pauseFrame,
            runningCount: pauseRunningCount,
            targetStatus: "paused"
          }
        : pauseSnapshot,
    observationSnapshot: {
      at: observationAt,
      frame: observationFrame,
      runningCount: observationRunningCount,
      targetStatus: "paused"
    }
  }
}

test("background timeline accepts activity-to-pause and pause-to-activity orderings", () => {
  const activityThenPause = evaluateAndroidBackgroundTimeline(
    timeline({ activityAt: 120, pauseAt: 140 }),
    BUDGETS
  )
  const pauseThenActivity = evaluateAndroidBackgroundTimeline(
    timeline({ activityAt: 160, pauseAt: 120 }),
    BUDGETS
  )

  deepEqual(
    [activityThenPause.transitionOrder, pauseThenActivity.transitionOrder],
    ["activity-then-pause", "pause-then-activity"]
  )
  equal(activityThenPause.frameAtPause, 40)
  equal(pauseThenActivity.postPauseFrames, 2)
})

test("native Android CDP connection suppresses Playwright lifecycle defaults", () => {
  const nativeAndroidCdpConnectionOptions = Reflect.get(
    timelineHelpers,
    "nativeAndroidCdpConnectionOptions"
  )
  equal(typeof nativeAndroidCdpConnectionOptions, "function")
  if (typeof nativeAndroidCdpConnectionOptions !== "function") return

  const options = nativeAndroidCdpConnectionOptions()
  deepEqual(options, { noDefaults: true })
  equal(Object.isFrozen(options), true)
})

test("native Android background binds the exact browser foreground receipt", () => {
  const requireAndroidBrowserForegroundReceipt = Reflect.get(
    timelineHelpers,
    "requireAndroidBrowserForegroundReceipt"
  )
  equal(typeof requireAndroidBrowserForegroundReceipt, "function")
  if (typeof requireAndroidBrowserForegroundReceipt !== "function") return

  const expectedUrl = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
  const foreground = {
    url: expectedUrl,
    visibilityState: "visible",
    hidden: false,
    hasFocus: true
  }
  deepEqual(requireAndroidBrowserForegroundReceipt(foreground, expectedUrl), foreground)

  for (const receipt of [
    { ...foreground, url: "http://127.0.0.1:4173/issues/issue-2026-01" },
    { ...foreground, visibilityState: "hidden", hidden: true },
    { ...foreground, hasFocus: false }
  ]) {
    throws(
      () => requireAndroidBrowserForegroundReceipt(receipt, expectedUrl),
      /Android browser foreground receipt/u
    )
  }
})

test("native Android connector behaviorally suppresses Playwright lifecycle defaults", async () => {
  const connectNativeAndroidBrowser = Reflect.get(timelineHelpers, "connectNativeAndroidBrowser")
  equal(typeof connectNativeAndroidBrowser, "function")
  if (typeof connectNativeAndroidBrowser !== "function") return

  const endpoint = "http://127.0.0.1:9222"
  const browser = Object.freeze({ identity: "native-android-browser" })
  const calls: unknown[] = []
  const result = await connectNativeAndroidBrowser(
    async (receivedEndpoint: unknown, receivedOptions: unknown) => {
      calls.push(receivedEndpoint, receivedOptions)
      await Promise.resolve()
      return browser
    },
    endpoint
  )

  equal(result, browser)
  deepEqual(calls, [endpoint, { noDefaults: true }])
  equal(Object.isFrozen(calls[1]), true)
})

test("native Android foreground activity retries incomplete receipts within one bounded deadline", async () => {
  const acquireChromeForegroundActivityAtBoundary = Reflect.get(
    timelineHelpers,
    "acquireChromeForegroundActivityAtBoundary"
  )
  equal(typeof acquireChromeForegroundActivityAtBoundary, "function")
  if (typeof acquireChromeForegroundActivityAtBoundary !== "function") return

  const activity =
    "topResumedActivity=ActivityRecord{abc123 u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"
  const receipts = [
    { status: "unresolved", activity: "" },
    { status: "timed-out", activity: "" },
    { status: "resolved", activity }
  ]
  const events: Array<string | number> = []
  let nowAt = 1_000
  const result = await acquireChromeForegroundActivityAtBoundary({
    readActivityReceipt: async (timeoutMilliseconds: number) => {
      events.push("read", timeoutMilliseconds)
      await Promise.resolve()
      nowAt += 25
      const receipt = receipts.shift()
      if (!receipt) throw new Error("unexpected activity receipt read")
      return receipt
    },
    deadlineAt: 2_000,
    now: () => nowAt,
    maximumReadMilliseconds: 250,
    maximumPollMilliseconds: 100,
    maximumAttempts: 4,
    delay: async (milliseconds: number) => {
      events.push("delay:start", milliseconds)
      await Promise.resolve()
      nowAt += milliseconds
      events.push("delay:end")
    }
  })

  deepEqual(events, [
    "read",
    250,
    "delay:start",
    100,
    "delay:end",
    "read",
    250,
    "delay:start",
    100,
    "delay:end",
    "read",
    250
  ])
  deepEqual(result, {
    activity,
    chromeForeground: true,
    recordId: "abc123",
    taskId: "t8",
    attempts: [
      { status: "unresolved", activity: "" },
      { status: "timed-out", activity: "" },
      { status: "resolved", activity }
    ]
  })
  equal(Object.isFrozen(result.attempts), true)
})

test("native Android foreground activity caps unresolved receipt history", async () => {
  const acquireChromeForegroundActivityAtBoundary = Reflect.get(
    timelineHelpers,
    "acquireChromeForegroundActivityAtBoundary"
  )
  equal(typeof acquireChromeForegroundActivityAtBoundary, "function")
  if (typeof acquireChromeForegroundActivityAtBoundary !== "function") return

  let reads = 0
  await rejects(
    () =>
      acquireChromeForegroundActivityAtBoundary({
        readActivityReceipt: () => {
          reads += 1
          return { status: "unresolved", activity: "" }
        },
        deadlineAt: 5_000,
        now: () => 1_000,
        maximumReadMilliseconds: 250,
        maximumPollMilliseconds: 100,
        maximumAttempts: 2,
        delay: () => Promise.resolve()
      }),
    /did not resolve.*attempts=\[\{"status":"unresolved","activity":""\},\{"status":"unresolved","activity":""\}\]/u
  )
  equal(reads, 2)
})

test("native Android foreground activity rejects a resolved receipt completed at its deadline", async () => {
  const acquireChromeForegroundActivityAtBoundary = Reflect.get(
    timelineHelpers,
    "acquireChromeForegroundActivityAtBoundary"
  )
  equal(typeof acquireChromeForegroundActivityAtBoundary, "function")
  if (typeof acquireChromeForegroundActivityAtBoundary !== "function") return

  const activity =
    "topResumedActivity=ActivityRecord{late123 u0 com.android.chrome/com.google.android.apps.chrome.Main t9}"
  let nowAt = 1_000
  let reads = 0
  await rejects(
    () =>
      acquireChromeForegroundActivityAtBoundary({
        readActivityReceipt: async () => {
          reads += 1
          nowAt = 2_000
          return { status: "resolved", activity }
        },
        deadlineAt: 2_000,
        now: () => nowAt,
        maximumReadMilliseconds: 250,
        maximumPollMilliseconds: 100,
        maximumAttempts: 4,
        delay: () => Promise.resolve()
      }),
    /did not resolve.*attempts=\[\{"status":"resolved","activity":"topResumedActivity=ActivityRecord\{late123/u
  )
  equal(reads, 1)
})

test("native Android background behaviorally binds and orders the exact HOME boundary", async () => {
  const establishNativeAndroidBackgroundBoundary = Reflect.get(
    timelineHelpers,
    "establishNativeAndroidBackgroundBoundary"
  )
  equal(typeof establishNativeAndroidBackgroundBoundary, "function")
  if (typeof establishNativeAndroidBackgroundBoundary !== "function") return

  const expectedUrl = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
  const events: string[] = []
  const epochTimes = [100_100, 100_120, 100_130]
  const monotonicTimes = [500, 507]
  const result = await establishNativeAndroidBackgroundBoundary({
    bringToFront: async () => {
      events.push("bring:start")
      await Promise.resolve()
      events.push("bring:end")
    },
    readBrowserForeground: async () => {
      events.push("browser:start")
      await Promise.resolve()
      events.push("browser:end")
      return {
        url: expectedUrl,
        visibilityState: "visible",
        hidden: false,
        hasFocus: true
      }
    },
    expectedUrl,
    readChromeForegroundActivity: async () => {
      events.push("activity:start")
      await Promise.resolve()
      events.push("activity:end")
      const activity =
        "topResumedActivity=ActivityRecord{abc123 u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"
      return {
        activity,
        chromeForeground: true,
        recordId: "abc123",
        taskId: "t8",
        attempts: [{ status: "resolved", activity }]
      }
    },
    armRuntimeObservation: async () => {
      events.push("arm:start")
      await Promise.resolve()
      events.push("arm:end")
      return { at: 10_000, frame: 35, runningCount: 1, targetStatus: "running" }
    },
    epochNow: () => {
      events.push("epoch")
      const value = epochTimes.shift()
      if (value === undefined) throw new Error("unexpected epoch clock read")
      return value
    },
    monotonicNow: () => {
      events.push("monotonic")
      const value = monotonicTimes.shift()
      if (value === undefined) throw new Error("unexpected monotonic clock read")
      return value
    },
    sendHome: async () => {
      events.push("home:start")
      await Promise.resolve()
      events.push("home:end")
    }
  })

  deepEqual(events, [
    "bring:start",
    "bring:end",
    "browser:start",
    "browser:end",
    "activity:start",
    "activity:end",
    "browser:start",
    "browser:end",
    "epoch",
    "arm:start",
    "arm:end",
    "epoch",
    "epoch",
    "monotonic",
    "home:start",
    "home:end",
    "monotonic"
  ])
  deepEqual(result, {
    browserForeground: {
      url: expectedUrl,
      visibilityState: "visible",
      hidden: false,
      hasFocus: true
    },
    foregroundActivity: {
      activity:
        "topResumedActivity=ActivityRecord{abc123 u0 com.android.chrome/com.google.android.apps.chrome.Main t8}",
      chromeForeground: true,
      recordId: "abc123",
      taskId: "t8"
    },
    foregroundActivityAttempts: [
      {
        status: "resolved",
        activity:
          "topResumedActivity=ActivityRecord{abc123 u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"
      }
    ],
    clockCalibration: {
      browserToHostOffsetMilliseconds: 90_110,
      hostRoundTripMilliseconds: 20,
      maximumUncertaintyMilliseconds: 10
    },
    activeSnapshot: { at: 100_110, frame: 35, runningCount: 1, targetStatus: "running" },
    homeSignal: { at: 100_130, signal: "Android KEYCODE_HOME" },
    commandMilliseconds: 7
  })
})

test("native Android background refuses HOME when the target loses focus during activity retries", async () => {
  const establishNativeAndroidBackgroundBoundary = Reflect.get(
    timelineHelpers,
    "establishNativeAndroidBackgroundBoundary"
  )
  equal(typeof establishNativeAndroidBackgroundBoundary, "function")
  if (typeof establishNativeAndroidBackgroundBoundary !== "function") return

  const expectedUrl = "http://127.0.0.1:4173/articles/opening-night?issue=issue-2026-01"
  let browserReads = 0
  let armCalls = 0
  let homeCalls = 0
  const activity =
    "topResumedActivity=ActivityRecord{abc123 u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"

  await rejects(
    () =>
      establishNativeAndroidBackgroundBoundary({
        bringToFront: () => Promise.resolve(),
        readBrowserForeground: async () => {
          browserReads += 1
          await Promise.resolve()
          return {
            url: expectedUrl,
            visibilityState: "visible",
            hidden: false,
            hasFocus: browserReads === 1
          }
        },
        expectedUrl,
        readChromeForegroundActivity: async () => {
          await Promise.resolve()
          return {
            activity,
            chromeForeground: true,
            recordId: "abc123",
            taskId: "t8",
            attempts: [
              { status: "unresolved", activity: "" },
              { status: "resolved", activity }
            ]
          }
        },
        armRuntimeObservation: () => {
          armCalls += 1
          return Promise.resolve({
            at: 10_000,
            frame: 35,
            runningCount: 1,
            targetStatus: "running"
          })
        },
        epochNow: () => 100_000,
        monotonicNow: () => 500,
        sendHome: () => {
          homeCalls += 1
          return Promise.resolve()
        }
      }),
    /Android browser foreground receipt is not visible and focused/u
  )
  equal(browserReads, 2)
  equal(armCalls, 0)
  equal(homeCalls, 0)
})

test("native Android performance harness invokes the behavioral boundaries", () => {
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )

  match(
    performanceHarness,
    /const browser = await connectNativeAndroidBrowser\(\s*chromium\.connectOverCDP\.bind\(chromium\),\s*"http:\/\/127\.0\.0\.1:9222"\s*\)/u
  )
  match(performanceHarness, /const boundary = await establishNativeAndroidBackgroundBoundary\(\{/u)
  match(performanceHarness, /acquireChromeForegroundActivityAtBoundary\(\{/u)
  match(performanceHarness, /const ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS = 250\b/u)
  match(performanceHarness, /const ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT = 64\b/u)
  match(performanceHarness, /const CHROME_AUTOMATION_POLL_MILLISECONDS = 100\b/u)
  match(performanceHarness, /const CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS = 5_000\b/u)
  match(
    performanceHarness,
    /readActivityReceipt:\s*\(timeoutMilliseconds\)\s*=>\s*resumedActivityReceipt\(timeoutMilliseconds\)/u
  )
  match(
    performanceHarness,
    /deadlineAt:\s*performance\.now\(\)\s*\+\s*CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS/u
  )
  match(
    performanceHarness,
    /maximumReadMilliseconds:\s*ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS/u
  )
  match(performanceHarness, /maximumPollMilliseconds:\s*CHROME_AUTOMATION_POLL_MILLISECONDS/u)
  match(performanceHarness, /maximumAttempts:\s*ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT/u)
  match(
    performanceHarness,
    /normalizeChromeAutomationSurfaceWithinDeadline\(\{\s*deadlineAt:\s*deadline,\s*now:\s*\(\)\s*=>\s*performance\.now\(\),/u
  )
  match(
    performanceHarness,
    /probeSurface:\s*\(\)\s*=>\s*probeChromeContentSurfaceAtActivityBoundary\(deadline\)/u
  )
  doesNotMatch(
    performanceHarness,
    /normalizeChromeAutomationSurfaceWithinDeadline\(\{[\s\S]*readActivityReceipt:\s*\(_expectedActivity/u
  )
  match(
    performanceHarness,
    /tap:\s*\(dismissTap,\s*label\)\s*=>\s*executeBoundChromeSurfaceTap\(\{\s*deadlineAt:\s*deadline,\s*maximumMilliseconds:\s*CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS,\s*dismissTap,\s*label,\s*remainingMilliseconds:\s*requireRemainingAutomationMilliseconds,\s*runAdb:\s*adbWithTimeout\s*\}\)/u
  )
  match(
    performanceHarness,
    /delay:\s*\(milliseconds\)\s*=>\s*new Promise\(\(resolve\)\s*=>\s*setTimeout\(resolve,\s*milliseconds\)\)/u
  )
  const finalSurfaceProof = performanceHarness.match(
    /async function requireClearChromeContentSurface\(\) \{[\s\S]*?\n\}/u
  )?.[0]
  equal(typeof finalSurfaceProof, "string")
  if (typeof finalSurfaceProof === "string") {
    match(finalSurfaceProof, /surface\.status\s*(?:===|!==)\s*"clear"/u)
    doesNotMatch(finalSurfaceProof, /planChromeAutomationSurfaceNormalization/u)
  }
  match(performanceHarness, /bringToFront:\s*\(\) => page\.bringToFront\(\)/u)
  equal(performanceHarness.match(/page\.bringToFront\(\)/gu)?.length, 1)
  equal(performanceHarness.match(/"KEYCODE_HOME"/gu)?.length, 1)
  doesNotMatch(performanceHarness, /chromium\.connectOverCDP\(/u)
  doesNotMatch(performanceHarness, /await page\.bringToFront\(\)/u)
})

test("fresh Chrome native surface is normalized before lifecycle timing budgets", () => {
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  const initialSurfaceReceipt = "const initialNativeSurface = await normalizeChromeContentSurface()"
  const initialSurfaceIndex = performanceHarness.indexOf(initialSurfaceReceipt)
  const offscreenBudgetIndex = performanceHarness.indexOf(
    "const offscreen = await measureOffscreenPause(page, 0)"
  )

  equal(initialSurfaceIndex >= 0, true)
  equal(offscreenBudgetIndex >= 0, true)
  equal(initialSurfaceIndex < offscreenBudgetIndex, true)
  match(
    performanceHarness.slice(initialSurfaceIndex, offscreenBudgetIndex),
    /await page\.evaluate\(\(\) => window\.dispatchEvent\(new Event\("focus"\)\)\)/u
  )
  match(performanceHarness, /creative:\s*\{[\s\S]*initialNativeSurface,/u)
})

test("creative long-task window starts after bounded offscreen runtime preload", () => {
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  const preloadReceipt = "const creativePreload = await preloadCreativeRuntime(page, firstRuntime)"
  const preloadIndex = performanceHarness.indexOf(preloadReceipt)
  const longTaskWindowIndex = performanceHarness.indexOf("const preCreativeLongTasks =")

  equal(preloadIndex >= 0, true)
  equal(longTaskWindowIndex >= 0, true)
  equal(preloadIndex < longTaskWindowIndex, true)
  const helperStart = performanceHarness.indexOf("async function preloadCreativeRuntime")
  const helperEnd = performanceHarness.indexOf("function measureBackgroundEventPause", helperStart)
  const preloadHelper = performanceHarness.slice(helperStart, helperEnd)

  match(
    preloadHelper,
    /async function preloadCreativeRuntime\(page, runtime\) \{[\s\S]*data-runtime-near-viewport[\s\S]*data-runtime-status[\s\S]*\.toBe\("paused"\)/u
  )
  doesNotMatch(preloadHelper, /window\.scrollTo/u)
  match(preloadHelper, /element\.style\.transform\s*=\s*`translateY\(/u)
  match(preloadHelper, /element\.style\.transform\s*=\s*placement\.originalInlineTransform/u)
  doesNotMatch(
    performanceHarness.slice(preloadIndex, longTaskWindowIndex),
    /setTimeout|waitForTimeout/u
  )
  match(performanceHarness, /creative:\s*\{[\s\S]*creativePreload,/u)
})

test("lifecycle budgets start only after bounded browser quiescence", () => {
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  const quiescenceReceipt =
    "const browserQuiescence = await waitForBrowserMainThreadQuiescence(page)"
  const quiescenceIndex = performanceHarness.indexOf(quiescenceReceipt)
  const longTaskWindowIndex = performanceHarness.indexOf("const preCreativeLongTasks =")
  const helperStart = performanceHarness.indexOf(
    "function waitForBrowserMainThreadQuiescence(page)"
  )
  const helperEnd = performanceHarness.indexOf("function measureOffscreenPause", helperStart)
  const quiescenceHelper = performanceHarness.slice(helperStart, helperEnd)

  equal(quiescenceIndex >= 0, true)
  equal(quiescenceIndex < longTaskWindowIndex, true)
  match(performanceHarness, /BROWSER_QUIESCENCE_TIMEOUT_MILLISECONDS\s*=\s*10_000/u)
  match(performanceHarness, /BROWSER_QUIESCENCE_MAX_FRAME_GAP_MILLISECONDS\s*=\s*200/u)
  match(performanceHarness, /BROWSER_QUIESCENCE_CONSECUTIVE_FRAMES\s*=\s*5/u)
  match(quiescenceHelper, /requestAnimationFrame\(sample\)/u)
  match(quiescenceHelper, /deadlineAt/u)
  doesNotMatch(quiescenceHelper, /waitForTimeout/u)
  match(performanceHarness, /creative:\s*\{[\s\S]*browserQuiescence,/u)
})

test("browser runtime epochs are normalized into the bracketed host clock", () => {
  const calibration = calibrateBrowserClockToHost({
    browserEpochAtArm: 10_000,
    hostEpochBeforeArm: 100_100,
    hostEpochAfterArm: 100_120
  })

  deepEqual(calibration, {
    browserToHostOffsetMilliseconds: 90_110,
    hostRoundTripMilliseconds: 20,
    maximumUncertaintyMilliseconds: 10
  })
  deepEqual(
    normalizeBrowserRuntimeSnapshot(
      { at: 10_020, frame: 40, runningCount: 0, targetStatus: "paused" },
      calibration
    ),
    { at: 100_130, frame: 40, runningCount: 0, targetStatus: "paused" }
  )
})

test("activity classification ignores unresolved dumpsys output instead of treating it as background", () => {
  for (const activity of [
    "",
    "   ",
    "mResumedActivity: null",
    "topResumedActivity=null",
    "mResumedActivity: garbage",
    "topResumedActivity=ActivityRecord{}",
    "unexpected launcher output"
  ]) {
    equal(classifyAndroidActivityLine(activity), null)
  }

  deepEqual(
    classifyAndroidActivityLine(
      "mResumedActivity: ActivityRecord{abc com.android.chrome/com.google.android.apps.chrome.Main}"
    ),
    {
      activity:
        "mResumedActivity: ActivityRecord{abc com.android.chrome/com.google.android.apps.chrome.Main}",
      chromeForeground: true
    }
  )
  deepEqual(
    classifyAndroidActivityLine(
      "mResumedActivity: ActivityRecord{def com.google.android.apps.nexuslauncher/.NexusLauncherActivity}"
    ),
    {
      activity:
        "mResumedActivity: ActivityRecord{def com.google.android.apps.nexuslauncher/.NexusLauncherActivity}",
      chromeForeground: false
    }
  )
})

test("activity probe receipts reject timed-out partial output and resolve only one complete authority", () => {
  const classifyProbe = Reflect.get(timelineHelpers, "classifyAndroidActivityProbeResult")
  equal(typeof classifyProbe, "function")
  if (typeof classifyProbe !== "function") return

  deepEqual(
    classifyProbe({
      errorCode: "ETIMEDOUT",
      status: null,
      stdout: ATTEMPT_1_ACTIVITY_DUMP_PREFIX
    }),
    { status: "timed-out", activity: "" }
  )
  deepEqual(classifyProbe({ errorCode: null, status: 0, stdout: ATTEMPT_1_ACTIVITY_DUMP_PREFIX }), {
    status: "resolved",
    activity: ATTEMPT_1_RESUMED_ACTIVITY
  })
  for (const stdout of [
    "",
    "topResumedActivity=null",
    "topResumedActivity=ActivityRecord{6cf73ed u0 com.android.chrome/",
    `${ATTEMPT_1_ACTIVITY_DUMP_PREFIX}\n    topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}`
  ]) {
    deepEqual(classifyProbe({ errorCode: null, status: 0, stdout }), {
      status: "unresolved",
      activity: ""
    })
  }
  throws(
    () =>
      classifyProbe({
        errorCode: "EPIPE",
        status: 0,
        stdout: ATTEMPT_1_ACTIVITY_DUMP_PREFIX
      }),
    /activity probe failed/
  )
})

test("native surface readiness retries whole attempts without probing or tapping from timeout receipts", () => {
  const captureAttempt = Reflect.get(timelineHelpers, "captureChromeSurfaceProbeBoundaryAttempt")
  equal(typeof captureAttempt, "function")
  if (typeof captureAttempt !== "function") return

  let probeCalls = 0
  deepEqual(
    captureAttempt({
      readActivityReceipt: () => ({ status: "timed-out", activity: "" }),
      probeSurface: () => {
        probeCalls += 1
        return { status: "known-notification-prompt", dismissTap: { x: 592, y: 1753 } }
      }
    }),
    {
      status: "activity-unresolved",
      stage: "before",
      activityProbe: { status: "timed-out", activity: "" }
    }
  )
  equal(probeCalls, 0)

  const receipts = [
    { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY },
    { status: "timed-out", activity: "" }
  ]
  const discarded = captureAttempt({
    readActivityReceipt: () => receipts.shift() ?? { status: "unresolved", activity: "" },
    probeSurface: () => {
      probeCalls += 1
      return { status: "known-notification-prompt", dismissTap: { x: 592, y: 1753 } }
    }
  })
  deepEqual(discarded, {
    status: "activity-unresolved",
    stage: "after",
    activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
    activityProbe: { status: "timed-out", activity: "" }
  })
  equal("dismissTap" in discarded, false)
  equal(probeCalls, 1)
})

test("native surface readiness still fails closed on a resolved foreign foreground", () => {
  const captureAttempt = Reflect.get(timelineHelpers, "captureChromeSurfaceProbeBoundaryAttempt")
  equal(typeof captureAttempt, "function")
  if (typeof captureAttempt !== "function") return

  let probeCalls = 0
  throws(
    () =>
      captureAttempt({
        readActivityReceipt: () => ({
          status: "resolved",
          activity:
            "topResumedActivity=ActivityRecord{def u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}"
        }),
        probeSurface: () => {
          probeCalls += 1
          return { status: "clear" }
        }
      }),
    /Chrome is not the resumed Android activity/
  )
  equal(probeCalls, 0)
})

test("a ready native surface attempt preserves exact activity bracket identity", () => {
  const captureAttempt = Reflect.get(timelineHelpers, "captureChromeSurfaceProbeBoundaryAttempt")
  equal(typeof captureAttempt, "function")
  if (typeof captureAttempt !== "function") return

  const events: string[] = []
  const receipt = captureAttempt({
    readActivityReceipt: () => {
      events.push("activity")
      return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
    },
    probeSurface: () => {
      events.push("probe")
      return { status: "clear", probeMilliseconds: 7, hierarchyBytes: 99 }
    }
  })
  deepEqual(events, ["activity", "probe", "activity"])
  deepEqual(receipt, {
    status: "clear",
    probeMilliseconds: 7,
    hierarchyBytes: 99,
    activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
    activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
  })

  const changed = [
    { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY },
    {
      status: "resolved",
      activity:
        "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}"
    }
  ]
  throws(
    () =>
      captureAttempt({
        readActivityReceipt: () => changed.shift() ?? { status: "unresolved", activity: "" },
        probeSurface: () => ({ status: "clear" })
      }),
    /Chrome activity identity changed during the native surface probe/
  )
})

test("the exact attempt 2 Chrome notification modal resolves only its safe negative target", () => {
  deepEqual(classifyChromeAutomationSurface(ATTEMPT_2_CHROME_MODAL_XML, PIXEL_7_DISPLAY), {
    status: "known-notification-prompt",
    dismissTap: { x: 592, y: 1753 }
  })
})

test("the exact attempt 3 Pixel Launcher ANR resolves only its safe Wait target", () => {
  deepEqual(classifyChromeAutomationSurface(ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML, PIXEL_7_DISPLAY), {
    status: "known-pixel-launcher-anr",
    dismissTap: { x: 540, y: 1363 }
  })
})

test("Pixel Launcher ANR normalization fails closed on any identity or geometry drift", () => {
  const fixtures = [
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "Pixel Launcher isn't responding",
      "System UI isn't responding"
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace('rotation="0"', 'rotation="1"'),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace("android:id/alertTitle", "android:id/message"),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'resource-id="android:id/alertTitle" class="android.widget.TextView"',
      'resource-id="android:id/alertTitle" class="android.widget.Button"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace("android:id/aerr_wait", "android:id/aerr_close"),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace('text="Wait"', 'text="Close app"'),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true"',
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="false"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true"',
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="false"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'resource-id="android:id/aerr_wait" class="android.widget.Button"',
      'resource-id="android:id/aerr_wait" class="android.widget.TextView"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'resource-id="android:id/aerr_close" class="android.widget.Button"',
      'resource-id="android:id/aerr_close" class="android.widget.TextView"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace('text="Close app"', 'text="Force stop"'),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true"',
      'text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="false"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android"',
      'text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="com.android.systemui"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      '<node text="Wait"',
      '<node text="Report" resource-id="android:id/aerr_report" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1300][1010,1360]" /><node text="Wait"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="Close app" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1174][1010,1300]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="false" enabled="true" bounds="[70,1300][1010,1426]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="System UI isn&apos;t responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="android" bounds="[133,1072][947,1135]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="" resource-id="android:id/parentPanel" class="android.widget.FrameLayout" package="android" bounds="[70,1025][1010,1447]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="Force stop" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="false" enabled="true" bounds="[70,1174][1010,1300]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      `    <node text="" resource-id="android:id/parentPanel" class="android.widget.LinearLayout" package="android" bounds="[70,1025][1010,1447]">
      <node text="Pixel Launcher isn't responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="android" bounds="[133,1072][947,1135]" />
      <node text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1174][1010,1300]" />
      <node text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1300][1010,1426]" />
    </node>`,
      `    <node text="" resource-id="android:id/parentPanel" class="android.widget.LinearLayout" package="android" bounds="[70,1025][1010,1447]" />
    <node text="Pixel Launcher isn't responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="android" bounds="[133,1072][947,1135]" />
    <node text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1174][1010,1300]" />
    <node text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1300][1010,1426]" />`
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'bounds="[70,1025][1010,1447]"',
      'bounds="[70,1024][1010,1447]"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'bounds="[133,1072][947,1135]"',
      'bounds="[133,1071][947,1135]"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'bounds="[70,1174][1010,1300]"',
      'bounds="[70,1173][1010,1300]"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'bounds="[70,1300][1010,1426]"',
      'bounds="[70,1301][1010,1426]"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      'bounds="[70,1300][1010,1426]"',
      'bounds="[0,0][999999,999999]"'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      "</hierarchy>",
      '<node text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1300][1010,1426]" /></hierarchy>'
    ),
    ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML.replace(
      '<node text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true" enabled="true" bounds="[70,1174][1010,1300]" />',
      ""
    )
  ]

  for (const fixture of fixtures) {
    deepEqual(classifyChromeAutomationSurface(fixture, PIXEL_7_DISPLAY), {
      status: "blocked",
      reason: "unrecognized-or-malformed-chrome-modal"
    })
  }
  for (const displaySize of [
    { width: 1080, height: 2399 },
    { width: 1079, height: 2400 },
    { width: 1440, height: 2960 }
  ]) {
    deepEqual(classifyChromeAutomationSurface(ATTEMPT_3_PIXEL_LAUNCHER_ANR_XML, displaySize), {
      status: "blocked",
      reason: "unrecognized-or-malformed-chrome-modal"
    })
  }
})

test("native surface normalization taps each exact safe prompt at most once", () => {
  const planChromeAutomationSurfaceNormalization = Reflect.get(
    timelineHelpers,
    "planChromeAutomationSurfaceNormalization"
  )
  equal(typeof planChromeAutomationSurfaceNormalization, "function")
  if (typeof planChromeAutomationSurfaceNormalization !== "function") return

  deepEqual(
    planChromeAutomationSurfaceNormalization(
      { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1363 } },
      []
    ),
    {
      action: "tap",
      prompt: "known-pixel-launcher-anr",
      dismissTap: { x: 540, y: 1363 }
    }
  )
  deepEqual(
    planChromeAutomationSurfaceNormalization(
      { status: "known-notification-prompt", dismissTap: { x: 592, y: 1753 } },
      ["known-pixel-launcher-anr"]
    ),
    {
      action: "tap",
      prompt: "known-notification-prompt",
      dismissTap: { x: 592, y: 1753 }
    }
  )
  deepEqual(
    planChromeAutomationSurfaceNormalization(
      { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1363 } },
      ["known-pixel-launcher-anr", "known-notification-prompt"]
    ),
    { action: "poll", prompt: "known-pixel-launcher-anr" }
  )
  deepEqual(planChromeAutomationSurfaceNormalization({ status: "clear" }, []), {
    action: "accept"
  })
  throws(
    () =>
      planChromeAutomationSurfaceNormalization(
        { status: "blocked", reason: "unrecognized-or-malformed-chrome-modal" },
        []
      ),
    /blocked by an unrecognized native modal/u
  )
  for (const surface of [
    { status: "known-pixel-launcher-anr", dismissTap: { x: 0, y: 1363 } },
    { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1237 } },
    { status: "known-pixel-launcher-anr", dismissTap: { x: 592, y: 1753 } },
    { status: "known-notification-prompt", dismissTap: { x: 592, y: 99_999 } },
    { status: "known-notification-prompt", dismissTap: { x: 540, y: 1363 } },
    { status: "known-pixel-launcher-anr", dismissTap: { x: "540", y: 1363 } }
  ]) {
    throws(() => planChromeAutomationSurfaceNormalization(surface, []), /dismiss|coordinate/u)
  }
  throws(
    () =>
      planChromeAutomationSurfaceNormalization(
        { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1363 } },
        ["known-pixel-launcher-anr", "known-pixel-launcher-anr"]
      ),
    /prompt identity is invalid/u
  )
})

test("native surface normalization uses exact bracketed authority for one safe tap", () => {
  const executeChromeSurfaceNormalizationAction = Reflect.get(
    timelineHelpers,
    "executeChromeSurfaceNormalizationAction"
  )
  equal(typeof executeChromeSurfaceNormalizationAction, "function")
  if (typeof executeChromeSurfaceNormalizationAction !== "function") return

  const events: unknown[] = []
  const result = executeChromeSurfaceNormalizationAction({
    surface: {
      status: "known-pixel-launcher-anr",
      dismissTap: { x: 540, y: 1363 },
      activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
      activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
    },
    dismissedPrompts: [],
    expectedActivity: ATTEMPT_1_RESUMED_ACTIVITY,
    readActivityReceipt: () => {
      throw new Error("prompt action must not perform an auxiliary activity read")
    },
    tap: (dismissTap: unknown, label: string) => {
      events.push(label, dismissTap)
    },
    recordDismissedPrompt: (prompt: string) => events.push(`record:${prompt}`)
  })
  deepEqual(events, [
    "Pixel Launcher ANR wait tap",
    { x: 540, y: 1363 },
    "record:known-pixel-launcher-anr"
  ])
  deepEqual(result, {
    action: "tap",
    prompt: "known-pixel-launcher-anr",
    dismissTap: { x: 540, y: 1363 },
    activityBeforeTap: {
      activity: ATTEMPT_1_RESUMED_ACTIVITY,
      chromeForeground: true,
      recordId: "6cf73ed",
      taskId: "t9"
    }
  })

  let tapCalls = 0
  let recordCalls = 0
  let activityReads = 0
  throws(
    () =>
      executeChromeSurfaceNormalizationAction({
        surface: {
          status: "known-pixel-launcher-anr",
          dismissTap: { x: 540, y: 1363 },
          activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
          activityAfter:
            "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}"
        },
        dismissedPrompts: [],
        expectedActivity: ATTEMPT_1_RESUMED_ACTIVITY,
        readActivityReceipt: () => {
          activityReads += 1
          return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
        },
        tap: () => {
          tapCalls += 1
        },
        recordDismissedPrompt: () => {
          recordCalls += 1
        }
      }),
    /Chrome normalization activity identity changed/u
  )
  equal(activityReads, 0)
  equal(tapCalls, 0)
  equal(recordCalls, 0)

  activityReads = 0
  deepEqual(
    executeChromeSurfaceNormalizationAction({
      surface: { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1363 } },
      dismissedPrompts: ["known-pixel-launcher-anr"],
      expectedActivity: ATTEMPT_1_RESUMED_ACTIVITY,
      readActivityReceipt: () => {
        activityReads += 1
        return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
      },
      tap: () => {
        tapCalls += 1
      },
      recordDismissedPrompt: () => {
        recordCalls += 1
      }
    }),
    { action: "poll", prompt: "known-pixel-launcher-anr" }
  )
  equal(activityReads, 0)
  equal(tapCalls, 0)
  equal(recordCalls, 0)
})

test("native Android normalization adapters preserve raw receipts and exact bounded tap arguments", async () => {
  const normalizeChromeAutomationSurfaceWithinDeadline = Reflect.get(
    timelineHelpers,
    "normalizeChromeAutomationSurfaceWithinDeadline"
  )
  const readBoundChromeSurfaceActivityReceipt = Reflect.get(
    timelineHelpers,
    "readBoundChromeSurfaceActivityReceipt"
  )
  const executeBoundChromeSurfaceTap = Reflect.get(timelineHelpers, "executeBoundChromeSurfaceTap")
  equal(typeof normalizeChromeAutomationSurfaceWithinDeadline, "function")
  equal(typeof readBoundChromeSurfaceActivityReceipt, "function")
  equal(typeof executeBoundChromeSurfaceTap, "function")
  if (
    typeof normalizeChromeAutomationSurfaceWithinDeadline !== "function" ||
    typeof readBoundChromeSurfaceActivityReceipt !== "function" ||
    typeof executeBoundChromeSurfaceTap !== "function"
  ) {
    return
  }

  const deadlineAt = 1_000
  let nowAt = 0
  let probeCalls = 0
  let rawReceiptReads = 0
  const remainingCalls: unknown[] = []
  const adbCalls: unknown[] = []
  deepEqual(
    readBoundChromeSurfaceActivityReceipt({
      deadlineAt,
      maximumMilliseconds: 250,
      label: "surface activity",
      remainingMilliseconds: (
        receivedDeadline: number,
        maximumMilliseconds: number,
        receivedLabel: string
      ) => {
        remainingCalls.push(receivedDeadline, maximumMilliseconds, receivedLabel)
        return Math.min(receivedDeadline - nowAt, maximumMilliseconds)
      },
      readActivityReceipt: (timeoutMilliseconds: number) => {
        rawReceiptReads += 1
        remainingCalls.push("read", timeoutMilliseconds)
        return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
      }
    }),
    { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
  )
  equal(rawReceiptReads, 1)
  deepEqual(remainingCalls, [
    1_000,
    250,
    "surface activity",
    "read",
    250,
    1_000,
    1,
    "surface activity acceptance"
  ])
  rawReceiptReads = 0
  remainingCalls.length = 0
  const result = await normalizeChromeAutomationSurfaceWithinDeadline({
    deadlineAt,
    now: () => nowAt,
    maximumPollMilliseconds: 100,
    probeSurface: () => {
      probeCalls += 1
      return {
        status: probeCalls === 1 ? "known-pixel-launcher-anr" : "clear",
        ...(probeCalls === 1 ? { dismissTap: { x: 540, y: 1363 } } : {}),
        activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
        activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
      }
    },
    readActivityReceipt: () => {
      rawReceiptReads += 1
      throw new Error("prompt action must not perform an auxiliary activity read")
    },
    tap: (dismissTap: unknown, label: string) =>
      executeBoundChromeSurfaceTap({
        deadlineAt,
        maximumMilliseconds: 5_000,
        dismissTap,
        label,
        remainingMilliseconds: (
          receivedDeadline: number,
          maximumMilliseconds: number,
          receivedLabel: string
        ) => {
          remainingCalls.push(receivedDeadline, maximumMilliseconds, receivedLabel)
          return Math.min(receivedDeadline - nowAt, maximumMilliseconds)
        },
        runAdb: (...arguments_: unknown[]) => adbCalls.push(arguments_)
      }),
    delay: async (milliseconds: number) => {
      await Promise.resolve()
      nowAt += milliseconds
    }
  })

  equal(probeCalls, 2)
  equal(rawReceiptReads, 0)
  deepEqual(adbCalls, [[1_000, "shell", "input", "tap", "540", "1363"]])
  deepEqual(remainingCalls, [1_000, 5_000, "Pixel Launcher ANR wait tap"])
  equal(result.surface.status, "clear")

  const rejectedAdbCalls: unknown[] = []
  throws(
    () =>
      executeBoundChromeSurfaceTap({
        deadlineAt,
        maximumMilliseconds: 5_000,
        dismissTap: { x: 540, y: 1237 },
        label: "Pixel Launcher ANR wait tap",
        remainingMilliseconds: () => 1_000,
        runAdb: (...arguments_: unknown[]) => rejectedAdbCalls.push(arguments_)
      }),
    /tap does not match the exact known prompt target/u
  )
  equal(rejectedAdbCalls.length, 0)
})

test("c8bb cold surface probe retains one hierarchy while activity receipts retry", async () => {
  const captureWithActivityAcquisition = Reflect.get(
    timelineHelpers,
    "captureChromeSurfaceProbeBoundaryWithActivityAcquisition"
  )
  const acquireChromeForegroundActivityAtBoundary = Reflect.get(
    timelineHelpers,
    "acquireChromeForegroundActivityAtBoundary"
  )
  equal(typeof captureWithActivityAcquisition, "function")
  equal(typeof acquireChromeForegroundActivityAtBoundary, "function")
  if (
    typeof captureWithActivityAcquisition !== "function" ||
    typeof acquireChromeForegroundActivityAtBoundary !== "function"
  ) {
    return
  }

  let nowAt = 0
  let probeCalls = 0
  const events: string[] = []
  const receipts = {
    "pre-surface activity": [
      { status: "timed-out", activity: "" },
      { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
    ],
    "post-surface activity": [
      { status: "timed-out", activity: "" },
      { status: "unresolved", activity: "" },
      { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
    ]
  }
  const result = await captureWithActivityAcquisition({
    acquireActivity: (label: keyof typeof receipts) =>
      acquireChromeForegroundActivityAtBoundary({
        readActivityReceipt: async () => {
          events.push(`read:${label}`)
          const receipt = receipts[label].shift()
          if (!receipt) throw new Error(`unexpected ${label} receipt`)
          nowAt += receipt.status === "timed-out" ? 250 : 25
          return receipt
        },
        deadlineAt: 10_000,
        now: () => nowAt,
        maximumReadMilliseconds: 250,
        maximumPollMilliseconds: 100,
        maximumAttempts: 64,
        delay: async (milliseconds: number) => {
          events.push(`delay:${label}:${String(milliseconds)}`)
          nowAt += milliseconds
        }
      }),
    probeSurface: async () => {
      events.push("probe")
      probeCalls += 1
      nowAt += 5_400.404_643
      return {
        status: "known-pixel-launcher-anr",
        dismissTap: { x: 540, y: 1363 },
        probeMilliseconds: 5_400.404_643
      }
    }
  })

  equal(probeCalls, 1)
  deepEqual(events, [
    "read:pre-surface activity",
    "delay:pre-surface activity:100",
    "read:pre-surface activity",
    "probe",
    "read:post-surface activity",
    "delay:post-surface activity:100",
    "read:post-surface activity",
    "delay:post-surface activity:100",
    "read:post-surface activity"
  ])
  equal(result.status, "known-pixel-launcher-anr")
  equal(result.activityBefore, ATTEMPT_1_RESUMED_ACTIVITY)
  equal(result.activityAfter, ATTEMPT_1_RESUMED_ACTIVITY)
  equal(result.activityBeforeAttempts.length, 2)
  equal(result.activityAfterAttempts.length, 3)
  equal(nowAt, 6_275.404_643)

  let driftProbeCalls = 0
  await rejects(
    () =>
      captureWithActivityAcquisition({
        acquireActivity: async (label: string) => ({
          activity:
            label === "pre-surface activity"
              ? ATTEMPT_1_RESUMED_ACTIVITY
              : "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}",
          attempts: []
        }),
        probeSurface: async () => {
          driftProbeCalls += 1
          return { status: "known-pixel-launcher-anr", dismissTap: { x: 540, y: 1363 } }
        }
      }),
    /Chrome activity identity changed during the native surface probe/u
  )
  equal(driftProbeCalls, 1)
})

test("c8bb normalization reuses exact surface authority with no auxiliary activity read", () => {
  const executeChromeSurfaceNormalizationAction = Reflect.get(
    timelineHelpers,
    "executeChromeSurfaceNormalizationAction"
  )
  equal(typeof executeChromeSurfaceNormalizationAction, "function")
  if (typeof executeChromeSurfaceNormalizationAction !== "function") return

  let tapCalls = 0
  let recordCalls = 0
  let auxiliaryReads = 0
  const result = executeChromeSurfaceNormalizationAction({
    surface: {
      status: "known-pixel-launcher-anr",
      dismissTap: { x: 540, y: 1363 },
      activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
      activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
    },
    dismissedPrompts: [],
    expectedActivity: ATTEMPT_1_RESUMED_ACTIVITY,
    readActivityReceipt: () => {
      auxiliaryReads += 1
      throw new Error("prompt action must reuse the exact bracketed surface authority")
    },
    tap: () => {
      tapCalls += 1
    },
    recordDismissedPrompt: () => {
      recordCalls += 1
    }
  })

  equal(auxiliaryReads, 0)
  equal(tapCalls, 1)
  equal(recordCalls, 1)
  equal(result.activityBeforeTap.activity, ATTEMPT_1_RESUMED_ACTIVITY)

  let rejectedTapCalls = 0
  throws(
    () =>
      executeChromeSurfaceNormalizationAction({
        surface: {
          status: "known-pixel-launcher-anr",
          dismissTap: { x: 540, y: 1363 },
          activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
          activityAfter:
            "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}"
        },
        dismissedPrompts: [],
        expectedActivity: ATTEMPT_1_RESUMED_ACTIVITY,
        readActivityReceipt: () => {
          auxiliaryReads += 1
          return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
        },
        tap: () => {
          rejectedTapCalls += 1
        },
        recordDismissedPrompt: () => {}
      }),
    /Chrome normalization activity identity changed/u
  )
  equal(rejectedTapCalls, 0)
})

test("production binds c8bb activity acquisition to existing normalization limits", () => {
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  match(
    performanceHarness,
    /function acquireChromeSurfaceActivityWithinDeadline\(deadline, label\)[\s\S]*acquireChromeForegroundActivityAtBoundary\(\{[\s\S]*deadlineAt: deadline[\s\S]*maximumReadMilliseconds: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS[\s\S]*maximumPollMilliseconds: CHROME_AUTOMATION_POLL_MILLISECONDS[\s\S]*maximumAttempts: ANDROID_ACTIVITY_RECEIPT_HISTORY_LIMIT/u
  )
  match(
    performanceHarness,
    /captureChromeSurfaceProbeBoundaryWithActivityAcquisition\(\{[\s\S]*acquireActivity: \(label\) => acquireChromeSurfaceActivityWithinDeadline\(deadline, label\)[\s\S]*probeSurface: \(\) => probeChromeContentSurface\(deadline\)/u
  )
  doesNotMatch(
    performanceHarness,
    /function probeChromeContentSurfaceAtActivityBoundary\(deadline\) \{[\s\S]*captureChromeSurfaceProbeBoundaryAttempt/u
  )
  match(
    performanceHarness,
    /requireClearChromeContentSurface\(\)[\s\S]*CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS/u
  )
})

test("native surface normalization requires fresh probes after each bounded prompt action", async () => {
  const normalizeChromeAutomationSurfaceWithinDeadline = Reflect.get(
    timelineHelpers,
    "normalizeChromeAutomationSurfaceWithinDeadline"
  )
  equal(typeof normalizeChromeAutomationSurfaceWithinDeadline, "function")
  if (typeof normalizeChromeAutomationSurfaceWithinDeadline !== "function") return

  let nowAt = 0
  let probeCalls = 0
  let activityReads = 0
  const taps: unknown[] = []
  const surfaces = [
    {
      status: "known-pixel-launcher-anr",
      dismissTap: { x: 540, y: 1363 },
      activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
      activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
    },
    {
      status: "known-notification-prompt",
      dismissTap: { x: 592, y: 1753 },
      activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
      activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
    },
    {
      status: "clear",
      activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
      activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
    }
  ]
  const result = await normalizeChromeAutomationSurfaceWithinDeadline({
    deadlineAt: 1_000,
    now: () => nowAt,
    maximumPollMilliseconds: 100,
    probeSurface: () => {
      probeCalls += 1
      const surface = surfaces.shift()
      if (!surface) throw new Error("unexpected surface probe")
      return surface
    },
    readActivityReceipt: () => {
      activityReads += 1
      return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
    },
    tap: (dismissTap: unknown, label: string) => taps.push(label, dismissTap),
    delay: async (milliseconds: number) => {
      await Promise.resolve()
      nowAt += milliseconds
    }
  })
  equal(probeCalls, 3)
  equal(activityReads, 0)
  deepEqual(taps, [
    "Pixel Launcher ANR wait tap",
    { x: 540, y: 1363 },
    "notification tap",
    { x: 592, y: 1753 }
  ])
  deepEqual(result.dismissedPrompts, ["known-pixel-launcher-anr", "known-notification-prompt"])
  deepEqual(result.dismissedTaps, {
    "known-pixel-launcher-anr": { x: 540, y: 1363 },
    "known-notification-prompt": { x: 592, y: 1753 }
  })
  equal(result.surface.status, "clear")
  equal(result.attempts.length, 3)
  equal(result.normalizationActivity, ATTEMPT_1_RESUMED_ACTIVITY)

  nowAt = 0
  probeCalls = 0
  activityReads = 0
  taps.length = 0
  await rejects(
    () =>
      normalizeChromeAutomationSurfaceWithinDeadline({
        deadlineAt: 250,
        now: () => nowAt,
        maximumPollMilliseconds: 100,
        probeSurface: () => {
          probeCalls += 1
          return {
            status: "known-pixel-launcher-anr",
            dismissTap: { x: 540, y: 1363 },
            activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
            activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
          }
        },
        readActivityReceipt: () => {
          activityReads += 1
          return { status: "resolved", activity: ATTEMPT_1_RESUMED_ACTIVITY }
        },
        tap: (dismissTap: unknown, label: string) => taps.push(label, dismissTap),
        delay: async (milliseconds: number) => {
          await Promise.resolve()
          nowAt += milliseconds
        }
      }),
    /known native modal did not clear within the shared automation deadline/u
  )
  equal(probeCalls, 3)
  equal(activityReads, 0)
  deepEqual(taps, ["Pixel Launcher ANR wait tap", { x: 540, y: 1363 }])

  nowAt = 0
  probeCalls = 0
  activityReads = 0
  taps.length = 0
  await rejects(
    () =>
      normalizeChromeAutomationSurfaceWithinDeadline({
        deadlineAt: 250,
        now: () => nowAt,
        maximumPollMilliseconds: 100,
        probeSurface: () => {
          probeCalls += 1
          return probeCalls === 1
            ? {
                status: "known-pixel-launcher-anr",
                dismissTap: { x: 540, y: 1363 },
                activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
                activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
              }
            : {
                status: "activity-unresolved",
                stage: "before",
                activityProbe: { status: "timed-out", activity: "" }
              }
        },
        readActivityReceipt: () => {
          activityReads += 1
          throw new Error("prompt action must not perform an auxiliary activity read")
        },
        tap: (dismissTap: unknown, label: string) => taps.push(label, dismissTap),
        delay: async (milliseconds: number) => {
          nowAt += milliseconds
        }
      }),
    /activity identity did not resolve within the shared automation deadline/u
  )
  equal(probeCalls, 3)
  equal(activityReads, 0)
  deepEqual(taps, ["Pixel Launcher ANR wait tap", { x: 540, y: 1363 }])
})

test("native surface normalization retains one Chrome authority across prompt and clear attempts", () => {
  const retainChromeSurfaceNormalizationActivity = Reflect.get(
    timelineHelpers,
    "retainChromeSurfaceNormalizationActivity"
  )
  equal(typeof retainChromeSurfaceNormalizationActivity, "function")
  if (typeof retainChromeSurfaceNormalizationActivity !== "function") return
  const requireChromeSurfaceNormalizationActivity = Reflect.get(
    timelineHelpers,
    "requireChromeSurfaceNormalizationActivity"
  )
  equal(typeof requireChromeSurfaceNormalizationActivity, "function")
  if (typeof requireChromeSurfaceNormalizationActivity !== "function") return

  const first = {
    activityBefore: ATTEMPT_1_RESUMED_ACTIVITY,
    activityAfter: ATTEMPT_1_RESUMED_ACTIVITY
  }
  equal(retainChromeSurfaceNormalizationActivity(null, first), ATTEMPT_1_RESUMED_ACTIVITY)
  equal(
    retainChromeSurfaceNormalizationActivity(ATTEMPT_1_RESUMED_ACTIVITY, first),
    ATTEMPT_1_RESUMED_ACTIVITY
  )
  for (const changedActivity of [
    "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t9}",
    "topResumedActivity=ActivityRecord{6cf73ed u0 com.android.chrome/com.google.android.apps.chrome.Main t10}",
    "topResumedActivity=ActivityRecord{launcher u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t1}"
  ]) {
    throws(
      () =>
        retainChromeSurfaceNormalizationActivity(ATTEMPT_1_RESUMED_ACTIVITY, {
          activityBefore: changedActivity,
          activityAfter: changedActivity
        }),
      /normalization activity identity changed|Chrome is not the resumed Android activity/u
    )
  }
  deepEqual(
    requireChromeSurfaceNormalizationActivity(ATTEMPT_1_RESUMED_ACTIVITY, {
      status: "resolved",
      activity: ATTEMPT_1_RESUMED_ACTIVITY
    }),
    {
      activity: ATTEMPT_1_RESUMED_ACTIVITY,
      chromeForeground: true,
      recordId: "6cf73ed",
      taskId: "t9"
    }
  )
  for (const receipt of [
    { status: "unresolved", activity: "" },
    { status: "timed-out", activity: "" },
    {
      status: "resolved",
      activity:
        "topResumedActivity=ActivityRecord{different u0 com.android.chrome/com.google.android.apps.chrome.Main t10}"
    }
  ]) {
    throws(
      () => requireChromeSurfaceNormalizationActivity(ATTEMPT_1_RESUMED_ACTIVITY, receipt),
      /normalization activity receipt did not resolve|normalization activity identity changed/u
    )
  }
})

test("Chrome automation surface is clear only when no native modal markers exist", () => {
  deepEqual(
    classifyChromeAutomationSurface(
      '<hierarchy><node package="com.android.chrome" text="Courtside TW" /></hierarchy>'
    ),
    { status: "clear" }
  )
})

test("foreign Android surfaces never certify the Chrome content surface as clear", () => {
  for (const packageName of [
    "com.google.android.apps.nexuslauncher",
    "com.android.permissioncontroller"
  ]) {
    deepEqual(
      classifyChromeAutomationSurface(
        `<hierarchy><node package="${packageName}" text="Foreign foreground surface" /></hierarchy>`
      ),
      {
        status: "blocked",
        reason: "chrome-package-not-visible"
      }
    )
  }
})

test("unknown or malformed Chrome native modals fail closed without a tap target", () => {
  const fixtures = [
    ATTEMPT_2_CHROME_MODAL_XML.replace('bounds="[477,1690][708,1816]"', 'bounds="bad"'),
    ATTEMPT_2_CHROME_MODAL_XML.replace(
      "Chrome notifications make things easier",
      "Unknown Chrome prompt"
    ),
    ATTEMPT_2_CHROME_MODAL_XML.replace(
      'resource-id="com.android.chrome:id/negative_button"',
      'resource-id="com.android.chrome:id/positive_button"'
    ),
    ATTEMPT_2_CHROME_MODAL_XML.replace(
      'bounds="[477,1690][708,1816]"',
      'bounds="[0,0][999999,999999]"'
    ),
    ATTEMPT_2_CHROME_MODAL_XML.replace(
      'bounds="[477,1690][708,1816]"',
      `bounds="[477,1690][${"9".repeat(400)},1816]"`
    ),
    ATTEMPT_2_CHROME_MODAL_XML.replace(
      'bounds="[28,615][1052,1858]"',
      'bounds="[0,0][999999,999999]"'
    ).replace('bounds="[477,1690][708,1816]"', 'bounds="[900000,900000][999999,999999]"'),
    '<hierarchy><node text="No thanks" resource-id="com.android.chrome:id/negative_button" bounds="[477,1690][708,1816]" /></hierarchy>',
    '<hierarchy rotation="0"><node package="com.android.chrome" text="Courtside TW" />',
    '<hierarchy rotation="0"><node package="com.android.chrome" resource-id="com.android.chrome:id/update_dialog" class="android.app.Dialog" text="Update Chrome" clickable="true" enabled="true" bounds="[28,615][1052,1858]" /></hierarchy>',
    '<hierarchy><node package="com.android.chrome" resource-id="com.android.chrome:id/update_prompt" class="android.app.AlertDialog" /></hierarchy>'
  ]

  for (const fixture of fixtures) {
    deepEqual(classifyChromeAutomationSurface(fixture, PIXEL_7_DISPLAY), {
      status: "blocked",
      reason: "unrecognized-or-malformed-chrome-modal"
    })
  }
})

test("the observation boundary requires a fresh resolved Android activity identity", () => {
  for (const activity of ["", "topResumedActivity=null", "mResumedActivity: garbage"]) {
    throws(() => requireAndroidActivityAtBoundary(activity), /activity identity is unresolved/)
  }
  deepEqual(
    requireAndroidActivityAtBoundary(
      "topResumedActivity=ActivityRecord{def u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}"
    ),
    {
      activity:
        "topResumedActivity=ActivityRecord{def u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}",
      chromeForeground: false
    }
  )
})

test("Chrome surface identity requires a fresh resumed Chrome activity", () => {
  throws(
    () =>
      requireChromeForegroundActivityAtBoundary(
        "topResumedActivity=ActivityRecord{def u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}"
      ),
    /Chrome is not the resumed Android activity/
  )
  deepEqual(
    requireChromeForegroundActivityAtBoundary(
      "topResumedActivity=ActivityRecord{abc u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"
    ),
    {
      activity:
        "topResumedActivity=ActivityRecord{abc u0 com.android.chrome/com.google.android.apps.chrome.Main t8}",
      chromeForeground: true,
      recordId: "abc",
      taskId: "t8"
    }
  )
  throws(
    () =>
      requireChromeForegroundActivityAtBoundary(
        "topResumedActivity=ActivityRecord{abc u0 com.android.chrome/com.google.android.apps.chrome.Main}"
      ),
    /Chrome activity identity lacks an ActivityRecord token and task id/
  )
})

test("native surface probes are behaviorally bracketed by fresh Chrome activity reads", () => {
  const chromeActivity =
    "topResumedActivity=ActivityRecord{abc u0 com.android.chrome/com.google.android.apps.chrome.Main t8}"
  const events: string[] = []
  const receipt = captureChromeSurfaceProbeBoundary({
    readActivity: () => {
      events.push("activity")
      return chromeActivity
    },
    probeSurface: () => {
      events.push("probe")
      return { status: "clear", probeMilliseconds: 7, hierarchyBytes: 99 }
    }
  })

  deepEqual(events, ["activity", "probe", "activity"])
  deepEqual(receipt, {
    status: "clear",
    probeMilliseconds: 7,
    hierarchyBytes: 99,
    activityBefore: chromeActivity,
    activityAfter: chromeActivity
  })
})

test("native surface probe rejects a post-probe foreground identity change", () => {
  const activities = [
    "topResumedActivity=ActivityRecord{abc u0 com.android.chrome/com.google.android.apps.chrome.Main t8}",
    "topResumedActivity=ActivityRecord{def u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}"
  ]
  throws(
    () =>
      captureChromeSurfaceProbeBoundary({
        readActivity: () => activities.shift() ?? "",
        probeSurface: () => ({ status: "clear" })
      }),
    /Chrome is not the resumed Android activity/
  )
})

test("native surface probe rejects a different Chrome activity or task identity", () => {
  const activities = [
    "topResumedActivity=ActivityRecord{aaa u0 com.android.chrome/com.google.android.apps.chrome.Main t8}",
    "topResumedActivity=ActivityRecord{bbb u0 com.android.chrome/com.google.android.apps.chrome.Main t9}"
  ]
  throws(
    () =>
      captureChromeSurfaceProbeBoundary({
        readActivity: () => activities.shift() ?? "",
        probeSurface: () => ({ status: "clear" })
      }),
    /Chrome activity identity changed during the native surface probe/
  )
})

test("Android display receipts prefer the active override and reject malformed sizes", () => {
  deepEqual(parseAndroidDisplaySize("Physical size: 1080x2400"), PIXEL_7_DISPLAY)
  deepEqual(
    parseAndroidDisplaySize("Physical size: 1440x3120\nOverride size: 1080x2400"),
    PIXEL_7_DISPLAY
  )
  for (const value of [
    "",
    "Physical size: 0x2400",
    "Physical size: 999999x999999",
    "Physical size: 1080x2400\nOverride size: malformed",
    "Physical size: 1080x2400\nOverride size: 1080x2400\nOverride size: 1080x2400"
  ]) {
    throws(() => parseAndroidDisplaySize(value), /Android display size receipt is invalid/)
  }
})

test("active snapshot requires exactly one running runtime", () => {
  equal(
    evaluateAndroidBackgroundTimeline(timeline({ activeRunningCount: 1 }), BUDGETS)
      .activeRunningCount,
    1
  )
  for (const runningCount of [0, 2]) {
    throws(
      () =>
        evaluateAndroidBackgroundTimeline(timeline({ activeRunningCount: runningCount }), BUDGETS),
      /active runtime snapshot must contain exactly one running canvas/
    )
  }
})

test("paused and observed snapshots require zero running runtimes", () => {
  throws(
    () => evaluateAndroidBackgroundTimeline(timeline({ pauseRunningCount: 1 }), BUDGETS),
    /runtime pause snapshot must contain zero running canvases/
  )
  throws(
    () => evaluateAndroidBackgroundTimeline(timeline({ observationRunningCount: 1 }), BUDGETS),
    /background observation snapshot must contain zero running canvases/
  )
  for (const targetStatus of ["idle", "loading", "error", "removed", "missing"]) {
    const candidate = { at: 140, frame: 40, runningCount: 0, targetStatus }
    equal(retainFirstPausedSnapshot(null, candidate), null)
    throws(
      () => evaluateAndroidBackgroundTimeline({ ...timeline(), pauseSnapshot: candidate }, BUDGETS),
      /runtime pause snapshot must have paused status/
    )
    throws(
      () =>
        evaluateAndroidBackgroundTimeline(
          { ...timeline(), observationSnapshot: { ...candidate, at: 1_640 } },
          BUDGETS
        ),
      /background observation snapshot must have paused status/
    )
  }
})

test("background timeline fails closed when the runtime never pauses", () => {
  throws(
    () => evaluateAndroidBackgroundTimeline(timeline({ pauseSnapshot: null }), BUDGETS),
    /runtime pause was never observed/
  )
})

test("background timeline rejects an automatic Chrome foreground return", () => {
  throws(
    () =>
      evaluateAndroidBackgroundTimeline(
        timeline({
          activityTransitions: [
            { at: 120, chromeForeground: false, activity: "Launcher" },
            { at: 900, chromeForeground: true, activity: "Chrome" }
          ]
        }),
        BUDGETS
      ),
    /returned to the foreground during frame observation/
  )
})

test("post-pause frames use the runtime pause frame and preserve the existing budget", () => {
  equal(
    evaluateAndroidBackgroundTimeline(timeline({ pauseFrame: 40, observationFrame: 42 }), BUDGETS)
      .postPauseFrames,
    2
  )
  throws(
    () =>
      evaluateAndroidBackgroundTimeline(
        timeline({ pauseFrame: 40, observationFrame: 43 }),
        BUDGETS
      ),
    /post-pause frames: expected <= 2, received 3/
  )
})

test("a live atomic snapshot recovers a pause when the lifecycle observer is frozen", () => {
  const active = { at: 120, frame: 39, runningCount: 1, targetStatus: "running" }
  const paused = { at: 140, frame: 40, runningCount: 0, targetStatus: "paused" }
  const later = { at: 200, frame: 40, runningCount: 0, targetStatus: "paused" }

  equal(retainFirstPausedSnapshot(null, active), null)
  deepEqual(retainFirstPausedSnapshot(null, paused), paused)
  deepEqual(retainFirstPausedSnapshot(paused, later), paused)
})

test("blocking ADB polls clamp an expired timer instead of scheduling a negative timeout", () => {
  equal(boundedAndroidPollDelay(-57.6, 100), 0)
  equal(boundedAndroidPollDelay(40, 100), 40)
  equal(boundedAndroidPollDelay(140, 100), 100)
})

test("one shared deadline charges every blocking Android automation command", () => {
  const commandTimeout = Reflect.get(timelineHelpers, "androidCommandTimeoutMilliseconds")
  equal(typeof commandTimeout, "function")
  if (typeof commandTimeout !== "function") return

  let now = 9_600
  const deadline = 10_000
  const allocate = (maximumMilliseconds: number) => {
    const timeout = commandTimeout(deadline, now, maximumMilliseconds)
    now += timeout
    return timeout
  }

  equal(allocate(250), 250)
  equal(allocate(5_000), 150)
  equal(allocate(5_000), 0)
  equal(now, deadline)
  equal(commandTimeout(5_000, 4_999, 5_000), 1)
  equal(commandTimeout(5_000, 4_999.2, 5_000), 0)
})

test("cold UIAutomator can use the remaining normalization envelope without widening final proof", () => {
  const commandTimeout = Reflect.get(timelineHelpers, "androidCommandTimeoutMilliseconds")
  equal(typeof commandTimeout, "function")
  if (typeof commandTimeout !== "function") return

  equal(commandTimeout(10_000, 3_360, 5_000), 5_000)
  equal(commandTimeout(10_000, 3_360, 10_000), 6_640)

  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  match(
    performanceHarness,
    /function probeChromeContentSurface\(deadline\) \{[\s\S]*requireRemainingAutomationMilliseconds\(\s*deadline,\s*CHROME_AUTOMATION_SETTLE_TIMEOUT_MILLISECONDS,\s*"UIAutomator probe"/u
  )
  match(
    performanceHarness,
    /function requireClearChromeContentSurface\(\) \{\s*const deadline =\s*performance\.now\(\) \+ CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS/u
  )
  match(
    performanceHarness,
    /if \(result\.error\?\.code === "ETIMEDOUT"\) \{[\s\S]*throw new Error[\s\S]*const hierarchy =[\s\S]*classifyChromeAutomationSurface/u
  )
  doesNotMatch(performanceHarness, /surface-unresolved/u)
})

test("bounded UIAutomator read-back pins the Pixel 7 guest to four cores", () => {
  const ciWorkflow = readFileSync(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  )

  match(ciWorkflow, /profile: pixel_7\s+cores: 4\s+ram-size: 4096M/u)
})

test("AVD preparation removes ambiguous hardware keys before writing one canonical binding", () => {
  const canonicalize = Reflect.get(timelineHelpers, "canonicalizeAndroidAvdConfig")
  equal(typeof canonicalize, "function")
  if (typeof canonicalize !== "function") return

  equal(
    canonicalize(
      [
        `AvdId=${ANDROID_AVD_NAME}`,
        `hw.device.name=${ANDROID_PROFILE}`,
        "hw.cpu.ncore=2",
        "hw.ramSize=2560",
        "vm.heapSize=512",
        "hw.cpu.ncore=4",
        "hw.ramSize=4096M",
        "hw.heapSize=576M",
        "image.sysdir.1=system-images/android-35/google_apis_playstore/x86_64/"
      ].join("\n")
    ),
    [
      `AvdId=${ANDROID_AVD_NAME}`,
      `hw.device.name=${ANDROID_PROFILE}`,
      "image.sysdir.1=system-images/android-35/google_apis_playstore/x86_64/",
      "hw.cpu.ncore=4",
      "hw.ramSize=4096",
      "vm.heapSize=576",
      ""
    ].join("\n")
  )
})

test("emulator environment proof binds requested, resolved and live hardware", () => {
  const evaluate = Reflect.get(timelineHelpers, "evaluateAndroidEmulatorEnvironment")
  equal(typeof evaluate, "function")
  if (typeof evaluate !== "function") return

  deepEqual(
    evaluate({
      requested: {
        avdName: ANDROID_AVD_NAME,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramInput: "4096M",
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      canonicalConfig: "hw.device.name=pixel_7\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n",
      resolvedHardware:
        "hw.device.name = pixel_7\navd.name = courtside-api35-pixel7\navd.id = courtside-api35-pixel7\nhw.cpu.ncore = 4\nhw.ramSize = 4096\nvm.heapSize = 576\n",
      liveAvdName: `${ANDROID_AVD_NAME}\nOK\n`,
      guestCpuOnline: "0-3\n",
      guestMeminfo: "MemTotal:        3973120 kB\nMemFree:          512000 kB\n",
      guestHeapSize: "576m\n"
    }),
    {
      schemaVersion: "courtside.android-emulator-environment/v1",
      result: "PASS",
      requested: {
        avdName: ANDROID_AVD_NAME,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramInput: "4096M",
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      canonicalConfig: {
        avdId: null,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      resolvedHardware: {
        avdName: ANDROID_AVD_NAME,
        avdId: ANDROID_AVD_NAME,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      liveGuest: {
        avdName: ANDROID_AVD_NAME,
        cpuOnline: "0-3",
        cpuCores: 4,
        memTotalKilobytes: 3_973_120,
        heapMegabytes: 576
      }
    }
  )
})

test("emulator environment proof rejects ambiguous, missing or drifted bindings", () => {
  const evaluate = Reflect.get(timelineHelpers, "evaluateAndroidEmulatorEnvironment")
  equal(typeof evaluate, "function")
  if (typeof evaluate !== "function") return

  const valid = {
    requested: {
      avdName: ANDROID_AVD_NAME,
      profile: ANDROID_PROFILE,
      cpuCores: 4,
      ramInput: "4096M",
      ramMegabytes: 4096,
      heapMegabytes: 576
    },
    canonicalConfig:
      "AvdId=courtside-api35-pixel7\nhw.device.name=pixel_7\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n",
    resolvedHardware:
      "hw.device.name=pixel_7\navd.name=courtside-api35-pixel7\navd.id=courtside-api35-pixel7\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n",
    liveAvdName: `${ANDROID_AVD_NAME}\nOK\n`,
    guestCpuOnline: "0-3\n",
    guestMeminfo: "MemTotal: 3973120 kB\n",
    guestHeapSize: "576m\n"
  }
  const invalid = [
    {
      label: "duplicate canonical CPU",
      value: { ...valid, canonicalConfig: `${valid.canonicalConfig}hw.cpu.ncore=4\n` }
    },
    {
      label: "missing resolved RAM",
      value: {
        ...valid,
        resolvedHardware: valid.resolvedHardware.replace("hw.ramSize=4096\n", "")
      }
    },
    {
      label: "resolved CPU drift",
      value: { ...valid, resolvedHardware: valid.resolvedHardware.replace("ncore=4", "ncore=2") }
    },
    {
      label: "resolved RAM drift",
      value: {
        ...valid,
        resolvedHardware: valid.resolvedHardware.replace("ramSize=4096", "ramSize=2560")
      }
    },
    {
      label: "resolved heap drift",
      value: {
        ...valid,
        resolvedHardware: valid.resolvedHardware.replace("heapSize=576", "heapSize=512")
      }
    },
    {
      label: "malformed canonical RAM",
      value: {
        ...valid,
        canonicalConfig: valid.canonicalConfig.replace("ramSize=4096", "ramSize=4096M")
      }
    },
    {
      label: "malformed resolved RAM",
      value: {
        ...valid,
        resolvedHardware: valid.resolvedHardware.replace("ramSize=4096", "ramSize=4096M")
      }
    },
    {
      label: "malformed canonical heap",
      value: {
        ...valid,
        canonicalConfig: valid.canonicalConfig.replace("heapSize=576", "heapSize=576M")
      }
    },
    {
      label: "malformed resolved heap",
      value: {
        ...valid,
        resolvedHardware: valid.resolvedHardware.replace("heapSize=576", "heapSize=576M")
      }
    },
    {
      label: "canonical AVD identity drift",
      value: {
        ...valid,
        canonicalConfig: valid.canonicalConfig.replace(ANDROID_AVD_NAME, "other-avd")
      }
    },
    {
      label: "duplicate canonical AVD identity",
      value: {
        ...valid,
        canonicalConfig: `${valid.canonicalConfig}AvdId=${ANDROID_AVD_NAME}\n`
      }
    },
    {
      label: "missing canonical profile",
      value: {
        ...valid,
        canonicalConfig: valid.canonicalConfig.replace("hw.device.name=pixel_7\n", "")
      }
    },
    {
      label: "duplicate resolved AVD name",
      value: {
        ...valid,
        resolvedHardware: `${valid.resolvedHardware}avd.name=${ANDROID_AVD_NAME}\n`
      }
    },
    { label: "live AVD identity drift", value: { ...valid, liveAvdName: "other-avd\nOK\n" } },
    {
      label: "requested AVD identity drift",
      value: { ...valid, requested: { ...valid.requested, avdName: "other-avd" } }
    },
    {
      label: "requested RAM megabytes drift",
      value: { ...valid, requested: { ...valid.requested, ramMegabytes: 2048 } }
    },
    { label: "offline CPU", value: { ...valid, guestCpuOnline: "0-2\n" } },
    { label: "extra CPU", value: { ...valid, guestCpuOnline: "0-4\n" } },
    {
      label: "guest memory below the 4 GB class",
      value: { ...valid, guestMeminfo: "MemTotal: 3145727 kB\n" }
    },
    {
      label: "guest memory above the bound",
      value: { ...valid, guestMeminfo: "MemTotal: 4194305 kB\n" }
    },
    { label: "guest heap drift", value: { ...valid, guestHeapSize: "512m\n" } }
  ]

  for (const fixture of invalid) {
    throws(() => evaluate(fixture.value), new RegExp(fixture.label, "u"))
  }
})

test("timed-out or nonzero emulator probes never accept partial stdout", () => {
  const classify = Reflect.get(timelineHelpers, "classifyAndroidEnvironmentProbeResult")
  equal(typeof classify, "function")
  if (typeof classify !== "function") return

  throws(
    () => classify({ status: null, errorCode: "ETIMEDOUT", stdout: "0-3\n", stderr: "" }),
    /timed out/u
  )
  throws(
    () => classify({ status: 1, errorCode: null, stdout: "0-3\n", stderr: "denied" }),
    /status 1/u
  )
  throws(() => classify({ status: 0, errorCode: null, stdout: "", stderr: "" }), /empty stdout/u)
  equal(classify({ status: 0, errorCode: null, stdout: "0-3\n", stderr: "" }), "0-3")
})

test("Android smoke verifies one fixed emulator receipt before Chrome starts", () => {
  const shellHarness = readFileSync(
    new URL("../../../../scripts/test/run-android-chrome-offline-smoke.sh", import.meta.url),
    "utf8"
  )
  const ciWorkflow = readFileSync(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  )
  const verifierCommand =
    'node apps/web/scripts/android-emulator-environment.mjs verify "$artifact_dir/emulator-environment.json"'
  const androidJobStart = ciWorkflow.indexOf("  android-chrome-smoke:")
  const androidJobEnd = ciWorkflow.indexOf("\n  java-quality:", androidJobStart)
  const androidJob = ciWorkflow.slice(androidJobStart, androidJobEnd)

  match(androidJob, /avd-name: \$\{\{ env\.COURTSIDE_ANDROID_AVD_NAME \}\}/u)
  match(androidJob, /pre-emulator-launch-script:[^\n]*android-emulator-environment\.mjs prepare/u)
  match(shellHarness, /diagnostic_phase="emulator-environment"/u)
  match(shellHarness, /emulator-environment\.json/u)
  equal(shellHarness.indexOf(verifierCommand) >= 0, true)
  equal(
    shellHarness.indexOf(verifierCommand) < shellHarness.indexOf('launch_chrome "offline"'),
    true
  )
})

test("emulator environment CLI canonicalizes and joins host, resolved and live identity", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "courtside-emulator-environment-"))
  const avdHome = join(fixtureRoot, "avd-home")
  const avdDirectory = join(avdHome, `${ANDROID_AVD_NAME}.avd`)
  const artifactDirectory = join(fixtureRoot, "artifacts", "android-chrome")
  const fakeBin = join(fixtureRoot, "bin")
  const scriptPath = fileURLToPath(
    new URL("../../scripts/android-emulator-environment.mjs", import.meta.url)
  )
  const registryPath = join(avdHome, `${ANDROID_AVD_NAME}.ini`)
  const configPath = join(avdDirectory, "config.ini")
  const resolvedPath = join(avdDirectory, "hardware-qemu.ini")
  const prepareReceiptPath = join(artifactDirectory, "emulator-environment-prepare.json")
  const verifyReceiptPath = join(artifactDirectory, "emulator-environment.json")

  mkdirSync(avdDirectory, { recursive: true })
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fixtureRoot, "artifacts", "exact-head.json"),
    `${JSON.stringify({ source_head_sha: EXACT_HEAD_SHA })}\n`,
    "utf8"
  )
  writeFileSync(
    registryPath,
    `avd.ini.encoding=UTF-8\npath=${avdDirectory}\npath.rel=avd/${ANDROID_AVD_NAME}.avd\ntarget=android-35\n`,
    "utf8"
  )
  writeFileSync(
    configPath,
    [
      `hw.device.name=${ANDROID_PROFILE}`,
      "hw.cpu.ncore=2",
      "hw.cpu.ncore=4",
      "hw.ramSize=4096M",
      "vm.heapSize=228",
      "hw.heapSize=576M",
      "image.sysdir.1=system-images/android-35/google_apis_playstore/x86_64/",
      ""
    ].join("\n"),
    "utf8"
  )
  const fakeAdb = join(fakeBin, "adb")
  writeFileSync(
    fakeAdb,
    `#!/usr/bin/env node
const command = process.argv.slice(2).join(" ")
if (command === "emu avd name") process.stdout.write((process.env.FAKE_AVD_NAME ?? "${ANDROID_AVD_NAME}") + "\\nOK\\n")
else if (command === "exec-out cat /sys/devices/system/cpu/online") process.stdout.write("0-3\\n")
else if (command === "exec-out cat /proc/meminfo") process.stdout.write("MemTotal: 3973120 kB\\n")
else if (command === "exec-out getprop dalvik.vm.heapsize") process.stdout.write("576m\\n")
else { process.stderr.write("unexpected fake adb command"); process.exitCode = 1 }
`,
    "utf8"
  )
  chmodSync(fakeAdb, 0o755)
  const environment = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    ANDROID_SERIAL: "emulator-5554",
    COURTSIDE_ANDROID_AVD_NAME: ANDROID_AVD_NAME,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`
  }

  try {
    const prepare = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "artifacts/android-chrome/emulator-environment-prepare.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(prepare.status, 0, prepare.stderr)
    const canonicalConfig = readFileSync(configPath, "utf8")
    equal(canonicalConfig.match(/^hw\.cpu\.ncore=/gmu)?.length, 1)
    equal(canonicalConfig.match(/^hw\.ramSize=/gmu)?.length, 1)
    equal(canonicalConfig.match(/^vm\.heapSize=/gmu)?.length, 1)
    equal(canonicalConfig.match(/^AvdId=/gmu)?.length ?? 0, 0)
    doesNotMatch(canonicalConfig, /^hw\.heapSize=/mu)
    doesNotMatch(canonicalConfig, /^AvdId=/mu)
    match(canonicalConfig, /^hw\.cpu\.ncore=4$/mu)
    match(canonicalConfig, /^hw\.ramSize=4096$/mu)
    match(canonicalConfig, /^vm\.heapSize=576$/mu)
    const prepareReceipt = JSON.parse(readFileSync(prepareReceiptPath, "utf8"))
    deepEqual(prepareReceipt, {
      schemaVersion: "courtside.android-emulator-environment/v1",
      result: "PASS",
      phase: "prepare",
      sourceHeadSha: EXACT_HEAD_SHA,
      requested: {
        avdName: ANDROID_AVD_NAME,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramInput: "4096M",
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      canonicalConfig: {
        avdId: null,
        profile: ANDROID_PROFILE,
        cpuCores: 4,
        ramMegabytes: 4096,
        heapMegabytes: 576
      },
      avdRegistry: {
        avdName: ANDROID_AVD_NAME,
        registryFile: `${ANDROID_AVD_NAME}.ini`,
        avdDirectory: `${ANDROID_AVD_NAME}.avd`
      },
      capturedAt: prepareReceipt.capturedAt
    })

    writeFileSync(
      resolvedPath,
      [
        `hw.device.name = ${ANDROID_PROFILE}`,
        `avd.name = ${ANDROID_AVD_NAME}`,
        `avd.id = ${ANDROID_AVD_NAME}`,
        "hw.cpu.ncore = 4",
        "hw.ramSize = 4096",
        "vm.heapSize = 576",
        ""
      ].join("\n"),
      "utf8"
    )
    const verify = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/emulator-environment.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(verify.status, 0, verify.stderr)
    const receipt = JSON.parse(readFileSync(verifyReceiptPath, "utf8"))
    equal(receipt.result, "PASS")
    equal(receipt.phase, "verify")
    equal(receipt.sourceHeadSha, EXACT_HEAD_SHA)
    equal(receipt.liveGuest.avdName, ANDROID_AVD_NAME)
    deepEqual(receipt.canonicalConfig, {
      avdId: null,
      profile: ANDROID_PROFILE,
      cpuCores: 4,
      ramMegabytes: 4096,
      heapMegabytes: 576
    })
    deepEqual(receipt.resolvedHardware, {
      avdName: ANDROID_AVD_NAME,
      avdId: ANDROID_AVD_NAME,
      profile: ANDROID_PROFILE,
      cpuCores: 4,
      ramMegabytes: 4096,
      heapMegabytes: 576
    })
    deepEqual(receipt.avdRegistry, {
      avdName: ANDROID_AVD_NAME,
      registryFile: `${ANDROID_AVD_NAME}.ini`,
      avdDirectory: `${ANDROID_AVD_NAME}.avd`
    })
    deepEqual(
      receipt.commands.map((command: { name: string }) => command.name),
      ["live-avd-name", "guest-cpu-online", "guest-meminfo", "guest-heap-size"]
    )
    for (const command of receipt.commands) {
      equal(command.timeoutMilliseconds, 5_000)
      equal(command.errorCode, null)
      equal(command.signal, null)
      equal(command.timedOut, false)
      equal(command.stderr, "")
      equal(command.stderrTruncated, false)
    }

    const actionCreatedConfig = readFileSync(configPath, "utf8")
    const otherAvdDirectory = join(avdHome, "other-avd.avd")
    const otherActionCreatedConfig =
      `hw.device.name=${ANDROID_PROFILE}\n` + "hw.cpu.ncore=4\nhw.ramSize=4096M\nvm.heapSize=576\n"
    mkdirSync(otherAvdDirectory)
    writeFileSync(
      join(avdHome, "other-avd.ini"),
      `avd.ini.encoding=UTF-8\npath=${otherAvdDirectory}\npath.rel=avd/other-avd.avd\ntarget=android-35\n`,
      "utf8"
    )
    writeFileSync(join(otherAvdDirectory, "config.ini"), otherActionCreatedConfig, "utf8")
    const requestedIdentityDrift = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "artifacts/android-chrome/requested-identity-drift.json"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
        env: { ...environment, COURTSIDE_ANDROID_AVD_NAME: "other-avd" }
      }
    )
    equal(requestedIdentityDrift.status, 1)
    equal(readFileSync(configPath, "utf8"), actionCreatedConfig)
    equal(readFileSync(join(otherAvdDirectory, "config.ini"), "utf8"), otherActionCreatedConfig)
    const requestedIdentityDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "requested-identity-drift.json"), "utf8")
    )
    equal(requestedIdentityDriftReceipt.result, "FAIL")
    equal(requestedIdentityDriftReceipt.phase, "prepare")
    match(requestedIdentityDriftReceipt.reason, /requested AVD identity drift/u)

    const verifiedCanonicalConfig = readFileSync(configPath, "utf8")
    writeFileSync(configPath, `AvdId=other-avd\n${verifiedCanonicalConfig}`, "utf8")
    const canonicalDrift = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/canonical-drift.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(canonicalDrift.status, 1)
    const canonicalDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "canonical-drift.json"), "utf8")
    )
    equal(canonicalDriftReceipt.result, "FAIL")
    equal("liveGuest" in canonicalDriftReceipt, false)
    deepEqual(canonicalDriftReceipt.commands, [])
    match(canonicalDriftReceipt.reason, /canonical AVD identity drift/u)
    writeFileSync(configPath, verifiedCanonicalConfig, "utf8")

    const verifiedResolvedHardware = readFileSync(resolvedPath, "utf8")
    writeFileSync(
      resolvedPath,
      verifiedResolvedHardware.replace(
        `hw.device.name = ${ANDROID_PROFILE}`,
        "hw.device.name = other_profile"
      ),
      "utf8"
    )
    const resolvedDrift = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/resolved-drift.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(resolvedDrift.status, 1)
    const resolvedDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "resolved-drift.json"), "utf8")
    )
    equal(resolvedDriftReceipt.result, "FAIL")
    equal("liveGuest" in resolvedDriftReceipt, false)
    deepEqual(resolvedDriftReceipt.commands, [])
    match(resolvedDriftReceipt.reason, /resolved profile drift/u)
    writeFileSync(resolvedPath, verifiedResolvedHardware, "utf8")

    const liveDrift = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/live-drift.json"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
        env: { ...environment, FAKE_AVD_NAME: "other-avd" }
      }
    )
    equal(liveDrift.status, 1)
    const liveDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "live-drift.json"), "utf8")
    )
    equal(liveDriftReceipt.result, "FAIL")
    equal("liveGuest" in liveDriftReceipt, false)
    match(liveDriftReceipt.reason, /live AVD identity drift/u)

    const verifiedRegistry = readFileSync(registryPath, "utf8")
    writeFileSync(
      registryPath,
      verifiedRegistry.replace(`path=${avdDirectory}`, `path=${join(avdHome, "other-avd.avd")}`),
      "utf8"
    )
    const configBeforeRegistryDrift = readFileSync(configPath, "utf8")
    const registryDrift = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "artifacts/android-chrome/registry-drift.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(registryDrift.status, 1)
    equal(readFileSync(configPath, "utf8"), configBeforeRegistryDrift)
    const registryDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "registry-drift.json"), "utf8")
    )
    equal(registryDriftReceipt.result, "FAIL")
    match(registryDriftReceipt.reason, /AVD registry path drift/u)
    writeFileSync(registryPath, verifiedRegistry, "utf8")

    writeFileSync(
      registryPath,
      verifiedRegistry.replace(
        `path.rel=avd/${ANDROID_AVD_NAME}.avd`,
        "path.rel=avd/other-avd.avd"
      ),
      "utf8"
    )
    const configBeforeRelativeDrift = readFileSync(configPath, "utf8")
    const relativeRegistryDrift = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/registry-relative-drift.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(relativeRegistryDrift.status, 1)
    equal(readFileSync(configPath, "utf8"), configBeforeRelativeDrift)
    const relativeRegistryDriftReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "registry-relative-drift.json"), "utf8")
    )
    equal(relativeRegistryDriftReceipt.result, "FAIL")
    equal(relativeRegistryDriftReceipt.phase, "verify")
    deepEqual(relativeRegistryDriftReceipt.commands, [])
    match(relativeRegistryDriftReceipt.reason, /AVD registry relative path drift/u)
    writeFileSync(registryPath, verifiedRegistry, "utf8")

    const registryCopyPath = join(fixtureRoot, "registry-copy.ini")
    writeFileSync(registryCopyPath, verifiedRegistry, "utf8")
    rmSync(registryPath)
    symlinkSync(registryCopyPath, registryPath)
    const configBeforeRegistrySymlink = readFileSync(configPath, "utf8")
    const registrySymlink = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/registry-symlink.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(registrySymlink.status, 1)
    equal(readFileSync(configPath, "utf8"), configBeforeRegistrySymlink)
    const registrySymlinkReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "registry-symlink.json"), "utf8")
    )
    equal(registrySymlinkReceipt.result, "FAIL")
    equal(registrySymlinkReceipt.phase, "verify")
    deepEqual(registrySymlinkReceipt.commands, [])
    match(registrySymlinkReceipt.reason, /AVD registry must be one physical file/u)
    rmSync(registryPath)
    writeFileSync(registryPath, verifiedRegistry, "utf8")

    const malformedConfig = verifiedCanonicalConfig.replace(
      `hw.device.name=${ANDROID_PROFILE}\n`,
      ""
    )
    writeFileSync(configPath, malformedConfig, "utf8")
    const failedPrepare = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "artifacts/android-chrome/prepare-failure.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(failedPrepare.status, 1)
    equal(readFileSync(configPath, "utf8"), malformedConfig)
    const failedPrepareReceipt = JSON.parse(
      readFileSync(join(artifactDirectory, "prepare-failure.json"), "utf8")
    )
    equal(failedPrepareReceipt.result, "FAIL")
    equal(failedPrepareReceipt.phase, "prepare")
    match(failedPrepareReceipt.reason, /missing canonical profile/u)
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

test("emulator environment CLI bounds host evidence before any live probe", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "courtside-emulator-host-bounds-"))
  const avdHome = join(fixtureRoot, "avd-home")
  const avdDirectory = join(avdHome, `${ANDROID_AVD_NAME}.avd`)
  const artifactDirectory = join(fixtureRoot, "artifacts", "android-chrome")
  const fakeBin = join(fixtureRoot, "bin")
  const scriptPath = fileURLToPath(
    new URL("../../scripts/android-emulator-environment.mjs", import.meta.url)
  )
  const registryPath = join(avdHome, `${ANDROID_AVD_NAME}.ini`)
  const configPath = join(avdDirectory, "config.ini")
  const resolvedPath = join(avdDirectory, "hardware-qemu.ini")
  const registry =
    `avd.ini.encoding=UTF-8\npath=${avdDirectory}\n` +
    `path.rel=avd/${ANDROID_AVD_NAME}.avd\ntarget=android-35\n`
  const config =
    `hw.device.name=${ANDROID_PROFILE}\n` + "hw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n"
  const resolvedHardware =
    `hw.device.name=${ANDROID_PROFILE}\n` +
    `avd.name=${ANDROID_AVD_NAME}\navd.id=${ANDROID_AVD_NAME}\n` +
    "hw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n"

  mkdirSync(avdDirectory, { recursive: true })
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fixtureRoot, "artifacts", "exact-head.json"),
    `${JSON.stringify({ source_head_sha: EXACT_HEAD_SHA })}\n`,
    "utf8"
  )
  const fakeAdb = join(fakeBin, "adb")
  writeFileSync(
    fakeAdb,
    `#!/usr/bin/env node
const command = process.argv.slice(2).join(" ")
if (command === "emu avd name") process.stdout.write("${ANDROID_AVD_NAME}\\nOK\\n")
else if (command === "exec-out cat /sys/devices/system/cpu/online") process.stdout.write("0-3\\n")
else if (command === "exec-out cat /proc/meminfo") process.stdout.write("MemTotal: 3973120 kB\\n")
else if (command === "exec-out getprop dalvik.vm.heapsize") process.stdout.write("576m\\n")
else { process.stderr.write("unexpected fake adb command"); process.exitCode = 1 }
`,
    "utf8"
  )
  chmodSync(fakeAdb, 0o755)
  const environment = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    ANDROID_SERIAL: "emulator-5554",
    COURTSIDE_ANDROID_AVD_NAME: ANDROID_AVD_NAME,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`
  }
  const oversizedPadding = "#".repeat(1024 * 1024)
  const invalidEvidence = [
    {
      label: "registry-oversized",
      path: registryPath,
      value: `${registry}${oversizedPadding}`,
      reason: /Android AVD registry must be a bounded physical file/u
    },
    {
      label: "registry-nul",
      path: registryPath,
      value: `${registry}\0`,
      reason: /Android AVD registry must be bounded non-empty text/u
    },
    {
      label: "canonical-oversized",
      path: configPath,
      value: `${config}${oversizedPadding}`,
      reason: /Canonical Android AVD config must be a bounded physical file/u
    },
    {
      label: "resolved-oversized",
      path: resolvedPath,
      value: `${resolvedHardware}${oversizedPadding}`,
      reason: /Resolved Android hardware must be a bounded physical file/u
    },
    {
      label: "resolved-nul",
      path: resolvedPath,
      value: `${resolvedHardware}\0`,
      reason: /Resolved Android hardware must be bounded non-empty text/u
    }
  ]

  try {
    for (const evidence of invalidEvidence) {
      writeFileSync(registryPath, registry, "utf8")
      writeFileSync(configPath, config, "utf8")
      writeFileSync(resolvedPath, resolvedHardware, "utf8")
      writeFileSync(evidence.path, evidence.value, "utf8")
      const receiptName = `${evidence.label}.json`
      const result = spawnSync(
        process.execPath,
        [scriptPath, "verify", `artifacts/android-chrome/${receiptName}`],
        { cwd: fixtureRoot, encoding: "utf8", env: environment }
      )
      equal(result.status, 1)
      equal(readFileSync(evidence.path, "utf8"), evidence.value)
      const receipt = JSON.parse(readFileSync(join(artifactDirectory, receiptName), "utf8"))
      equal(receipt.result, "FAIL")
      equal(receipt.phase, "verify")
      deepEqual(receipt.commands, [])
      match(receipt.reason, evidence.reason)
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

test("physical Android host reads require one stable descriptor snapshot", () => {
  const requireStableRead = Reflect.get(environmentHelpers, "requireStablePhysicalFileRead")
  equal(typeof requireStableRead, "function")
  if (typeof requireStableRead !== "function") return

  const metadata = {
    dev: 1n,
    ino: 2n,
    mode: 33_188n,
    size: 4n,
    mtimeNs: 3n,
    ctimeNs: 4n
  }
  const stableRead = {
    label: "Host fixture",
    beforeReadMetadata: metadata,
    betweenReadMetadata: metadata,
    afterReadMetadata: metadata,
    firstRead: Buffer.from("same"),
    secondRead: Buffer.from("same"),
    firstBytesRead: 4,
    secondBytesRead: 4
  }
  deepEqual(requireStableRead(stableRead), Buffer.from("same"))
  throws(
    () => requireStableRead({ ...stableRead, secondRead: Buffer.from("sAme") }),
    /physical file changed while being read/u
  )
  throws(
    () =>
      requireStableRead({
        ...stableRead,
        afterReadMetadata: { ...metadata, mtimeNs: metadata.mtimeNs + 1n }
      }),
    /physical file changed while being read/u
  )
})

test("emulator environment CLI rereads host evidence after live probes", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "courtside-emulator-host-readback-"))
  const avdHome = join(fixtureRoot, "avd-home")
  const avdDirectory = join(avdHome, `${ANDROID_AVD_NAME}.avd`)
  const artifactDirectory = join(fixtureRoot, "artifacts", "android-chrome")
  const fakeBin = join(fixtureRoot, "bin")
  const scriptPath = fileURLToPath(
    new URL("../../scripts/android-emulator-environment.mjs", import.meta.url)
  )
  const registryPath = join(avdHome, `${ANDROID_AVD_NAME}.ini`)
  const configPath = join(avdDirectory, "config.ini")
  const resolvedPath = join(avdDirectory, "hardware-qemu.ini")
  const registry =
    `avd.ini.encoding=UTF-8\npath=${avdDirectory}\n` +
    `path.rel=avd/${ANDROID_AVD_NAME}.avd\ntarget=android-35\n`
  const config =
    `hw.device.name=${ANDROID_PROFILE}\n` + "hw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n"
  const resolvedHardware =
    `hw.device.name=${ANDROID_PROFILE}\n` +
    `avd.name=${ANDROID_AVD_NAME}\navd.id=${ANDROID_AVD_NAME}\n` +
    "hw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n"

  mkdirSync(avdDirectory, { recursive: true })
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fixtureRoot, "artifacts", "exact-head.json"),
    `${JSON.stringify({ source_head_sha: EXACT_HEAD_SHA })}\n`,
    "utf8"
  )
  const fakeAdb = join(fakeBin, "adb")
  writeFileSync(
    fakeAdb,
    `#!/usr/bin/env node
const { renameSync, writeFileSync } = require("node:fs")
const command = process.argv.slice(2).join(" ")
if (command === "emu avd name") {
  const mutationPath = process.env.FAKE_HOST_MUTATION_PATH
  if (mutationPath && process.env.FAKE_HOST_MUTATION_BASE64) {
    writeFileSync(
      mutationPath,
      Buffer.from(process.env.FAKE_HOST_MUTATION_BASE64, "base64")
    )
  }
  if (mutationPath && process.env.FAKE_HOST_RESTORE_BASE64) {
    writeFileSync(mutationPath, Buffer.from(process.env.FAKE_HOST_RESTORE_BASE64, "base64"))
  }
  if (mutationPath && process.env.FAKE_HOST_REPLACEMENT_BASE64) {
    const replacementPath = mutationPath + "." + process.pid + ".replacement"
    writeFileSync(replacementPath, Buffer.from(process.env.FAKE_HOST_REPLACEMENT_BASE64, "base64"))
    renameSync(replacementPath, mutationPath)
  }
  process.stdout.write("${ANDROID_AVD_NAME}\\nOK\\n")
} else if (command === "exec-out cat /sys/devices/system/cpu/online") process.stdout.write("0-3\\n")
else if (command === "exec-out cat /proc/meminfo") process.stdout.write("MemTotal: 3973120 kB\\n")
else if (command === "exec-out getprop dalvik.vm.heapsize") process.stdout.write("576m\\n")
else { process.stderr.write("unexpected fake adb command"); process.exitCode = 1 }
`,
    "utf8"
  )
  chmodSync(fakeAdb, 0o755)
  const environment = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    ANDROID_SERIAL: "emulator-5554",
    COURTSIDE_ANDROID_AVD_NAME: ANDROID_AVD_NAME,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`
  }
  const mutations = [
    {
      label: "registry",
      path: registryPath,
      value: `${registry}tag.display=Google Play\n`
    },
    {
      label: "canonical",
      path: configPath,
      value: `${config}disk.dataPartition.size=6G\n`
    },
    {
      label: "resolved",
      path: resolvedPath,
      value: `${resolvedHardware}hw.gpu.enabled=yes\n`
    },
    {
      label: "canonical-aba",
      path: configPath,
      value: `${config}disk.dataPartition.size=6G\n`,
      restoreValue: config
    },
    {
      label: "canonical-replacement",
      path: configPath,
      replacementValue: config
    }
  ]

  try {
    for (const mutation of mutations) {
      writeFileSync(registryPath, registry, "utf8")
      writeFileSync(configPath, config, "utf8")
      writeFileSync(resolvedPath, resolvedHardware, "utf8")
      const receiptName = `${mutation.label}-readback-drift.json`
      const result = spawnSync(
        process.execPath,
        [scriptPath, "verify", `artifacts/android-chrome/${receiptName}`],
        {
          cwd: fixtureRoot,
          encoding: "utf8",
          env: {
            ...environment,
            FAKE_HOST_MUTATION_PATH: mutation.path,
            ...(mutation.value
              ? { FAKE_HOST_MUTATION_BASE64: Buffer.from(mutation.value).toString("base64") }
              : {}),
            ...(mutation.restoreValue
              ? { FAKE_HOST_RESTORE_BASE64: Buffer.from(mutation.restoreValue).toString("base64") }
              : {}),
            ...(mutation.replacementValue
              ? {
                  FAKE_HOST_REPLACEMENT_BASE64: Buffer.from(mutation.replacementValue).toString(
                    "base64"
                  )
                }
              : {})
          }
        }
      )
      equal(result.status, 1)
      equal(
        readFileSync(mutation.path, "utf8"),
        mutation.restoreValue ?? mutation.replacementValue ?? mutation.value
      )
      const receipt = JSON.parse(readFileSync(join(artifactDirectory, receiptName), "utf8"))
      equal(receipt.result, "FAIL")
      equal(receipt.phase, "verify")
      equal("liveGuest" in receipt, false)
      deepEqual(
        receipt.commands.map((command: { name: string }) => command.name),
        ["live-avd-name", "guest-cpu-online", "guest-meminfo", "guest-heap-size"]
      )
      match(receipt.reason, /host evidence changed during live probes/u)
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

test("emulator environment CLI refuses a symlinked fixed artifact directory", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "courtside-emulator-symlink-"))
  const avdHome = join(fixtureRoot, "avd-home")
  const avdDirectory = join(avdHome, `${ANDROID_AVD_NAME}.avd`)
  const artifactsDirectory = join(fixtureRoot, "artifacts")
  const externalDirectory = join(fixtureRoot, "external-receipts")
  const artifactDirectory = join(artifactsDirectory, "android-chrome")
  const scriptPath = fileURLToPath(
    new URL("../../scripts/android-emulator-environment.mjs", import.meta.url)
  )
  const externalReceiptPath = join(externalDirectory, "emulator-environment-prepare.json")

  mkdirSync(avdDirectory, { recursive: true })
  mkdirSync(artifactsDirectory, { recursive: true })
  mkdirSync(externalDirectory, { recursive: true })
  symlinkSync(externalDirectory, artifactDirectory, "dir")
  writeFileSync(
    join(artifactsDirectory, "exact-head.json"),
    `${JSON.stringify({ source_head_sha: EXACT_HEAD_SHA })}\n`,
    "utf8"
  )
  writeFileSync(
    join(avdDirectory, "config.ini"),
    `AvdId=${ANDROID_AVD_NAME}\nhw.device.name=${ANDROID_PROFILE}\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n`,
    "utf8"
  )
  const environment = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    COURTSIDE_ANDROID_AVD_NAME: ANDROID_AVD_NAME
  }

  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "artifacts/android-chrome/emulator-environment-prepare.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(result.status, 1)
    match(result.stderr, /physical fixed artifact directory/u)
    equal(existsSync(externalReceiptPath), false)
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

test("emulator environment CLI rejects partial timeout output with one bounded FAIL receipt", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "courtside-emulator-timeout-"))
  const avdHome = join(fixtureRoot, "avd-home")
  const avdDirectory = join(avdHome, `${ANDROID_AVD_NAME}.avd`)
  const artifactDirectory = join(fixtureRoot, "artifacts", "android-chrome")
  const fakeBin = join(fixtureRoot, "bin")
  const scriptPath = fileURLToPath(
    new URL("../../scripts/android-emulator-environment.mjs", import.meta.url)
  )
  const receiptPath = join(artifactDirectory, "emulator-environment.json")

  mkdirSync(avdDirectory, { recursive: true })
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fixtureRoot, "artifacts", "exact-head.json"),
    `${JSON.stringify({ source_head_sha: EXACT_HEAD_SHA })}\n`,
    "utf8"
  )
  writeFileSync(
    join(avdHome, `${ANDROID_AVD_NAME}.ini`),
    `avd.ini.encoding=UTF-8\npath=${avdDirectory}\npath.rel=avd/${ANDROID_AVD_NAME}.avd\ntarget=android-35\n`,
    "utf8"
  )
  writeFileSync(
    join(avdDirectory, "config.ini"),
    `AvdId=${ANDROID_AVD_NAME}\nhw.device.name=${ANDROID_PROFILE}\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n`,
    "utf8"
  )
  writeFileSync(
    join(avdDirectory, "hardware-qemu.ini"),
    `hw.device.name=${ANDROID_PROFILE}\navd.name=${ANDROID_AVD_NAME}\navd.id=${ANDROID_AVD_NAME}\nhw.cpu.ncore=4\nhw.ramSize=4096\nvm.heapSize=576\n`,
    "utf8"
  )
  const fakeAdb = join(fakeBin, "adb")
  writeFileSync(
    fakeAdb,
    `#!/usr/bin/env node
const command = process.argv.slice(2).join(" ")
if (command === "emu avd name") process.stdout.write("${ANDROID_AVD_NAME}\\nOK\\n")
else if (command === "exec-out cat /sys/devices/system/cpu/online") {
  process.stdout.write("0-3\\n")
  process.stderr.write("E".repeat(6000))
  setTimeout(() => {}, 10000)
} else { process.stderr.write("unexpected fake adb command"); process.exitCode = 1 }
`,
    "utf8"
  )
  chmodSync(fakeAdb, 0o755)
  const environment = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    ANDROID_SERIAL: "emulator-5554",
    COURTSIDE_ANDROID_AVD_NAME: ANDROID_AVD_NAME,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`
  }

  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "verify", "artifacts/android-chrome/emulator-environment.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(result.status, 1)
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"))
    equal(receipt.result, "FAIL")
    equal(receipt.phase, "verify")
    equal(receipt.sourceHeadSha, EXACT_HEAD_SHA)
    match(receipt.reason, /timed out/u)
    equal("liveGuest" in receipt, false)
    deepEqual(
      receipt.commands.map((command: { name: string }) => command.name),
      ["live-avd-name", "guest-cpu-online"]
    )
    deepEqual(receipt.commands[1], {
      name: "guest-cpu-online",
      timeoutMilliseconds: 5_000,
      status: null,
      signal: "SIGKILL",
      errorCode: "ETIMEDOUT",
      timedOut: true,
      durationMilliseconds: receipt.commands[1].durationMilliseconds,
      stdoutBytes: 4,
      stderrBytes: 6_000,
      stderr: "E".repeat(4_096),
      stderrTruncated: true
    })

    const escaped = spawnSync(
      process.execPath,
      [scriptPath, "prepare", "../escaped-emulator-environment.json"],
      { cwd: fixtureRoot, encoding: "utf8", env: environment }
    )
    equal(escaped.status, 1)
    match(escaped.stderr, /fixed artifact directory/u)
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

test("foreground frames use one exact browser timeline after the first attributable frame", () => {
  const active = (at: number, frame: number) => ({
    at,
    frame,
    runningCount: 1,
    targetStatus: "running"
  })
  const evaluation = evaluateAndroidForegroundFrameTimeline(
    {
      armedSnapshot: active(100, 10),
      readinessTimeoutMilliseconds: 5_000,
      samples: [
        active(200, 11),
        active(280, 12),
        active(370, 13),
        active(460, 14),
        active(550, 15),
        active(640, 16),
        active(710, 17)
      ],
      boundarySnapshot: active(710, 17)
    },
    FOREGROUND_BUDGETS
  )

  deepEqual(evaluation.readiness, {
    timeoutMilliseconds: 5_000,
    startupMilliseconds: 100,
    frameBefore: 10,
    frameAfter: 11
  })
  equal(evaluation.observationMilliseconds, 500)
  equal(evaluation.frameBefore, 11)
  equal(evaluation.frameAfter, 16)
  equal(evaluation.frameDelta, 5)
})

test("foreground timeline ignores frames outside the fixed budget and fails closed", () => {
  const active = (at: number, frame: number) => ({
    at,
    frame,
    runningCount: 1,
    targetStatus: "running"
  })

  throws(
    () =>
      evaluateAndroidForegroundFrameTimeline(
        {
          armedSnapshot: active(100, 10),
          readinessTimeoutMilliseconds: 5_000,
          samples: [
            active(200, 11),
            active(390, 12),
            active(580, 13),
            active(710, 14),
            active(890, 15),
            active(1_080, 16)
          ],
          boundarySnapshot: active(710, 14)
        },
        FOREGROUND_BUDGETS
      ),
    /foreground creative frames: expected >= 5, received 2/
  )
})

test("foreground timeline rejects a non-active sample inside the observation window", () => {
  throws(
    () =>
      evaluateAndroidForegroundFrameTimeline(
        {
          armedSnapshot: {
            at: 100,
            frame: 10,
            runningCount: 1,
            targetStatus: "running"
          },
          readinessTimeoutMilliseconds: 5_000,
          samples: [
            { at: 200, frame: 11, runningCount: 1, targetStatus: "running" },
            { at: 300, frame: 12, runningCount: 0, targetStatus: "paused" }
          ],
          boundarySnapshot: {
            at: 710,
            frame: 12,
            runningCount: 1,
            targetStatus: "running"
          }
        },
        FOREGROUND_BUDGETS
      ),
    /foreground frame sample must contain exactly one running canvas/
  )
})

test("foreground timeline reproduces exact attempt 2 undercount attribution", () => {
  const active = (at: number, frame: number) => ({
    at,
    frame,
    runningCount: 1,
    targetStatus: "running"
  })

  throws(
    () =>
      evaluateAndroidForegroundFrameTimeline(
        {
          armedSnapshot: active(100, 10),
          readinessTimeoutMilliseconds: 5_000,
          samples: [active(200, 11), active(330, 12), active(500, 13), active(680, 14)],
          boundarySnapshot: active(710, 14)
        },
        FOREGROUND_BUDGETS
      ),
    /foreground creative frames: expected >= 5, received 3/
  )
})

test("foreground observation boundary must reach the deadline and remain exactly active", () => {
  const active = (at: number, frame: number) => ({
    at,
    frame,
    runningCount: 1,
    targetStatus: "running"
  })
  const timeline = {
    armedSnapshot: active(100, 10),
    readinessTimeoutMilliseconds: 5_000,
    samples: [
      active(200, 11),
      active(280, 12),
      active(370, 13),
      active(460, 14),
      active(550, 15),
      active(640, 16)
    ]
  }

  throws(
    () =>
      evaluateAndroidForegroundFrameTimeline(
        { ...timeline, boundarySnapshot: active(699, 16) },
        FOREGROUND_BUDGETS
      ),
    /foreground observation boundary must reach the 500 ms deadline/
  )
  for (const boundarySnapshot of [
    { at: 710, frame: 16, runningCount: 0, targetStatus: "paused" },
    { at: 710, frame: 16, runningCount: 2, targetStatus: "running" }
  ]) {
    throws(
      () =>
        evaluateAndroidForegroundFrameTimeline(
          { ...timeline, boundarySnapshot },
          FOREGROUND_BUDGETS
        ),
      /foreground observation boundary must contain exactly one running canvas/
    )
  }
})

test("clock uncertainty is charged against the runtime background deadline", () => {
  throws(
    () =>
      evaluateAndroidBackgroundTimeline(
        timeline({
          activeAt: 70,
          clockMaximumUncertaintyMilliseconds: 20,
          pauseAt: 5_085,
          observationAt: 5_200
        }),
        BUDGETS
      ),
    /runtime background pause upper bound: expected <= 5000, received 5005/
  )
})

test("Android smoke diagnostics preserve the failing producer and bound probes", () => {
  const shellHarness = readFileSync(
    new URL("../../../../scripts/test/run-android-chrome-offline-smoke.sh", import.meta.url),
    "utf8"
  )
  const performanceHarness = readFileSync(
    new URL("../../scripts/android-chrome-performance-smoke.mjs", import.meta.url),
    "utf8"
  )
  const ciWorkflow = readFileSync(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  )

  match(shellHarness, /PIPESTATUS\[0\]/u)
  match(shellHarness, /logcat -d -v threadtime -t 2000/u)
  match(shellHarness, /timeout --kill-after=2s 15s adb shell uiautomator/u)
  match(shellHarness, /curl --max-time 5/u)
  match(performanceHarness, /ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS/u)
  match(performanceHarness, /function resumedActivityReceipt\([\s\S]*timeout: timeoutMilliseconds/u)
  match(performanceHarness, /observerSnapshot: liveSnapshot\?\.observerSnapshot \?\? null/u)
  match(performanceHarness, /observeForegroundFrameTimeline/u)
  match(performanceHarness, /CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS/u)
  match(
    performanceHarness,
    /function resumedActivityReceipt\([\s\S]*timeoutMilliseconds = ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS[\s\S]*classifyAndroidActivityProbeResult\(\{[\s\S]*errorCode: result\.error\?\.code/u
  )
  match(performanceHarness, /captureChromeSurfaceProbeBoundaryWithActivityAcquisition\(\{/u)
  match(
    performanceHarness,
    /surface\.status === "activity-unresolved"[\s\S]*boundedAndroidPollDelay/u
  )
  doesNotMatch(performanceHarness, /result\.error\?\.code === "ETIMEDOUT"\) \{\s*return ""/u)
  match(
    performanceHarness,
    /normalizeChromeContentSurface\(\)[\s\S]*observeForegroundFrameTimeline\([\s\S]*requireClearChromeContentSurface\(\)[\s\S]*evaluateAndroidForegroundFrameTimeline/u
  )
  match(performanceHarness, /timeout: probeTimeoutMilliseconds/u)
  match(
    performanceHarness,
    /function probeChromeContentSurfaceAtActivityBoundary\(deadline\) \{[\s\S]*captureChromeSurfaceProbeBoundaryWithActivityAcquisition\(\{[\s\S]*acquireChromeSurfaceActivityWithinDeadline\(deadline, label\)[\s\S]*probeChromeContentSurface\(deadline\)/u
  )
  match(
    performanceHarness,
    /function probeChromeContentSurface\(deadline\) \{[\s\S]*requireExpectedAndroidDisplaySize\(deadline\)[\s\S]*requireRemainingAutomationMilliseconds\([\s\S]*uiautomator/u
  )
  equal(performanceHarness.match(/probeChromeContentSurfaceAtActivityBoundary\(/gu)?.length, 3)
  match(ciWorkflow, /profile: pixel_7\s+cores: 4\s+ram-size: 4096M/u)
  doesNotMatch(performanceHarness, /pm["',\s]+grant/u)
  doesNotMatch(
    performanceHarness,
    /observed\.runningCount === 0 && observed\.targetStatus !== "running"/u
  )
  doesNotMatch(
    performanceHarness,
    /pauseSnapshot\.runningCount !== 0 \|\| pauseSnapshot\.targetStatus === "running"/u
  )
})
