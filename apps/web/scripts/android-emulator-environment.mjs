#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"

import {
  canonicalizeAndroidAvdConfig,
  classifyAndroidEnvironmentProbeResult,
  evaluateCanonicalAndroidAvdConfig,
  evaluateAndroidEmulatorEnvironment
} from "./android-creative-timeline.mjs"

const SCHEMA_VERSION = "courtside.android-emulator-environment/v1"
const PROBE_TIMEOUT_MILLISECONDS = 5_000
const STDERR_RECEIPT_MAXIMUM_BYTES = 4_096
const ARTIFACT_ROOT = resolve("artifacts/android-chrome")
const EXACT_HEAD_PATH = resolve("artifacts/exact-head.json")
const REQUESTED_ENVIRONMENT = Object.freeze({
  avdName: "courtside-api35-pixel7",
  profile: "pixel_7",
  cpuCores: 4,
  ramInput: "4096M",
  ramMegabytes: 4096,
  heapMegabytes: 576
})

function requireReceiptPath(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Android emulator receipt path is required")
  }
  const receiptPath = resolve(value)
  const artifactRelativePath = relative(ARTIFACT_ROOT, receiptPath)
  if (
    artifactRelativePath === "" ||
    artifactRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    artifactRelativePath === ".." ||
    isAbsolute(artifactRelativePath) ||
    !artifactRelativePath.endsWith(".json")
  ) {
    throw new Error("Android emulator receipt must stay inside the fixed artifact directory")
  }
  return receiptPath
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  try {
    writeFileSync(temporaryPath, value, "utf8")
    renameSync(temporaryPath, path)
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
  }
}

function writeReceipt(path, receipt) {
  atomicWrite(path, `${JSON.stringify(receipt, null, 2)}\n`)
}

function readSourceHeadSha() {
  const receipt = JSON.parse(readFileSync(EXACT_HEAD_PATH, "utf8"))
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
  const home = resolve(avdHome)
  const avdDirectory = resolve(home, `${avdName}.avd`)
  const avdRelativePath = relative(home, avdDirectory)
  if (avdRelativePath.startsWith("..") || isAbsolute(avdRelativePath)) {
    throw new Error("Android AVD path escaped ANDROID_AVD_HOME")
  }
  return {
    config: join(avdDirectory, "config.ini"),
    resolvedHardware: join(avdDirectory, "hardware-qemu.ini")
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
  const canonicalConfig = canonicalizeAndroidAvdConfig(readFileSync(paths.config, "utf8"))
  atomicWrite(paths.config, canonicalConfig)
  const canonicalReadBack = readFileSync(paths.config, "utf8")
  if (canonicalReadBack !== canonicalConfig) {
    throw new Error("Canonical Android AVD config read-back did not match the atomic write")
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    result: "PASS",
    phase: "prepare",
    requested: REQUESTED_ENVIRONMENT,
    canonicalConfig: evaluateCanonicalAndroidAvdConfig(canonicalReadBack)
  }
}

function verifyEnvironment(commandReceipts) {
  const paths = avdPaths()
  const evidence = evaluateAndroidEmulatorEnvironment({
    requested: REQUESTED_ENVIRONMENT,
    canonicalConfig: readFileSync(paths.config, "utf8"),
    resolvedHardware: readFileSync(paths.resolvedHardware, "utf8"),
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
  })
  return { ...evidence, phase: "verify", commands: commandReceipts }
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
