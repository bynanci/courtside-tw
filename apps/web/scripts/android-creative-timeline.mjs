function requireRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function requireTimestamp(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative timestamp`)
  }
  return value
}

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`)
  }
  return value
}

function requireCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function requireFrame(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative frame`)
  }
  return value
}

function validateSnapshot(value, label) {
  const snapshot = requireRecord(value, label)
  const targetStatus = snapshot.targetStatus
  if (typeof targetStatus !== "string" || targetStatus.length === 0) {
    throw new Error(`${label} targetStatus must be non-empty`)
  }
  return {
    at: requireTimestamp(snapshot.at, `${label} at`),
    frame: requireFrame(snapshot.frame, `${label} frame`),
    runningCount: requireCount(snapshot.runningCount, `${label} runningCount`),
    targetStatus
  }
}

export function classifyAndroidActivityLine(value) {
  if (typeof value !== "string") {
    throw new Error("Android activity line must be a string")
  }
  const activity = value.trim()
  if (!activity || /(?:^|[:=]\s*)(?:null|none)\s*$/iu.test(activity)) {
    return null
  }
  return {
    activity,
    chromeForeground: /com\.android\.chrome/u.test(activity)
  }
}

export function calibrateBrowserClockToHost(rawCalibration) {
  const calibration = requireRecord(rawCalibration, "browser clock calibration")
  const browserEpochAtArm = requireTimestamp(calibration.browserEpochAtArm, "browser epoch at arm")
  const hostEpochBeforeArm = requireTimestamp(
    calibration.hostEpochBeforeArm,
    "host epoch before arm"
  )
  const hostEpochAfterArm = requireTimestamp(calibration.hostEpochAfterArm, "host epoch after arm")
  if (hostEpochAfterArm < hostEpochBeforeArm) {
    throw new Error("host epoch after arm must not precede host epoch before arm")
  }

  const hostRoundTripMilliseconds = hostEpochAfterArm - hostEpochBeforeArm
  const hostMidpointAt = hostEpochBeforeArm + hostRoundTripMilliseconds / 2
  return {
    browserToHostOffsetMilliseconds: hostMidpointAt - browserEpochAtArm,
    hostRoundTripMilliseconds,
    maximumUncertaintyMilliseconds: hostRoundTripMilliseconds / 2
  }
}

export function normalizeBrowserRuntimeSnapshot(rawSnapshot, rawCalibration) {
  const snapshot = validateSnapshot(rawSnapshot, "browser runtime snapshot")
  const calibration = requireRecord(rawCalibration, "browser clock calibration")
  const browserToHostOffsetMilliseconds = requireFiniteNumber(
    calibration.browserToHostOffsetMilliseconds,
    "browser-to-host clock offset"
  )
  return {
    ...snapshot,
    at: requireTimestamp(
      snapshot.at + browserToHostOffsetMilliseconds,
      "normalized runtime snapshot at"
    )
  }
}

export function evaluateAndroidBackgroundTimeline(rawTimeline, rawBudgets) {
  const timeline = requireRecord(rawTimeline, "Android background timeline")
  const budgets = requireRecord(rawBudgets, "Android background budgets")
  const maximumBackgroundFrames = requireCount(
    budgets.maximumBackgroundFrames,
    "maximumBackgroundFrames"
  )
  const maximumTransitionMilliseconds = requireCount(
    budgets.operatingSystemBackgroundMilliseconds,
    "operatingSystemBackgroundMilliseconds"
  )

  const homeSignal = requireRecord(timeline.homeSignal, "HOME signal")
  const homeSignalAt = requireTimestamp(homeSignal.at, "HOME signal at")
  const activeSnapshot = validateSnapshot(timeline.activeSnapshot, "active runtime snapshot")
  if (activeSnapshot.at > homeSignalAt) {
    throw new Error("active runtime snapshot must be captured before the HOME signal")
  }
  if (activeSnapshot.runningCount !== 1 || activeSnapshot.targetStatus !== "running") {
    throw new Error(
      `active runtime snapshot must contain exactly one running canvas; ` +
        `runningCount=${activeSnapshot.runningCount}, targetStatus=${activeSnapshot.targetStatus}`
    )
  }

  const activityTransitions = timeline.activityTransitions
  if (!Array.isArray(activityTransitions)) {
    throw new Error("Android activity transitions must be a list")
  }
  const normalizedActivityTransitions = activityTransitions.map((value, index) => {
    const transition = requireRecord(value, `Android activity transition[${index}]`)
    if (typeof transition.chromeForeground !== "boolean") {
      throw new Error(`Android activity transition[${index}] chromeForeground must be boolean`)
    }
    if (typeof transition.activity !== "string" || transition.activity.length === 0) {
      throw new Error(`Android activity transition[${index}] activity must be non-empty`)
    }
    return {
      at: requireTimestamp(transition.at, `Android activity transition[${index}] at`),
      chromeForeground: transition.chromeForeground,
      activity: transition.activity
    }
  })
  const backgroundActivity = normalizedActivityTransitions.find(
    (transition) => transition.at >= homeSignalAt && !transition.chromeForeground
  )
  if (!backgroundActivity) {
    throw new Error("Android background activity transition was never observed")
  }

  if (timeline.pauseSnapshot === null || timeline.pauseSnapshot === undefined) {
    throw new Error("Android runtime pause was never observed")
  }
  const pauseSnapshot = validateSnapshot(timeline.pauseSnapshot, "runtime pause snapshot")
  if (pauseSnapshot.at < homeSignalAt) {
    throw new Error("runtime pause snapshot must follow the HOME signal")
  }
  if (pauseSnapshot.runningCount !== 0 || pauseSnapshot.targetStatus === "running") {
    throw new Error(
      `runtime pause snapshot must contain zero running canvases; ` +
        `runningCount=${pauseSnapshot.runningCount}, targetStatus=${pauseSnapshot.targetStatus}`
    )
  }

  const observationSnapshot = validateSnapshot(
    timeline.observationSnapshot,
    "background observation snapshot"
  )
  if (observationSnapshot.at < pauseSnapshot.at || observationSnapshot.at < backgroundActivity.at) {
    throw new Error("background observation snapshot must follow activity and runtime pause")
  }
  if (observationSnapshot.runningCount !== 0 || observationSnapshot.targetStatus === "running") {
    throw new Error(
      `background observation snapshot must contain zero running canvases; ` +
        `runningCount=${observationSnapshot.runningCount}, ` +
        `targetStatus=${observationSnapshot.targetStatus}`
    )
  }

  const foregroundReturn = normalizedActivityTransitions.find(
    (transition) =>
      transition.at > backgroundActivity.at &&
      transition.at <= observationSnapshot.at &&
      transition.chromeForeground
  )
  if (foregroundReturn) {
    throw new Error(
      `Android Chrome returned to the foreground during frame observation: ` +
        foregroundReturn.activity
    )
  }

  const activityTransitionMilliseconds = backgroundActivity.at - homeSignalAt
  const runtimePauseMilliseconds = pauseSnapshot.at - homeSignalAt
  if (activityTransitionMilliseconds > maximumTransitionMilliseconds) {
    throw new Error(
      `Android operating-system background transition: expected <= ` +
        `${maximumTransitionMilliseconds}, received ${activityTransitionMilliseconds}`
    )
  }
  if (runtimePauseMilliseconds > maximumTransitionMilliseconds) {
    throw new Error(
      `Android runtime background pause: expected <= ${maximumTransitionMilliseconds}, ` +
        `received ${runtimePauseMilliseconds}`
    )
  }

  const postPauseFrames = observationSnapshot.frame - pauseSnapshot.frame
  if (postPauseFrames < 0) {
    throw new Error("Android runtime frame counter regressed after pause")
  }
  if (postPauseFrames > maximumBackgroundFrames) {
    throw new Error(
      `Android post-pause frames: expected <= ${maximumBackgroundFrames}, ` +
        `received ${postPauseFrames}`
    )
  }

  return {
    activeRunningCount: activeSnapshot.runningCount,
    activityTransitionMilliseconds,
    runtimePauseMilliseconds,
    transitionOrder:
      backgroundActivity.at <= pauseSnapshot.at ? "activity-then-pause" : "pause-then-activity",
    backgroundActivity: backgroundActivity.activity,
    activityTransitions: normalizedActivityTransitions,
    frameAtPause: pauseSnapshot.frame,
    frameAfterObservation: observationSnapshot.frame,
    postPauseFrames,
    statusAtPause: pauseSnapshot.targetStatus,
    statusAfterObservation: observationSnapshot.targetStatus
  }
}
