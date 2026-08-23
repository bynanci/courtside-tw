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

function requireCallable(value, label) {
  if (typeof value !== "function") {
    throw new Error(`${label} must be a function`)
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

const ANDROID_EMULATOR_ENVIRONMENT_SCHEMA = "courtside.android-emulator-environment/v1"
const EXPECTED_ANDROID_EMULATOR_ENVIRONMENT = Object.freeze({
  avdName: "courtside-api35-pixel7",
  profile: "pixel_7",
  cpuCores: 4,
  ramInput: "4096M",
  ramMegabytes: 4096,
  heapMegabytes: 576,
  minimumGuestMemoryKilobytes: 3_145_728,
  maximumGuestMemoryKilobytes: 4_194_304
})

const ANDROID_AVD_HARDWARE_KEYS = Object.freeze([
  "hw.cpu.ncore",
  "hw.ramSize",
  "vm.heapSize",
  "hw.heapSize"
])

function requireBoundedReceiptText(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1024 * 1024 ||
    value.includes("\0")
  ) {
    throw new Error(`${label} must be bounded non-empty text`)
  }
  return value.replace(/\r\n?/gu, "\n")
}

function iniMetricLines(value, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const prefix = new RegExp(`^\\s*${escapedKey}(?:\\s*=|\\s*$)`, "u")
  const exact = new RegExp(`^\\s*${escapedKey}\\s*=\\s*([^\\s#]+)\\s*$`, "u")
  return requireBoundedReceiptText(value, "Android emulator INI receipt")
    .split("\n")
    .filter((line) => prefix.test(line))
    .map((line) => ({ line, value: line.match(exact)?.[1] ?? null }))
}

function parseBoundHardwareMetric(value, key, label, metric, expectedValue) {
  const lines = iniMetricLines(value, key)
  if (lines.length === 0) {
    throw new Error(`missing ${label} ${metric}`)
  }
  if (lines.length > 1) {
    throw new Error(`duplicate ${label} ${metric}`)
  }
  const rawValue = lines[0].value
  const match = rawValue?.match(/^(\d+)$/u)
  const parsed = match ? Number(match[1]) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`malformed ${label} ${metric}`)
  }
  if (parsed !== expectedValue) {
    throw new Error(`${label} ${metric} drift: expected ${expectedValue}, received ${parsed}`)
  }
  return parsed
}

function parseBoundTextMetric(value, key, label, metric, expectedValue) {
  const lines = iniMetricLines(value, key)
  if (lines.length === 0) {
    throw new Error(`missing ${label} ${metric}`)
  }
  if (lines.length > 1) {
    throw new Error(`duplicate ${label} ${metric}`)
  }
  const rawValue = lines[0].value
  if (rawValue === null || !/^[A-Za-z0-9_-]+$/u.test(rawValue)) {
    throw new Error(`malformed ${label} ${metric}`)
  }
  if (rawValue !== expectedValue) {
    throw new Error(`${label} ${metric} drift`)
  }
  return rawValue
}

function parseCanonicalAndroidAvdConfig(value) {
  const unsupportedHeap = iniMetricLines(value, "hw.heapSize")
  if (unsupportedHeap.length > 0) {
    throw new Error("canonical contains unsupported hw.heapSize")
  }
  const avdIdentityLines = iniMetricLines(value, "AvdId")
  if (avdIdentityLines.length > 1) {
    throw new Error("duplicate canonical AVD identity")
  }
  return {
    avdId:
      avdIdentityLines.length === 0
        ? null
        : parseBoundTextMetric(
            value,
            "AvdId",
            "canonical",
            "AVD identity",
            EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName
          ),
    profile: parseBoundTextMetric(
      value,
      "hw.device.name",
      "canonical",
      "profile",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.profile
    ),
    cpuCores: parseBoundHardwareMetric(
      value,
      "hw.cpu.ncore",
      "canonical",
      "CPU",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores
    ),
    ramMegabytes: parseBoundHardwareMetric(
      value,
      "hw.ramSize",
      "canonical",
      "RAM",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramMegabytes
    ),
    heapMegabytes: parseBoundHardwareMetric(
      value,
      "vm.heapSize",
      "canonical",
      "heap",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes
    )
  }
}

function parseResolvedAndroidHardware(value) {
  const unsupportedHeap = iniMetricLines(value, "hw.heapSize")
  if (unsupportedHeap.length > 0) {
    throw new Error("resolved contains unsupported hw.heapSize")
  }
  return {
    avdName: parseBoundTextMetric(
      value,
      "avd.name",
      "resolved",
      "AVD name",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName
    ),
    avdId: parseBoundTextMetric(
      value,
      "avd.id",
      "resolved",
      "AVD id",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName
    ),
    profile: parseBoundTextMetric(
      value,
      "hw.device.name",
      "resolved",
      "profile",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.profile
    ),
    cpuCores: parseBoundHardwareMetric(
      value,
      "hw.cpu.ncore",
      "resolved",
      "CPU",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores
    ),
    ramMegabytes: parseBoundHardwareMetric(
      value,
      "hw.ramSize",
      "resolved",
      "RAM",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramMegabytes
    ),
    heapMegabytes: parseBoundHardwareMetric(
      value,
      "vm.heapSize",
      "resolved",
      "heap",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes
    )
  }
}

function parseLiveAvdName(value) {
  const lines = requireBoundedReceiptText(value, "live Android AVD identity")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 2 && lines[1] === "OK") lines.pop()
  if (lines.length !== 1 || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(lines[0])) {
    throw new Error("malformed live AVD identity")
  }
  if (lines[0] !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName) {
    throw new Error("live AVD identity drift")
  }
  return lines[0]
}

export function evaluateCanonicalAndroidAvdConfig(value) {
  return parseCanonicalAndroidAvdConfig(value)
}

export function canonicalizeAndroidAvdConfig(value) {
  const avdIdentityLines = iniMetricLines(value, "AvdId")
  if (avdIdentityLines.length > 1) {
    throw new Error("duplicate canonical AVD identity")
  }
  if (avdIdentityLines.length === 1) {
    parseBoundTextMetric(
      value,
      "AvdId",
      "canonical",
      "AVD identity",
      EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName
    )
  }
  parseBoundTextMetric(
    value,
    "hw.device.name",
    "canonical",
    "profile",
    EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.profile
  )
  const lines = requireBoundedReceiptText(value, "Android AVD config").split("\n")
  const targetedLine = new RegExp(
    `^\\s*(?:${ANDROID_AVD_HARDWARE_KEYS.map((key) =>
      key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    ).join("|")})(?:\\s*=|\\s*$)`,
    "u"
  )
  const preserved = lines.filter((line) => !targetedLine.test(line))
  while (preserved.at(-1) === "") preserved.pop()
  return [
    ...preserved,
    `hw.cpu.ncore=${EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores}`,
    `hw.ramSize=${EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramMegabytes}`,
    `vm.heapSize=${EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes}`,
    ""
  ].join("\n")
}

export function classifyAndroidEnvironmentProbeResult(value) {
  const probe = requireRecord(value, "Android emulator probe result")
  const errorCode = probe.errorCode
  if (errorCode !== null && errorCode !== undefined && typeof errorCode !== "string") {
    throw new Error("Android emulator probe error code must be a string or null")
  }
  if (errorCode === "ETIMEDOUT") {
    throw new Error("Android emulator probe timed out")
  }
  if (errorCode) {
    throw new Error(`Android emulator probe failed with error ${errorCode}`)
  }
  if (probe.status !== 0) {
    throw new Error(`Android emulator probe failed with status ${String(probe.status)}`)
  }
  if (typeof probe.stdout !== "string") {
    throw new Error("Android emulator probe stdout must be a string")
  }
  const stdout = probe.stdout.trim()
  if (!stdout) {
    throw new Error("Android emulator probe returned empty stdout")
  }
  return stdout
}

function evaluateRequestedAndroidEmulatorEnvironment(value) {
  const requested = requireRecord(value, "requested Android emulator environment")
  if (requested.avdName !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName) {
    throw new Error("requested AVD identity drift")
  }
  if (requested.profile !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.profile) {
    throw new Error("requested profile drift")
  }
  if (requested.cpuCores !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores) {
    throw new Error("requested CPU drift")
  }
  if (requested.ramInput !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramInput) {
    throw new Error("requested RAM drift")
  }
  if (requested.ramMegabytes !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramMegabytes) {
    throw new Error("requested RAM megabytes drift")
  }
  if (requested.heapMegabytes !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes) {
    throw new Error("requested heap drift")
  }
  return {
    avdName: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.avdName,
    profile: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.profile,
    cpuCores: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores,
    ramInput: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramInput,
    ramMegabytes: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.ramMegabytes,
    heapMegabytes: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes
  }
}

export function evaluateAndroidEmulatorHostEnvironment(value) {
  const evidence = requireRecord(value, "Android emulator host environment evidence")
  return {
    requested: evaluateRequestedAndroidEmulatorEnvironment(evidence.requested),
    canonicalConfig: parseCanonicalAndroidAvdConfig(evidence.canonicalConfig),
    resolvedHardware: parseResolvedAndroidHardware(evidence.resolvedHardware)
  }
}

export function evaluateAndroidEmulatorEnvironment(value) {
  const evidence = requireRecord(value, "Android emulator environment evidence")
  const hostEvidence = evaluateAndroidEmulatorHostEnvironment(evidence)
  const liveAvdName = parseLiveAvdName(evidence.liveAvdName)
  const guestCpuOnline = requireBoundedReceiptText(
    evidence.guestCpuOnline,
    "Android guest online CPU receipt"
  ).trim()
  if (guestCpuOnline !== "0-3") {
    const range = guestCpuOnline.match(/^0-(\d+)$/u)
    if (range && Number(range[1]) < 3) throw new Error("offline CPU")
    if (range && Number(range[1]) > 3) throw new Error("extra CPU")
    throw new Error("malformed guest online CPU receipt")
  }

  const meminfo = requireBoundedReceiptText(evidence.guestMeminfo, "Android guest meminfo")
  const memoryLines = meminfo
    .split("\n")
    .map((line) => line.match(/^MemTotal:\s*(\d+)\s+kB\s*$/u)?.[1] ?? null)
    .filter((item) => item !== null)
  if (memoryLines.length !== 1) {
    throw new Error("guest memory receipt is missing or ambiguous")
  }
  const memTotalKilobytes = Number(memoryLines[0])
  if (memTotalKilobytes < EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.minimumGuestMemoryKilobytes) {
    throw new Error("guest memory below the 4 GB class")
  }
  if (memTotalKilobytes > EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.maximumGuestMemoryKilobytes) {
    throw new Error("guest memory above the bound")
  }

  const guestHeap = requireBoundedReceiptText(evidence.guestHeapSize, "Android guest heap receipt")
    .trim()
    .match(/^(\d+)[mM]$/u)
  const guestHeapMegabytes = guestHeap ? Number(guestHeap[1]) : Number.NaN
  if (guestHeapMegabytes !== EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.heapMegabytes) {
    throw new Error("guest heap drift")
  }

  return {
    schemaVersion: ANDROID_EMULATOR_ENVIRONMENT_SCHEMA,
    result: "PASS",
    ...hostEvidence,
    liveGuest: {
      avdName: liveAvdName,
      cpuOnline: guestCpuOnline,
      cpuCores: EXPECTED_ANDROID_EMULATOR_ENVIRONMENT.cpuCores,
      memTotalKilobytes,
      heapMegabytes: guestHeapMegabytes
    }
  }
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

export function selectResumedAndroidActivityLine(value) {
  if (typeof value !== "string") {
    throw new Error("Android activity dump must be a string")
  }
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  const topResumed = lines.filter((line) => /^topResumedActivity\s*[:=]/u.test(line))
  const legacyResumed = lines.filter((line) => /^mResumedActivity\s*[:=]/u.test(line))
  const candidates = topResumed.length > 0 ? topResumed : legacyResumed
  if (candidates.length !== 1) return ""

  const activity = candidates[0]
  if (!/ActivityRecord\{[^}\r\n]+\}\s*$/u.test(activity)) return ""
  return classifyAndroidActivityLine(activity) ? activity : ""
}

export function classifyAndroidActivityProbeResult(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Android activity probe result must be an object")
  }
  const errorCode = value.errorCode
  if (errorCode !== null && errorCode !== undefined && typeof errorCode !== "string") {
    throw new Error("Android activity probe error code must be a string or null")
  }
  if (errorCode === "ETIMEDOUT") {
    return { status: "timed-out", activity: "" }
  }
  if (errorCode) {
    throw new Error(`Android activity probe failed with error ${errorCode}`)
  }
  if (value.status !== 0) {
    throw new Error(`Android activity probe failed with status ${String(value.status)}`)
  }
  if (typeof value.stdout !== "string") {
    throw new Error("Android activity probe stdout must be a string")
  }
  const activity = selectResumedAndroidActivityLine(value.stdout)
  return activity ? { status: "resolved", activity } : { status: "unresolved", activity: "" }
}

export function requireAndroidActivityProbeReceipt(value) {
  const receipt = requireRecord(value, "Android activity probe receipt")
  if (!new Set(["resolved", "unresolved", "timed-out"]).has(receipt.status)) {
    throw new Error(`Android activity probe receipt status is invalid: ${String(receipt.status)}`)
  }
  if (typeof receipt.activity !== "string") {
    throw new Error("Android activity probe receipt activity must be a string")
  }
  if (receipt.status === "resolved" && !receipt.activity) {
    throw new Error("Resolved Android activity probe receipt must include an activity")
  }
  if (receipt.status !== "resolved" && receipt.activity) {
    throw new Error("Unresolved Android activity probe receipt cannot include an activity")
  }
  return Object.freeze({ status: receipt.status, activity: receipt.activity })
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

export async function acquireChromeForegroundActivityAtBoundary(rawDependencies) {
  const dependencies = requireRecord(
    rawDependencies,
    "Chrome foreground activity acquisition dependencies"
  )
  const readActivityReceipt = requireCallable(
    dependencies.readActivityReceipt,
    "readActivityReceipt"
  )
  const now = requireCallable(dependencies.now, "activity acquisition clock")
  const delay = requireCallable(dependencies.delay, "activity acquisition delay")
  const deadlineAt = requireTimestamp(dependencies.deadlineAt, "activity acquisition deadline")
  const maximumReadMilliseconds = requireCount(
    dependencies.maximumReadMilliseconds,
    "maximum activity receipt read"
  )
  const maximumPollMilliseconds = requireCount(
    dependencies.maximumPollMilliseconds,
    "maximum activity receipt poll delay"
  )
  const maximumAttempts = requireCount(
    dependencies.maximumAttempts,
    "maximum activity receipt attempts"
  )
  if (maximumReadMilliseconds === 0 || maximumAttempts === 0) {
    throw new Error("activity receipt read and attempt bounds must be positive")
  }

  const attempts = []
  for (let attemptIndex = 0; attemptIndex < maximumAttempts; attemptIndex += 1) {
    const timeoutMilliseconds = androidCommandTimeoutMilliseconds(
      deadlineAt,
      requireTimestamp(now(), "activity acquisition current time"),
      maximumReadMilliseconds
    )
    if (timeoutMilliseconds === 0) break

    const receipt = requireAndroidActivityProbeReceipt(
      await readActivityReceipt(timeoutMilliseconds)
    )
    attempts.push(receipt)
    const postReadAt = requireTimestamp(now(), "activity acquisition post-read time")
    if (postReadAt >= deadlineAt) break
    if (receipt.status === "resolved") {
      return {
        ...requireChromeForegroundActivityAtBoundary(receipt.activity),
        attempts: Object.freeze([...attempts])
      }
    }
    if (attemptIndex + 1 >= maximumAttempts) break

    const remainingMilliseconds = deadlineAt - postReadAt
    if (remainingMilliseconds <= 0) break
    const delayMilliseconds = boundedAndroidPollDelay(
      remainingMilliseconds,
      maximumPollMilliseconds
    )
    if (delayMilliseconds > 0) await delay(delayMilliseconds)
  }

  throw new Error(
    `Android Chrome activity identity did not resolve within its bounded receipt acquisition; ` +
      `attempts=${JSON.stringify(attempts)}`
  )
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

export function captureChromeSurfaceProbeBoundaryAttempt({ readActivityReceipt, probeSurface }) {
  if (typeof readActivityReceipt !== "function" || typeof probeSurface !== "function") {
    throw new Error("Chrome surface readiness dependencies must be functions")
  }
  const readReceipt = () => requireAndroidActivityProbeReceipt(readActivityReceipt())

  const activityProbeBefore = readReceipt()
  if (activityProbeBefore.status !== "resolved") {
    return {
      status: "activity-unresolved",
      stage: "before",
      activityProbe: activityProbeBefore
    }
  }
  const activityBefore = requireChromeForegroundActivityAtBoundary(activityProbeBefore.activity)
  const surface = probeSurface()
  if (typeof surface !== "object" || surface === null || Array.isArray(surface)) {
    throw new Error("Chrome surface probe must return an object")
  }
  const activityProbeAfter = readReceipt()
  if (activityProbeAfter.status !== "resolved") {
    return {
      status: "activity-unresolved",
      stage: "after",
      activityBefore: activityBefore.activity,
      activityProbe: activityProbeAfter
    }
  }
  const activityAfter = requireChromeForegroundActivityAtBoundary(activityProbeAfter.activity)
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

const NATIVE_ANDROID_CDP_CONNECTION_OPTIONS = Object.freeze({ noDefaults: true })

export function nativeAndroidCdpConnectionOptions() {
  return NATIVE_ANDROID_CDP_CONNECTION_OPTIONS
}

export async function connectNativeAndroidBrowser(connectOverCdp, endpoint) {
  const connect = requireCallable(connectOverCdp, "native Android CDP connector")
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("native Android CDP endpoint must be non-empty")
  }
  return await connect(endpoint, nativeAndroidCdpConnectionOptions())
}

export function requireAndroidBrowserForegroundReceipt(value, expectedUrl) {
  const receipt = requireRecord(value, "Android browser foreground receipt")
  if (typeof expectedUrl !== "string" || expectedUrl.length === 0 || receipt.url !== expectedUrl) {
    throw new Error("Android browser foreground receipt URL is not the exact target")
  }
  if (
    receipt.visibilityState !== "visible" ||
    receipt.hidden !== false ||
    receipt.hasFocus !== true
  ) {
    throw new Error("Android browser foreground receipt is not visible and focused")
  }
  return Object.freeze({
    url: receipt.url,
    visibilityState: receipt.visibilityState,
    hidden: receipt.hidden,
    hasFocus: receipt.hasFocus
  })
}

export function androidCommandTimeoutMilliseconds(deadlineAt, nowAt, maximumMilliseconds) {
  const deadline = requireTimestamp(deadlineAt, "Android command deadline")
  const now = requireTimestamp(nowAt, "Android command current time")
  const maximum = requireCount(maximumMilliseconds, "maximum Android command timeout")
  if (maximum === 0) {
    throw new Error("maximum Android command timeout must be positive")
  }
  return Math.max(0, Math.min(maximum, Math.floor(deadline - now)))
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

export async function establishNativeAndroidBackgroundBoundary(rawDependencies) {
  const dependencies = requireRecord(rawDependencies, "native Android background dependencies")
  const bringToFront = requireCallable(dependencies.bringToFront, "bringToFront")
  const readBrowserForeground = requireCallable(
    dependencies.readBrowserForeground,
    "readBrowserForeground"
  )
  const readChromeForegroundActivity = requireCallable(
    dependencies.readChromeForegroundActivity,
    "readChromeForegroundActivity"
  )
  const armRuntimeObservation = requireCallable(
    dependencies.armRuntimeObservation,
    "armRuntimeObservation"
  )
  const epochNow = requireCallable(dependencies.epochNow, "epochNow")
  const monotonicNow = requireCallable(dependencies.monotonicNow, "monotonicNow")
  const sendHome = requireCallable(dependencies.sendHome, "sendHome")

  await bringToFront()
  const browserForeground = requireAndroidBrowserForegroundReceipt(
    await readBrowserForeground(),
    dependencies.expectedUrl
  )
  const foregroundActivityReceipt = requireRecord(
    await readChromeForegroundActivity(),
    "Chrome foreground activity acquisition"
  )
  const foregroundActivity = requireChromeForegroundActivityAtBoundary(
    foregroundActivityReceipt.activity
  )
  if (
    !Array.isArray(foregroundActivityReceipt.attempts) ||
    foregroundActivityReceipt.attempts.length === 0
  ) {
    throw new Error("Chrome foreground activity acquisition attempts must be non-empty")
  }
  const foregroundActivityAttempts = foregroundActivityReceipt.attempts.map((receipt) =>
    requireAndroidActivityProbeReceipt(receipt)
  )
  const finalActivityAttempt = foregroundActivityAttempts.at(-1)
  if (
    finalActivityAttempt?.status !== "resolved" ||
    finalActivityAttempt.activity !== foregroundActivity.activity
  ) {
    throw new Error("Chrome foreground activity acquisition final receipt is not authoritative")
  }
  const hostEpochBeforeArm = requireTimestamp(epochNow(), "host epoch before arm")
  const rawActiveSnapshot = await armRuntimeObservation()
  const hostEpochAfterArm = requireTimestamp(epochNow(), "host epoch after arm")
  const clockCalibration = calibrateBrowserClockToHost({
    browserEpochAtArm: rawActiveSnapshot.at,
    hostEpochBeforeArm,
    hostEpochAfterArm
  })
  const activeSnapshot = normalizeBrowserRuntimeSnapshot(rawActiveSnapshot, clockCalibration)
  const homeSignal = {
    at: requireTimestamp(epochNow(), "Android HOME signal epoch"),
    signal: "Android KEYCODE_HOME"
  }
  const commandStartedAt = requireTimestamp(monotonicNow(), "Android HOME command start")
  await sendHome()
  const commandCompletedAt = requireTimestamp(monotonicNow(), "Android HOME command completion")
  if (commandCompletedAt < commandStartedAt) {
    throw new Error("Android HOME command completion precedes its start")
  }

  return {
    browserForeground,
    foregroundActivity,
    foregroundActivityAttempts: Object.freeze(foregroundActivityAttempts),
    clockCalibration,
    activeSnapshot,
    homeSignal,
    commandMilliseconds: commandCompletedAt - commandStartedAt
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
