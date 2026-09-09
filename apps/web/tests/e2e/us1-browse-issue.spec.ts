import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const firstIssueFixture = JSON.parse(
  readFileSync(
    new URL("../../../api/src/test/resources/fixtures/first-issue/manifest.json", import.meta.url),
    "utf8"
  )
) as {
  issue: {
    slug: string
    title: string
    summary: string
    publishedAt: string
    cover: { url: string }
    articleCount: number
  }
  sections: Array<{ articles: Array<{ slug: string }> }>
}

test("a mobile reader reaches an article shell from Home in two activations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await expect(page.getByRole("heading", { level: 1, name: /先閱讀/ })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://courtside.test/"
  )
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Courtside TW — 台灣籃球雜誌"
  )
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
  await expect(page.getByTestId("home-issue-link")).toHaveAttribute("href", "/issues/issue-2026-01")
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true)
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true
  )

  await page.getByTestId("home-issue-link").click()
  await expect(page).toHaveURL(/\/issues\/issue-2026-01$/)
  await expect(
    page.getByRole("heading", { level: 1, name: "主場開季：先把每一次進場讀完" })
  ).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://courtside.test/issues/issue-2026-01"
  )
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true)

  await page.getByTestId("article-link").first().click()
  await expect(page).toHaveURL(/\/articles\/opening-night\?issue=issue-2026-01$/)
  await expect(page.getByTestId("article-header")).toBeVisible()

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})

test("the first issue completes Home to Issue to TOC to Article to Closure", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await expect(page.getByTestId("home-issue-link")).toHaveAttribute(
    "href",
    `/issues/${firstIssueFixture.issue.slug}`
  )
  await page.getByTestId("home-issue-link").click()

  await expect(page).toHaveURL(new RegExp(`/issues/${firstIssueFixture.issue.slug}$`))
  await expect(
    page.getByRole("heading", { level: 1, name: firstIssueFixture.issue.title })
  ).toBeVisible()
  await expect(page.getByTestId("issue-toc")).toBeVisible()
  await expect(page.getByTestId("article-link")).toHaveCount(firstIssueFixture.issue.articleCount)

  const firstArticleSlug = firstIssueFixture.sections[0]?.articles[0]?.slug
  if (!firstArticleSlug) throw new Error("first issue seed has no opening article")
  await page.getByTestId("article-link").first().click()

  await expect(page).toHaveURL(
    new RegExp(`/articles/${firstArticleSlug}\\?issue=${firstIssueFixture.issue.slug}$`)
  )
  await expect(page.getByTestId("article-document")).toBeVisible()
  await expect(page.getByTestId("article-toc")).toBeVisible()
  await expect(page.getByTestId("article-return-issue-toc")).toHaveAttribute(
    "href",
    `/issues/${firstIssueFixture.issue.slug}#toc`
  )
  await expect(page.getByTestId("article-next")).toHaveAttribute("href", /courtside-notes/)
  await expect(page.getByTestId("article-media-attribution").first()).toBeVisible()
})

test("issue SEO binds SSR Open Graph, structured data and sitemap to the public issue", async ({
  browser,
  request
}) => {
  const issue = firstIssueFixture.issue
  const issuePath = `/issues/${issue.slug}`
  const canonical = `https://courtside.test${issuePath}`
  const image = `http://127.0.0.1:4010${issue.cover.url}`
  const context = await browser.newContext({ javaScriptEnabled: false })

  try {
    const page = await context.newPage()
    const response = await page.goto(`http://127.0.0.1:4173${issuePath}`, {
      waitUntil: "domcontentloaded"
    })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1, name: issue.title })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical)

    const openGraph = {
      title: `${issue.title} — Courtside TW`,
      description: issue.summary,
      type: "article",
      url: canonical,
      image
    }
    for (const [property, value] of Object.entries(openGraph)) {
      await expect(page.locator(`meta[property="og:${property}"]`)).toHaveAttribute(
        "content",
        value
      )
    }

    const structuredDataElement = page.locator('script[type="application/ld+json"]')
    await expect(structuredDataElement).toHaveCount(1)
    const structuredData = JSON.parse((await structuredDataElement.textContent()) ?? "null")
    expect(structuredData).toEqual({
      "@context": "https://schema.org",
      "@type": "Magazine",
      name: issue.title,
      description: issue.summary,
      datePublished: issue.publishedAt,
      image,
      url: canonical,
      inLanguage: "zh-Hant-TW"
    })

    const sitemap = await request.get("/sitemap.xml")
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain(`<loc>${canonical}</loc>`)
  } finally {
    await context.close()
  }
})

test("reader links remain available in SSR output without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce"
  })
  const page = await context.newPage()

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("home-issue-link")).toHaveAttribute("href", "/issues/issue-2026-01")

  await page.getByTestId("home-issue-link").click()
  await expect(page.getByTestId("article-link").first()).toHaveAttribute(
    "href",
    "/articles/opening-night?issue=issue-2026-01"
  )
  await page.getByTestId("article-link").first().click()
  await expect(page.getByTestId("article-header")).toBeVisible()

  await context.close()
})

test("robots and sitemap expose only the public reading surface", async ({ request }) => {
  const robots = await request.get("/robots.txt")
  const robotsText = await robots.text()
  expect(robotsText).toContain("Sitemap: https://courtside.test/sitemap.xml")
  expect(robotsText).toContain("Disallow: /api/")
  expect(robotsText).not.toContain("Disallow: /articles/")

  const sitemap = await request.get("/sitemap.xml")
  const sitemapText = await sitemap.text()
  expect(sitemap.headers()["cache-control"]).toBe("public, max-age=30, must-revalidate")
  expect(sitemapText).toContain("<loc>https://courtside.test/issues/issue-2026-01</loc>")
  expect(sitemapText).toContain("<loc>https://courtside.test/articles/opening-night</loc>")
  expect(sitemapText).toContain("<loc>https://courtside.test/articles/courtside-notes</loc>")
  expect(sitemapText).toContain("<loc>https://courtside.test/issues/issue-2025-12</loc>")
  expect(sitemapText).toContain(
    "<loc>https://courtside.test/articles/archived-courtside-story</loc>"
  )
  expect(sitemapText).not.toContain("wallet")
  expect(sitemapText).not.toContain("passport")
})
