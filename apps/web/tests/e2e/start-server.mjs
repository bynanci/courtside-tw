import { spawn } from "node:child_process"
import { createServer } from "node:http"

const API_PORT = 4010
const WEB_PORT = 4173
const webOrigin = "http://127.0.0.1:" + WEB_PORT
const issue = {
  issueId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
  slug: "issue-2026-01",
  issueNumber: 1,
  title: "主場開季：先把每一次進場讀完",
  summary: "從主場看台出發，整理這座城市與籃球的共同記憶。",
  cover: {
    url: "/media/issues/issue-2026-01/cover.webp",
    alt: "第 1 期 Courtside TW 封面",
    width: 1200,
    height: 1600
  },
  publishedAt: "2026-08-01T00:00:00Z",
  articleCount: 2
}
const issueDetail = {
  ...issue,
  sections: [
    {
      title: "開場",
      position: 1,
      articles: [
        {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
          slug: "opening-night",
          title: "主場燈光亮起之前",
          position: 1
        }
      ]
    },
    {
      title: "場邊觀察",
      position: 2,
      articles: [
        {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abe",
          slug: "courtside-notes",
          title: "看台上的第二種節奏",
          position: 1
        }
      ]
    }
  ]
}

const apiServer = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", webOrigin)

  response.setHeader("access-control-allow-origin", webOrigin)
  response.setHeader("access-control-allow-credentials", "true")
  response.setHeader("x-request-id", "e2e-public-api")
  response.setHeader("cache-control", "public, max-age=60, must-revalidate")

  if (requestUrl.pathname === "/api/v1/public/issues") {
    writeJson(response, 200, { items: [issue], page: { nextCursor: null, limit: 20 } })
    return
  }
  if (requestUrl.pathname === "/api/v1/public/issues/issue-2026-01") {
    writeJson(response, 200, issueDetail)
    return
  }
  if (requestUrl.pathname.startsWith("/media/")) {
    response.writeHead(204)
    response.end()
    return
  }
  writeJson(response, 404, {
    type: "https://courtside.tw/problems/resource_not_found",
    title: "Not found",
    status: 404,
    detail: "The requested resource was not found.",
    instance: "/api/v1/public/issues",
    requestId: "e2e-public-api",
    code: "RESOURCE_NOT_FOUND",
    errors: []
  })
})

apiServer.listen(API_PORT, "127.0.0.1", () => {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const webServer = spawn(
    command,
    ["exec", "nuxt", "dev", "--host", "127.0.0.1", "--port", String(WEB_PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NUXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:" + API_PORT,
        NUXT_PUBLIC_SITE_URL: "https://courtside.test",
        NUXT_TELEMETRY_DISABLED: "1"
      },
      stdio: "inherit"
    }
  )

  const stop = () => {
    webServer.kill("SIGTERM")
    apiServer.close(() => process.exit(0))
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  webServer.once("exit", (code) => {
    apiServer.close(() => process.exit(code ?? 1))
  })
})

function writeJson(response, status, body) {
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.setHeader("etag", '"e2e-public-issue"')
  response.writeHead(status)
  response.end(JSON.stringify(body))
}
