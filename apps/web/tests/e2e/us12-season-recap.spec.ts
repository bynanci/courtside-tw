import { expect, test } from "@playwright/test"

const recapPath = "/articles/season-recap?issue=issue-2026-01"
const summary = "測試賽季的公開訊號：0.25、0.5、0.75；資料截至 2026-08-01。"

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:4010/__test/recap/withdraw", { data: { withdrawn: false } })
})

test("recap has a complete anonymous SSR poster and summary with JavaScript disabled", async ({
  browser
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const response = await page.goto("http://127.0.0.1:4173" + recapPath)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole("heading", { name: "賽季回顧", exact: true })).toBeVisible()
  await expect(page.getByTestId("generative-poster")).toContainText(summary)
  await expect(page.getByTestId("generative-poster-image")).toHaveAttribute(
    "alt",
    "賽季公開資料的三段視覺摘要"
  )
  await expect(page.locator("canvas")).toHaveCount(0)
  await context.close()
})

test("reduced motion retains complete recap fallback without loading p5", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => requests.push(new URL(request.url()).pathname))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(recapPath, { waitUntil: "networkidle" })
  await expect(page.getByTestId("generative-poster")).toContainText(summary)
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  expect(requests.some((url) => /p5(?:-court-runtime)?[.-]/u.test(url))).toBe(false)
})

test("explicit recap enhancement uses local preset and disposes its canvas on route change", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(recapPath, { waitUntil: "networkidle" })
  await page.getByTestId("creative-enable").click()
  await page.getByTestId("generative-canvas").scrollIntoViewIfNeeded()
  await expect(page.locator("canvas")).toHaveCount(1)
  await expect(page.getByTestId("generative-poster")).toContainText(summary)
  await page.getByTestId("article-next").click()
  await expect(page).toHaveURL(/\/articles\/courtside-notes/u)
  await expect(page.locator("canvas")).toHaveCount(0)
  await expect(page.getByTestId("creative-runtime")).toHaveCount(0)
  await expect(page.getByTestId("article-document")).toBeVisible()
})

test("withdrawal denies the recap after reload while an ordinary article stays readable", async ({
  page,
  request
}) => {
  await page.goto(recapPath, { waitUntil: "networkidle" })
  await expect(page.getByTestId("generative-poster")).toContainText(summary)
  await request.post("http://127.0.0.1:4010/__test/recap/withdraw", { data: { withdrawn: true } })
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("article-error-state")).toBeVisible()
  await expect(page.getByTestId("generative-poster")).toHaveCount(0)
  await expect(page.locator("canvas")).toHaveCount(0)
  await page.goto("/articles/courtside-notes?issue=issue-2026-01")
  await expect(page.getByTestId("article-document")).toBeVisible()
})
