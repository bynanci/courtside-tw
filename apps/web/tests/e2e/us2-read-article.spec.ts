import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

type ContentFixture = {
  blocks: Array<{ type: string }>
}

const contentFixture = JSON.parse(
  readFileSync(new URL("../fixtures/content-document-v1.json", import.meta.url), "utf8")
) as ContentFixture

test.describe("US2 long-form public article", () => {
  test("renders every v1 block, metadata, image fallback, navigation and share", async ({
    page
  }) => {
    expect(new Set(contentFixture.blocks.map((block) => block.type)).size).toBe(11)

    await page.route("**/media/**", (route) => route.abort())
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })

    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect(page.getByTestId("article-byline")).toContainText("Courtside TW 編輯部")
    await expect(page.getByTestId("article-byline")).toContainText("攝影")
    await expect(page.getByTestId("article-credit")).toHaveCount(3)
    const structuredData = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}"
    ) as { author?: unknown }
    expect(structuredData.author).toEqual([{ "@type": "Person", name: "Courtside TW 主筆" }])
    await expect(
      page.locator('[data-testid="article-document"] .article-image img').first()
    ).toHaveAttribute("src", /\/media\/published\/opening-wide\.webp$/)
    await expect(page.getByTestId("article-reading-time")).toContainText("分鐘")
    await expect(page.getByTestId("article-issue-link")).toHaveAttribute(
      "href",
      "/issues/issue-2026-01"
    )
    await page.waitForLoadState("networkidle")
    await page
      .locator('[data-testid="article-document"] .article-image img')
      .first()
      .dispatchEvent("error")
    await expect(page.getByTestId("article-image-fallback")).toBeVisible()
    await expect(page.getByTestId("article-error-state")).toHaveCount(0)

    await page.getByTestId("article-share").click()
    await expect(page.getByTestId("share-status")).toBeVisible()
  })

  test("offers explicit continue or start-over actions before restoring a stable anchor", async ({
    page
  }) => {
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()
    await page
      .locator("[data-block-id]")
      .nth(6)
      .evaluate((element) => {
        element.scrollIntoView({ block: "center", behavior: "auto" })
      })
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem(
            "courtside.reader.progress:v1:index:" +
              encodeURIComponent("0190f7b0-7c4b-7e3a-8f12-123456789abd")
          )
        )
      )
      .not.toBeNull()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.reload({ waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("reader-resume")).toBeVisible()
    await expect(page.getByTestId("reader-resume")).toContainText("主場燈光亮起之前")
    await expect(page.getByTestId("reader-resume-section")).not.toBeEmpty()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await page.getByTestId("reader-resume-continue").click()
    await expect(page.getByTestId("reader-resume")).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await page.getByTestId("article-issue-link").click()
    await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)
    await page.goBack({ waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("reader-resume")).toBeVisible()
    await page.getByTestId("reader-resume-start-over").click()
    await expect(page.getByTestId("reader-resume")).toHaveCount(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(
      await page.evaluate(() =>
        localStorage.getItem(
          "courtside.reader.progress:v1:index:" +
            encodeURIComponent("0190f7b0-7c4b-7e3a-8f12-123456789abd")
        )
      )
    ).toBeNull()
  })

  test("invalidates stale revision progress and starts a reload from the top", async ({ page }) => {
    const articleId = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
    const staleRevisionId = "0190f7b0-7c4b-7e3a-8f12-123456789ab0"
    const blockId = "00000000-0000-4000-8000-000000000007"
    const recordKey =
      "courtside.reader.progress:v1:record:" +
      [articleId, staleRevisionId, blockId].map(encodeURIComponent).join(":")
    const indexKey = "courtside.reader.progress:v1:index:" + encodeURIComponent(articleId)
    const slugKey = "courtside.reader.progress:v1:slug:" + encodeURIComponent("opening-night")

    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()
    await page
      .locator("[data-block-id]")
      .nth(6)
      .evaluate((element) => {
        element.scrollIntoView({ block: "center", behavior: "auto" })
      })
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.evaluate(
      ({ articleId, staleRevisionId, blockId, recordKey, indexKey, slugKey }) => {
        localStorage.setItem(
          recordKey,
          JSON.stringify({
            schemaVersion: 1,
            articleId,
            revisionId: staleRevisionId,
            articleSlug: "opening-night",
            blockId,
            blockLabel: "舊版段落",
            offset: 0.42,
            documentProgress: 0.5
          })
        )
        localStorage.setItem(indexKey, recordKey)
        localStorage.setItem(slugKey, articleId)
      },
      { articleId, staleRevisionId, blockId, recordKey, indexKey, slugKey }
    )

    await page.reload({ waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("reader-resume")).toHaveCount(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), indexKey)).toBeNull()
  })

  test("uses the issue snapshot for previous, next and table-of-contents links", async ({
    page
  }) => {
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()

    await expect(page.getByTestId("article-previous")).toBeDisabled()
    await expect(page.getByTestId("article-next")).toHaveAttribute(
      "href",
      "/articles/courtside-notes?issue=issue-2026-01"
    )
    await page.getByTestId("article-next").click()
    await expect(page).toHaveURL(/\/articles\/courtside-notes\?issue=issue-2026-01$/)
    await expect(page.getByTestId("article-toc")).toBeVisible()
  })

  test("clears local progress after the reader reaches the completed range", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()
    await expect(page.getByTestId("article-document")).toHaveAttribute("data-client-ready", "true")
    await page.waitForLoadState("networkidle")

    const middleBlock = page.locator("[data-block-id]").nth(6)
    await middleBlock.evaluate((element) => {
      element.scrollIntoView({ block: "center", behavior: "auto" })
    })
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem(
            "courtside.reader.progress:v1:index:" +
              encodeURIComponent("0190f7b0-7c4b-7e3a-8f12-123456789abd")
          )
        )
      )
      .not.toBeNull()

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const documentBottom = Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0
          )
          return window.scrollY + window.innerHeight >= documentBottom - 2
        })
      )
      .toBe(true)
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))

    await expect
      .poll(() =>
        page.evaluate(() => {
          return localStorage.getItem(
            "courtside.reader.progress:v1:index:" +
              encodeURIComponent("0190f7b0-7c4b-7e3a-8f12-123456789abd")
          )
        })
      )
      .toBeNull()
  })

  test("clears a saved pointer when the public article becomes unavailable", async ({ page }) => {
    const articleId = "0190f7b0-7c4b-7e3a-8f12-123456789aff"
    const revisionId = "0190f7b0-7c4b-7e3a-8f12-123456789afe"
    const blockId = "00000000-0000-4000-8000-000000000002"
    const recordKey =
      "courtside.reader.progress:v1:record:" +
      [articleId, revisionId, blockId].map(encodeURIComponent).join(":")
    const indexKey = "courtside.reader.progress:v1:index:" + encodeURIComponent(articleId)
    const slugKey = "courtside.reader.progress:v1:slug:" + encodeURIComponent("withdrawn-article")
    const legacyKey = "courtside.reader.progress:withdrawn-article:revision-1"
    const recordOnlyArticleId = "0190f7b0-7c4b-7e3a-8f12-123456789af0"
    const recordOnlyKey =
      "courtside.reader.progress:v1:record:" +
      [recordOnlyArticleId, revisionId, blockId].map(encodeURIComponent).join(":")
    await page.addInitScript(
      ({
        articleId,
        revisionId,
        blockId,
        recordKey,
        indexKey,
        slugKey,
        legacyKey,
        recordOnlyArticleId,
        recordOnlyKey
      }) => {
        localStorage.setItem(
          recordKey,
          JSON.stringify({
            schemaVersion: 1,
            articleId,
            revisionId,
            articleSlug: "withdrawn-article",
            blockId,
            blockLabel: "已撤回段落",
            offset: 0.4,
            documentProgress: 0.5
          })
        )
        localStorage.setItem(indexKey, recordKey)
        localStorage.setItem(slugKey, articleId)
        localStorage.setItem(legacyKey, JSON.stringify({ blockId, offset: 0.4 }))
        localStorage.setItem(
          recordOnlyKey,
          JSON.stringify({
            schemaVersion: 1,
            articleId: recordOnlyArticleId,
            revisionId,
            articleSlug: "withdrawn-article",
            blockId,
            blockLabel: "中斷寫入段落",
            offset: 0.3,
            documentProgress: 0.45
          })
        )
      },
      {
        articleId,
        revisionId,
        blockId,
        recordKey,
        indexKey,
        slugKey,
        legacyKey,
        recordOnlyArticleId,
        recordOnlyKey
      }
    )

    await page.goto("/articles/withdrawn-article?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-error-state")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          ({ recordKey, indexKey, slugKey, legacyKey, recordOnlyKey }) => [
            localStorage.getItem(recordKey),
            localStorage.getItem(indexKey),
            localStorage.getItem(slugKey),
            localStorage.getItem(legacyKey),
            localStorage.getItem(recordOnlyKey)
          ],
          { recordKey, indexKey, slugKey, legacyKey, recordOnlyKey }
        )
      )
      .toEqual([null, null, null, null, null])
  })

  test("keeps reading functional when browser storage is unavailable", async ({ page }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError")
        }
      })
    })
    await page.goto("/articles/opening-night?issue=issue-2026-01", {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByTestId("article-document")).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))
    expect(pageErrors).toEqual([])
  })
})
