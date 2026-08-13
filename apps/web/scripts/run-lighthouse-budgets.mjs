import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const lighthouseConfig = require("../lighthouserc.cjs")
const SUPPORTED_AGGREGATIONS = new Set(["median", "optimistic", "pessimistic"])

export function validateLighthouseConfig(config) {
  const collect = config?.ci?.collect
  const assertions = config?.ci?.assert?.assertions
  const outputTarget = config?.ci?.upload?.target
  const outputDir = config?.ci?.upload?.outputDir

  if (!collect || typeof collect.startServerCommand !== "string") {
    throw new Error("Lighthouse collect.startServerCommand must be configured")
  }
  if (!Array.isArray(collect.url) || collect.url.length === 0) {
    throw new Error("Lighthouse collect.url must contain at least one URL")
  }
  for (const value of collect.url) {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported Lighthouse URL protocol: ${url.protocol}`)
    }
  }
  if (!Number.isInteger(collect.numberOfRuns) || collect.numberOfRuns < 1) {
    throw new Error("Lighthouse collect.numberOfRuns must be a positive integer")
  }
  if (!assertions || Object.keys(assertions).length === 0) {
    throw new Error("Lighthouse assertions must not be empty")
  }
  for (const [auditId, rawAssertion] of Object.entries(assertions)) {
    const { severity, options } = normalizeAssertion(rawAssertion)
    if (!new Set(["off", "warn", "error"]).has(severity)) {
      throw new Error(`Unsupported severity for ${auditId}: ${severity}`)
    }
    const aggregation = options.aggregationMethod ?? "optimistic"
    if (!SUPPORTED_AGGREGATIONS.has(aggregation)) {
      throw new Error(`Unsupported aggregation for ${auditId}: ${aggregation}`)
    }
    const unknownOptions = Object.keys(options).filter(
      (key) => !new Set(["aggregationMethod", "maxNumericValue", "minScore"]).has(key)
    )
    if (unknownOptions.length > 0) {
      throw new Error(`Unsupported assertion options for ${auditId}: ${unknownOptions.join(", ")}`)
    }
    const hasMaximum = options.maxNumericValue !== undefined
    const hasMinimum = options.minScore !== undefined
    if (hasMaximum && hasMinimum) {
      throw new Error(`Assertion ${auditId} cannot combine maxNumericValue and minScore`)
    }
    if (hasMaximum && (!Number.isFinite(options.maxNumericValue) || options.maxNumericValue < 0)) {
      throw new Error(`Assertion ${auditId} maxNumericValue must be a finite non-negative number`)
    }
    if (
      hasMinimum &&
      (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 1)
    ) {
      throw new Error(`Assertion ${auditId} minScore must be a finite number between 0 and 1`)
    }
  }
  if (outputTarget !== "filesystem" || typeof outputDir !== "string" || outputDir.length === 0) {
    throw new Error("Lighthouse filesystem outputDir must be configured")
  }

  return {
    assertions,
    collect,
    outputDir
  }
}

export function evaluateLighthouseAssertions(lhrs, assertions) {
  if (!Array.isArray(lhrs) || lhrs.length === 0) {
    throw new Error("At least one Lighthouse result is required")
  }

  const results = []
  for (const [auditId, rawAssertion] of Object.entries(assertions)) {
    const { severity, options } = normalizeAssertion(rawAssertion)
    if (severity === "off") continue

    const auditResults = lhrs.map((lhr) => selectAuditResult(lhr, auditId))
    const aggregation = options.aggregationMethod ?? "optimistic"
    if (auditResults.some((audit) => audit === undefined)) {
      results.push({
        actual: Number.NaN,
        auditId,
        expected: "audit to run",
        passed: false,
        severity
      })
      continue
    }

    if (options.maxNumericValue !== undefined) {
      const values = auditResults.map((audit) => audit.numericValue)
      if (!values.every(Number.isFinite)) {
        results.push(nonFiniteResult(auditId, severity, "finite numericValue in every run"))
        continue
      }
      const actual = aggregate(values, aggregation, "max")
      results.push({
        actual,
        auditId,
        expected: `<= ${options.maxNumericValue}`,
        passed: Number.isFinite(actual) && actual <= options.maxNumericValue,
        severity
      })
      continue
    }

    const minimum = options.minScore ?? 0.9
    const values = auditResults.map((audit) => audit.score)
    if (!values.every(Number.isFinite)) {
      results.push(nonFiniteResult(auditId, severity, "finite score in every run"))
      continue
    }
    const actual = aggregate(values, aggregation, "min")
    results.push({
      actual,
      auditId,
      expected: `>= ${minimum}`,
      passed: Number.isFinite(actual) && actual >= minimum,
      severity
    })
  }
  return results
}

function nonFiniteResult(auditId, severity, expected) {
  return {
    actual: Number.NaN,
    auditId,
    expected,
    passed: false,
    severity
  }
}

function normalizeAssertion(rawAssertion) {
  if (typeof rawAssertion === "string") return { severity: rawAssertion, options: {} }
  if (
    Array.isArray(rawAssertion) &&
    typeof rawAssertion[0] === "string" &&
    (rawAssertion[1] === undefined || isPlainObject(rawAssertion[1]))
  ) {
    return { severity: rawAssertion[0], options: rawAssertion[1] ?? {} }
  }
  throw new Error("Invalid Lighthouse assertion")
}

function selectAuditResult(lhr, auditId) {
  if (auditId.startsWith("categories:")) {
    return lhr.categories?.[auditId.slice("categories:".length)]
  }
  return lhr.audits?.[auditId]
}

function aggregate(values, method, assertionDirection) {
  if (values.length === 0) return Number.NaN
  if (method === "median") {
    const sorted = values.toSorted((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }
  const useMinimum =
    (method === "optimistic" && assertionDirection === "max") ||
    (method === "pessimistic" && assertionDirection === "min")
  return useMinimum ? Math.min(...values) : Math.max(...values)
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseServerCommand(commandLine) {
  const parts = commandLine.trim().split(/\s+/u)
  if (parts[0].length === 0 || parts.some((part) => /["'`;|&<>]/u.test(part))) {
    throw new Error("Lighthouse startServerCommand must be a simple trusted command")
  }
  return { command: parts[0], args: parts.slice(1) }
}

async function startServer(collect) {
  const { command, args } = parseServerCommand(collect.startServerCommand)
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  })
  const readyPattern = new RegExp(collect.startServerReadyPattern ?? "Listening on", "u")
  const timeoutMilliseconds = collect.startServerReadyTimeout ?? 60_000

  try {
    await new Promise((resolveReady, rejectReady) => {
      let output = ""
      const timeout = setTimeout(() => {
        rejectReady(
          new Error(`Lighthouse fixture server did not become ready in ${timeoutMilliseconds} ms`)
        )
      }, timeoutMilliseconds)
      const onOutput = (chunk) => {
        const text = chunk.toString()
        process.stdout.write(text)
        output = (output + text).slice(-8_192)
        if (readyPattern.test(output)) {
          clearTimeout(timeout)
          resolveReady()
        }
      }
      child.stdout.on("data", onOutput)
      child.stderr.on("data", onOutput)
      child.once("exit", (code) => {
        clearTimeout(timeout)
        rejectReady(
          new Error(`Lighthouse fixture server exited before readiness (${code ?? "signal"})`)
        )
      })
      child.once("error", (error) => {
        clearTimeout(timeout)
        rejectReady(error)
      })
    })
  } catch (error) {
    await stopServer(child)
    throw error
  }

  return child
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolveExit) => {
    const forceStop = setTimeout(() => {
      child.kill("SIGKILL")
      resolveExit()
    }, 5_000)
    const onStopped = () => {
      clearTimeout(forceStop)
      resolveExit()
    }
    child.once("error", onStopped)
    child.once("exit", onStopped)
    child.kill("SIGTERM")
  })
}

async function collectLighthouseReport(url, settings) {
  const chromePath = process.env.CHROME_PATH
  if (!chromePath) throw new Error("CHROME_PATH must point to the CI Chromium executable")

  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import("lighthouse"),
    import("chrome-launcher")
  ])
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"]
  })
  try {
    const result = await lighthouse(url, {
      ...settings,
      logLevel: "error",
      output: "json",
      port: chrome.port
    })
    if (!result?.lhr) throw new Error(`Lighthouse did not return a report for ${url}`)
    return result.lhr
  } finally {
    await chrome.kill()
  }
}

function artifactBaseName(url, run) {
  const parsed = new URL(url)
  const slug = parsed.pathname.replace(/^\/+|\/+$/gu, "").replace(/[^a-z0-9-]+/giu, "-") || "home"
  return `${slug}-run-${run}`
}

async function run() {
  const { assertions, collect, outputDir } = validateLighthouseConfig(lighthouseConfig)
  if (process.argv.includes("--validate-config")) {
    process.stdout.write(
      `Lighthouse configuration valid: ${collect.url.length} URLs x ${collect.numberOfRuns} runs, ${Object.keys(assertions).length} protected assertions.\n`
    )
    return
  }

  const artifactDirectory = resolve(process.cwd(), outputDir)
  await mkdir(artifactDirectory, { recursive: true })
  const fixtureServer = await startServer(collect)
  let hasErrors = false
  try {
    for (const url of collect.url) {
      const reports = []
      for (let runNumber = 1; runNumber <= collect.numberOfRuns; runNumber += 1) {
        process.stdout.write(`Running Lighthouse ${runNumber}/${collect.numberOfRuns}: ${url}\n`)
        const report = await collectLighthouseReport(url, collect.settings ?? {})
        reports.push(report)
        const reportPath = resolve(
          artifactDirectory,
          `${artifactBaseName(url, runNumber)}.report.json`
        )
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
      }

      for (const result of evaluateLighthouseAssertions(reports, assertions)) {
        const actual = Number.isFinite(result.actual) ? result.actual : "no value"
        process.stdout.write(
          `${result.passed ? "PASS" : "FAIL"} ${url} ${result.auditId}: ${actual} ${result.expected}\n`
        )
        if (!result.passed && result.severity === "error") hasErrors = true
      }
    }
  } finally {
    await stopServer(fixtureServer)
  }

  if (hasErrors) throw new Error("Lighthouse performance or quality budgets failed")
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isEntrypoint) {
  run().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    )
    process.exitCode = 1
  })
}
