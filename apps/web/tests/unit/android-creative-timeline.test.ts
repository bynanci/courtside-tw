import { deepEqual, doesNotMatch, equal, match, throws } from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  boundedAndroidPollDelay,
  calibrateBrowserClockToHost,
  classifyAndroidActivityLine,
  evaluateAndroidBackgroundTimeline,
  normalizeBrowserRuntimeSnapshot,
  requireAndroidActivityAtBoundary,
  retainFirstPausedSnapshot
} from "../../scripts/android-creative-timeline.mjs"

const BUDGETS = Object.freeze({
  maximumBackgroundFrames: 2,
  operatingSystemBackgroundMilliseconds: 5_000
})

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

  match(shellHarness, /PIPESTATUS\[0\]/u)
  match(shellHarness, /logcat -d -v threadtime -t 2000/u)
  match(shellHarness, /timeout 15s adb shell uiautomator/u)
  match(shellHarness, /curl --max-time 5/u)
  match(performanceHarness, /ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS/u)
  match(performanceHarness, /timeout: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS/u)
  doesNotMatch(
    performanceHarness,
    /observed\.runningCount === 0 && observed\.targetStatus !== "running"/u
  )
  doesNotMatch(
    performanceHarness,
    /pauseSnapshot\.runningCount !== 0 \|\| pauseSnapshot\.targetStatus === "running"/u
  )
})
