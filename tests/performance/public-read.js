const { spawn } = require("node:child_process")
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")

const REPOSITORY_ROOT = path.resolve(__dirname, "../..")
const WEB_ROOT = path.join(REPOSITORY_ROOT, "apps/web")
const ARTIFACT_DIRECTORY = path.join(REPOSITORY_ROOT, "artifacts/performance")
const FIXTURE_SERVER = path.join(__dirname, "start-server.mjs")
const WEB_ORIGIN = "http://127.0.0.1:4173"
const API_ORIGIN = "http://127.0.0.1:4020"
const HOME_PATH = "/"
const PERFORMANCE_ISSUE_PATH = "/issues/performance-issue"
const ORDINARY_ARTICLE_PATH = "/articles/performance-article-01?issue=performance-issue"
const CREATIVE_ARTICLE_PATH = "/articles/performance-article-20?issue=performance-issue"
const BUDGETS = Object.freeze({
  issueArticleCount: 20,
  homeDomContentLoadedMilliseconds: 2_500,
  coldDomContentLoadedMilliseconds: 3_500,
  warmDomContentLoadedMilliseconds: 2_500,
  ordinaryDomContentLoadedMilliseconds: 3_000,
  representativeImageRequests: 3,
  representativeImageTransferBytes: 12_000,
  creativeFirstRunningMilliseconds: 2_500,
  offscreenPauseMilliseconds: 1_500,
  backgroundPauseMilliseconds: 2_000,
  maximumLongTaskMilliseconds: 350,
  maximumTotalLongTaskMilliseconds: 1_200
})

if (!existsSync(FIXTURE_SERVER)) {
  throw new Error(
    "T079 RED: deterministic 20-article performance fixture server is missing at tests/performance/start-server.mjs"
  )
}

const webRequire = createRequire(path.join(WEB_ROOT, "package.json"))
const { chromium } = webRequire("@playwright/test")

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  )
  process.exitCode = 1
})

async function main() {
  mkdirSync(ARTIFACT_DIRECTORY, { recursive: true })
  const server = startFixtureServer()
  let browser

  try {
    await waitForServer(server)

    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || chromium.executablePath(),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    })

    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: "block"
    })

    await context.addInitScript(() => {
      window.__courtsideT079LongTasks = []
      if (typeof PerformanceObserver === "undefined") return

      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__courtsideT079LongTasks.push({
              duration: entry.duration,
              startTime: entry.startTime
            })
          }
        })
        observer.observe({ type: "longtask", buffered: true })
      } catch {
        // The Long Task API is optional. Unsupported environments preserve an empty list.
      }
    })

    const page = await context.newPage()
    const p5Chunk = findP5ChunkName()
    const requestedPaths = []

    page.on("request", (request) => {
      requestedPaths.push(new URL(request.url()).pathname)
    })

    const cache = await verifyCacheContract()

    requestedPaths.length = 0
    const home = await navigateAndMeasure(page, HOME_PATH)
    assertAtMost(
      home.domContentLoadedMilliseconds,
      BUDGETS.homeDomContentLoadedMilliseconds,
      "home DOMContentLoaded"
    )
    assertNoP5Transfer(requestedPaths, p5Chunk, "home")

    requestedPaths.length = 0
    const coldIssue = await navigateAndMeasure(page, PERFORMANCE_ISSUE_PATH)
    const articleCount = await page.getByTestId("article-link").count()
    assertEqual(articleCount, BUDGETS.issueArticleCount, "large issue article count")
    assertAtMost(
      coldIssue.domContentLoadedMilliseconds,
      BUDGETS.coldDomContentLoadedMilliseconds,
      "cold 20-article issue DOMContentLoaded"
    )
    assertNoP5Transfer(requestedPaths, p5Chunk, "20-article issue")

    requestedPaths.length = 0
    const warmIssue = await navigateAndMeasure(page, PERFORMANCE_ISSUE_PATH)
    assertAtMost(
      warmIssue.domContentLoadedMilliseconds,
      BUDGETS.warmDomContentLoadedMilliseconds,
      "warm 20-article issue DOMContentLoaded"
    )
    assertNoP5Transfer(requestedPaths, p5Chunk, "warm 20-article issue")

    requestedPaths.length = 0
    const ordinaryArticle = await navigateAndMeasure(page, ORDINARY_ARTICLE_PATH)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(500)
    assertAtMost(
      ordinaryArticle.domContentLoadedMilliseconds,
      BUDGETS.ordinaryDomContentLoadedMilliseconds,
      "ordinary article DOMContentLoaded"
    )
    assertNoP5Transfer(requestedPaths, p5Chunk, "ordinary article")

    const imagery = await representativeImagery(page)
    assertAtLeast(
      imagery.requestCount,
      BUDGETS.representativeImageRequests,
      "representative image request count"
    )
    assertAtLeast(
      imagery.transferBytes,
      BUDGETS.representativeImageTransferBytes,
      "representative image transfer bytes"
    )

    requestedPaths.length = 0
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.goto(`${WEB_ORIGIN}${CREATIVE_ARTICLE_PATH}`, { waitUntil: "networkidle" })

    const creativeHosts = page.getByTestId("creative-runtime")
    assertEqual(await creativeHosts.count(), 1, "creative host count")
    const creativeHost = creativeHosts.first()

    const creativeStart = performance.now()
    await creativeHost.scrollIntoViewIfNeeded()
    await poll(
      async () => (await creativeHost.getAttribute("data-runtime-status")) === "running",
      5_000
    )
    const creativeFirstRunningMilliseconds = performance.now() - creativeStart
    assertAtMost(
      creativeFirstRunningMilliseconds,
      BUDGETS.creativeFirstRunningMilliseconds,
      "creative first running"
    )
    assertEqual(await runningCanvasCount(page), 1, "bounded running canvas count")
    assertP5Transfer(requestedPaths, p5Chunk, "creative article")

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto"
    })
    const offscreenStart = performance.now()
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }))
    await poll(() => isOutsideViewport(creativeHost), 1_500)
    await poll(
      async () => (await creativeHost.getAttribute("data-runtime-status")) !== "running",
      5_000
    )
    const offscreenPauseMilliseconds = performance.now() - offscreenStart
    assertAtMost(
      offscreenPauseMilliseconds,
      BUDGETS.offscreenPauseMilliseconds,
      "offscreen creative pause"
    )

    await creativeHost.scrollIntoViewIfNeeded()
    await poll(
      async () => (await creativeHost.getAttribute("data-runtime-status")) === "running",
      5_000
    )

    const backgroundStart = performance.now()
    await page.evaluate(() => window.dispatchEvent(new Event("blur")))
    await poll(
      async () => (await creativeHost.getAttribute("data-runtime-status")) !== "running",
      5_000
    )
    const backgroundPauseMilliseconds = performance.now() - backgroundStart
    assertAtMost(
      backgroundPauseMilliseconds,
      BUDGETS.backgroundPauseMilliseconds,
      "background lifecycle pause"
    )

    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await poll(
      async () => (await creativeHost.getAttribute("data-runtime-status")) === "running",
      5_000
    )

    const longTasks = await page.evaluate(() => window.__courtsideT079LongTasks ?? [])
    const longestLongTaskMilliseconds = longTasks.reduce(
      (maximum, entry) => Math.max(maximum, Number(entry.duration) || 0),
      0
    )
    const totalLongTaskMilliseconds = longTasks.reduce(
      (total, entry) => total + (Number(entry.duration) || 0),
      0
    )
    assertAtMost(
      longestLongTaskMilliseconds,
      BUDGETS.maximumLongTaskMilliseconds,
      "longest creative long task"
    )
    assertAtMost(
      totalLongTaskMilliseconds,
      BUDGETS.maximumTotalLongTaskMilliseconds,
      "total creative long tasks"
    )

    const result = {
      result: "PASS",
      environment: {
        browser: await browser.version(),
        viewport: { width: 412, height: 915, deviceScaleFactor: 2.625 },
        fixture: "deterministic 20-article public issue"
      },
      budgets: BUDGETS,
      cache,
      ordinaryRoutes: {
        home: { navigation: home, p5Transferred: false },
        issue: {
          articleCount,
          cold: coldIssue,
          warm: warmIssue,
          p5Transferred: false
        },
        article: {
          navigation: ordinaryArticle,
          imagery,
          p5Transferred: false
        }
      },
      creativeArticle: {
        p5Chunk,
        p5Transferred: true,
        creativeFirstRunningMilliseconds,
        offscreenPauseMilliseconds,
        offscreenScrollBehavior: "auto",
        backgroundPauseMilliseconds,
        backgroundSignal: "window.blur lifecycle event",
        actualOperatingSystemBackgroundEvidence:
          "artifacts/android-chrome/performance-smoke.json",
        runningCanvasCount: 1,
        longTasks: {
          count: longTasks.length,
          longestMilliseconds: longestLongTaskMilliseconds,
          totalMilliseconds: totalLongTaskMilliseconds
        }
      }
    }

    const artifact = path.join(ARTIFACT_DIRECTORY, "public-read.json")
    writeFileSync(artifact, `${JSON.stringify(result, null, 2)}\n`, "utf8")
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await browser?.close()
    await stopProcess(server)
  }
}

function startFixtureServer() {
  return spawn(process.execPath, [FIXTURE_SERVER], {
    cwd: WEB_ROOT,
    env: { ...process.env, NODE_ENV: "test", NUXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  })
}

async function waitForServer(child) {
  const readiness = /Performance fixture listening/u

  await new Promise((resolve, reject) => {
    let output = ""
    const timeout = setTimeout(() => {
      reject(new Error(`T079 fixture server did not become ready. Last output:\n${output}`))
    }, 120_000)

    const onOutput = (chunk) => {
      const text = chunk.toString()
      process.stdout.write(text)
      output = `${output}${text}`.slice(-16_384)
      if (readiness.test(output)) {
        clearTimeout(timeout)
        resolve()
      }
    }

    child.stdout.on("data", onOutput)
    child.stderr.on("data", onOutput)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`T079 fixture server exited before readiness (${code ?? "signal"})`))
    })
  })
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      resolve()
    }, 5_000)

    child.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill("SIGTERM")
  })
}

async function verifyCacheContract() {
  await fetch(`${API_ORIGIN}/test/performance/reset-cache`, { method: "POST" })
  const target = `${API_ORIGIN}/api/v1/public/issues/performance-issue`

  const first = await timedFetch(target)
  assertEqual(first.response.status, 200, "cache miss status")
  assertEqual(first.response.headers.get("x-cache"), "MISS", "cache miss marker")
  const etag = first.response.headers.get("etag")
  if (!etag) throw new Error("cache miss response must include an ETag")
  await first.response.arrayBuffer()

  const second = await timedFetch(target)
  assertEqual(second.response.status, 200, "cache hit status")
  assertEqual(second.response.headers.get("x-cache"), "HIT", "cache hit marker")
  await second.response.arrayBuffer()

  const revalidated = await timedFetch(target, { headers: { "if-none-match": etag } })
  assertEqual(revalidated.response.status, 304, "cache revalidation status")
  assertEqual(
    revalidated.response.headers.get("x-cache"),
    "REVALIDATED",
    "cache revalidation marker"
  )

  return {
    etag,
    missMilliseconds: first.milliseconds,
    hitMilliseconds: second.milliseconds,
    revalidatedMilliseconds: revalidated.milliseconds
  }
}

async function timedFetch(url, init) {
  const start = performance.now()
  const response = await fetch(url, init)
  return { response, milliseconds: performance.now() - start }
}

async function navigateAndMeasure(page, pathname) {
  await page.goto(`${WEB_ORIGIN}${pathname}`, { waitUntil: "networkidle" })

  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0]
    if (!navigation) throw new Error("NavigationTiming entry is missing")

    return {
      domContentLoadedMilliseconds: navigation.domContentLoadedEventEnd,
      loadMilliseconds: navigation.loadEventEnd,
      transferBytes: performance
        .getEntriesByType("resource")
        .reduce((total, entry) => total + (entry.transferSize || 0), 0),
      resourceCount: performance.getEntriesByType("resource").length
    }
  })
}

async function representativeImagery(page) {
  return page.evaluate(() => {
    const entries = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname.startsWith("/media/performance/"))

    return {
      requestCount: entries.length,
      transferBytes: entries.reduce((total, entry) => total + (entry.transferSize || 0), 0),
      decodedBodyBytes: entries.reduce((total, entry) => total + (entry.decodedBodySize || 0), 0),
      resources: entries.map((entry) => ({
        path: new URL(entry.name).pathname,
        transferBytes: entry.transferSize,
        decodedBodyBytes: entry.decodedBodySize,
        durationMilliseconds: entry.duration
      }))
    }
  })
}

function findP5ChunkName() {
  const assetDirectory = path.join(WEB_ROOT, ".output/public/_nuxt")
  if (!existsSync(assetDirectory)) {
    throw new Error("Nuxt production output is required before the T079 transfer gate")
  }

  const candidates = readdirSync(assetDirectory).filter((fileName) => {
    if (!fileName.endsWith(".js")) return false
    const source = readFileSync(path.join(assetDirectory, fileName), "utf8")
    return (
      source.includes("courtside-p5-core-color-shape") && source.includes("createCanvas")
    )
  })

  assertEqual(candidates.length, 1, "isolated p5 implementation chunk count")
  return candidates[0]
}

function assertNoP5Transfer(requestedPaths, p5Chunk, surface) {
  if (requestedPaths.some((pathname) => pathname.endsWith(`/${p5Chunk}`))) {
    throw new Error(`${surface} transferred isolated p5 chunk ${p5Chunk}`)
  }
}

function assertP5Transfer(requestedPaths, p5Chunk, surface) {
  if (!requestedPaths.some((pathname) => pathname.endsWith(`/${p5Chunk}`))) {
    throw new Error(`${surface} did not transfer isolated p5 chunk ${p5Chunk}`)
  }
}

async function isOutsideViewport(locator) {
  return locator.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    return rectangle.bottom <= 0 || rectangle.top >= window.innerHeight
  })
}

async function runningCanvasCount(page) {
  return page
    .getByTestId("creative-runtime")
    .evaluateAll(
      (runtimes) =>
        runtimes.filter((runtime) => runtime.getAttribute("data-runtime-status") === "running")
          .length
    )
}

async function poll(predicate, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`condition did not pass within ${timeoutMilliseconds} ms`)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

function assertAtMost(actual, maximum, label) {
  if (!Number.isFinite(actual) || actual > maximum) {
    throw new Error(`${label}: expected <= ${maximum}, received ${actual}`)
  }
}

function assertAtLeast(actual, minimum, label) {
  if (!Number.isFinite(actual) || actual < minimum) {
    throw new Error(`${label}: expected >= ${minimum}, received ${actual}`)
  }
}
