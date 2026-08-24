#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"

import {
  canonicalizeAndroidAvdConfig,
  classifyAndroidEnvironmentProbeResult,
  evaluateCanonicalAndroidAvdConfig,
  evaluateAndroidEmulatorEnvironment,
  evaluateAndroidEmulatorHostEnvironment
} from "./android-creative-timeline.mjs"

const SCHEMA_VERSION = "courtside.android-emulator-environment/v1"
const PROBE_TIMEOUT_MILLISECONDS = 5_000
const STDERR_RECEIPT_MAXIMUM_BYTES = 4_096
const PHYSICAL_TEXT_MAXIMUM_BYTES = 1024 * 1024
const WORKSPACE_ROOT = realpathSync(".")
const ARTIFACTS_DIRECTORY = join(WORKSPACE_ROOT, "artifacts")
const ARTIFACT_ROOT = join(ARTIFACTS_DIRECTORY, "android-chrome")
const EXACT_HEAD_PATH = join(ARTIFACTS_DIRECTORY, "exact-head.json")
const REQUESTED_ENVIRONMENT = Object.freeze({
  avdName: "courtside-api35-pixel7",
  profile: "pixel_7",
  cpuCores: 4,
  ramInput: "4096M",
  ramMegabytes: 4096,
  heapMegabytes: 576
})

function samePhysicalFileMetadata(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

export function requireStablePhysicalFileRead(value) {
  const openedSize = Number(value.beforeReadMetadata.size)
  if (
    !Number.isSafeInteger(openedSize) ||
    openedSize <= 0 ||
    !Buffer.isBuffer(value.firstRead) ||
    !Buffer.isBuffer(value.secondRead) ||
    value.firstBytesRead !== openedSize ||
    value.secondBytesRead !== openedSize ||
    !value.firstRead.equals(value.secondRead) ||
    !samePhysicalFileMetadata(value.beforeReadMetadata, value.betweenReadMetadata) ||
    !samePhysicalFileMetadata(value.beforeReadMetadata, value.afterReadMetadata)
  ) {
    throw new Error(`${value.label} physical file changed while being read`)
  }
  return value.firstRead.subarray(0, openedSize)
}

function requirePhysicalDirectory(path, label, create = false) {
  if (!existsSync(path)) {
    if (!create) throw new Error(`${label} does not exist`)
    mkdirSync(path, { mode: 0o700 })
  }
  const metadata = lstatSync(path)
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || realpathSync(path) !== path) {
    throw new Error(`${label} must be a physical directory`)
  }
  return path
}

function readPhysicalFileSnapshot(path, label) {
  requirePhysicalDirectory(dirname(path), `${label} parent directory`)
  const metadata = lstatSync(path)
  if (metadata.isSymbolicLink() || !metadata.isFile() || realpathSync(path) !== path) {
    throw new Error(`${label} must be one physical file`)
  }
  if (metadata.size === 0 || metadata.size > PHYSICAL_TEXT_MAXIMUM_BYTES) {
    throw new Error(`${label} must be a bounded physical file`)
  }
  let descriptor = null
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const beforeReadMetadata = fstatSync(descriptor, { bigint: true })
    if (!beforeReadMetadata.isFile()) {
      throw new Error(`${label} must be one physical file`)
    }
    if (
      beforeReadMetadata.size === 0n ||
      beforeReadMetadata.size > BigInt(PHYSICAL_TEXT_MAXIMUM_BYTES)
    ) {
      throw new Error(`${label} must be a bounded physical file`)
    }
    const openedSize = Number(beforeReadMetadata.size)
    const firstRead = Buffer.alloc(openedSize + 1)
    const firstBytesRead = readSync(descriptor, firstRead, 0, firstRead.length, 0)
    const betweenReadMetadata = fstatSync(descriptor, { bigint: true })
    const secondRead = Buffer.alloc(openedSize + 1)
    const secondBytesRead = readSync(descriptor, secondRead, 0, secondRead.length, 0)
    const afterReadMetadata = fstatSync(descriptor, { bigint: true })
    const stableBytes = requireStablePhysicalFileRead({
      label,
      beforeReadMetadata,
      betweenReadMetadata,
      afterReadMetadata,
      firstRead,
      secondRead,
      firstBytesRead,
      secondBytesRead
    })
    const value = stableBytes.toString("utf8")
    if (Buffer.byteLength(value, "utf8") !== stableBytes.length || value.includes("\0")) {
      throw new Error(`${label} must be bounded non-empty text`)
    }
    return { value, fingerprint: afterReadMetadata }
  } finally {
    if (descriptor !== null) closeSync(descriptor)
  }
}

function readPhysicalFile(path, label) {
  return readPhysicalFileSnapshot(path, label).value
}

function requirePhysicalArtifactRoot() {
  requirePhysicalDirectory(ARTIFACTS_DIRECTORY, "Android artifacts directory", true)
  return requirePhysicalDirectory(
    ARTIFACT_ROOT,
    "Android emulator physical fixed artifact directory",
    true
  )
}

function requireReceiptPath(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Android emulator receipt path is required")
  }
  const physicalArtifactRoot = requirePhysicalArtifactRoot()
  const receiptPath = resolve(value)
  const artifactRelativePath = relative(physicalArtifactRoot, receiptPath)
  if (
    artifactRelativePath === "" ||
    dirname(receiptPath) !== physicalArtifactRoot ||
    artifactRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    artifactRelativePath === ".." ||
    isAbsolute(artifactRelativePath) ||
    !artifactRelativePath.endsWith(".json")
  ) {
    throw new Error("Android emulator receipt must stay inside the fixed artifact directory")
  }
  if (existsSync(receiptPath) && lstatSync(receiptPath).isSymbolicLink()) {
    throw new Error("Android emulator receipt must not replace a symbolic link")
  }
  return receiptPath
}

function atomicWrite(path, value) {
  const directory = dirname(path)
  requirePhysicalDirectory(directory, "Atomic write parent directory")
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  let descriptor = null
  try {
    descriptor = openSync(
      temporaryPath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600
    )
    writeFileSync(descriptor, value, "utf8")
    fsyncSync(descriptor)
    const completedDescriptor = descriptor
    descriptor = null
    closeSync(completedDescriptor)
    requirePhysicalDirectory(directory, "Atomic write parent directory")
    renameSync(temporaryPath, path)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
  }
}

function writeReceipt(path, receipt) {
  const physicalArtifactRoot = requirePhysicalArtifactRoot()
  if (dirname(path) !== physicalArtifactRoot) {
    throw new Error("Android emulator receipt must stay inside the fixed artifact directory")
  }
  atomicWrite(path, `${JSON.stringify(receipt, null, 2)}\n`)
}

function readSourceHeadSha() {
  const receipt = JSON.parse(readPhysicalFile(EXACT_HEAD_PATH, "Exact-head receipt"))
  const sourceHeadSha = receipt.source_head_sha
  if (typeof sourceHeadSha !== "string" || !/^[0-9a-f]{40}$/u.test(sourceHeadSha)) {
    throw new Error("Exact-head receipt does not contain one source head SHA")
  }
  return sourceHeadSha
}

function avdPaths() {
  const avdHome = process.env.ANDROID_AVD_HOME
  const avdName = process.env.COURTSIDE_ANDROID_AVD_NAME
  if (typeof avdHome !== "string" || !avdHome) {
    throw new Error("ANDROID_AVD_HOME is required")
  }
  if (typeof avdName !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(avdName)) {
    throw new Error("COURTSIDE_ANDROID_AVD_NAME is invalid")
  }
  if (avdName !== REQUESTED_ENVIRONMENT.avdName) {
    throw new Error("requested AVD identity drift")
  }
  const home = resolve(avdHome)
  const avdDirectory = resolve(home, `${avdName}.avd`)
  const avdRelativePath = relative(home, avdDirectory)
  if (avdRelativePath.startsWith("..") || isAbsolute(avdRelativePath)) {
    throw new Error("Android AVD path escaped ANDROID_AVD_HOME")
  }
  requirePhysicalDirectory(home, "Android AVD home")
  requirePhysicalDirectory(avdDirectory, "Android AVD config directory")
  return {
    avdName,
    avdDirectory,
    registry: join(home, `${avdName}.ini`),
    config: join(avdDirectory, "config.ini"),
    resolvedHardware: join(avdDirectory, "hardware-qemu.ini")
  }
}

function readAvdRegistry(paths) {
  const registrySnapshot = readPhysicalFileSnapshot(paths.registry, "Android AVD registry")
  const registry = registrySnapshot.value
  const pathLines = registry.split("\n").filter((line) => /^\s*path(?:\s*=|\s*$)/u.test(line))
  if (pathLines.length === 0) {
    throw new Error("missing AVD registry path")
  }
  if (pathLines.length > 1) {
    throw new Error("duplicate AVD registry path")
  }
  const configuredPath = pathLines[0].match(/^\s*path\s*=\s*(.+?)\s*$/u)?.[1]
  if (!configuredPath || !isAbsolute(configuredPath)) {
    throw new Error("malformed AVD registry path")
  }
  const resolvedPath = resolve(configuredPath)
  if (resolvedPath !== paths.avdDirectory) {
    throw new Error("AVD registry path drift")
  }
  const relativePathLines = registry
    .split("\n")
    .filter((line) => /^\s*path\.rel(?:\s*=|\s*$)/u.test(line))
  if (relativePathLines.length > 1) {
    throw new Error("duplicate AVD registry relative path")
  }
  if (relativePathLines.length === 1) {
    const configuredRelativePath = relativePathLines[0].match(
      /^\s*path\.rel\s*=\s*([^\s#]+)\s*$/u
    )?.[1]
    if (configuredRelativePath !== `avd/${paths.avdName}.avd`) {
      throw new Error("AVD registry relative path drift")
    }
  }
  requirePhysicalDirectory(resolvedPath, "Android AVD registry target")
  return {
    source: registry,
    fingerprint: registrySnapshot.fingerprint,
    receipt: {
      avdName: paths.avdName,
      registryFile: basename(paths.registry),
      avdDirectory: basename(paths.avdDirectory)
    }
  }
}

function readVerifiedHostEnvironment(paths) {
  const avdRegistry = readAvdRegistry(paths)
  const canonicalConfig = readPhysicalFileSnapshot(paths.config, "Canonical Android AVD config")
  const resolvedHardware = readPhysicalFileSnapshot(
    paths.resolvedHardware,
    "Resolved Android hardware"
  )
  evaluateAndroidEmulatorHostEnvironment({
    requested: REQUESTED_ENVIRONMENT,
    canonicalConfig: canonicalConfig.value,
    resolvedHardware: resolvedHardware.value
  })
  return {
    registrySource: avdRegistry.source,
    registryFingerprint: avdRegistry.fingerprint,
    avdRegistry: avdRegistry.receipt,
    canonicalConfig: canonicalConfig.value,
    canonicalFingerprint: canonicalConfig.fingerprint,
    resolvedHardware: resolvedHardware.value,
    resolvedFingerprint: resolvedHardware.fingerprint
  }
}

function requireUnchangedHostEnvironment(before, after) {
  if (
    before.registrySource !== after.registrySource ||
    !samePhysicalFileMetadata(before.registryFingerprint, after.registryFingerprint) ||
    before.canonicalConfig !== after.canonicalConfig ||
    !samePhysicalFileMetadata(before.canonicalFingerprint, after.canonicalFingerprint) ||
    before.resolvedHardware !== after.resolvedHardware ||
    !samePhysicalFileMetadata(before.resolvedFingerprint, after.resolvedFingerprint)
  ) {
    throw new Error("Android emulator host evidence changed during live probes")
  }
}

function boundedStderrReceipt(value) {
  const stderr = typeof value === "string" ? value : ""
  const bytes = Buffer.from(stderr)
  let boundedStderr = bytes.subarray(0, STDERR_RECEIPT_MAXIMUM_BYTES).toString("utf8")
  while (Buffer.byteLength(boundedStderr) > STDERR_RECEIPT_MAXIMUM_BYTES) {
    boundedStderr = boundedStderr.slice(0, -1)
  }
  return {
    stderr: boundedStderr,
    stderrBytes: bytes.length,
    stderrTruncated: bytes.length > STDERR_RECEIPT_MAXIMUM_BYTES
  }
}

function probeAdb(name, arguments_, commandReceipts) {
  const startedAt = performance.now()
  const result = spawnSync("adb", arguments_, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: PROBE_TIMEOUT_MILLISECONDS,
    killSignal: "SIGKILL"
  })
  const errorCode = result.error?.code ?? null
  const commandReceipt = {
    name,
    timeoutMilliseconds: PROBE_TIMEOUT_MILLISECONDS,
    status: result.status ?? null,
    signal: result.signal ?? null,
    errorCode,
    timedOut: errorCode === "ETIMEDOUT",
    durationMilliseconds: Math.round((performance.now() - startedAt) * 1000) / 1000,
    stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
    ...boundedStderrReceipt(result.stderr)
  }
  commandReceipts.push(commandReceipt)
  return classifyAndroidEnvironmentProbeResult({
    status: result.status,
    errorCode,
    stdout: result.stdout,
    stderr: result.stderr
  })
}

function failureReceipt(mode, sourceHeadSha, commandReceipts, error) {
  return {
    schemaVersion: SCHEMA_VERSION,
    result: "FAIL",
    phase: mode,
    sourceHeadSha,
    requested: REQUESTED_ENVIRONMENT,
    commands: commandReceipts,
    capturedAt: new Date().toISOString(),
    reason:
      error instanceof Error ? error.message.slice(0, 500) : "Unknown emulator environment error"
  }
}

function prepareEnvironment() {
  const paths = avdPaths()
  const avdRegistry = readAvdRegistry(paths).receipt
  const canonicalConfig = canonicalizeAndroidAvdConfig(
    readPhysicalFile(paths.config, "Canonical Android AVD config")
  )
  atomicWrite(paths.config, canonicalConfig)
  const canonicalReadBack = readPhysicalFile(paths.config, "Canonical Android AVD config")
  if (canonicalReadBack !== canonicalConfig) {
    throw new Error("Canonical Android AVD config read-back did not match the atomic write")
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    result: "PASS",
    phase: "prepare",
    requested: REQUESTED_ENVIRONMENT,
    canonicalConfig: evaluateCanonicalAndroidAvdConfig(canonicalReadBack),
    avdRegistry
  }
}

function verifyEnvironment(commandReceipts) {
  const paths = avdPaths()
  const before = readVerifiedHostEnvironment(paths)
  const liveEvidence = {
    liveAvdName: probeAdb("live-avd-name", ["emu", "avd", "name"], commandReceipts),
    guestCpuOnline: probeAdb(
      "guest-cpu-online",
      ["exec-out", "cat", "/sys/devices/system/cpu/online"],
      commandReceipts
    ),
    guestMeminfo: probeAdb("guest-meminfo", ["exec-out", "cat", "/proc/meminfo"], commandReceipts),
    guestHeapSize: probeAdb(
      "guest-heap-size",
      ["exec-out", "getprop", "dalvik.vm.heapsize"],
      commandReceipts
    )
  }
  const after = readVerifiedHostEnvironment(paths)
  requireUnchangedHostEnvironment(before, after)
  const evidence = evaluateAndroidEmulatorEnvironment({
    requested: REQUESTED_ENVIRONMENT,
    canonicalConfig: after.canonicalConfig,
    resolvedHardware: after.resolvedHardware,
    ...liveEvidence
  })
  return { ...evidence, avdRegistry: after.avdRegistry, phase: "verify", commands: commandReceipts }
}

function main() {
  const mode = process.argv[2]
  if (!new Set(["prepare", "verify"]).has(mode)) {
    throw new Error("Usage: android-emulator-environment.mjs <prepare|verify> <receipt-path>")
  }
  const receiptPath = requireReceiptPath(process.argv[3])
  const commandReceipts = []
  let sourceHeadSha = null
  try {
    sourceHeadSha = readSourceHeadSha()
    const receipt = mode === "prepare" ? prepareEnvironment() : verifyEnvironment(commandReceipts)
    writeReceipt(receiptPath, {
      ...receipt,
      sourceHeadSha,
      capturedAt: new Date().toISOString()
    })
  } catch (error) {
    writeReceipt(receiptPath, failureReceipt(mode, sourceHeadSha, commandReceipts, error))
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
