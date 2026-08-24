import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { exportJWK, generateKeyPair, SignJWT } from "jose"

const API_PORT = 4010
const WEB_PORT = 4173
const webOrigin = "http://127.0.0.1:" + WEB_PORT
const STUDIO_ARTICLE_ID = "00000000-0000-4000-8000-000000000201"
const STUDIO_REVISION_ID = "00000000-0000-4000-8000-000000000202"
const STUDIO_ISSUE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const STUDIO_COVER_ASSET_ID = "00000000-0000-4000-8000-000000000203"
const STUDIO_ACCESS_TOKEN = "e2e-studio-access-token"
const STUDIO_PUBLIC_TARGET = STUDIO_ARTICLE_ID
const contentDocument = JSON.parse(
  readFileSync(new URL("../fixtures/content-document-v1.json", import.meta.url), "utf8")
)
const firstIssueFixture = JSON.parse(
  readFileSync(
    new URL("../../../api/src/test/resources/fixtures/first-issue/manifest.json", import.meta.url),
    "utf8"
  )
)
const issue = firstIssueFixture.issue
const issueDetail = {
  ...issue,
  sections: firstIssueFixture.sections.map((section) => ({
    ...section,
    articles: section.articles.map((article) => {
      const publicArticle = { ...article }
      Reflect.deleteProperty(publicArticle, "contentFile")
      return publicArticle
    })
  }))
}
const archivedIssue = {
  ...issue,
  issueId: "0190f7b0-7c4b-7e3a-8f12-123456789abf",
  slug: "issue-2025-12",
  issueNumber: 12,
  title: "年末場邊誌",
  summary: "驗證公開 sitemap 會走訪所有 issue cursor。",
  publishedAt: "2025-12-01T00:00:00Z",
  articleCount: 1
}
const archivedIssueDetail = {
  ...archivedIssue,
  sections: [
    {
      title: "年末回顧",
      position: 1,
      articles: [
        {
          articleId: "0190f7b0-7c4b-7e3a-8f12-123456789ac0",
          slug: "archived-courtside-story",
          title: "舊期仍應被找到",
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
      plainText:
        "主場燈光亮起以前，人們已經沿著熟悉的路線進場。這篇文章記錄球場、看台與城市共同形成的主場記憶。",
      readingTimeMinutes: 6,
      publishedAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
      canonicalPath: "/articles/opening-night",
      media: [
        {
          assetId: "00000000-0000-4000-8000-000000000011",
          variant: "wide",
          url: "/media/published/opening-wide.webp",
          mimeType: "image/webp",
          width: 1600,
          height: 900,
          altText: "球場在夜間燈光下的全景",
          credit: "場邊攝影",
          rightsOwner: "Courtside TW",
          licenseName: "Courtside public editorial license"
        },
        {
          assetId: "00000000-0000-4000-8000-000000000012",
          variant: "inline",
          url: "/media/published/opening-gallery-1.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 800,
          altText: "球員在場上傳球",
          credit: "場邊攝影",
          rightsOwner: "Courtside TW",
          licenseName: "Courtside public editorial license"
        },
        {
          assetId: "00000000-0000-4000-8000-000000000013",
          variant: "inline",
          url: "/media/published/opening-gallery-2.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 800,
          altText: "觀眾席的主場應援",
          credit: "場邊攝影",
          rightsOwner: "Courtside TW",
          licenseName: "Courtside public editorial license"
        },
        {
          assetId: "00000000-0000-4000-8000-000000000016",
          variant: "wide",
          url: "/media/published/opening-generative-wide.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 675,
          altText: "以球場線條與投籃落點構成的抽象視覺 poster",
          credit: "Courtside TW 資料視覺",
          rightsOwner: "Courtside TW",
          licenseName: "Courtside public editorial license"
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
          contributorId: "00000000-0000-4000-8000-000000000022",
          slug: "courtside-tw-editorial",
          displayName: "Courtside TW 編輯部",
          role: "EDITOR"
        },
        {
          contributorId: "00000000-0000-4000-8000-000000000023",
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
  ],
  [
    "future-creative",
    {
      articleId: "00000000-0000-4000-8000-000000000901",
      revisionId: "00000000-0000-4000-8000-000000000902",
      revisionNumber: 1,
      slug: "future-creative",
      title: "未支援創意版本的安全備援",
      dek: "驗證公開 reader 對未知 preset 採 total deny-by-default。",
      content: {
        schemaVersion: 1,
        documentId: "00000000-0000-4000-8000-000000000903",
        blocks: [
          {
            id: "00000000-0000-4000-8000-000000000904",
            type: "generative-canvas",
            version: 1,
            payload: {
              presetId: "court-pulse-v2",
              seed: 20260813,
              posterAssetId: "00000000-0000-4000-8000-000000000905",
              altText: "未知創意版本的靜態球場 poster",
              dataSummary: "此創意版本尚未支援，reader 只呈現可信的靜態摘要。"
            }
          }
        ]
      },
      plainText: "此創意版本尚未支援，reader 只呈現可信的靜態摘要。",
      readingTimeMinutes: 1,
      publishedAt: "2026-08-13T00:00:00Z",
      updatedAt: "2026-08-13T00:00:00Z",
      canonicalPath: "/articles/future-creative",
      media: [
        {
          assetId: "00000000-0000-4000-8000-000000000905",
          variant: "wide",
          url: "/media/published/future-creative-poster.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 675,
          altText: "未知創意版本的靜態球場 poster",
          credit: "Courtside TW 資料視覺",
          rightsOwner: "Courtside TW",
          licenseName: "Courtside public editorial license"
        }
      ],
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
        previous: null,
        next: null
      }
    }
  ]
])

const publicMediaFixtures = new Map([
  [
    issue.cover.url,
    {
      width: issue.cover.width,
      height: issue.cover.height,
      label: "ISSUE 01 / HOME COURT"
    }
  ],
  ...Array.from(articleProjections.values()).flatMap((article) =>
    article.media.map((media) => [
      media.url,
      {
        width: media.width,
        height: media.height,
        label: media.url.includes("gallery-1")
          ? "PASS THE BALL"
          : media.url.includes("gallery-2")
            ? "HOME STANDS"
            : media.url.includes("generative")
              ? "COURT PULSE"
              : media.url.includes("future")
                ? "SAFE POSTER"
                : "HOME COURT"
      }
    ])
  )
])

let studioState = createStudioState("DRAFT")
let studioIssueState = createStudioIssueState()
let studioIssueSections = createStudioIssueSections()
let studioAuditEvents = []
let studioReceipts = new Map()
let studioTaxonomyTerms = []
let readerLibraryState = createReaderLibraryState(false)

function createReaderLibraryState(withdrawn) {
  const opening = articleProjections.get("opening-night")
  const notes = articleProjections.get("courtside-notes")
  const openingBlockId = opening.content.blocks[0].id
  return {
    identifiableProfiles: 1,
    bookmarks: withdrawn
      ? [
          {
            articleId: opening.articleId,
            createdAt: "2026-08-01T00:00:00Z",
            available: false,
            unavailableReason: "WITHDRAWN",
            slug: null,
            title: "Opening Night"
          }
        ]
      : [
          {
            articleId: notes.articleId,
            createdAt: "2026-08-01T00:00:00Z",
            available: true,
            unavailableReason: null,
            slug: notes.slug,
            title: "Courtside Notes"
          }
        ],
    progress: [
      {
        articleId: opening.articleId,
        revisionId: opening.revisionId,
        blockId: openingBlockId,
        percent: 35,
        updatedAt: "2026-08-01T00:00:00Z"
      }
    ]
  }
}

function resetReaderLibraryState(withdrawn = false) {
  readerLibraryState = createReaderLibraryState(withdrawn)
}

function createStudioIssueState() {
  return {
    issueId: STUDIO_ISSUE_ID,
    issueNumber: 1,
    version: 1,
    title: issue.title,
    slug: issue.slug,
    description: issue.summary,
    coverAssetId: STUDIO_COVER_ASSET_ID,
    state: "DRAFT"
  }
}

function createStudioIssueSections() {
  return [
    {
      sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
      title: "開場",
      position: 1,
      articleCount: 0,
      version: 0
    },
    {
      sectionId: "0190f7b0-7c4b-7e3a-8f12-123456789abe",
      title: "場邊觀察",
      position: 2,
      articleCount: 0,
      version: 0
    }
  ]
}

function studioIssueCollection() {
  return {
    issueId: studioIssueState.issueId,
    issueVersion: studioIssueState.version,
    sections: studioIssueSections.map((section) => ({ ...section }))
  }
}

function createStudioState(initialState) {
  return {
    articleId: STUDIO_ARTICLE_ID,
    revisionId: STUDIO_REVISION_ID,
    revisionNumber: 1,
    version: initialState === "DRAFT" ? 1 : 4,
    slug: "studio-fixture",
    title: "Studio fixture article",
    dek: "Deterministic Studio workflow fixture.",
    content: contentDocument,
    state: initialState,
    scheduledAt: undefined,
    readiness: {
      ready: initialState !== "IN_REVIEW",
      blockingCodes: initialState === "IN_REVIEW" ? ["RIGHTS_MISSING"] : [],
      blockers: []
    }
  }
}

function resetStudioState(initialState = "DRAFT") {
  studioState = createStudioState(initialState)
  studioIssueState = createStudioIssueState()
  studioIssueSections = createStudioIssueSections()
  studioAuditEvents = []
  studioReceipts = new Map()
  studioTaxonomyTerms = []
}

function studioArticle() {
  return {
    ...studioState,
    ...(studioState.scheduledAt ? { scheduledAt: studioState.scheduledAt } : {})
  }
}

function appendStudioAudit(action, actorSubject, metadata = {}) {
  studioAuditEvents.unshift({
    id: `00000000-0000-4000-8000-${String(studioAuditEvents.length + 301).padStart(12, "0")}`,
    occurredAt: new Date().toISOString(),
    actorSubject,
    action,
    targetType: "ARTICLE",
    targetId: STUDIO_ARTICLE_ID,
    requestId: "e2e-studio-request",
    metadata
  })
}

function studioOperation(status, operationId) {
  return { status, operationId }
}

function isStudioAuthorizationValid(request) {
  return request.headers.authorization === `Bearer ${STUDIO_ACCESS_TOKEN}`
}

function isReaderAuthorizationValid(request) {
  return request.headers.authorization === `Bearer ${STUDIO_ACCESS_TOKEN}`
}

async function readJson(request) {
  const text = await readBodyText(request)
  if (!text) return {}
  return JSON.parse(text)
}

async function readForm(request) {
  return new URLSearchParams(await readBodyText(request))
}

async function readBodyText(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function writeProblem(response, status, detail, code) {
  writeJson(response, status, {
    type: `https://courtside.tw/problems/${code.toLowerCase()}`,
    title: code,
    status,
    detail,
    instance: "/api/v1/editor/articles",
    requestId: "e2e-studio-request",
    code,
    errors: []
  })
}

function writePublicMediaFixture(response, fixture) {
  const { width, height, label } = fixture
  const inset = Math.round(width * 0.07)
  const courtTop = Math.round(height * 0.38)
  const courtBottom = Math.round(height * 0.9)
  const centerX = Math.round(width / 2)
  const centerY = Math.round((courtTop + courtBottom) / 2)
  const titleY = Math.round(height * 0.2)
  const labelY = Math.round(height * 0.27)
  const titleSize = Math.round(Math.min(width, height) * 0.11)
  const labelSize = Math.round(Math.min(width, height) * 0.025)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#080808"/>
  <rect x="${inset}" y="${courtTop}" width="${width - inset * 2}" height="${courtBottom - courtTop}" rx="${Math.round(width * 0.018)}" fill="#151515" stroke="#f2eee5" stroke-width="${Math.max(4, Math.round(width * 0.006))}"/>
  <path d="M ${centerX} ${courtTop} V ${courtBottom}" stroke="#f2eee5" stroke-width="${Math.max(3, Math.round(width * 0.004))}" opacity=".72"/>
  <circle cx="${centerX}" cy="${centerY}" r="${Math.round(width * 0.105)}" fill="none" stroke="#e64d32" stroke-width="${Math.max(5, Math.round(width * 0.008))}"/>
  <path d="M ${inset} ${centerY} H ${centerX - Math.round(width * 0.105)} M ${centerX + Math.round(width * 0.105)} ${centerY} H ${width - inset}" stroke="#b8b1a7" stroke-width="${Math.max(3, Math.round(width * 0.004))}" opacity=".62"/>
  <circle cx="${Math.round(width * 0.84)}" cy="${Math.round(height * 0.18)}" r="${Math.round(width * 0.065)}" fill="#e64d32"/>
  <text x="${inset}" y="${titleY}" fill="#f2eee5" font-family="Arial Narrow, Arial, sans-serif" font-size="${titleSize}" font-weight="800" letter-spacing="-2">COURTSIDE TW</text>
  <text x="${inset}" y="${labelY}" fill="#e64d32" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700" letter-spacing="4">${label}</text>
</svg>`
  response.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=3600"
  })
  response.end(svg)
}

function scheduledUtc(publishAt, timezone) {
  const value = String(publishAt)
  if (timezone === "Asia/Taipei" && !/[zZ]|[+-]\d{2}:?\d{2}$/u.test(value)) {
    return new Date(`${value}:00+08:00`).toISOString()
  }
  return new Date(value).toISOString()
}

const apiServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", webOrigin)

  response.setHeader("access-control-allow-origin", webOrigin)
  response.setHeader("access-control-allow-credentials", "true")
  response.setHeader("x-request-id", "e2e-public-api")
  response.setHeader("cache-control", "public, max-age=60, must-revalidate")

  if (requestUrl.pathname === "/test/studio/reset" && request.method === "POST") {
    const requestedState = requestUrl.searchParams.get("state") ?? "DRAFT"
    const allowedStates = new Set(["DRAFT", "APPROVED", "PUBLISHED"])
    resetStudioState(allowedStates.has(requestedState) ? requestedState : "DRAFT")
    writeJson(response, 204, null)
    return
  }

  if (requestUrl.pathname === "/test/reader-library/reset" && request.method === "POST") {
    resetReaderLibraryState(requestUrl.searchParams.get("withdrawn") === "true")
    writeJson(response, 204, null)
    return
  }
  if (requestUrl.pathname === "/test/reader-library/state" && request.method === "GET") {
    writeJson(response, 200, {
      bookmarks: readerLibraryState.bookmarks.length,
      progress: readerLibraryState.progress.length,
      identifiableProfiles: readerLibraryState.identifiableProfiles
    })
    return
  }

  const isReaderRequest =
    requestUrl.pathname === "/api/v1/me" || requestUrl.pathname.startsWith("/api/v1/me/")
  if (isReaderRequest) {
    response.setHeader("cache-control", "no-store")
    if (!isReaderAuthorizationValid(request)) {
      writeProblem(
        response,
        401,
        "Reader fixture requires a server-side session bearer.",
        "AUTHENTICATION_REQUIRED"
      )
      return
    }

    if (requestUrl.pathname === "/api/v1/me/bookmarks" && request.method === "GET") {
      writeJson(response, 200, {
        items: readerLibraryState.bookmarks,
        page: { nextCursor: null, limit: 20 }
      })
      return
    }
    const bookmarkPrefix = "/api/v1/me/bookmarks/"
    if (requestUrl.pathname.startsWith(bookmarkPrefix)) {
      const articleId = requestUrl.pathname.slice(bookmarkPrefix.length)
      if (request.method === "PUT") {
        const article = Array.from(articleProjections.values()).find(
          (candidate) => candidate.articleId === articleId
        )
        if (!article) {
          writeProblem(response, 404, "Article not found.", "RESOURCE_NOT_FOUND")
          return
        }
        if (!readerLibraryState.bookmarks.some((bookmark) => bookmark.articleId === articleId)) {
          readerLibraryState.bookmarks.unshift({
            articleId,
            createdAt: new Date().toISOString(),
            available: true,
            unavailableReason: null,
            slug: article.slug,
            title: article.slug === "opening-night" ? "Opening Night" : article.title
          })
        }
        writeJson(response, 204, null)
        return
      }
      if (request.method === "DELETE") {
        readerLibraryState.bookmarks = readerLibraryState.bookmarks.filter(
          (bookmark) => bookmark.articleId !== articleId
        )
        writeJson(response, 204, null)
        return
      }
    }

    if (requestUrl.pathname === "/api/v1/me/progress" && request.method === "GET") {
      writeJson(response, 200, {
        items: readerLibraryState.progress,
        page: { nextCursor: null, limit: 20 }
      })
      return
    }
    const progressPrefix = "/api/v1/me/progress/"
    if (requestUrl.pathname.startsWith(progressPrefix) && request.method === "PUT") {
      const articleId = requestUrl.pathname.slice(progressPrefix.length)
      const body = await readJson(request)
      const next = {
        articleId,
        revisionId: body.revisionId,
        blockId: body.blockId,
        percent: Number(body.percent),
        updatedAt: new Date().toISOString()
      }
      readerLibraryState.progress = readerLibraryState.progress
        .filter((item) => item.articleId !== articleId)
        .concat(next)
      writeJson(response, 200, next)
      return
    }
    if (requestUrl.pathname === "/api/v1/me/progress:merge" && request.method === "POST") {
      const body = await readJson(request)
      const items = Array.isArray(body.items) ? body.items : []
      const accepted = items.map((local) => {
        const server = readerLibraryState.progress.find(
          (candidate) => candidate.articleId === local.articleId
        )
        if (!server) return local
        return Date.parse(local.updatedAt) > Date.parse(server.updatedAt) ? local : server
      })
      if (body.mode === "apply") {
        for (const selected of accepted) {
          readerLibraryState.progress = readerLibraryState.progress
            .filter((item) => item.articleId !== selected.articleId)
            .concat(selected)
        }
      }
      writeJson(response, 200, { mode: body.mode, accepted, conflicts: [] })
      return
    }
    if (requestUrl.pathname === "/api/v1/me/export" && request.method === "GET") {
      writeJson(response, 200, {
        issuer: "http://127.0.0.1/e2e",
        subject: "reader-e2e-user",
        bookmarks: readerLibraryState.bookmarks,
        progress: readerLibraryState.progress,
        generatedAt: new Date().toISOString()
      })
      return
    }
    if (requestUrl.pathname === "/api/v1/me" && request.method === "DELETE") {
      readerLibraryState.bookmarks = []
      readerLibraryState.progress = []
      readerLibraryState.identifiableProfiles = 0
      writeJson(response, 202, {
        requestId: "00000000-0000-4000-8000-000000000701",
        status: "COMPLETED"
      })
      return
    }
    writeProblem(response, 404, "Reader resource not found.", "RESOURCE_NOT_FOUND")
    return
  }

  const isStudioRequest =
    requestUrl.pathname.startsWith("/api/v1/editor/") ||
    requestUrl.pathname.startsWith("/api/v1/publisher/")
  if (isStudioRequest) {
    response.setHeader("cache-control", "no-store")
    if (!isStudioAuthorizationValid(request)) {
      writeProblem(
        response,
        401,
        "Studio fixture requires a server-side session bearer.",
        "AUTHENTICATION_REQUIRED"
      )
      return
    }

    const taxonomyBasePath = "/api/v1/editor/taxonomy"
    if (requestUrl.pathname === taxonomyBasePath && request.method === "GET") {
      const kind = requestUrl.searchParams.get("kind")
      const status = requestUrl.searchParams.get("status")
      const items = studioTaxonomyTerms.filter(
        (term) => (!kind || term.kind === kind) && (!status || term.status === status)
      )
      writeJson(response, 200, { items })
      return
    }
    if (requestUrl.pathname === taxonomyBasePath && request.method === "POST") {
      const body = await readJson(request)
      if (studioTaxonomyTerms.some((term) => term.key === body.key)) {
        writeProblem(response, 400, "Taxonomy key already exists.", "INVALID_REQUEST")
        return
      }
      const term = {
        id: globalThis.crypto.randomUUID(),
        key: String(body.key),
        kind: String(body.kind),
        displayName: String(body.displayName),
        locale: String(body.locale ?? "zh-TW"),
        validFrom: "2026-08-01T00:00:00Z",
        validUntil: null,
        status: "ACTIVE",
        version: 0,
        aliases: []
      }
      studioTaxonomyTerms.push(term)
      writeJson(response, 201, term)
      return
    }
    if (requestUrl.pathname.startsWith(`${taxonomyBasePath}/`)) {
      const suffix = requestUrl.pathname.slice(`${taxonomyBasePath}/`.length)
      const [termId, nested] = suffix.split("/")
      const index = studioTaxonomyTerms.findIndex((term) => term.id === termId)
      if (index < 0) {
        writeProblem(response, 404, "Taxonomy term was not found.", "RESOURCE_NOT_FOUND")
        return
      }
      const current = studioTaxonomyTerms[index]
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== current.version) {
        writeProblem(response, 409, "Taxonomy term version is stale.", "VERSION_CONFLICT")
        return
      }
      const body = await readJson(request)
      if (nested === "aliases" && request.method === "POST") {
        const alias = {
          id: globalThis.crypto.randomUUID(),
          alias: String(body.alias),
          normalizedAlias: String(body.alias).toLocaleLowerCase().replaceAll("+", "").trim(),
          locale: String(body.locale ?? "zh-TW"),
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: null,
          version: 0
        }
        studioTaxonomyTerms[index] = {
          ...current,
          version: current.version + 1,
          aliases: [...current.aliases, alias]
        }
        writeJson(response, 201, studioTaxonomyTerms[index])
        return
      }
      if (!nested && request.method === "PATCH") {
        studioTaxonomyTerms[index] = {
          ...current,
          displayName: String(body.displayName ?? current.displayName),
          status: String(body.status ?? current.status),
          version: current.version + 1
        }
        writeJson(response, 200, studioTaxonomyTerms[index])
        return
      }
    }

    if (requestUrl.pathname === "/api/v1/editor/issues" && request.method === "GET") {
      writeJson(response, 200, {
        items: [{ ...studioIssueState }],
        page: { nextCursor: null, limit: 100 }
      })
      return
    }

    if (requestUrl.pathname === "/api/v1/editor/issues" && request.method === "PATCH") {
      const body = await readJson(request)
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== studioIssueState.version) {
        writeProblem(response, 409, "The Studio issue version is stale.", "VERSION_CONFLICT")
        return
      }
      studioIssueState = {
        ...studioIssueState,
        title: String(body.changes?.title ?? studioIssueState.title),
        description: String(body.changes?.description ?? studioIssueState.description),
        version: studioIssueState.version + 1
      }
      writeJson(response, 200, { ...studioIssueState })
      return
    }

    const editorIssueSectionsPath = `/api/v1/editor/issues/${STUDIO_ISSUE_ID}/sections`
    const editorIssueSectionPrefix = `${editorIssueSectionsPath}/`
    if (requestUrl.pathname === editorIssueSectionsPath && request.method === "GET") {
      writeJson(response, 200, studioIssueCollection())
      return
    }

    if (requestUrl.pathname === editorIssueSectionsPath && request.method === "POST") {
      const body = await readJson(request)
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== studioIssueState.version) {
        writeProblem(response, 409, "The Studio issue version is stale.", "VERSION_CONFLICT")
        return
      }
      const title = String(body.title ?? "").trim()
      const requestedPosition =
        body.position === undefined ? studioIssueSections.length + 1 : Number(body.position)
      if (
        !title ||
        !Number.isInteger(requestedPosition) ||
        requestedPosition < 1 ||
        requestedPosition > studioIssueSections.length + 1
      ) {
        writeProblem(response, 400, "Section title or position is invalid.", "INVALID_REQUEST")
        return
      }
      studioIssueSections = studioIssueSections
        .map((section) => ({
          ...section,
          position: section.position >= requestedPosition ? section.position + 1 : section.position
        }))
        .concat({
          sectionId: globalThis.crypto.randomUUID(),
          title,
          position: requestedPosition,
          articleCount: 0,
          version: 0
        })
        .sort((left, right) => left.position - right.position)
      studioIssueState = { ...studioIssueState, version: studioIssueState.version + 1 }
      writeJson(response, 201, studioIssueCollection())
      return
    }

    if (requestUrl.pathname === editorIssueSectionsPath && request.method === "PATCH") {
      const body = await readJson(request)
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== studioIssueState.version) {
        writeProblem(response, 409, "The Studio issue version is stale.", "VERSION_CONFLICT")
        return
      }
      const changes = Array.isArray(body.sections) ? body.sections : []
      const byId = new Map(changes.map((change) => [change.sectionId, Number(change.position)]))
      if (
        changes.length !== studioIssueSections.length ||
        new Set(changes.map((change) => change.sectionId)).size !== changes.length ||
        new Set(changes.map((change) => Number(change.position))).size !== changes.length ||
        changes.some((change) => !Number.isInteger(Number(change.position))) ||
        changes.some(
          (change) => Number(change.position) < 1 || Number(change.position) > changes.length
        ) ||
        changes.some(
          (change) => !studioIssueSections.some((section) => section.sectionId === change.sectionId)
        )
      ) {
        writeProblem(response, 400, "The complete section order is required.", "INVALID_REQUEST")
        return
      }
      studioIssueSections = studioIssueSections
        .map((section) => ({
          ...section,
          position: byId.get(section.sectionId),
          version: section.version + 1
        }))
        .sort((left, right) => left.position - right.position)
      studioIssueState = { ...studioIssueState, version: studioIssueState.version + 1 }
      writeJson(response, 200, studioIssueCollection())
      return
    }

    if (requestUrl.pathname.startsWith(editorIssueSectionPrefix)) {
      const sectionId = requestUrl.pathname.slice(editorIssueSectionPrefix.length)
      const section = studioIssueSections.find((candidate) => candidate.sectionId === sectionId)
      if (!section) {
        writeProblem(response, 404, "The Studio section was not found.", "RESOURCE_NOT_FOUND")
        return
      }
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== studioIssueState.version) {
        writeProblem(response, 409, "The Studio issue version is stale.", "VERSION_CONFLICT")
        return
      }
      if (request.method === "PATCH") {
        const body = await readJson(request)
        const title = String(body.title ?? "").trim()
        if (!title) {
          writeProblem(response, 400, "Section title is required.", "INVALID_REQUEST")
          return
        }
        studioIssueSections = studioIssueSections.map((candidate) =>
          candidate.sectionId === sectionId
            ? { ...candidate, title, version: candidate.version + 1 }
            : candidate
        )
        studioIssueState = { ...studioIssueState, version: studioIssueState.version + 1 }
        writeJson(response, 200, studioIssueCollection())
        return
      }
      if (request.method === "DELETE") {
        if (section.articleCount > 0) {
          writeProblem(
            response,
            422,
            "Sections with articles cannot be deleted.",
            "SECTION_NOT_EMPTY"
          )
          return
        }
        studioIssueSections = studioIssueSections
          .filter((candidate) => candidate.sectionId !== sectionId)
          .map((candidate, position) => ({ ...candidate, position: position + 1 }))
        studioIssueState = { ...studioIssueState, version: studioIssueState.version + 1 }
        writeJson(response, 200, studioIssueCollection())
        return
      }
    }

    if (requestUrl.pathname === "/api/v1/editor/articles" && request.method === "GET") {
      writeJson(response, 200, { items: [studioArticle()], page: { nextCursor: null, limit: 100 } })
      return
    }
    if (
      requestUrl.pathname === `/api/v1/editor/articles/${STUDIO_ARTICLE_ID}` &&
      request.method === "GET"
    ) {
      writeJson(response, 200, studioArticle())
      return
    }
    if (requestUrl.pathname === "/api/v1/editor/articles" && request.method === "PATCH") {
      const body = await readJson(request)
      const expectedVersion = Number(String(request.headers["if-match"] ?? "").replaceAll('"', ""))
      if (expectedVersion !== studioState.version) {
        writeProblem(response, 409, "The Studio article version is stale.", "VERSION_CONFLICT")
        return
      }
      studioState = {
        ...studioState,
        title: String(body.changes?.title ?? studioState.title),
        dek: String(body.changes?.dek ?? studioState.dek),
        version: studioState.version + 1
      }
      appendStudioAudit("ARTICLE_DRAFT_PATCHED", "editor.e2e", { version: studioState.version })
      writeJson(response, 200, studioArticle())
      return
    }

    const editorSubmitPrefix = "/api/v1/editor/articles/"
    if (
      requestUrl.pathname.startsWith(editorSubmitPrefix) &&
      requestUrl.pathname.endsWith(":submit") &&
      request.method === "POST"
    ) {
      studioState = {
        ...studioState,
        state: "IN_REVIEW",
        version: studioState.version + 1,
        readiness: { ready: false, blockingCodes: ["RIGHTS_MISSING"], blockers: [] }
      }
      appendStudioAudit("ARTICLE_SUBMITTED", "editor.e2e", { revisionId: STUDIO_REVISION_ID })
      writeJson(response, 202, studioOperation("IN_REVIEW", "e2e-submit-operation"))
      return
    }

    if (requestUrl.pathname === "/api/v1/publisher/articles" && request.method === "GET") {
      writeJson(response, 200, { items: [studioArticle()], page: { nextCursor: null, limit: 100 } })
      return
    }

    const publisherArticlePrefix = "/api/v1/publisher/articles/"
    if (
      requestUrl.pathname === `${publisherArticlePrefix}${STUDIO_ARTICLE_ID}` &&
      request.method === "GET"
    ) {
      writeJson(response, 200, studioArticle())
      return
    }

    if (
      requestUrl.pathname === `${publisherArticlePrefix}${STUDIO_ARTICLE_ID}:schedule` &&
      request.method === "POST"
    ) {
      const key = String(request.headers["idempotency-key"] ?? "")
      if (key && studioReceipts.has(key)) {
        writeJson(response, 202, studioReceipts.get(key))
        return
      }
      const body = await readJson(request)
      studioState = {
        ...studioState,
        state: "SCHEDULED",
        scheduledAt: scheduledUtc(body.publishAt, body.timezone),
        version: studioState.version + 1
      }
      appendStudioAudit("ARTICLE_SCHEDULED", "publisher.e2e", {
        timezone: body.timezone,
        scheduledAt: studioState.scheduledAt
      })
      const result = studioOperation("SCHEDULED", "e2e-schedule-operation")
      if (key) studioReceipts.set(key, result)
      writeJson(response, 202, result)
      return
    }

    if (
      requestUrl.pathname === `${publisherArticlePrefix}${STUDIO_ARTICLE_ID}:withdraw` &&
      request.method === "POST"
    ) {
      const body = await readJson(request)
      studioState = { ...studioState, state: "WITHDRAWN", version: studioState.version + 1 }
      appendStudioAudit("ARTICLE_WITHDRAWN", "publisher.e2e", { reason: body.reason })
      writeJson(response, 202, studioOperation("WITHDRAWN", "e2e-withdraw-operation"))
      return
    }

    if (requestUrl.pathname === "/api/v1/editor/audit" && request.method === "GET") {
      const targetType = requestUrl.searchParams.get("targetType")
      const targetId = requestUrl.searchParams.get("targetId")
      const items =
        targetType === "ARTICLE" && targetId === STUDIO_PUBLIC_TARGET
          ? studioAuditEvents.slice(0, 50)
          : []
      writeJson(response, 200, { items, page: { nextCursor: null, limit: 50 } })
      return
    }

    writeProblem(
      response,
      404,
      "The requested Studio fixture resource was not found.",
      "RESOURCE_NOT_FOUND"
    )
    return
  }

  if (requestUrl.pathname === "/api/v1/public/issues") {
    if (requestUrl.searchParams.get("cursor") === "sitemap-older-issues") {
      writeJson(response, 200, {
        items: [archivedIssue],
        page: { nextCursor: null, limit: 100 }
      })
      return
    }
    writeJson(response, 200, {
      items: [issue],
      page: {
        nextCursor: requestUrl.searchParams.get("limit") === "100" ? "sitemap-older-issues" : null,
        limit: Number(requestUrl.searchParams.get("limit") ?? 20)
      }
    })
    return
  }
  if (requestUrl.pathname === "/api/v1/public/issues/issue-2026-01") {
    writeJson(response, 200, issueDetail)
    return
  }
  if (requestUrl.pathname === "/api/v1/public/issues/issue-2025-12") {
    writeJson(response, 200, archivedIssueDetail)
    return
  }

  if (requestUrl.pathname === "/api/v1/public/search") {
    const raw = requestUrl.searchParams.get("q") ?? ""
    const cursor = requestUrl.searchParams.get("cursor")
    const taxonomy = requestUrl.searchParams.getAll("taxonomy")
    const normalized = raw
      .normalize("NFKC")
      .toLocaleLowerCase("zh-TW")
      .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
      .trim()
    const pagedItems = normalized.includes("分頁")
      ? [
          {
            articleId:
              cursor === "cGFnZS0y"
                ? "0190f7b0-7c4b-7e3a-8f12-123456789ac2"
                : "0190f7b0-7c4b-7e3a-8f12-123456789ac1",
            slug: cursor === "cGFnZS0y" ? "search-page-two" : "search-page-one",
            title: cursor === "cGFnZS0y" ? "搜尋第二頁" : "搜尋第一頁",
            snippet: "Opaque cursor pagination fixture.",
            issueSlug: "issue-2026-01",
            publishedAt: cursor === "cGFnZS0y" ? "2026-08-01T00:00:00Z" : "2026-08-02T00:00:00Z"
          }
        ]
      : null
    const taxonomyItems = taxonomy.includes("team-formosa")
      ? [
          {
            articleId: "0190f7b0-7c4b-7e3a-8f12-123456789ac3",
            slug: "taxonomy-filter-result",
            title: "分類篩選結果",
            snippet: "Stable taxonomy key fixture.",
            issueSlug: "issue-2026-01",
            publishedAt: "2026-08-01T00:00:00Z"
          }
        ]
      : null
    const items =
      pagedItems ??
      taxonomyItems ??
      (normalized.includes("台籃") && normalized.includes("courtside")
        ? [
            {
              articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
              slug: "opening-night",
              title: "台籃 Courtside：主場燈光亮起之前",
              snippet: "從 Courtside 看台灣籃球的主場記憶。",
              issueSlug: "issue-2026-01",
              publishedAt: "2026-08-01T00:00:00Z"
            }
          ]
        : [])
    writeJson(response, 200, {
      query: { raw, normalized, taxonomy },
      items,
      page: {
        nextCursor: pagedItems && cursor !== "cGFnZS0y" ? "cGFnZS0y" : null,
        limit: Number(requestUrl.searchParams.get("limit") ?? 20)
      }
    })
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
    const fixture = publicMediaFixtures.get(requestUrl.pathname)
    if (fixture) {
      writePublicMediaFixture(response, fixture)
    } else {
      response.writeHead(204)
      response.end()
    }
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

const { privateKey: oidcPrivateKey, publicKey: oidcPublicKey } = await generateKeyPair("RS256")
const oidcJwk = await exportJWK(oidcPublicKey)
const oidcKeyId = "courtside-e2e-key"
const pendingAuthorizationCodes = new Map()
const oidcServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", webOrigin)
  const oidcIssuer = `http://127.0.0.1:${oidcServer.address()?.port}/issuer`

  if (requestUrl.pathname === "/jwks") {
    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({ keys: [{ ...oidcJwk, kid: oidcKeyId, alg: "RS256", use: "sig" }] })
    )
    return
  }
  if (requestUrl.pathname === "/authorize") {
    const code = `e2e-code-${Date.now()}`
    pendingAuthorizationCodes.set(code, {
      nonce: requestUrl.searchParams.get("nonce"),
      redirectUri: requestUrl.searchParams.get("redirect_uri")
    })
    const redirect = new URL(requestUrl.searchParams.get("redirect_uri"))
    redirect.searchParams.set("code", code)
    redirect.searchParams.set("state", requestUrl.searchParams.get("state") ?? "")
    response.writeHead(302, { location: redirect.toString() })
    response.end()
    return
  }
  if (requestUrl.pathname === "/token" && request.method === "POST") {
    const body = await readForm(request)
    const code = pendingAuthorizationCodes.get(body.get("code"))
    if (!code || body.get("redirect_uri") !== code.redirectUri) {
      response.statusCode = 400
      response.end(JSON.stringify({ error: "invalid_grant" }))
      return
    }
    pendingAuthorizationCodes.delete(body.get("code"))
    const idToken = await new SignJWT({
      roles: ["READER", "EDITOR", "PUBLISHER"],
      nonce: code.nonce
    })
      .setProtectedHeader({ alg: "RS256", kid: oidcKeyId })
      .setIssuer(oidcIssuer)
      .setSubject("studio-e2e-user")
      .setAudience("courtside-web")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(oidcPrivateKey)
    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({
        access_token: STUDIO_ACCESS_TOKEN,
        id_token: idToken,
        token_type: "Bearer",
        refresh_token: "e2e-studio-refresh-token",
        expires_in: 300
      })
    )
    return
  }
  if (requestUrl.pathname === "/revoke" && request.method === "POST") {
    response.statusCode = 200
    response.end()
    return
  }
  response.statusCode = 404
  response.end()
})

await listen(oidcServer, 0)
await listen(apiServer, API_PORT)

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const webEntry = fileURLToPath(new URL("../../.output/server/index.mjs", import.meta.url))
const oidcPort = oidcServer.address().port
const webEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  COURTSIDE_E2E: "1",
  HOST: "127.0.0.1",
  PORT: String(WEB_PORT),
  NITRO_HOST: "127.0.0.1",
  NITRO_PORT: String(WEB_PORT),
  NUXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:" + API_PORT,
  NUXT_PUBLIC_SITE_URL: "https://courtside.test",
  NUXT_PUBLIC_LOCAL_READER_DEMO: "false",
  NUXT_OIDC_ISSUER: `http://127.0.0.1:${oidcPort}/issuer`,
  NUXT_OIDC_AUTHORIZATION_ENDPOINT: `http://127.0.0.1:${oidcPort}/authorize`,
  NUXT_OIDC_TOKEN_ENDPOINT: `http://127.0.0.1:${oidcPort}/token`,
  NUXT_OIDC_JWKS_URI: `http://127.0.0.1:${oidcPort}/jwks`,
  NUXT_OIDC_REVOCATION_ENDPOINT: `http://127.0.0.1:${oidcPort}/revoke`,
  NUXT_OIDC_CLIENT_ID: "courtside-web",
  NUXT_OIDC_CLIENT_SECRET: "e2e-client-secret",
  NUXT_OIDC_REDIRECT_URI: `${webOrigin}/auth/callback`,
  NUXT_OIDC_ALLOW_INSECURE_HTTP: "true",
  NUXT_TELEMETRY_DISABLED: "1"
}
let webServer
let buildProcess

const closeServers = (code) => {
  apiServer.close(() => oidcServer.close(() => process.exit(code)))
}

const launchWebServer = () => {
  webServer = spawn(process.execPath, [webEntry], {
    cwd: process.cwd(),
    env: webEnvironment,
    stdio: "inherit"
  })
  webServer.once("exit", (code) => closeServers(code ?? 1))
}

if (existsSync(webEntry)) {
  launchWebServer()
} else {
  buildProcess = spawn(command, ["exec", "nuxt", "build"], {
    cwd: process.cwd(),
    env: webEnvironment,
    stdio: "inherit"
  })
  buildProcess.once("exit", (code) => {
    if (code === 0) launchWebServer()
    else closeServers(code ?? 1)
  })
}

const stop = () => {
  buildProcess?.kill("SIGTERM")
  webServer?.kill("SIGTERM")
  closeServers(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
}

function writeJson(response, status, body) {
  if (status === 204) {
    response.writeHead(status)
    response.end()
    return
  }
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.setHeader("etag", '"e2e-public-issue"')
  response.writeHead(status)
  response.end(JSON.stringify(body))
}
