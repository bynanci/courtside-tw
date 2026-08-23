import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

const API_PORT = 4020
const WEB_PORT = 4173
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
const ISSUE_SLUG = "performance-issue"
const cache = new Map()

const issue = {
  issueId: "00000000-0000-4000-8000-000000079000",
  slug: ISSUE_SLUG,
  issueNumber: 79,
  title: "效能基準：二十篇公開閱讀專刊",
  summary: "T079 使用的固定 20 篇文章、代表性圖片、快取與生成式內容壓力資料。",
  cover: {
    url: "/media/performance/cover.svg",
    alt: "T079 二十篇公開閱讀效能專刊封面",
    width: 1200,
    height: 1600
  },
  publishedAt: "2026-08-20T00:00:00Z",
  articleCount: 20
}

const articleSummaries = Array.from({ length: 20 }, (_, zeroBasedIndex) => {
  const index = zeroBasedIndex + 1
  return {
    articleId: stableId(79_100 + index),
    slug: articleSlug(index),
    title:
      index === 20
        ? "生成式球場：Android 與 lifecycle 基準"
        : `公開閱讀效能樣本 ${String(index).padStart(2, "0")}`,
    position: index
  }
})

const issueDetail = {
  ...issue,
  sections: Array.from({ length: 4 }, (_, sectionIndex) => ({
    title: `效能分區 ${sectionIndex + 1}`,
    position: sectionIndex + 1,
    articles: articleSummaries.slice(sectionIndex * 5, sectionIndex * 5 + 5)
  }))
}

const media = [
  mediaAsset(79_501, "wide", "/media/performance/hero.svg", 1600, 900, "大型球場全景效能圖片"),
  mediaAsset(
    79_502,
    "inline",
    "/media/performance/gallery-1.svg",
    1200,
    800,
    "球員移動與場線代表圖片"
  ),
  mediaAsset(
    79_503,
    "inline",
    "/media/performance/gallery-2.svg",
    1200,
    800,
    "觀眾席與燈光代表圖片"
  ),
  mediaAsset(
    79_504,
    "wide",
    "/media/performance/poster.svg",
    1200,
    675,
    "固定 seed 生成式球場 poster"
  )
]

const articleProjections = new Map(
  articleSummaries.map((summary, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1
    return [summary.slug, articleProjection(index, summary)]
  })
)

const mediaBodies = new Map([
  ["/media/performance/cover.svg", createSvg(1200, 1600, "T079 COVER", 79)],
  ["/media/performance/hero.svg", createSvg(1600, 900, "T079 HERO", 80)],
  ["/media/performance/gallery-1.svg", createSvg(1200, 800, "T079 GALLERY A", 81)],
  ["/media/performance/gallery-2.svg", createSvg(1200, 800, "T079 GALLERY B", 82)],
  ["/media/performance/poster.svg", createSvg(1200, 675, "T079 GENERATIVE POSTER", 83)]
])

const apiServer = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", WEB_ORIGIN)
  response.setHeader("access-control-allow-origin", WEB_ORIGIN)
  response.setHeader("timing-allow-origin", WEB_ORIGIN)
  response.setHeader("x-request-id", "t079-performance-fixture")

  if (request.method === "OPTIONS") {
    response.writeHead(204)
    response.end()
    return
  }

  if (requestUrl.pathname === "/test/performance/reset-cache" && request.method === "POST") {
    cache.clear()
    response.setHeader("cache-control", "no-store")
    response.writeHead(204)
    response.end()
    return
  }

  if (requestUrl.pathname === "/api/v1/public/issues") {
    writeCachedJson(request, response, requestUrl, {
      items: [issue],
      page: {
        nextCursor: null,
        limit: Number(requestUrl.searchParams.get("limit") ?? 20)
      }
    })
    return
  }

  if (requestUrl.pathname === `/api/v1/public/issues/${ISSUE_SLUG}`) {
    writeCachedJson(request, response, requestUrl, issueDetail)
    return
  }

  const articlePrefix = "/api/v1/public/articles/"
  if (requestUrl.pathname.startsWith(articlePrefix)) {
    const slug = requestUrl.pathname.slice(articlePrefix.length)
    const projection = articleProjections.get(slug)
    if (projection) {
      writeCachedJson(request, response, requestUrl, projection)
    } else {
      writeProblem(response, requestUrl.pathname)
    }
    return
  }

  const mediaBody = mediaBodies.get(requestUrl.pathname)
  if (mediaBody) {
    writeCachedBody(request, response, requestUrl, mediaBody, "image/svg+xml; charset=utf-8", true)
    return
  }

  writeProblem(response, requestUrl.pathname)
})

await listen(apiServer, API_PORT)

const webRoot = fileURLToPath(new URL("../../apps/web/", import.meta.url))
const webEntry = fileURLToPath(new URL("../../apps/web/.output/server/index.mjs", import.meta.url))
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const webEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  COURTSIDE_E2E: "1",
  HOST: "127.0.0.1",
  PORT: String(WEB_PORT),
  NITRO_HOST: "127.0.0.1",
  NITRO_PORT: String(WEB_PORT),
  NUXT_PUBLIC_API_BASE_URL: API_ORIGIN,
  NUXT_PUBLIC_SITE_URL: "https://performance.courtside.test",
  NUXT_PUBLIC_LOCAL_READER_DEMO: "false",
  NUXT_TELEMETRY_DISABLED: "1"
}
let buildProcess = null
let webServer = null
let readyPrinted = false
let stopping = false

function forwardOutput(child) {
  const onOutput = (chunk) => {
    const text = chunk.toString()
    process.stdout.write(text)
    if (!readyPrinted && /Listening on/u.test(text)) {
      readyPrinted = true
      process.stdout.write(`Performance fixture listening on ${WEB_ORIGIN}\n`)
    }
  }
  child.stdout?.on("data", onOutput)
  child.stderr?.on("data", onOutput)
}

function launchWebServer() {
  webServer = spawn(process.execPath, [webEntry], {
    cwd: webRoot,
    env: webEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  })
  forwardOutput(webServer)
  webServer.once("exit", (code) => {
    if (!stopping) stop(code ?? 1)
  })
}

if (existsSync(webEntry)) {
  launchWebServer()
} else {
  buildProcess = spawn(command, ["exec", "nuxt", "build"], {
    cwd: webRoot,
    env: webEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  })
  forwardOutput(buildProcess)
  buildProcess.once("exit", (code) => {
    buildProcess = null
    if (code === 0) launchWebServer()
    else stop(code ?? 1)
  })
}

process.once("SIGINT", () => stop(0))
process.once("SIGTERM", () => stop(0))

function stop(code) {
  if (stopping) return
  stopping = true
  buildProcess?.kill("SIGTERM")
  webServer?.kill("SIGTERM")
  apiServer.close(() => process.exit(code))
  setTimeout(() => process.exit(code), 5_000).unref()
}

function articleProjection(index, summary) {
  const isCreative = index === 20
  const blocks = [
    {
      id: stableId(79_600 + index),
      type: "heading",
      version: 1,
      payload: { level: 2, text: `二十篇工作負載中的第 ${index} 篇` }
    },
    ...Array.from({ length: 8 }, (_, paragraphIndex) => ({
      id: stableId(80_000 + index * 20 + paragraphIndex),
      type: "paragraph",
      version: 1,
      payload: {
        content: [
          {
            kind: "text",
            text: `這是 T079 第 ${index} 篇文章的第 ${paragraphIndex + 1} 段固定繁體中文內容，用來建立可重現的公開閱讀、版面與資源載入工作負載。`
          }
        ]
      }
    })),
    {
      id: stableId(79_700 + index),
      type: "image",
      version: 1,
      payload: {
        assetId: media[0].assetId,
        altText: media[0].altText,
        variant: "wide",
        caption: "1600 × 900 代表性主圖",
        credit: "Courtside TW performance fixture"
      }
    },
    {
      id: stableId(79_800 + index),
      type: "gallery",
      version: 1,
      payload: {
        layout: "grid",
        items: [
          { assetId: media[1].assetId, altText: media[1].altText },
          {
            assetId: media[2].assetId,
            altText: media[2].altText,
            caption: "1200 × 800 代表性圖庫"
          }
        ]
      }
    }
  ]
  if (isCreative) {
    blocks.push({
      id: stableId(79_999),
      type: "generative-canvas",
      version: 1,
      payload: {
        presetId: "court-pulse-v1",
        seed: 20260820,
        parameters: {
          density: 42,
          tempo: 0.8,
          lineWeight: 1.5,
          paletteId: "court-dusk",
          numericSequence: [0.1, 0.4, 0.9]
        },
        posterAssetId: media[3].assetId,
        altText: media[3].altText,
        dataSummary: "固定 seed 的 T079 生成式球場資料摘要；runtime 不可用時仍保留完整 poster。"
      }
    })
  }

  return {
    articleId: summary.articleId,
    revisionId: stableId(81_000 + index),
    revisionNumber: 1,
    slug: summary.slug,
    title: summary.title,
    dek: "固定資料用於 20 篇 issue、圖片、bundle、cache 與 creative lifecycle 效能驗證。",
    content: {
      schemaVersion: 1,
      documentId: stableId(82_000 + index),
      blocks
    },
    plainText: blocks
      .flatMap((block) =>
        block.type === "paragraph" ? block.payload.content.map((item) => item.text) : []
      )
      .join(" "),
    readingTimeMinutes: 4,
    publishedAt: `2026-08-20T00:${String(index).padStart(2, "0")}:00Z`,
    updatedAt: `2026-08-20T00:${String(index).padStart(2, "0")}:00Z`,
    canonicalPath: `/articles/${summary.slug}`,
    media,
    contributors: [
      {
        contributorId: stableId(79_400),
        slug: "performance-editorial",
        displayName: "Courtside TW 效能基準編輯部",
        role: "EDITOR"
      }
    ],
    issueNavigation: {
      issueSlug: ISSUE_SLUG,
      previous: index > 1 ? articleSummaries[index - 2] : null,
      next: index < 20 ? articleSummaries[index] : null
    }
  }
}

function articleSlug(index) {
  return `performance-article-${String(index).padStart(2, "0")}`
}

function stableId(value) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`
}

function mediaAsset(value, variant, url, width, height, altText) {
  return {
    assetId: stableId(value),
    variant,
    url,
    mimeType: "image/svg+xml",
    width,
    height,
    altText,
    credit: "Courtside TW performance fixture",
    rightsOwner: "Courtside TW",
    licenseName: "T079 deterministic test license"
  }
}

function createSvg(width, height, label, seed) {
  const shapes = Array.from({ length: 160 }, (_, index) => {
    const x = (index * (31 + seed)) % width
    const y = (index * (47 + seed)) % height
    const radius = 8 + ((index * 13 + seed) % 42)
    const opacity = (0.15 + ((index + seed) % 7) * 0.08).toFixed(2)
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#f4c95d" stroke-width="${1 + (index % 4)}" opacity="${opacity}"/>`
  }).join("")
  const description = "Courtside TW deterministic performance imagery. ".repeat(80)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><desc>${description}</desc><rect width="100%" height="100%" fill="#15181d"/><path d="M0 ${height / 2} H${width} M${width / 2} 0 V${height}" stroke="#8aa0b8" stroke-width="4" opacity="0.6"/>${shapes}<text x="${width / 2}" y="${height / 2}" fill="#f7f1e3" font-size="48" text-anchor="middle">${label}</text></svg>`
}

function writeCachedJson(request, response, requestUrl, body) {
  writeCachedBody(
    request,
    response,
    requestUrl,
    JSON.stringify(body),
    "application/json; charset=utf-8",
    false
  )
}

function writeCachedBody(request, response, requestUrl, body, contentType, immutable) {
  const key = `${requestUrl.pathname}${requestUrl.search}`
  let entry = cache.get(key)
  const cacheState = entry ? "HIT" : "MISS"
  if (!entry) {
    entry = {
      body,
      etag: `"${createHash("sha256").update(body).digest("hex")}"`
    }
    cache.set(key, entry)
  }
  response.setHeader("content-type", contentType)
  response.setHeader("etag", entry.etag)
  response.setHeader(
    "cache-control",
    immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60, stale-while-revalidate=300"
  )
  if (request.headers["if-none-match"] === entry.etag) {
    response.setHeader("x-cache", "REVALIDATED")
    response.writeHead(304)
    response.end()
    return
  }
  response.setHeader("x-cache", cacheState)
  response.setHeader("content-length", Buffer.byteLength(entry.body))
  response.writeHead(200)
  response.end(entry.body)
}

function writeProblem(response, pathname) {
  response.setHeader("cache-control", "no-store")
  response.setHeader("content-type", "application/problem+json; charset=utf-8")
  response.writeHead(404)
  response.end(
    JSON.stringify({
      type: "https://courtside.tw/problems/resource_not_found",
      title: "Not found",
      status: 404,
      detail: "The requested T079 fixture resource was not found.",
      instance: pathname,
      requestId: "t079-performance-fixture",
      code: "RESOURCE_NOT_FOUND",
      errors: []
    })
  )
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
}
