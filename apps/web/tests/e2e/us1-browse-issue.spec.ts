import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

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
  expect(robotsText).toContain("Disallow: /articles/")

  const sitemap = await request.get("/sitemap.xml")
  const sitemapText = await sitemap.text()
  expect(sitemapText).toContain("<loc>https://courtside.test/issues/issue-2026-01</loc>")
  expect(sitemapText).not.toContain("wallet")
  expect(sitemapText).not.toContain("passport")
})
