import { deepEqual, equal, throws } from "node:assert/strict"
import { test } from "node:test"

import { evaluateAndroidBackgroundTimeline } from "../../scripts/android-creative-timeline.mjs"

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
  activeRunningCount?: number
  activityAt?: number
  activityTransitions?: ActivityTransition[]
  observationFrame?: number
  observationRunningCount?: number
  pauseAt?: number
  pauseFrame?: number
  pauseRunningCount?: number
  pauseSnapshot?: null
}

function timeline({
  activeRunningCount = 1,
  activityAt = 120,
  activityTransitions,
  observationFrame = 42,
  observationRunningCount = 0,
  pauseAt = 140,
  pauseFrame = 40,
  pauseRunningCount = 0,
  pauseSnapshot
}: TimelineFixtureOptions = {}) {
  return {
    homeSignal: { at: 100, signal: "Android KEYCODE_HOME" },
    activeSnapshot: {
      at: 90,
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
      at: 1_640,
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
