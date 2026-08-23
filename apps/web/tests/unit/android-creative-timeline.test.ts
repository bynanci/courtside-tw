import { deepEqual, doesNotMatch, equal, match, throws } from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

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

const ATTEMPT_2_CHROME_MODAL_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" resource-id="com.android.chrome:id/modal_dialog_view" package="com.android.chrome" bounds="[28,615][1052,1858]">
    <node text="Chrome notifications make things easier" resource-id="" class="android.widget.TextView" package="com.android.chrome" bounds="[70,1364][1010,1522]" />
    <node text="No thanks" resource-id="com.android.chrome:id/negative_button" class="android.widget.Button" package="com.android.chrome" clickable="true" enabled="true" bounds="[477,1690][708,1816]" />
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

test("the exact attempt 2 Chrome notification modal resolves only its safe negative target", () => {
  deepEqual(classifyChromeAutomationSurface(ATTEMPT_2_CHROME_MODAL_XML, PIXEL_7_DISPLAY), {
    status: "known-notification-prompt",
    dismissTap: { x: 592, y: 1753 }
  })
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
      chromeForeground: true
    }
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
  for (const value of ["", "Physical size: 0x2400", "Physical size: 999999x999999"]) {
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
  match(performanceHarness, /timeout: ANDROID_ACTIVITY_PROBE_TIMEOUT_MILLISECONDS/u)
  match(performanceHarness, /observerSnapshot: liveSnapshot\?\.observerSnapshot \?\? null/u)
  match(performanceHarness, /observeForegroundFrameTimeline/u)
  match(performanceHarness, /CHROME_AUTOMATION_PROBE_TIMEOUT_MILLISECONDS/u)
  match(
    performanceHarness,
    /normalizeChromeContentSurface\(\)[\s\S]*observeForegroundFrameTimeline\([\s\S]*requireClearChromeContentSurface\(\)[\s\S]*evaluateAndroidForegroundFrameTimeline/u
  )
  match(performanceHarness, /timeout: probeTimeoutMilliseconds/u)
  match(
    performanceHarness,
    /function probeChromeContentSurfaceAtActivityBoundary\(probeTimeoutMilliseconds\) \{[\s\S]*captureChromeSurfaceProbeBoundary\(\{[\s\S]*readActivity: resumedActivityLine,[\s\S]*probeSurface:/u
  )
  equal(performanceHarness.match(/probeChromeContentSurfaceAtActivityBoundary\(/gu)?.length, 3)
  match(ciWorkflow, /profile: pixel_7\s+ram-size: 4096M/u)
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
