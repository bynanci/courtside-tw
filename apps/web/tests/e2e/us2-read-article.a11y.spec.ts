import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const articlePath = "/articles/opening-night?issue=issue-2026-01"

test("public article has no serious WCAG 2.2 AA axe violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(articlePath, { waitUntil: "domcontentloaded" })

  await expect(page.getByTestId("article-document")).toBeVisible()
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const blockers = report.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  )

  expect(blockers).toEqual([])
})

test("article SEO, keyboard controls and media geometry survive progressive enhancement", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(articlePath, { waitUntil: "domcontentloaded" })

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://courtside.test/articles/opening-night"
  )
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article")
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://courtside.test/articles/opening-night"
  )
  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}"
  ) as { "@type"?: string; author?: unknown }
  expect(structuredData["@type"]).toBe("Article")
  expect(structuredData.author).toEqual([
    { "@type": "Person", name: "Courtside TW 主筆" }
  ])

  const controls = [
    page.getByTestId("article-share"),
    page.getByTestId("article-issue-link"),
    page.getByTestId("article-next")
  ]
  for (const control of controls) {
    await control.focus()
    await expect(control).toBeFocused()
    await expect
      .poll(() => control.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none")
  }

  const unstableMedia = await page
    .locator('[data-testid="article-document"] img')
    .evaluateAll((images) =>
      images.flatMap((image) => {
        const width = Number(image.getAttribute("width"))
        const height = Number(image.getAttribute("height"))
        const aspectRatio = getComputedStyle(image).aspectRatio
        return width > 0 && height > 0 || (aspectRatio !== "auto" && aspectRatio !== "")
          ? []
          : [image.getAttribute("src") ?? "unknown"]
      })
    )
  expect(unstableMedia).toEqual([])
})

test("unavailable public article remains an accessible recovery state", async ({ page }) => {
  await page.goto("/articles/withdrawn-article?issue=issue-2026-01", {
    waitUntil: "domcontentloaded"
  })

  await expect(page.getByTestId("article-error-state")).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: "找不到這篇文章" })).toBeVisible()
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(
    report.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([])
})
