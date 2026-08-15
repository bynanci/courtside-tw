import { expect, test, type Page } from "@playwright/test"

const ISSUE_SLUG = "issue-2026-01"
const ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const ARTICLE_SLUG = "opening-night"

type OfflineManifest = {
  issueSlug: string
  manifestVersion: number
  checksum: string
  expiresAt: string
  articles: Array<{
    articleId: string
    slug: string
    title: string
    position: number
  }>
}

const manifestV1: OfflineManifest = {
  issueSlug: ISSUE_SLUG,
  manifestVersion: 1,
  checksum: "a".repeat(64),
  expiresAt: "2026-09-01T00:00:00Z",
  articles: [
    {
      articleId: ARTICLE_ID,
      slug: ARTICLE_SLUG,
      title: "主場燈光亮起之前",
      position: 1
    }
  ]
}

const manifestV2: OfflineManifest = {
  ...manifestV1,
  manifestVersion: 2,
  checksum: "b".repeat(64)
}

const withdrawalManifest = {
  version: 2,
  generatedAt: "2026-08-15T00:00:00Z",
  withdrawals: [ARTICLE_ID]
}

async function openOfflineIssue(page: Page) {
  await page.goto(`/issues/${ISSUE_SLUG}`, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("offline-download")).toBeVisible()
}

test.describe("US6 offline issue", () => {
  test("does not install a partially downloaded issue after interruption", async ({ page }) => {
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestV1)
      })
    )
    await page.route("**/media/offline/**", (route) => route.abort("failed"))

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-status")).toContainText(
      /interrupted|中斷|未完成/i
    )
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("rejects a corrupted asset before marking the issue installed", async ({ page }) => {
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestV1)
      })
    )
    await page.route("**/media/offline/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "corrupt offline asset"
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-error")).toContainText(
      /checksum|校驗|corrupt/i
    )
    await expect(page.getByTestId("offline-installed")).toHaveCount(0)
  })

  test("surfaces quota denial without leaving a partial installation", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.storage, "estimate", {
        configurable: true,
        value: async () => ({ quota: 1024, usage: 1024 })
      })
    })
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestV1)
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()

    await expect(page.getByTestId("offline-download-error")).toContainText(
      /quota|儲存空間|容量/i
    )
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

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await expect(page.getByTestId("offline-manifest-version")).toHaveText("1")

    await page.getByTestId("offline-update").click()
    await expect(page.getByTestId("offline-manifest-version")).toHaveText("2")
    await expect(page.getByTestId("offline-installed")).toBeVisible()
  })

  test("reconciles an online withdrawal before exposing cached article content", async ({ page }) => {
    await page.route("**/api/v1/public/offline/issues/**/manifest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manifestV1)
      })
    )
    await page.route("**/api/v1/public/withdrawals", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(withdrawalManifest)
      })
    )

    await openOfflineIssue(page)
    await page.getByTestId("offline-download").click()
    await page.getByTestId("offline-reconcile").click()

    await expect(page.getByTestId("offline-unavailable")).toContainText(
      /withdrawn|撤回|不可用/i
    )
    await expect(page.getByTestId("offline-article-body")).toHaveCount(0)
  })
})
