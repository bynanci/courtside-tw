import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// Public reader demo only. This process intentionally exposes no Studio, OIDC,
// publisher, mutation, or production-data surface.
const HOST = "127.0.0.1"
const API_PORT = boundedPort(process.env.COURTSIDE_DEMO_API_PORT, 4010)
const WEB_PORT = boundedPort(process.env.COURTSIDE_DEMO_WEB_PORT, 4173)
if (API_PORT === WEB_PORT) {
  throw new Error("demo API and web ports must be different")
}
const webOrigin = `http://${HOST}:${WEB_PORT}`

const manifest = JSON.parse(
  readFileSync(
    new URL("../../api/src/test/resources/fixtures/first-issue/manifest.json", import.meta.url),
    "utf8"
  )
)
const richOpeningDocument = JSON.parse(
  readFileSync(new URL("../tests/fixtures/content-document-v1.json", import.meta.url), "utf8")
)
const notesDocument = JSON.parse(
  readFileSync(
    new URL(
      "../../api/src/test/resources/fixtures/first-issue/content/courtside-notes.json",
      import.meta.url
    ),
    "utf8"
  )
)
const seasonOpeningNotesDocument = {
  schemaVersion: 1,
  documentId: "0190f7b0-7c4b-7e3a-8f12-123456789ab4",
  blocks: [
    {
      id: "00000000-0000-4000-8000-000000000102",
      type: "heading",
      version: 1,
      payload: {
        level: 2,
        text: "開幕不是起點，而是第一個可被驗證的節點"
      }
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      type: "paragraph",
      version: 1,
      payload: {
        content: [
          {
            kind: "text",
            text: "從第一場球的動線、聲音與觀眾回應開始，記錄一個賽季如何逐步形成共同記憶。"
          }
        ]
      }
    }
  ]
}

const issue = {
  ...manifest.issue,
  cover: {
    ...manifest.issue.cover,
    url: "/media/demo/issue-01-cover.svg",
    height: 1500
  }
}
const issueDetail = {
  ...issue,
  sections: manifest.sections.map((section) => ({
    ...section,
    articles: section.articles.map(({ articleId, slug, title, position }) => ({
      articleId,
      slug,
      title,
      position
    }))
  }))
}

const media = [
  {
    assetId: "00000000-0000-4000-8000-000000000011",
    variant: "wide",
    url: "/media/demo/arena-wide.svg",
    mimeType: "image/svg+xml",
    width: 1600,
    height: 900,
    altText: "夜間球館與半場線構成的抽象全景",
    credit: "Courtside TW demo artwork",
    rightsOwner: "Courtside TW",
    licenseName: "Repository demo fixture"
  },
  {
    assetId: "00000000-0000-4000-8000-000000000012",
    variant: "inline",
    url: "/media/demo/court-detail.svg",
    mimeType: "image/svg+xml",
    width: 1200,
    height: 800,
    altText: "朱紅球路與場地線條的抽象構圖",
    credit: "Courtside TW demo artwork",
    rightsOwner: "Courtside TW",
    licenseName: "Repository demo fixture"
  },
  {
    assetId: "00000000-0000-4000-8000-000000000013",
    variant: "inline",
    url: "/media/demo/stands-detail.svg",
    mimeType: "image/svg+xml",
    width: 1200,
    height: 800,
    altText: "看台節奏與記分燈的抽象構圖",
    credit: "Courtside TW demo artwork",
    rightsOwner: "Courtside TW",
    licenseName: "Repository demo fixture"
  },
  {
    assetId: "00000000-0000-4000-8000-000000000016",
    variant: "wide",
    url: "/media/demo/court-pulse.svg",
    mimeType: "image/svg+xml",
    width: 1200,
    height: 675,
    altText: "固定 seed 的球場落點抽象視覺",
    credit: "Courtside TW demo artwork",
    rightsOwner: "Courtside TW",
    licenseName: "Repository demo fixture"
  }
]

const articles = new Map([
  [
    "opening-night",
    {
      articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
      revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab1",
      revisionNumber: 1,
      slug: "opening-night",
      title: "主場燈光亮起之前",
      dek: "一篇從球場入口開始，記錄主場如何成為共同記憶的長文。",
      content: richOpeningDocument,
      plainText: "主場燈光亮起以前，人們已經沿著熟悉的路線進場。",
      readingTimeMinutes: 6,
      publishedAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
      canonicalPath: "/articles/opening-night",
      media,
      contributors: [
        {
          contributorId: "00000000-0000-4000-8000-000000000021",
          slug: "courtside-tw-author",
          displayName: "Courtside TW 主筆",
          role: "AUTHOR"
        },
        {
          contributorId: "00000000-0000-4000-8000-000000000022",
          slug: "courtside-tw-editorial",
          displayName: "Courtside TW 編輯部",
          role: "EDITOR"
        }
      ],
      issueNavigation: {
        issueSlug: issue.slug,
        previous: null,
        next: {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abe",
          slug: "courtside-notes",
          title: "看台上的第二種節奏",
          position: 1
        }
      }
    }
  ],
  [
    "courtside-notes",
    {
      articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abe",
      revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab2",
      revisionNumber: 1,
      slug: "courtside-notes",
      title: "看台上的第二種節奏",
      dek: "從觀眾席回望比賽，讀懂主場之外的節奏。",
      content: notesDocument,
      plainText: "看台的聲音，讓比賽在終場之後繼續留下節奏。",
      readingTimeMinutes: 1,
      publishedAt: "2026-08-01T00:05:00Z",
      updatedAt: "2026-08-01T00:05:00Z",
      canonicalPath: "/articles/courtside-notes",
      media: [],
      contributors: [
        {
          contributorId: "00000000-0000-4000-8000-000000000022",
          slug: "courtside-tw-editorial",
          displayName: "Courtside TW 編輯部",
          role: "EDITOR"
        }
      ],
      issueNavigation: {
        issueSlug: issue.slug,
        previous: {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
          slug: "opening-night",
          title: "主場燈光亮起之前",
          position: 1
        },
        next: null
      }
    }
  ],
  [
    "season-opening-notes",
    {
      articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abf",
      revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab5",
      revisionNumber: 1,
      slug: "season-opening-notes",
      title: "賽季開幕觀察",
      dek: "從開幕夜的現場線索，整理一個賽季值得持續追蹤的問題。",
      content: seasonOpeningNotesDocument,
      plainText: "開幕不是起點，而是第一個可被驗證的節點。",
      readingTimeMinutes: 2,
      publishedAt: "2026-08-01T00:10:00Z",
      updatedAt: "2026-08-01T00:10:00Z",
      canonicalPath: "/articles/season-opening-notes",
      media: [],
      contributors: [
        {
          contributorId: "00000000-0000-4000-8000-000000000022",
          slug: "courtside-tw-editorial",
          displayName: "Courtside TW 編輯部",
          role: "EDITOR"
        }
      ],
      issueNavigation: {
        issueSlug: issue.slug,
        previous: null,
        next: null
      }
    }
  ]
])

const coverPath = issue.cover.url
const allowedMediaPaths = new Set([coverPath, ...media.map((item) => item.url)])

const apiServer = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", webOrigin)
  response.setHeader("access-control-allow-origin", webOrigin)
  response.setHeader("cache-control", "public, max-age=60, must-revalidate")
  response.setHeader("x-request-id", "courtside-public-demo")

  if (request.method !== "GET") {
    writeProblem(response, 405, requestUrl.pathname)
    return
  }

  if (requestUrl.pathname === "/api/v1/public/issues") {
    writeJson(response, 200, {
      items: [issue],
      page: { nextCursor: null, limit: boundedLimit(requestUrl.searchParams.get("limit")) }
    })
    return
  }

  if (requestUrl.pathname === `/api/v1/public/issues/${issue.slug}`) {
    writeJson(response, 200, issueDetail)
    return
  }

  const articlePrefix = "/api/v1/public/articles/"
  if (requestUrl.pathname.startsWith(articlePrefix)) {
    const article = articles.get(requestUrl.pathname.slice(articlePrefix.length))
    if (article) writeJson(response, 200, article)
    else writeProblem(response, 404, requestUrl.pathname)
    return
  }

  if (allowedMediaPaths.has(requestUrl.pathname)) {
    writeDemoMedia(response, requestUrl.pathname)
    return
  }

  writeProblem(response, 404, requestUrl.pathname)
})

let stopDemo = (code = 1) => {
  process.exitCode = code
}

apiServer.once("error", (error) => {
  writeError(`reader demo API failed: ${error.message}`)
  stopDemo(1)
})

apiServer.listen(API_PORT, HOST, () => {
  const environment = {
    ...process.env,
    NUXT_PUBLIC_API_BASE_URL: `http://${HOST}:${API_PORT}`,
    NUXT_PUBLIC_SITE_URL: webOrigin,
    NUXT_PUBLIC_LOCAL_READER_DEMO: "true",
    NUXT_PUBLIC_OFFLINE_APP_SHELL_ENABLED: "false",
    NUXT_TELEMETRY_DISABLED: "1",
    COURTSIDE_LOCAL_DEMO: "1",
    NODE_ENV: "production"
  }
  const webRoot = new URL("..", import.meta.url)
  const buildInvocation = packageManagerInvocation(["exec", "nuxt", "build"])
  let web = spawnManaged(buildInvocation.command, buildInvocation.args, webRoot, environment)
  let stopping = false

  writeLog("Building the bounded reader demo…")
  writeLog(`Read-only fixture API: http://${HOST}:${API_PORT}`)

  const stop = (code = 0) => {
    if (stopping) return
    stopping = true
    terminateChild(web)
    const forcedExit = setTimeout(() => process.exit(code), 2_000)
    forcedExit.unref()
    apiServer.close(() => {
      clearTimeout(forcedExit)
      process.exit(code)
    })
  }
  stopDemo = stop

  web.once("error", (error) => {
    writeError(`reader demo build could not start: ${error.message}`)
    stop(1)
  })

  web.once("exit", async (code) => {
    if (stopping) return
    if (code !== 0) {
      writeError(`reader demo build failed with exit code ${code ?? 1}`)
      stop(code ?? 1)
      return
    }

    web = spawnManaged(
      process.execPath,
      [fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url))],
      webRoot,
      {
        ...environment,
        HOST,
        PORT: String(WEB_PORT),
        NITRO_HOST: HOST,
        NITRO_PORT: String(WEB_PORT)
      }
    )
    web.once("error", (error) => {
      writeError(`reader demo server could not start: ${error.message}`)
      stop(1)
    })
    web.once("exit", (serverCode) => stop(serverCode ?? 1))
    try {
      await waitForDemoReady()
      if (!stopping) writeLog(`Courtside TW reader demo ready: ${webOrigin}`)
    } catch (error) {
      writeError(error instanceof Error ? error.message : "reader demo readiness failed")
      stop(1)
    }
  })

  process.once("SIGINT", () => stop(0))
  process.once("SIGTERM", () => stop(0))
})

function packageManagerInvocation(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] }
  }
  return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", args }
}

function spawnManaged(command, args, cwd, environment) {
  return spawn(command, args, {
    cwd,
    env: environment,
    stdio: "inherit",
    detached: process.platform !== "win32"
  })
}

function terminateChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM")
      return
    } catch {
      // Fall through to the direct-child termination path.
    }
  }
  child.kill("SIGTERM")
}

async function waitForDemoReady() {
  const deadline = Date.now() + 15_000
  let detail = "no response"
  while (Date.now() < deadline) {
    try {
      const [webResponse, apiResponse] = await Promise.all([
        fetch(webOrigin),
        fetch(`http://${HOST}:${API_PORT}/api/v1/public/issues`)
      ])
      if (webResponse.ok && apiResponse.ok) return
      detail = `web ${webResponse.status}; API ${apiResponse.status}`
    } catch (error) {
      detail = error instanceof Error ? error.message : "connection failed"
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`reader demo did not become ready within 15 seconds (${detail})`)
}

function writeLog(message) {
  process.stdout.write(`${message}\n`)
}

function writeError(message) {
  process.stderr.write(`${message}\n`)
}

function boundedPort(raw, fallback) {
  const value = Number(raw ?? fallback)
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("demo ports must be integers between 1024 and 65535")
  }
  return value
}

function boundedLimit(raw) {
  const value = Number(raw ?? 20)
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 20
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    etag: '"courtside-public-demo-v1"'
  })
  response.end(JSON.stringify(body))
}

function writeProblem(response, status, path) {
  writeJson(response, status, {
    type: "https://courtside.tw/problems/resource_not_found",
    title: status === 405 ? "Method not allowed" : "Not found",
    status,
    detail: "The public reader demo does not expose this resource.",
    instance: path,
    requestId: "courtside-public-demo",
    code: status === 405 ? "METHOD_NOT_ALLOWED" : "RESOURCE_NOT_FOUND",
    errors: []
  })
}

function writeDemoMedia(response, path) {
  const portrait = path === coverPath
  const width = portrait ? 1200 : path.includes("wide") ? 1600 : 1200
  const height = portrait ? 1500 : path.includes("wide") ? 900 : path.includes("pulse") ? 675 : 800
  const label = portrait ? "ISSUE 01" : path.includes("stands") ? "HOME COURT" : "COURT PULSE"
  const title = portrait
    ? `<tspan x="${width * 0.07}" dy="0">HOME</tspan><tspan x="${width * 0.07}" dy="0.92em">COURT</tspan>`
    : "TAIWAN HOOPS / COURTSIDE TW"
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Courtside TW abstract arena demo artwork">
  <defs>
    <linearGradient id="arena" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080808"/><stop offset="0.68" stop-color="#151515"/><stop offset="1" stop-color="#2c1712"/>
    </linearGradient>
    <pattern id="grain" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="1" fill="#f2eee5" opacity=".055"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#arena)"/><rect width="100%" height="100%" fill="url(#grain)"/>
  <g fill="none" stroke="#f2eee5" stroke-width="${portrait ? 5 : 3}" opacity=".28">
    <path d="M ${width * 0.54} 0 V ${height}"/><circle cx="${width * 0.54}" cy="${height * 0.52}" r="${Math.min(width, height) * 0.18}"/>
    <path d="M ${width * 0.54} ${height * 0.29} C ${width * 0.76} ${height * 0.34}, ${width * 0.76} ${height * 0.7}, ${width * 0.54} ${height * 0.75}"/>
  </g>
  <rect x="${width * 0.07}" y="${height * 0.08}" width="${width * 0.016}" height="${height * 0.32}" fill="#e64d32"/>
  <circle cx="${width * 0.82}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.022}" fill="#e64d32"/>
  <text x="${width * 0.07}" y="${height * 0.07}" fill="#e64d32" font-family="Arial, sans-serif" font-size="${Math.min(width, height) * 0.024}" font-weight="700" letter-spacing="6">${label}</text>
  <text x="${width * 0.07}" y="${height * 0.55}" fill="#f2eee5" font-family="Arial Black, Arial, sans-serif" font-size="${Math.min(width, height) * (portrait ? 0.12 : 0.065)}" font-weight="900" letter-spacing="-4">${title}</text>
  <text x="${width * 0.07}" y="${height * 0.9}" fill="#b8b1a7" font-family="Arial, sans-serif" font-size="${Math.min(width, height) * 0.022}" letter-spacing="4">COURTSIDE TW / TAIPEI</text>
</svg>`
  response.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=3600"
  })
  response.end(svg)
}
