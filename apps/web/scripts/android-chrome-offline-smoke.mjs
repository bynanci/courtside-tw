import { createHash } from "node:crypto"

import { chromium, expect } from "@playwright/test"

const ISSUE_SLUG = "issue-2026-01"
const ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const REVISION_ID = "0190f7b0-7c4b-7e3a-8f12-123456789ab1"
const ARTICLE_SLUG = "opening-night"
const ARTICLE_CONTENT_PATH = `/api/v1/public/offline/issues/${ISSUE_SLUG}/articles/${ARTICLE_ID}/revisions/${REVISION_ID}`

const articleProjection = {
  articleId: ARTICLE_ID,
  revisionId: REVISION_ID,
  revisionNumber: 1,
  slug: ARTICLE_SLUG,
  title: "主場燈光亮起之前",
  dek: "Android Chrome 離線撤回 smoke。",
  content: {
    schemaVersion: 1,
    documentId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "paragraph",
        version: 1,
        payload: { content: [{ kind: "text", text: "Android offline smoke body." }] }
      }
    ]
  },
  plainText: "Android offline smoke body.",
  readingTimeMinutes: 1,
  publishedAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  canonicalPath: `/articles/${ARTICLE_SLUG}`,
  media: [],
  contributors: [],
  issueNavigation: { issueSlug: ISSUE_SLUG, previous: null, next: null }
}
const articleBody = JSON.stringify(articleProjection)
const articleBytes = Buffer.byteLength(articleBody)
const articleChecksum = sha256(articleBody)
const withdrawalChecksum = sha256(`5\n${ARTICLE_ID}`)

const manifest = {
  issueSlug: ISSUE_SLUG,
  manifestVersion: 1,
  checksum: "a".repeat(64),
  expiresAt: "2099-09-01T00:00:00Z",
  assetBytes: articleBytes,
  articles: [
    {
      articleId: ARTICLE_ID,
      revisionId: REVISION_ID,
      revisionNumber: 1,
      slug: ARTICLE_SLUG,
      title: articleProjection.title,
      position: 1,
      contentUrl: ARTICLE_CONTENT_PATH,
      byteSize: articleBytes,
      checksum: articleChecksum
    }
  ],
  assets: []
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222")
try {
  const context = browser.contexts()[0]
  if (!context) throw new Error("Android Chrome did not expose a browser context")
  const page = context.pages()[0] ?? (await context.newPage())
  let withdrawalCalls = 0

  await context.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) })
  )
  await context.route("**/api/v1/public/offline/issues/**/articles/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: articleBody })
  )
  await context.route("**/api/v1/public/withdrawals", (route) => {
    withdrawalCalls += 1
    if (withdrawalCalls < 3) {
      return route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ status: 503, title: "Temporarily unavailable" })
      })
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 5,
        generatedAt: "2026-08-16T00:00:00Z",
        withdrawals: [ARTICLE_ID],
        checksum: withdrawalChecksum
      })
    })
  })

  await page.goto(`http://127.0.0.1:4173/issues/${ISSUE_SLUG}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000
  })
  const device = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform,
    width: window.innerWidth,
    height: window.innerHeight,
    touchPoints: navigator.maxTouchPoints
  }))
  if (!/Android/i.test(device.userAgent)) {
    throw new Error(`smoke must run in Android Chrome, received: ${device.userAgent}`)
  }

  await page.getByTestId("offline-download").click()
  await expect(page.getByTestId("offline-installed")).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => window.dispatchEvent(new Event("online")))

  await expect.poll(() => withdrawalCalls, { timeout: 15_000 }).toBe(3)
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await caches.keys()).some((name) => name.startsWith("courtside-offline:candidate:"))
        ),
      { timeout: 15_000 }
    )
    .toBe(false)

  const installedState = await page.evaluate(
    ({ databaseName, storeName, issueSlug }) =>
      new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(databaseName, 1)
        openRequest.onerror = () => reject(openRequest.error)
        openRequest.onsuccess = () => {
          const database = openRequest.result
          const request = database
            .transaction(storeName, "readonly")
            .objectStore(storeName)
            .get(issueSlug)
          request.onerror = () => {
            database.close()
            reject(request.error)
          }
          request.onsuccess = () => {
            database.close()
            resolve(request.result ?? null)
          }
        }
      }),
    {
      databaseName: "courtside-offline",
      storeName: "installed-issues",
      issueSlug: ISSUE_SLUG
    }
  )
  if (installedState !== null) {
    throw new Error("confirmed withdrawal left Android IndexedDB install authority behind")
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        result: "pass",
        browser: "Android Chrome",
        device,
        withdrawalAttempts: withdrawalCalls,
        cacheRemoved: true,
        installedState: null
      },
      null,
      2
    )}\n`
  )
} finally {
  await browser.close()
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}
