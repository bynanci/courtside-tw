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
  const normalized = {
    at: requireTimestamp(snapshot.at, `${label} at`),
    frame: requireFrame(snapshot.frame, `${label} frame`),
    runningCount: requireCount(snapshot.runningCount, `${label} runningCount`),
    targetStatus
  }
  if (snapshot.source !== undefined) {
    if (typeof snapshot.source !== "string" || snapshot.source.length === 0) {
      throw new Error(`${label} source must be non-empty`)
    }
    normalized.source = snapshot.source
  }
  return normalized
}

function xmlAttribute(node, name) {
  return node.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"))?.[1] ?? null
}

function parseAndroidBounds(node) {
  const match = xmlAttribute(node, "bounds")?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u)
  if (!match) return null
  const values = match.slice(1).map(Number)
  if (!values.every(Number.isSafeInteger)) return null
  const [left, top, right, bottom] = values
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom }
}

function normalizeAndroidDisplaySize(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const width = value.width
  const height = value.height
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 10_000 ||
    height > 10_000
  ) {
    return null
  }
  return { width, height }
}

export function parseAndroidDisplaySize(value) {
  if (typeof value !== "string") {
    throw new Error("Android display size receipt is invalid")
  }
  const lines = value.split(/\r?\n/u).map((line) => line.trim())
  const overrideLines = lines.filter((line) => line.startsWith("Override size:"))
  const physicalLines = lines.filter((line) => line.startsWith("Physical size:"))
  const selectedLines = overrideLines.length > 0 ? overrideLines : physicalLines
  const selectedLabel = overrideLines.length > 0 ? "Override" : "Physical"
  const match =
    selectedLines.length === 1
      ? selectedLines[0].match(new RegExp(`^${selectedLabel} size:\\s*(\\d+)x(\\d+)$`, "u"))
      : null
  const displaySize = match
    ? normalizeAndroidDisplaySize({ width: Number(match[1]), height: Number(match[2]) })
    : null
  if (!displaySize) {
    throw new Error("Android display size receipt is invalid")
  }
  return displaySize
}

export function classifyChromeAutomationSurface(value, rawDisplaySize) {
  if (typeof value !== "string") {
    throw new Error("Chrome automation hierarchy must be a string")
  }
  const hierarchy = value.trim()
  const blocked = {
    status: "blocked",
    reason: "unrecognized-or-malformed-chrome-modal"
  }
  const hierarchyStart = hierarchy.search(/<hierarchy(?:\s|>)/u)
  const hierarchyEnd = hierarchy.indexOf("</hierarchy>", hierarchyStart)
  if (!hierarchy || hierarchyStart < 0 || hierarchyEnd < 0) {
    return blocked
  }

  const hierarchyDocument = hierarchy.slice(hierarchyStart, hierarchyEnd + "</hierarchy>".length)
  const nodes = hierarchyDocument.match(/<node\b[^>]*>/gu) ?? []
  const modalId = "com.android.chrome:id/modal_dialog_view"
  const negativeButtonId = "com.android.chrome:id/negative_button"
  const knownTitle = "Chrome notifications make things easier"
  const hasChromeNode = nodes.some((node) => xmlAttribute(node, "package") === "com.android.chrome")
  const modal = nodes.find(
    (node) =>
      xmlAttribute(node, "package") === "com.android.chrome" &&
      xmlAttribute(node, "resource-id") === modalId
  )
  const hasModal = Boolean(modal)
  const hasKnownMarker = nodes.some((node) => {
    const resourceId = xmlAttribute(node, "resource-id")
    return (
      resourceId === modalId ||
      resourceId === negativeButtonId ||
      xmlAttribute(node, "text") === knownTitle
    )
  })
  const hasNativeDialogMarker = nodes.some((node) => {
    const resourceId = xmlAttribute(node, "resource-id") ?? ""
    const className = xmlAttribute(node, "class") ?? ""
    return /(?:dialog|modal)/iu.test(resourceId) || /Dialog(?:Fragment)?$/u.test(className)
  })
  if (!hasChromeNode) {
    return hasKnownMarker
      ? blocked
      : {
          status: "blocked",
          reason: "chrome-package-not-visible"
        }
  }
  if (!hasModal) {
    return hasKnownMarker || hasNativeDialogMarker ? blocked : { status: "clear" }
  }

  const hasKnownTitle = nodes.some(
    (node) =>
      xmlAttribute(node, "package") === "com.android.chrome" &&
      xmlAttribute(node, "text") === knownTitle
  )
  const negativeButton = nodes.find(
    (node) =>
      xmlAttribute(node, "package") === "com.android.chrome" &&
      xmlAttribute(node, "resource-id") === negativeButtonId &&
      xmlAttribute(node, "text") === "No thanks" &&
      xmlAttribute(node, "clickable") === "true" &&
      xmlAttribute(node, "enabled") === "true"
  )
  if (!hasKnownTitle || !negativeButton) {
    return blocked
  }

  const modalBounds = parseAndroidBounds(modal)
  const buttonBounds = parseAndroidBounds(negativeButton)
  const displaySize = normalizeAndroidDisplaySize(rawDisplaySize)
  if (
    !displaySize ||
    !modalBounds ||
    !buttonBounds ||
    modalBounds.right > displaySize.width ||
    modalBounds.bottom > displaySize.height ||
    buttonBounds.left < modalBounds.left ||
    buttonBounds.top < modalBounds.top ||
    buttonBounds.right > modalBounds.right ||
    buttonBounds.bottom > modalBounds.bottom
  ) {
    return blocked
  }
  const x = buttonBounds.left + Math.floor((buttonBounds.right - buttonBounds.left) / 2)
  const y = buttonBounds.top + Math.floor((buttonBounds.bottom - buttonBounds.top) / 2)
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return blocked

  return {
    status: "known-notification-prompt",
    dismissTap: { x, y }
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
  const component = activity.match(
    /(?:mResumedActivity|topResumedActivity)\s*[:=]\s*ActivityRecord\{[^}\r\n]*?\s([A-Za-z0-9_.$]+\/[A-Za-z0-9_.$]+)(?:\s|\})/u
  )?.[1]
  if (!component) {
    return null
  }
  return {
    activity,
    chromeForeground: component.startsWith("com.android.chrome/")
  }
}

export function requireAndroidActivityAtBoundary(value) {
  const classified = classifyAndroidActivityLine(value)
  if (!classified) {
    throw new Error("Android activity identity is unresolved at the observation boundary")
  }
  return classified
}

export function requireChromeForegroundActivityAtBoundary(value) {
  const activity = requireAndroidActivityAtBoundary(value)
  if (!activity.chromeForeground) {
    throw new Error(`Chrome is not the resumed Android activity: ${activity.activity}`)
  }
  const identity = activity.activity.match(
    /ActivityRecord\{([A-Za-z0-9]+)\s+[^}\r\n]*?\s(t\d+)(?:\s|\})/u
  )
  if (!identity) {
    throw new Error(
      `Chrome activity identity lacks an ActivityRecord token and task id: ${activity.activity}`
    )
  }
  return {
    ...activity,
    recordId: identity[1],
    taskId: identity[2]
  }
}

export function captureChromeSurfaceProbeBoundary({ readActivity, probeSurface }) {
  if (typeof readActivity !== "function" || typeof probeSurface !== "function") {
    throw new Error("Chrome surface boundary dependencies must be functions")
  }
  const activityBefore = requireChromeForegroundActivityAtBoundary(readActivity())
  const surface = probeSurface()
  if (typeof surface !== "object" || surface === null || Array.isArray(surface)) {
    throw new Error("Chrome surface probe must return an object")
  }
  const activityAfter = requireChromeForegroundActivityAtBoundary(readActivity())
  if (
    activityBefore.recordId !== activityAfter.recordId ||
    activityBefore.taskId !== activityAfter.taskId ||
    activityBefore.activity !== activityAfter.activity
  ) {
    throw new Error(
      `Chrome activity identity changed during the native surface probe: ` +
        `before=${activityBefore.activity}, after=${activityAfter.activity}`
    )
  }
  return {
    ...surface,
    activityBefore: activityBefore.activity,
    activityAfter: activityAfter.activity
  }
}

export function retainFirstPausedSnapshot(currentSnapshot, candidateSnapshot) {
  if (currentSnapshot !== null && currentSnapshot !== undefined) {
    return validateSnapshot(currentSnapshot, "retained runtime pause snapshot")
  }
  if (candidateSnapshot === null || candidateSnapshot === undefined) {
    return null
  }
  const candidate = validateSnapshot(candidateSnapshot, "runtime pause candidate")
  if (candidate.runningCount !== 0 || candidate.targetStatus !== "paused") {
    return null
  }
  return candidate
}

export function boundedAndroidPollDelay(remainingMilliseconds, maximumPollMilliseconds) {
  const remaining = requireFiniteNumber(remainingMilliseconds, "remaining Android poll time")
  const maximum = requireCount(maximumPollMilliseconds, "maximum Android poll delay")
  return Math.max(0, Math.min(maximum, remaining))
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

export function evaluateAndroidForegroundFrameTimeline(rawTimeline, rawBudgets) {
  const timeline = requireRecord(rawTimeline, "Android foreground frame timeline")
  const budgets = requireRecord(rawBudgets, "Android foreground frame budgets")
  const readinessTimeoutMilliseconds = requireCount(
    timeline.readinessTimeoutMilliseconds,
    "foreground frame readiness timeout"
  )
  const observationMilliseconds = requireCount(
    budgets.foregroundObservationMilliseconds,
    "foregroundObservationMilliseconds"
  )
  const minimumForegroundFrames = requireCount(
    budgets.minimumForegroundFrames,
    "minimumForegroundFrames"
  )
  const maximumRunningCanvases = requireCount(
    budgets.maximumRunningCanvases,
    "maximumRunningCanvases"
  )
  if (maximumRunningCanvases !== 1) {
    throw new Error("maximumRunningCanvases must remain exactly one")
  }

  const requireActive = (value, label) => {
    const snapshot = validateSnapshot(value, label)
    if (snapshot.runningCount !== 1 || snapshot.targetStatus !== "running") {
      throw new Error(
        `${label} must contain exactly one running canvas; ` +
          `runningCount=${snapshot.runningCount}, targetStatus=${snapshot.targetStatus}`
      )
    }
    return snapshot
  }

  const armedSnapshot = requireActive(timeline.armedSnapshot, "foreground frame armed snapshot")
  if (!Array.isArray(timeline.samples) || timeline.samples.length === 0) {
    throw new Error(
      `Android creative frame counter did not advance within ` +
        `${readinessTimeoutMilliseconds} ms`
    )
  }
  const samples = timeline.samples.map((value, index) =>
    validateSnapshot(value, `foreground frame sample[${index}]`)
  )
  let previous = armedSnapshot
  for (const sample of samples) {
    if (sample.at < previous.at) {
      throw new Error("Android foreground frame timeline timestamps must be monotonic")
    }
    if (sample.frame < previous.frame) {
      throw new Error("Android foreground frame counter regressed")
    }
    previous = sample
  }

  const firstFrame = requireActive(samples[0], "foreground frame sample")
  if (firstFrame.frame <= armedSnapshot.frame) {
    throw new Error("Android foreground frame receipt must advance beyond the armed snapshot")
  }
  const startupMilliseconds = firstFrame.at - armedSnapshot.at
  if (startupMilliseconds > readinessTimeoutMilliseconds) {
    throw new Error(
      `Android creative frame counter did not advance within ` +
        `${readinessTimeoutMilliseconds} ms`
    )
  }

  const observationDeadlineAt = firstFrame.at + observationMilliseconds
  const samplesInsideBudget = samples.filter((sample) => sample.at <= observationDeadlineAt)
  for (const sample of samplesInsideBudget) {
    requireActive(sample, "foreground frame sample")
  }
  const finalFrame = samplesInsideBudget.at(-1)
  const boundarySnapshot = requireActive(
    timeline.boundarySnapshot,
    "foreground observation boundary"
  )
  if (boundarySnapshot.at < observationDeadlineAt) {
    throw new Error(
      `Android foreground observation boundary must reach the ` +
        `${observationMilliseconds} ms deadline`
    )
  }
  if (boundarySnapshot.frame < finalFrame.frame) {
    throw new Error("Android foreground frame counter regressed at the observation boundary")
  }
  const frameDelta = finalFrame.frame - firstFrame.frame
  if (frameDelta < minimumForegroundFrames) {
    throw new Error(
      `Android foreground creative frames: expected >= ${minimumForegroundFrames}, ` +
        `received ${frameDelta}`
    )
  }

  return {
    observationMilliseconds,
    observationStartedAt: firstFrame.at,
    observationDeadlineAt,
    frameBefore: firstFrame.frame,
    frameAfter: finalFrame.frame,
    frameDelta,
    runningCountBefore: firstFrame.runningCount,
    runningCountAfter: finalFrame.runningCount,
    status: finalFrame.targetStatus,
    samples: samplesInsideBudget,
    boundarySnapshot,
    readiness: {
      timeoutMilliseconds: readinessTimeoutMilliseconds,
      startupMilliseconds,
      frameBefore: armedSnapshot.frame,
      frameAfter: firstFrame.frame
    }
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
  const clockMaximumUncertaintyMilliseconds = requireTimestamp(
    timeline.clockMaximumUncertaintyMilliseconds,
    "clock maximum uncertainty"
  )

  const homeSignal = requireRecord(timeline.homeSignal, "HOME signal")
  const homeSignalAt = requireTimestamp(homeSignal.at, "HOME signal at")
  const activeSnapshot = validateSnapshot(timeline.activeSnapshot, "active runtime snapshot")
  if (activeSnapshot.at + clockMaximumUncertaintyMilliseconds > homeSignalAt) {
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
  if (pauseSnapshot.at - clockMaximumUncertaintyMilliseconds < homeSignalAt) {
    throw new Error("runtime pause snapshot must follow the HOME signal")
  }
  if (pauseSnapshot.targetStatus !== "paused") {
    throw new Error(
      `runtime pause snapshot must have paused status; ` + `received ${pauseSnapshot.targetStatus}`
    )
  }
  if (pauseSnapshot.runningCount !== 0) {
    throw new Error(
      `runtime pause snapshot must contain zero running canvases; ` +
        `runningCount=${pauseSnapshot.runningCount}, targetStatus=${pauseSnapshot.targetStatus}`
    )
  }

  const observationSnapshot = validateSnapshot(
    timeline.observationSnapshot,
    "background observation snapshot"
  )
  if (
    observationSnapshot.at < pauseSnapshot.at ||
    observationSnapshot.at - clockMaximumUncertaintyMilliseconds < backgroundActivity.at
  ) {
    throw new Error("background observation snapshot must follow activity and runtime pause")
  }
  if (observationSnapshot.targetStatus !== "paused") {
    throw new Error(
      `background observation snapshot must have paused status; ` +
        `received ${observationSnapshot.targetStatus}`
    )
  }
  if (observationSnapshot.runningCount !== 0) {
    throw new Error(
      `background observation snapshot must contain zero running canvases; ` +
        `runningCount=${observationSnapshot.runningCount}, ` +
        `targetStatus=${observationSnapshot.targetStatus}`
    )
  }

  const foregroundReturn = normalizedActivityTransitions.find(
    (transition) =>
      transition.at > backgroundActivity.at &&
      transition.at <= observationSnapshot.at + clockMaximumUncertaintyMilliseconds &&
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
  const runtimePauseUpperBoundMilliseconds =
    runtimePauseMilliseconds + clockMaximumUncertaintyMilliseconds
  if (activityTransitionMilliseconds > maximumTransitionMilliseconds) {
    throw new Error(
      `Android operating-system background transition: expected <= ` +
        `${maximumTransitionMilliseconds}, received ${activityTransitionMilliseconds}`
    )
  }
  if (runtimePauseUpperBoundMilliseconds > maximumTransitionMilliseconds) {
    throw new Error(
      `Android runtime background pause upper bound: expected <= ` +
        `${maximumTransitionMilliseconds}, received ${runtimePauseUpperBoundMilliseconds}`
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
    runtimePauseUpperBoundMilliseconds,
    clockMaximumUncertaintyMilliseconds,
    transitionOrder:
      backgroundActivity.at <= pauseSnapshot.at ? "activity-then-pause" : "pause-then-activity",
    backgroundActivity: backgroundActivity.activity,
    activityTransitions: normalizedActivityTransitions,
    frameAtPause: pauseSnapshot.frame,
    frameAfterObservation: observationSnapshot.frame,
    postPauseFrames,
    pauseObservationSource: pauseSnapshot.source ?? "unspecified",
    statusAtPause: pauseSnapshot.targetStatus,
    statusAfterObservation: observationSnapshot.targetStatus
  }
}
