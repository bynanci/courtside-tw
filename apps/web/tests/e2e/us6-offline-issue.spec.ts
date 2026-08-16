import { createHash } from "node:crypto"

import { expect, test, type Page } from "@playwright/test"

const ISSUE_SLUG = "issue-2026-01"
const ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const REVISION_ID = "0190f7b0-7c4b-7e3a-8f12-123456789ab1"
const ARTICLE_SLUG = "opening-night"
const ARTICLE_CONTENT_PATH = `/api/v1/public/offline/issues/${ISSUE_SLUG}/articles/${ARTICLE_ID}/revisions/${REVISION_ID}`

const offlineArticleProjection = {
  articleId: ARTICLE_ID,
  revisionId: REVISION_ID,
  revisionNumber: 1,
  slug: ARTICLE_SLUG,
  title: "主場燈光亮起之前",
  dek: "離線仍能閱讀的版本化文章。",
  content: {
    schemaVersion: 1,
    documentId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "paragraph",
        version: 1,
        payload: {
          content: [{ kind: "text", text: "離線文章仍保留完整閱讀內容。" }]
        }
      }
    ]
  },
  plainText: "離線文章仍保留完整閱讀內容。",
  readingTimeMinutes: 1,
  publishedAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  canonicalPath: `/articles/${ARTICLE_SLUG}`,
  media: [],
  contributors: [],
  issueNavigation: {
    issueSlug: ISSUE_SLUG,
    previous: null,
    next: null
  }
}
const articleContentJson = JSON.stringify(offlineArticleProjection)
const articleContentChecksum = sha256(articleContentJson)
const articleContentBytes = Buffer.byteLength(articleContentJson)

type OfflineManifest = {
  issueSlug: string
  manifestVersion: number
  checksum: string
  expiresAt: string
  assetBytes: number
  articles: Array<{
    articleId: string
    revisionId: string
    revisionNumber: number
    slug: string
    title: string
    position: number
    contentUrl: string
    byteSize: number
    checksum: string
  }>
  assets: Array<{
    url: string
    byteSize: number
    checksum: string
  }>
}

const manifestV1: OfflineManifest = {
  issueSlug: ISSUE_SLUG,
  manifestVersion: 1,
  checksum: "a".repeat(64),
  expiresAt: "2026-09-01T00:00:00Z",
  assetBytes: articleContentBytes,
  articles: [
    {
      articleId: ARTICLE_ID,
      revisionId: REVISION_ID,
      revisionNumber: 1,
      slug: ARTICLE_SLUG,
      title: "主場燈光亮起之前",
      position: 1,
      contentUrl: ARTICLE_CONTENT_PATH,
      byteSize: articleContentBytes,
      checksum: articleContentChecksum
    }
  ],
  assets: []
}

const manifestV2: OfflineManifest = {
  ...manifestV1,
  manifestVersion: 2,
  checksum: "b".repeat(64)
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function withdrawalManifest(version: number, withdrawals: string[], checksum?: string) {
  const canonical = `${version}\n${[...withdrawals].sort().join("\n")}`
  return {
    version,
    generatedAt: "2026-08-15T00:00:00Z",
    withdrawals,
    checksum: checksum ?? sha256(canonical)
  }
}

async function routeManifest(page: Page, manifest: OfflineManifest = manifestV1) {
  await page.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(manifest)
    })
  )
}

async function routeArticleContent(page: Page, body = articleContentJson) {
  await page.route("**/api/v1/public/offline/issues/**/articles/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body
    })
  )
}

async function openOfflineIssue(page: Page) {
  await page.goto(`/issues/${ISSUE_SLUG}`, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("offline-download")).toBeVisible()
}

test.describe("US6 offline issue", () => {
  test("does not install a partially downloaded issue after interruption", async ({ page }) => {
    await routeManifest(page)
    await page.route("**/api/v1/public/offline/issues/**/articles/**", (route) =>
      route.abort("failed")
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-status")).toContainText(
      /interrupted|中斷|未完成/i
    )
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("rejects checksum corruption before marking the issue installed", async ({ page }) => {
    await routeManifest(page)
    await routeArticleContent(
      page,
      JSON.stringify({ ...offlineArticleProjection, title: "tampered" })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-error")).toContainText(/checksum|校驗|corrupt/i)
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("surfaces quota denial without leaving a partial installation", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.storage, "estimate", {
        configurable: true,
        value: async () => ({ quota: 1024, usage: 1024 })
      })
    })
    await routeManifest(page)

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-error")).toContainText(/quota|儲存空間|容量/i)
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("atomically replaces an installed issue with a newer manifest", async ({ page }) => {
    let manifestCalls = 0
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) => {
      manifestCalls += 1
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestCalls === 1 ? manifestV1 : manifestV2)
      })
    })
    await routeArticleContent(page)

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await expect(page.getByTestId("offline-manifest-version")).toHaveText("1")

    await page.getByTestId("offline-update").click()
    await expect(page.getByTestId("offline-manifest-version")).toHaveText("2")
    await expect(page.getByTestId("offline-installed")).toBeVisible()
  })

  test("reads the cached article when the cross-origin article API is unavailable", async ({
    page
  }) => {
    await routeManifest(page)
    await routeArticleContent(page)
    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await expect(page.getByTestId("offline-installed")).toBeVisible()

    const cachedUrls = await page.evaluate(async () => {
      const cacheName = (await caches.keys()).find((name) =>
        name.startsWith("courtside-offline:candidate:")
      )
      if (!cacheName) return []
      const requests = await (await caches.open(cacheName)).keys()
      return requests.map((request) => request.url)
    })
    expect(cachedUrls).toContain(`http://127.0.0.1:4010${ARTICLE_CONTENT_PATH}`)
    expect(cachedUrls.every((url) => url.startsWith("http://127.0.0.1:4010/"))).toBe(true)

    await page.route("**/api/v1/public/articles/**", (route) => route.abort("failed"))
    await page.getByTestId("article-link").first().click()

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("主場燈光亮起之前")
    await expect(page.getByTestId("article-content")).toContainText("離線文章仍保留完整閱讀內容。")
  })

  test("removes an installed issue when its rights expiry has passed", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-16T00:00:00Z") })
    await routeManifest(page)
    await routeArticleContent(page)
    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await expect(page.getByTestId("offline-installed")).toBeVisible()

    await page.clock.setFixedTime(new Date("2026-09-02T00:00:00Z"))
    await page.reload({ waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
    await expect(page.getByTestId("offline-download-status")).toContainText(
      /尚未保存|expired|過期/i
    )
  })

  test("honors a confirmed withdrawal even when issue revalidation fails", async ({ page }) => {
    let manifestCalls = 0
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) => {
      manifestCalls += 1
      if (manifestCalls > 1) return route.abort("failed")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestV1)
      })
    })
    await routeArticleContent(page)
    await page.route("**/api/v1/public/withdrawals", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(withdrawalManifest(2, [ARTICLE_ID]))
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await page.getByTestId("offline-reconcile").click()

    await expect(page.getByTestId("offline-unavailable")).toContainText(/withdrawn|撤回|不可用/i)
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("fails closed when the withdrawal checksum does not match its payload", async ({ page }) => {
    await routeManifest(page)
    await routeArticleContent(page)
    await page.route("**/api/v1/public/withdrawals", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(withdrawalManifest(3, [], "f".repeat(64)))
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await page.getByTestId("offline-reconcile").click()

    await expect(page.getByTestId("offline-unavailable")).toContainText(/不可用|停用|撤回/i)
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("invalidates an installed issue when its manifest is withdrawn", async ({ page }) => {
    let manifestCalls = 0
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) => {
      manifestCalls += 1
      return route.fulfill({
        status: manifestCalls === 1 ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(manifestCalls === 1 ? manifestV1 : {})
      })
    })
    await routeArticleContent(page)
    await page.route("**/api/v1/public/withdrawals", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(withdrawalManifest(4, []))
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await page.getByTestId("offline-reconcile").click()

    await expect(page.getByTestId("offline-unavailable")).toContainText(/withdrawn|撤回|不可用/i)
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })
})
