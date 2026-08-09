import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"

const API_PORT = 4010
const WEB_PORT = 4173
const webOrigin = "http://127.0.0.1:" + WEB_PORT
const contentDocument = JSON.parse(
  readFileSync(new URL("../fixtures/content-document-v1.json", import.meta.url), "utf8")
)
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

const articleProjections = new Map([
  [
    "opening-night",
    {
      articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
      revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab1",
      revisionNumber: 1,
      slug: "opening-night",
      title: "主場燈光亮起之前",
      dek: "一篇從球場入口開始，記錄主場如何成為共同記憶的長文。",
      content: contentDocument,
      media: [
        {
          assetId: "00000000-0000-4000-8000-000000000011",
          variant: "wide",
          url: "/media/published/opening-wide.webp",
          mimeType: "image/webp",
          width: 1600,
          height: 900
        },
        {
          assetId: "00000000-0000-4000-8000-000000000012",
          variant: "inline",
          url: "/media/published/opening-gallery-1.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 800
        },
        {
          assetId: "00000000-0000-4000-8000-000000000013",
          variant: "inline",
          url: "/media/published/opening-gallery-2.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 800
        },
        {
          assetId: "00000000-0000-4000-8000-000000000016",
          variant: "wide",
          url: "/media/published/opening-generative-wide.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 675
        }
      ],
      contributors: [
        {
          contributorId: "00000000-0000-4000-8000-000000000021",
          slug: "courtside-tw-author",
          displayName: "Courtside TW 主筆",
          role: "AUTHOR"
        },
        {
          contributorId: "00000000-0000-0000-0000-000000000022",
          slug: "courtside-tw-editorial",
          displayName: "Courtside TW 編輯部",
          role: "EDITOR"
        },
        {
          contributorId: "00000000-0000-0000-0000-000000000023",
          slug: "courtside-tw-photographer",
          displayName: "場邊攝影",
          role: "PHOTOGRAPHER"
        }
      ],
      issueNavigation: {
        issueSlug: "issue-2026-01",
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
      content: {
        schemaVersion: 1,
        documentId: "0190f7b0-7c4b-7e3a-8f12-123456789ab3",
        blocks: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            type: "paragraph",
            version: 1,
            payload: {
              content: [
                {
                  kind: "text",
                  text: "看台的聲音，讓比賽在終場之後繼續留下節奏。"
                }
              ]
            }
          }
        ]
      },
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
        issueSlug: "issue-2026-01",
        previous: {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
          slug: "opening-night",
          title: "主場燈光亮起之前",
          position: 1
        },
        next: null
      }
    }
  ]
])

const apiServer = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", webOrigin)

  response.setHeader("access-control-allow-origin", webOrigin)
  response.setHeader("access-control-allow-credentials", "true")
  response.setHeader("x-request-id", "e2e-public-api")
  response.setHeader("cache-control", "public, max-age=60, must-revalidate")

  if (requestUrl.pathname === "/api/v1/public/issues") {
    writeJson(response, 200, {
      items: [issue],
      page: { nextCursor: null, limit: 20 }
    })
    return
  }
  if (requestUrl.pathname === "/api/v1/public/issues/issue-2026-01") {
    writeJson(response, 200, issueDetail)
    return
  }

  const articlePrefix = "/api/v1/public/articles/"
  if (requestUrl.pathname.startsWith(articlePrefix)) {
    const articleSlug = requestUrl.pathname.slice(articlePrefix.length)
    const article = articleProjections.get(articleSlug)
    if (article) {
      writeJson(response, 200, article)
    } else {
      writeJson(response, 404, {
        type: "https://courtside.tw/problems/resource_not_found",
        title: "Not found",
        status: 404,
        detail: "The requested resource was not found.",
        instance: requestUrl.pathname,
        requestId: "e2e-public-api",
        code: "RESOURCE_NOT_FOUND",
        errors: []
      })
    }
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
