import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

const HOST = "127.0.0.1"
const API_PORT = await availablePort()
let WEB_PORT = await availablePort()
while (WEB_PORT === API_PORT) WEB_PORT = await availablePort()

const apiOrigin = `http://${HOST}:${API_PORT}`
const webOrigin = `http://${HOST}:${WEB_PORT}`
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL("./start-reader-demo.mjs", import.meta.url))],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      COURTSIDE_DEMO_API_PORT: String(API_PORT),
      COURTSIDE_DEMO_WEB_PORT: String(WEB_PORT),
      // Prove the demo runner overrides inherited Nitro bind settings.
      NITRO_HOST: "0.0.0.0",
      NITRO_PORT: "65534"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
)

let output = ""
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-64 * 1024)
  })
}

const terminate = () => {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM")
}
process.once("SIGINT", terminate)
process.once("SIGTERM", terminate)

try {
  await waitUntilReady()
  await verifyReaderJourney()
  terminate()
  await waitForExit()
  await assertPortReusable(API_PORT)
  await assertPortReusable(WEB_PORT)
  writeLog(`reader demo smoke: pass (${webOrigin})`)
} catch (error) {
  terminate()
  await waitForExit().catch(() => {})
  writeError(output)
  throw error
}

async function waitUntilReady() {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`reader demo exited before readiness (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const response = await fetch(webOrigin)
      if (response.ok && (await response.text()).includes('data-testid="home-issue-link"')) return
    } catch {
      // Build and server startup are still in progress.
    }
    await delay(100)
  }
  throw new Error("reader demo smoke timed out after 45 seconds")
}

async function verifyReaderJourney() {
  const home = await fetch(webOrigin)
  const homeHtml = await home.text()
  assert.equal(home.status, 200)
  assert.match(homeHtml, /先閱讀，/u)
  assert.match(homeHtml, /本期命題/u)
  assert.match(homeHtml, /data-testid="home-issue-link"/u)
  assert.match(homeHtml, /aria-label="閱讀旅程"/u)
  assert.match(homeHtml, /aria-current="step"[^>]*>.*?01/su)
  assert.match(homeHtml, /data-motion-role="source"/u)
  assert.doesNotMatch(homeHtml, /style="[^"]*--motion-/u)
  assert.doesNotMatch(homeHtml, /<html[^>]*data-reader-motion="full"/u)

  const csp = home.headers.get("content-security-policy") ?? ""
  assert.match(csp, new RegExp(`img-src[^;]*${escapeRegex(apiOrigin)}`, "u"))
  assert.match(csp, new RegExp(`connect-src[^;]*${escapeRegex(apiOrigin)}`, "u"))

  const issue = await fetch(`${webOrigin}/issues/issue-2026-01`)
  assert.equal(issue.status, 200)
  const issueHtml = await issue.text()
  assert.match(issueHtml, /主場燈光亮起之前/u)
  assert.match(issueHtml, /data-testid="issue-toc-link"/u)
  assert.match(issueHtml, /data-motion-role="target"/u)
  assert.match(issueHtml, /aria-current="step"[^>]*>.*?02/su)
  assert.doesNotMatch(issueHtml, /data-testid="offline-panel"/u)
  assert.doesNotMatch(issueHtml, /data-testid="offline-download"/u)
  assert.doesNotMatch(issueHtml, /找不到這一期/u)
  assert.doesNotMatch(issueHtml, /請從公開期數目錄重新開始/u)

  const article = await fetch(`${webOrigin}/articles/opening-night`)
  assert.equal(article.status, 200)
  const articleHtml = await article.text()
  assert.match(articleHtml, /data-testid="article-document"/u)
  assert.match(articleHtml, /aria-current="step"[^>]*>.*?03/su)
  assert.match(articleHtml, /\/articles\/season-opening-notes/u)

  const relatedArticle = await fetch(`${webOrigin}/articles/season-opening-notes`)
  assert.equal(relatedArticle.status, 200)
  const relatedArticleHtml = await relatedArticle.text()
  assert.match(relatedArticleHtml, /賽季開幕觀察/u)
  assert.match(relatedArticleHtml, /data-testid="article-document"/u)

  const api = await fetch(`${apiOrigin}/api/v1/public/issues`, {
    headers: { origin: webOrigin }
  })
  assert.equal(api.status, 200)
  assert.equal(api.headers.get("access-control-allow-origin"), webOrigin)
  assert.match(await api.text(), /"slug":"issue-2026-01"/u)

  const unsupportedOfflineManifest = await fetch(
    `${apiOrigin}/api/v1/public/offline/issues/issue-2026-01/manifest`
  )
  assert.equal(unsupportedOfflineManifest.status, 404)

  const media = await fetch(`${apiOrigin}/media/demo/issue-01-cover.svg`)
  assert.equal(media.status, 200)
  assert.match(media.headers.get("content-type") ?? "", /^image\/svg\+xml/u)
  assert.match(await media.text(), /<svg\b/u)

  assert.equal((await fetch(`${apiOrigin}/api/v1/public/issues`, { method: "POST" })).status, 405)
  assert.equal((await fetch(`${apiOrigin}/api/v1/studio/issues`)).status, 404)
}

async function waitForExit() {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", handleExit)
      reject(new Error("reader demo did not stop within five seconds"))
    }, 5_000)
    const handleExit = () => {
      clearTimeout(timeout)
      resolve()
    }
    child.once("exit", handleExit)
  })
}

async function availablePort() {
  const server = createServer()
  await listen(server, 0)
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const port = address.port
  await close(server)
  return port
}

async function assertPortReusable(port) {
  const server = createServer()
  await listen(server, port)
  await close(server)
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, HOST, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function writeLog(message) {
  process.stdout.write(`${message}\n`)
}

function writeError(message) {
  process.stderr.write(`${message}\n`)
}
