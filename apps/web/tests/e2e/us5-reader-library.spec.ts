import { expect, test } from "@playwright/test"

const OPENING_ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const OPENING_REVISION_ID = "0190f7b0-7c4b-7e3a-8f12-123456789ab1"
const OPENING_BLOCK_ID = "00000000-0000-4000-8000-000000000002"

function progressKey(kind: "index" | "record" | "slug", ...segments: string[]): string {
  return `courtside.reader.progress:v1:${kind}:${segments.map(encodeURIComponent).join(":")}`
}

test.describe("US5 reader library", () => {
  test("exposes the deterministic reader-library fixture contract", async ({ request }) => {
    const reset = await request.post("http://127.0.0.1:4010/test/reader-library/reset")
    expect(reset.status()).toBe(204)

    const state = await request.get("http://127.0.0.1:4010/test/reader-library/state")
    expect(await state.json()).toMatchObject({ bookmarks: 1, progress: 1 })
  })

  test("syncs a bookmark and explicitly merges newer valid progress across devices", async ({
    browser,
    request
  }) => {
    const reset = await request.post("http://127.0.0.1:4010/test/reader-library/reset")
    expect(reset.ok()).toBeTruthy()

    const firstDevice = await browser.newContext()
    const secondDevice = await browser.newContext()
    await secondDevice.addInitScript(
      ({ articleId, revisionId, blockId }) => {
        const recordKey = `courtside.reader.progress:v1:record:${encodeURIComponent(articleId)}:${encodeURIComponent(revisionId)}:${encodeURIComponent(blockId)}`
        const indexKey = `courtside.reader.progress:v1:index:${encodeURIComponent(articleId)}`
        const slugKey = `courtside.reader.progress:v1:slug:${encodeURIComponent("opening-night")}`
        if (localStorage.getItem(indexKey)) return
        localStorage.setItem(
          recordKey,
          JSON.stringify({
            schemaVersion: 1,
            articleId,
            revisionId,
            articleSlug: "opening-night",
            blockId,
            blockLabel: "文章開場",
            offset: 0.2,
            documentProgress: 0.72,
            updatedAt: "2026-08-03T00:00:00Z"
          })
        )
        localStorage.setItem(indexKey, recordKey)
        localStorage.setItem(slugKey, articleId)
        localStorage.setItem(
          "courtside.reader.progress:v1:manifest",
          JSON.stringify([{ articleId, articleSlug: "opening-night" }])
        )
      },
      {
        articleId: OPENING_ARTICLE_ID,
        revisionId: OPENING_REVISION_ID,
        blockId: OPENING_BLOCK_ID
      }
    )
    const firstPage = await firstDevice.newPage()
    const secondPage = await secondDevice.newPage()

    await firstPage.goto("/auth/login?returnTo=%2Farticles%2Fopening-night")
    await firstPage.goto("/articles/opening-night", { waitUntil: "domcontentloaded" })
    await firstPage.getByTestId("bookmark-toggle").click()
    await expect(firstPage.getByTestId("bookmark-toggle")).toHaveAttribute("aria-pressed", "true")

    await secondPage.goto("/auth/login?returnTo=%2Flibrary")
    await secondPage.goto("/library", { waitUntil: "domcontentloaded" })
    await expect(
      secondPage.getByTestId("library-bookmark").filter({ hasText: "Opening Night" })
    ).toBeVisible()

    await secondPage.getByTestId("progress-merge-preview").click()
    await expect(secondPage.getByTestId("progress-merge-decision")).toContainText(/newer|較新/i)
    await expect(secondPage.getByTestId("library-progress-percent")).not.toHaveText("72%")
    await secondPage.getByTestId("progress-merge-apply").click()
    await expect(secondPage.getByTestId("library-progress-percent")).toHaveText("72%")

    await firstDevice.close()
    await secondDevice.close()
  })

  test("keeps anonymous local progress after logout and expired-session fallback", async ({
    browser
  }) => {
    const context = await browser.newContext()
    await context.addInitScript(
      ({ articleId, revisionId, blockId, recordKey, indexKey, slugKey }) => {
        if (localStorage.getItem(indexKey)) return
        localStorage.setItem(
          recordKey,
          JSON.stringify({
            schemaVersion: 1,
            articleId,
            revisionId,
            articleSlug: "opening-night",
            blockId,
            blockLabel: "文章開場",
            offset: 0.2,
            documentProgress: 0.42,
            updatedAt: "2026-08-03T00:00:00Z"
          })
        )
        localStorage.setItem(indexKey, recordKey)
        localStorage.setItem(slugKey, articleId)
        localStorage.setItem(
          "courtside.reader.progress:v1:manifest",
          JSON.stringify([{ articleId, articleSlug: "opening-night" }])
        )
      },
      {
        articleId: OPENING_ARTICLE_ID,
        revisionId: OPENING_REVISION_ID,
        blockId: OPENING_BLOCK_ID,
        recordKey: progressKey("record", OPENING_ARTICLE_ID, OPENING_REVISION_ID, OPENING_BLOCK_ID),
        indexKey: progressKey("index", OPENING_ARTICLE_ID),
        slugKey: progressKey("slug", "opening-night")
      }
    )
    const page = await context.newPage()

    await page.goto("/auth/login?returnTo=%2Farticles%2Fopening-night")
    await page.goto("/articles/opening-night", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("bookmark-toggle")).toBeVisible()

    await page.evaluate(async () => {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("__Host-courtside_csrf="))
        ?.split("=")[1]
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}
      })
      if (!response.ok) throw new Error(`logout failed: ${response.status}`)
    })
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("bookmark-toggle")).toHaveCount(0)
    await expect(page.getByTestId("reader-resume")).toBeVisible()

    await page.goto("/auth/login?returnTo=%2Farticles%2Fopening-night")
    await context.clearCookies()
    await page.goto("/articles/opening-night", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("bookmark-toggle")).toHaveCount(0)
    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect(page.getByTestId("reader-resume")).toBeVisible()

    await context.close()
  })

  test("invalidates a local position after the published revision changes", async ({ browser }) => {
    const context = await browser.newContext()
    const indexKey = progressKey("index", OPENING_ARTICLE_ID)
    const staleRevisionId = "0190f7b0-7c4b-7e3a-8f12-123456789aff"
    const recordKey = progressKey("record", OPENING_ARTICLE_ID, staleRevisionId, OPENING_BLOCK_ID)
    await context.addInitScript(
      ({ articleId, revisionId, blockId, record, index }) => {
        if (localStorage.getItem(index)) return
        localStorage.setItem(
          record,
          JSON.stringify({
            schemaVersion: 1,
            articleId,
            revisionId,
            articleSlug: "opening-night",
            blockId,
            blockLabel: "舊版文章開場",
            offset: 0.2,
            documentProgress: 0.42,
            updatedAt: "2026-08-03T00:00:00Z"
          })
        )
        localStorage.setItem(index, record)
        localStorage.setItem(
          `courtside.reader.progress:v1:slug:${encodeURIComponent("opening-night")}`,
          articleId
        )
        localStorage.setItem(
          "courtside.reader.progress:v1:manifest",
          JSON.stringify([{ articleId, articleSlug: "opening-night" }])
        )
      },
      {
        articleId: OPENING_ARTICLE_ID,
        revisionId: staleRevisionId,
        blockId: OPENING_BLOCK_ID,
        record: recordKey,
        index: indexKey
      }
    )
    const page = await context.newPage()

    await page.goto("/articles/opening-night", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect(page.getByTestId("reader-resume")).toHaveCount(0)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), indexKey)).toBeNull()

    await context.close()
  })

  test("shows a withdrawn bookmark without restricted article body", async ({ page, request }) => {
    const reset = await request.post(
      "http://127.0.0.1:4010/test/reader-library/reset?withdrawn=true"
    )
    expect(reset.ok()).toBeTruthy()

    await page.goto("/auth/login?returnTo=%2Flibrary")
    await page.goto("/library", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("library-unavailable")).toBeVisible()
    await expect(page.getByTestId("library-unavailable")).toContainText(/不可用|unavailable/i)
    await expect(page.getByText("Restricted withdrawn body fixture")).toHaveCount(0)
  })
})
