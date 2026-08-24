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

function parseAndroidHierarchyNodes(value) {
  const tags = value.match(/<\/?node\b[^>]*>/gu) ?? []
  const records = []
  const stack = []
  for (const tag of tags) {
    if (tag.startsWith("</")) {
      if (!/^<\/node\s*>$/u.test(tag) || stack.length === 0) return null
      stack.pop()
      continue
    }
    const record = {
      node: tag,
      parentIndex: stack.length === 0 ? null : stack.at(-1)
    }
    records.push(record)
    if (!/\/\s*>$/u.test(tag)) stack.push(records.length - 1)
  }
  return stack.length === 0 ? records : null
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

export function classifyPixelLauncherAnrWindow(value, rawDisplaySize) {
  if (typeof value !== "string") {
    throw new Error("Android window-manager receipt must be a string")
  }
  const displaySize = normalizeAndroidDisplaySize(rawDisplaySize)
  const blocked = Object.freeze({
    status: "blocked",
    reason: "unrecognized-or-malformed-system-error-window"
  })
  const headers = [
    ...value.matchAll(
      /^[ \t]*Window #\d+ Window\{[0-9a-f]+ u0 Application Not Responding: ([^}\r\n]+)\}:[ \t]*$/gimu
    )
  ]
  if (headers.length === 0) {
    return value.includes("Application Not Responding:")
      ? blocked
      : Object.freeze({ status: "absent" })
  }
  if (
    headers.length !== 1 ||
    headers[0][1] !== "com.google.android.apps.nexuslauncher" ||
    displaySize?.width !== 1080 ||
    displaySize.height !== 2400
  ) {
    return blocked
  }

  const blockStart = headers[0].index
  const nextWindowStart = value.indexOf("\n  Window #", blockStart + headers[0][0].length)
  const block = value.slice(blockStart, nextWindowStart < 0 ? value.length : nextWindowStart)
  const exactEvidence = [
    /mOwnerUid=1000 showForAllUsers=true package=android appop=SYSTEM_ALERT_WINDOW/u,
    /mAttrs=\{[\s\S]*?\bty=SYSTEM_ALERT\b/u,
    /Requested w=1024 h=506\b/u,
    /mViewVisibility=0x0 mHaveFrame=true mObscured=false/u,
    /mHasSurface=true isReadyForDisplay\(\)=true/u,
    /Frames: parent=\[0,136\]\[1080,2337\] display=\[0,136\]\[1080,2337\] frame=\[28,983\]\[1052,1489\] last=\[28,983\]\[1052,1489\]/u,
    /isOnScreen=true/u,
    /isVisible=true/u
  ]
  if (!exactEvidence.every((pattern) => pattern.test(block))) return blocked

  return Object.freeze({
    status: "known-pixel-launcher-anr",
    dismissTap: KNOWN_CHROME_AUTOMATION_PROMPT_TAPS["known-pixel-launcher-anr"]
  })
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
  const hierarchyNode = hierarchyDocument.match(/^<hierarchy\b[^>]*>/u)?.[0] ?? ""
  const nodeRecords = parseAndroidHierarchyNodes(hierarchyDocument)
  if (nodeRecords === null) return blocked
  const nodes = nodeRecords.map((record) => record.node)
  const displaySize = normalizeAndroidDisplaySize(rawDisplaySize)
  const modalId = "com.android.chrome:id/modal_dialog_view"
  const negativeButtonId = "com.android.chrome:id/negative_button"
  const knownTitle = "Chrome notifications make things easier"
  const launcherAnrTitle = "Pixel Launcher isn't responding"
  const launcherAnrIds = Object.freeze({
    panel: "android:id/parentPanel",
    title: "android:id/alertTitle",
    close: "android:id/aerr_close",
    wait: "android:id/aerr_wait"
  })
  const launcherAnrMarker = nodes.some((node) => {
    const resourceId = xmlAttribute(node, "resource-id")
    return (
      Object.values(launcherAnrIds).includes(resourceId) ||
      xmlAttribute(node, "text") === launcherAnrTitle
    )
  })
  if (launcherAnrMarker) {
    const resourceRecords = (resourceId) =>
      nodeRecords.filter((record) => xmlAttribute(record.node, "resource-id") === resourceId)
    const exactRecords = (resourceId, className, text) =>
      resourceRecords(resourceId).filter(
        (record) =>
          xmlAttribute(record.node, "package") === "android" &&
          xmlAttribute(record.node, "class") === className &&
          (text === null || xmlAttribute(record.node, "text") === text)
      )
    const panels = exactRecords(launcherAnrIds.panel, "android.widget.LinearLayout", "")
    const titles = exactRecords(launcherAnrIds.title, "android.widget.TextView", launcherAnrTitle)
    const closeButtons = exactRecords(
      launcherAnrIds.close,
      "android.widget.Button",
      "Close app"
    ).filter(
      (record) =>
        xmlAttribute(record.node, "clickable") === "true" &&
        xmlAttribute(record.node, "enabled") === "true"
    )
    const waitButtons = exactRecords(launcherAnrIds.wait, "android.widget.Button", "Wait").filter(
      (record) =>
        xmlAttribute(record.node, "clickable") === "true" &&
        xmlAttribute(record.node, "enabled") === "true"
    )
    const allNodesBelongToAndroid =
      nodes.length > 0 && nodes.every((node) => xmlAttribute(node, "package") === "android")
    const actionableButtons = nodeRecords.filter(
      (record) =>
        xmlAttribute(record.node, "package") === "android" &&
        xmlAttribute(record.node, "class") === "android.widget.Button" &&
        xmlAttribute(record.node, "clickable") === "true" &&
        xmlAttribute(record.node, "enabled") === "true"
    )
    const actionableButtonIds = actionableButtons.map((record) =>
      xmlAttribute(record.node, "resource-id")
    )
    const isDescendantOf = (record, ancestor) => {
      let parentIndex = record.parentIndex
      const ancestorIndex = nodeRecords.indexOf(ancestor)
      while (parentIndex !== null && parentIndex !== undefined) {
        if (parentIndex === ancestorIndex) return true
        parentIndex = nodeRecords[parentIndex]?.parentIndex
      }
      return false
    }
    if (
      xmlAttribute(hierarchyNode, "rotation") !== "0" ||
      !allNodesBelongToAndroid ||
      Object.values(launcherAnrIds).some(
        (resourceId) => resourceRecords(resourceId).length !== 1
      ) ||
      panels.length !== 1 ||
      titles.length !== 1 ||
      closeButtons.length !== 1 ||
      waitButtons.length !== 1 ||
      !isDescendantOf(titles[0], panels[0]) ||
      !isDescendantOf(closeButtons[0], panels[0]) ||
      !isDescendantOf(waitButtons[0], panels[0]) ||
      actionableButtons.length !== 2 ||
      !actionableButtonIds.includes(launcherAnrIds.close) ||
      !actionableButtonIds.includes(launcherAnrIds.wait) ||
      displaySize?.width !== 1080 ||
      displaySize.height !== 2400
    ) {
      return blocked
    }

    const panelBounds = parseAndroidBounds(panels[0].node)
    const titleBounds = parseAndroidBounds(titles[0].node)
    const closeBounds = parseAndroidBounds(closeButtons[0].node)
    const waitBounds = parseAndroidBounds(waitButtons[0].node)
    const boundsAreInside = (inner, outer) =>
      inner &&
      outer &&
      inner.left >= outer.left &&
      inner.top >= outer.top &&
      inner.right <= outer.right &&
      inner.bottom <= outer.bottom
    const displayBounds = { left: 0, top: 0, right: displaySize.width, bottom: displaySize.height }
    const exactBounds = (bounds, expected) =>
      bounds !== null &&
      bounds.left === expected.left &&
      bounds.top === expected.top &&
      bounds.right === expected.right &&
      bounds.bottom === expected.bottom
    if (
      !boundsAreInside(panelBounds, displayBounds) ||
      !boundsAreInside(titleBounds, panelBounds) ||
      !boundsAreInside(closeBounds, panelBounds) ||
      !boundsAreInside(waitBounds, panelBounds) ||
      closeBounds.bottom > waitBounds.top ||
      !exactBounds(panelBounds, { left: 70, top: 1025, right: 1010, bottom: 1447 }) ||
      !exactBounds(titleBounds, { left: 133, top: 1072, right: 947, bottom: 1135 }) ||
      !exactBounds(closeBounds, { left: 70, top: 1174, right: 1010, bottom: 1300 }) ||
      !exactBounds(waitBounds, { left: 70, top: 1300, right: 1010, bottom: 1426 })
    ) {
      return blocked
    }
    const x = waitBounds.left + Math.floor((waitBounds.right - waitBounds.left) / 2)
    const y = waitBounds.top + Math.floor((waitBounds.bottom - waitBounds.top) / 2)
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return blocked
    return {
      status: "known-pixel-launcher-anr",
      dismissTap: { x, y }
    }
  }
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

const KNOWN_CHROME_AUTOMATION_PROMPTS = Object.freeze([
  "known-notification-prompt",
  "known-pixel-launcher-anr"
])
const KNOWN_CHROME_AUTOMATION_PROMPT_TAPS = Object.freeze({
  "known-notification-prompt": Object.freeze({ x: 592, y: 1753 }),
  "known-pixel-launcher-anr": Object.freeze({ x: 540, y: 1363 })
})

export function planChromeAutomationSurfaceNormalization(rawSurface, rawDismissedPrompts) {
  const surface = requireRecord(rawSurface, "Chrome automation surface")
  if (!Array.isArray(rawDismissedPrompts)) {
    throw new Error("dismissed Chrome automation prompts must be an array")
  }
  const dismissedPrompts = new Set()
  for (const prompt of rawDismissedPrompts) {
    if (!KNOWN_CHROME_AUTOMATION_PROMPTS.includes(prompt) || dismissedPrompts.has(prompt)) {
      throw new Error("dismissed Chrome automation prompt identity is invalid")
    }
    dismissedPrompts.add(prompt)
  }
  if (surface.status === "clear") return Object.freeze({ action: "accept" })
  if (!KNOWN_CHROME_AUTOMATION_PROMPTS.includes(surface.status)) {
    throw new Error("Android Chrome content surface is blocked by an unrecognized native modal")
  }
  if (dismissedPrompts.has(surface.status)) {
    return Object.freeze({ action: "poll", prompt: surface.status })
  }
  const dismissTap = requireRecord(surface.dismissTap, "Chrome automation prompt dismiss tap")
  const x = requireCount(dismissTap.x, "Chrome automation prompt dismiss x")
  const y = requireCount(dismissTap.y, "Chrome automation prompt dismiss y")
  if (x === 0 || y === 0 || x > 10_000 || y > 10_000) {
    throw new Error("Chrome automation prompt dismiss tap is outside the safe coordinate bound")
  }
  const expectedTap = KNOWN_CHROME_AUTOMATION_PROMPT_TAPS[surface.status]
  if (x !== expectedTap.x || y !== expectedTap.y) {
    throw new Error("Chrome automation prompt dismiss tap does not match its exact target")
  }
  return Object.freeze({
    action: "tap",
    prompt: surface.status,
    dismissTap: Object.freeze({ x, y })
  })
}

export function executeChromeSurfaceNormalizationAction(rawDependencies) {
  const dependencies = requireRecord(
    rawDependencies,
    "Chrome surface normalization action dependencies"
  )
  const surface = requireRecord(dependencies.surface, "Chrome automation surface")
  const normalization = planChromeAutomationSurfaceNormalization(
    surface,
    dependencies.dismissedPrompts
  )
  if (normalization.action !== "tap") return normalization

  const expectedActivity = requireChromeForegroundActivityAtBoundary(dependencies.expectedActivity)
  const tap = requireCallable(dependencies.tap, "normalization tap")
  const recordDismissedPrompt = requireCallable(
    dependencies.recordDismissedPrompt,
    "normalization dismissed prompt recorder"
  )
  const activityBeforeTap = requireChromeSurfaceNormalizationActivity(expectedActivity.activity, {
    status: "resolved",
    activity: surface.activityAfter
  })
  const tapLabel =
    normalization.prompt === "known-pixel-launcher-anr"
      ? "Pixel Launcher ANR wait tap"
      : "notification tap"
  tap(normalization.dismissTap, tapLabel)
  recordDismissedPrompt(normalization.prompt)
  return Object.freeze({
    ...normalization,
    activityBeforeTap
  })
}

export function readBoundChromeSurfaceActivityReceipt(rawDependencies) {
  const dependencies = requireRecord(
    rawDependencies,
    "bounded Chrome surface activity receipt dependencies"
  )
  const deadlineAt = requireTimestamp(
    dependencies.deadlineAt,
    "bounded Chrome surface activity receipt deadline"
  )
  const maximumMilliseconds = requireCount(
    dependencies.maximumMilliseconds,
    "bounded Chrome surface activity receipt maximum"
  )
  if (maximumMilliseconds === 0) {
    throw new Error("bounded Chrome surface activity receipt maximum must be positive")
  }
  const label = dependencies.label
  if (typeof label !== "string" || label.length === 0) {
    throw new Error("bounded Chrome surface activity receipt label must be non-empty")
  }
  const remainingMilliseconds = requireCallable(
    dependencies.remainingMilliseconds,
    "bounded Chrome surface activity remaining-time resolver"
  )
  const readActivityReceipt = requireCallable(
    dependencies.readActivityReceipt,
    "bounded Chrome surface activity receipt reader"
  )
  const timeoutMilliseconds = requireCount(
    remainingMilliseconds(deadlineAt, maximumMilliseconds, label),
    "bounded Chrome surface activity receipt timeout"
  )
  if (timeoutMilliseconds === 0) {
    throw new Error("bounded Chrome surface activity receipt deadline expired")
  }
  const receipt = requireAndroidActivityProbeReceipt(readActivityReceipt(timeoutMilliseconds))
  const acceptanceMilliseconds = requireCount(
    remainingMilliseconds(deadlineAt, 1, `${label} acceptance`),
    "bounded Chrome surface activity acceptance timeout"
  )
  if (acceptanceMilliseconds === 0) {
    throw new Error("bounded Chrome surface activity receipt completed at its deadline")
  }
  return receipt
}

export function executeBoundChromeSurfaceTap(rawDependencies) {
  const dependencies = requireRecord(rawDependencies, "bounded Chrome surface tap dependencies")
  const deadlineAt = requireTimestamp(
    dependencies.deadlineAt,
    "bounded Chrome surface tap deadline"
  )
  const maximumMilliseconds = requireCount(
    dependencies.maximumMilliseconds,
    "bounded Chrome surface tap maximum"
  )
  if (maximumMilliseconds === 0) {
    throw new Error("bounded Chrome surface tap maximum must be positive")
  }
  const label = dependencies.label
  const expectedTap =
    label === "Pixel Launcher ANR wait tap"
      ? KNOWN_CHROME_AUTOMATION_PROMPT_TAPS["known-pixel-launcher-anr"]
      : label === "notification tap"
        ? KNOWN_CHROME_AUTOMATION_PROMPT_TAPS["known-notification-prompt"]
        : null
  const dismissTap = requireRecord(dependencies.dismissTap, "bounded Chrome surface dismiss tap")
  const x = requireCount(dismissTap.x, "bounded Chrome surface dismiss x")
  const y = requireCount(dismissTap.y, "bounded Chrome surface dismiss y")
  if (!expectedTap || x !== expectedTap.x || y !== expectedTap.y) {
    throw new Error("bounded Chrome surface tap does not match the exact known prompt target")
  }
  const remainingMilliseconds = requireCallable(
    dependencies.remainingMilliseconds,
    "bounded Chrome surface tap remaining-time resolver"
  )
  const runAdb = requireCallable(dependencies.runAdb, "bounded Chrome surface adb runner")
  const timeoutMilliseconds = requireCount(
    remainingMilliseconds(deadlineAt, maximumMilliseconds, label),
    "bounded Chrome surface tap timeout"
  )
  if (timeoutMilliseconds === 0) {
    throw new Error("bounded Chrome surface tap deadline expired")
  }
  return runAdb(
    timeoutMilliseconds,
    "shell",
    "input",
    "tap",
    String(expectedTap.x),
    String(expectedTap.y)
  )
}

export async function normalizeChromeAutomationSurfaceWithinDeadline(rawDependencies) {
  const dependencies = requireRecord(
    rawDependencies,
    "Chrome surface normalization deadline dependencies"
  )
  const deadlineAt = requireTimestamp(
    dependencies.deadlineAt,
    "Chrome surface normalization deadline"
  )
  const now = requireCallable(dependencies.now, "Chrome surface normalization clock")
  const probeSurface = requireCallable(
    dependencies.probeSurface,
    "Chrome surface normalization probe"
  )
  const tap = requireCallable(dependencies.tap, "Chrome surface normalization tap")
  const delay = requireCallable(dependencies.delay, "Chrome surface normalization delay")
  const maximumPollMilliseconds = requireCount(
    dependencies.maximumPollMilliseconds,
    "Chrome surface normalization maximum poll delay"
  )
  if (maximumPollMilliseconds === 0) {
    throw new Error("Chrome surface normalization maximum poll delay must be positive")
  }

  const attempts = []
  const dismissedPromptStatuses = new Set()
  const dismissedTaps = {}
  let normalizationActivity = null

  while (requireTimestamp(now(), "Chrome surface normalization current time") < deadlineAt) {
    const surface = requireRecord(
      await probeSurface(),
      "Chrome surface normalization probe receipt"
    )
    attempts.push(surface)
    if (surface.status !== "activity-unresolved") {
      normalizationActivity = retainChromeSurfaceNormalizationActivity(
        normalizationActivity,
        surface
      )
      const normalization = executeChromeSurfaceNormalizationAction({
        surface,
        dismissedPrompts: [...dismissedPromptStatuses],
        expectedActivity: normalizationActivity,
        tap,
        recordDismissedPrompt: (prompt) => dismissedPromptStatuses.add(prompt)
      })
      const postActionAt = requireTimestamp(now(), "Chrome surface normalization post-action time")
      if (normalization.action === "accept") {
        if (postActionAt >= deadlineAt) break
        return Object.freeze({
          surface,
          normalizationActivity,
          dismissedPrompts: Object.freeze([...dismissedPromptStatuses]),
          dismissedTaps: Object.freeze({ ...dismissedTaps }),
          attempts: Object.freeze([...attempts])
        })
      }
      if (normalization.action === "tap") {
        dismissedTaps[normalization.prompt] = normalization.dismissTap
      }
    }

    const remainingMilliseconds =
      deadlineAt - requireTimestamp(now(), "Chrome surface normalization poll time")
    if (remainingMilliseconds <= 0) break
    await delay(boundedAndroidPollDelay(remainingMilliseconds, maximumPollMilliseconds))
  }

  const lastAttempt = attempts.at(-1)
  if (lastAttempt?.status === "activity-unresolved") {
    throw new Error(
      `Android Chrome activity identity did not resolve within the shared automation deadline; ` +
        `attempts=${JSON.stringify(attempts)}`
    )
  }
  throw new Error(
    `Android Chrome known native modal did not clear within the shared automation deadline; ` +
      `attempts=${JSON.stringify(attempts)}`
  )
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

function sameChromeActivityIdentity(left, right) {
  return (
    left.recordId === right.recordId &&
    left.taskId === right.taskId &&
    left.activity === right.activity
  )
}

export function retainChromeSurfaceNormalizationActivity(currentActivity, rawSurface) {
  const surface = requireRecord(rawSurface, "Chrome surface normalization receipt")
  const activityBefore = requireChromeForegroundActivityAtBoundary(surface.activityBefore)
  const activityAfter = requireChromeForegroundActivityAtBoundary(surface.activityAfter)
  if (!sameChromeActivityIdentity(activityBefore, activityAfter)) {
    throw new Error(
      `Chrome normalization activity identity changed: ` +
        `before=${activityBefore.activity}, after=${activityAfter.activity}`
    )
  }
  if (currentActivity === null || currentActivity === undefined) {
    return activityBefore.activity
  }
  const retainedActivity = requireChromeForegroundActivityAtBoundary(currentActivity)
  if (!sameChromeActivityIdentity(retainedActivity, activityBefore)) {
    throw new Error(
      `Chrome normalization activity identity changed: ` +
        `retained=${retainedActivity.activity}, current=${activityBefore.activity}`
    )
  }
  return retainedActivity.activity
}

export function requireChromeSurfaceNormalizationActivity(expectedActivity, rawReceipt) {
  const expected = requireChromeForegroundActivityAtBoundary(expectedActivity)
  const receipt = requireAndroidActivityProbeReceipt(rawReceipt)
  if (receipt.status !== "resolved") {
    throw new Error("Chrome normalization activity receipt did not resolve")
  }
  const current = requireChromeForegroundActivityAtBoundary(receipt.activity)
  if (!sameChromeActivityIdentity(expected, current)) {
    throw new Error(
      `Chrome normalization activity identity changed: ` +
        `expected=${expected.activity}, current=${current.activity}`
    )
  }
  return current
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

function requireChromeSurfaceActivityAcquisition(rawAcquisition, label) {
  const acquisition = requireRecord(rawAcquisition, label)
  const activity = requireChromeForegroundActivityAtBoundary(acquisition.activity)
  if (!Array.isArray(acquisition.attempts)) {
    throw new Error(`${label} attempts must be an array`)
  }
  const attempts = acquisition.attempts.map((attempt) =>
    requireAndroidActivityProbeReceipt(attempt)
  )
  return Object.freeze({
    ...activity,
    attempts: Object.freeze(attempts)
  })
}

export async function captureChromeSurfaceProbeBoundaryWithActivityAcquisition(rawDependencies) {
  const dependencies = requireRecord(
    rawDependencies,
    "Chrome surface activity-acquisition boundary dependencies"
  )
  const acquireActivity = requireCallable(
    dependencies.acquireActivity,
    "Chrome surface boundary activity acquisition"
  )
  const probeSurface = requireCallable(dependencies.probeSurface, "Chrome surface boundary probe")
  const activityBefore = requireChromeSurfaceActivityAcquisition(
    await acquireActivity("pre-surface activity"),
    "pre-surface Chrome activity acquisition"
  )
  const surface = requireRecord(await probeSurface(), "Chrome surface probe")
  const activityAfter = requireChromeSurfaceActivityAcquisition(
    await acquireActivity("post-surface activity"),
    "post-surface Chrome activity acquisition"
  )
  if (!sameChromeActivityIdentity(activityBefore, activityAfter)) {
    throw new Error(
      `Chrome activity identity changed during the native surface probe: ` +
        `before=${activityBefore.activity}, after=${activityAfter.activity}`
    )
  }
  return Object.freeze({
    ...surface,
    activityBefore: activityBefore.activity,
    activityAfter: activityAfter.activity,
    activityBeforeAttempts: activityBefore.attempts,
    activityAfterAttempts: activityAfter.attempts
  })
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
  const browserForegroundBeforeActivity = requireAndroidBrowserForegroundReceipt(
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
  const browserForeground = requireAndroidBrowserForegroundReceipt(
    await readBrowserForeground(),
    dependencies.expectedUrl
  )
  if (
    browserForeground.url !== browserForegroundBeforeActivity.url ||
    browserForeground.visibilityState !== browserForegroundBeforeActivity.visibilityState ||
    browserForeground.hidden !== browserForegroundBeforeActivity.hidden ||
    browserForeground.hasFocus !== browserForegroundBeforeActivity.hasFocus
  ) {
    throw new Error("Android browser foreground identity changed during activity acquisition")
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

export function evaluateAndroidOffscreenTimeline(rawTimeline, rawBudgets) {
  const timeline = requireRecord(rawTimeline, "Android offscreen timeline")
  const budgets = requireRecord(rawBudgets, "Android offscreen budgets")
  const maximumReactionMilliseconds = requireCount(
    budgets.offscreenPauseMilliseconds,
    "offscreenPauseMilliseconds"
  )
  const maximumBackgroundFrames = requireCount(
    budgets.maximumBackgroundFrames,
    "maximumBackgroundFrames"
  )

  const commandAt = requireTimestamp(timeline.commandAt, "offscreen command at")
  const offscreenAt = requireTimestamp(timeline.offscreenAt, "offscreen geometry at")
  const scrollSignalAt = requireTimestamp(timeline.scrollSignalAt, "offscreen scroll signal at")
  const pauseAt = requireTimestamp(timeline.pauseAt, "offscreen pause at")
  if (!(commandAt <= offscreenAt && offscreenAt <= scrollSignalAt && scrollSignalAt <= pauseAt)) {
    throw new Error(
      `Android offscreen timeline ordering is invalid; ` +
        `commandAt=${commandAt}, offscreenAt=${offscreenAt}, ` +
        `scrollSignalAt=${scrollSignalAt}, pauseAt=${pauseAt}`
    )
  }

  const activeSnapshot = validateSnapshot(timeline.activeSnapshot, "offscreen active snapshot")
  const scrollSignalSnapshot = validateSnapshot(
    timeline.scrollSignalSnapshot,
    "offscreen scroll signal snapshot"
  )
  const pauseSnapshot = validateSnapshot(timeline.pauseSnapshot, "offscreen pause snapshot")

  if (activeSnapshot.runningCount !== 1 || activeSnapshot.targetStatus !== "running") {
    throw new Error(
      `offscreen active snapshot must contain exactly one running canvas; ` +
        `runningCount=${activeSnapshot.runningCount}, targetStatus=${activeSnapshot.targetStatus}`
    )
  }
  const signalIsActive =
    scrollSignalSnapshot.runningCount === 1 && scrollSignalSnapshot.targetStatus === "running"
  const signalIsPaused =
    scrollSignalSnapshot.runningCount === 0 && scrollSignalSnapshot.targetStatus === "paused"
  if (!signalIsActive && !signalIsPaused) {
    throw new Error(
      `offscreen scroll signal snapshot must be exactly active or fully paused; ` +
        `runningCount=${scrollSignalSnapshot.runningCount}, ` +
        `targetStatus=${scrollSignalSnapshot.targetStatus}`
    )
  }
  if (pauseSnapshot.runningCount !== 0 || pauseSnapshot.targetStatus !== "paused") {
    throw new Error(
      `offscreen pause snapshot must contain zero running canvases with paused status; ` +
        `runningCount=${pauseSnapshot.runningCount}, targetStatus=${pauseSnapshot.targetStatus}`
    )
  }
  if (activeSnapshot.at > scrollSignalSnapshot.at || scrollSignalSnapshot.at > pauseSnapshot.at) {
    throw new Error("Android offscreen snapshot epochs are not monotonic")
  }
  if (
    activeSnapshot.frame > scrollSignalSnapshot.frame ||
    scrollSignalSnapshot.frame > pauseSnapshot.frame
  ) {
    throw new Error("Android offscreen runtime frame counter regressed")
  }

  const commandToOffscreenMilliseconds = offscreenAt - commandAt
  const offscreenToScrollSignalMilliseconds = scrollSignalAt - offscreenAt
  const reactionMilliseconds = pauseAt - scrollSignalAt
  const totalMilliseconds = pauseAt - commandAt
  const preSignalFrames = scrollSignalSnapshot.frame - activeSnapshot.frame
  const postSignalFrames = pauseSnapshot.frame - scrollSignalSnapshot.frame
  const offscreenFrames = pauseSnapshot.frame - activeSnapshot.frame

  if (reactionMilliseconds > maximumReactionMilliseconds) {
    throw new Error(
      `Android offscreen reaction: expected <= ${maximumReactionMilliseconds}, ` +
        `received ${reactionMilliseconds}`
    )
  }
  if (offscreenFrames > maximumBackgroundFrames) {
    throw new Error(
      `Android offscreen creative frames: expected <= ${maximumBackgroundFrames}, ` +
        `received ${offscreenFrames}`
    )
  }

  return {
    commandToOffscreenMilliseconds,
    offscreenToScrollSignalMilliseconds,
    reactionMilliseconds,
    totalMilliseconds,
    preSignalFrames,
    postSignalFrames,
    offscreenFrames,
    finalStatus: pauseSnapshot.targetStatus,
    activeSnapshot,
    scrollSignalSnapshot,
    pauseSnapshot
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
