import { expect, test } from "@playwright/test"

/**
 * This uses the same browser OIDC code flow and BFF as the app. The local
 * server fixture supplies deterministic API state so CI executes the workflow
 * without production credentials or a database.
 */
test.describe("US3 Studio editor/publisher workflow", () => {
  const seededArticleId = "00000000-0000-4000-8000-000000000201"
  const seededIssueId = "0190f7b0-7c4b-7e3a-8f12-123456789abc"

  async function resetFixture(page, state) {
    const response = await page.request.post(
      `http://127.0.0.1:4010/test/studio/reset?state=${state}`
    )
    expect(response.ok()).toBeTruthy()
  }

  async function loginStudio(page, returnTo) {
    await page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
      waitUntil: "domcontentloaded"
    })
  }

  test("editor conflict preserves a revision while publisher sees the rights gate", async ({
    page
  }) => {
    await resetFixture(page, "DRAFT")
    await loginStudio(page, `/studio/articles/${seededArticleId}?role=EDITOR`)
    await page.goto(`/studio/articles/${seededArticleId}?role=EDITOR`, {
      waitUntil: "domcontentloaded"
    })

    await expect(page.getByRole("heading", { name: /文章編輯|Article editor/i })).toBeVisible()
    await page.getByRole("textbox", { name: /標題|title/i }).fill("T044 revision A")
    await page.getByRole("button", { name: "儲存 Save", exact: true }).click()
    await expect(page.getByText(/已保存 revision|saved revision/i)).toBeVisible()
    await page.getByRole("button", { name: /送出審核|submit/i }).click()
    await expect(page.locator(".studio-action-result")).toContainText(/已送出 review|review/i)

    await page.goto(`/studio/review/${seededArticleId}?role=PUBLISHER`, {
      waitUntil: "domcontentloaded"
    })
    await expect(page.getByText(new RegExp(seededArticleId))).toBeVisible()
    await expect(page.getByText(/Publication readiness|發布檢查/i)).toBeVisible()
  })

  test("editor persists an accessible keyboard section reorder", async ({ page }) => {
    await resetFixture(page, "DRAFT")
    await loginStudio(page, `/studio/issues/${seededIssueId}`)
    await page.goto(`/studio/issues/${seededIssueId}`, { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("heading", { name: /期數編輯|Issue editor/i })).toBeVisible()
    const rows = page.locator('ol[aria-label="可排序的期數章節"] > li')
    await expect(rows).toHaveCount(2)
    await rows.nth(1).focus()
    await rows.nth(1).press("ArrowUp")

    await expect(rows.nth(0).getByRole("textbox")).toHaveValue("場邊觀察")
    await expect(page.getByText(/章節變更已保存/)).toBeVisible()
  })

  test("publisher retry is idempotent and schedules Asia/Taipei without losing revision", async ({
    page
  }) => {
    await resetFixture(page, "APPROVED")
    await loginStudio(page, `/studio/review/${seededArticleId}?role=PUBLISHER`)
    await page.goto(`/studio/review/${seededArticleId}?role=PUBLISHER`, {
      waitUntil: "domcontentloaded"
    })

    await expect(page.locator(".studio-workflow-result strong")).toHaveText(
      /已核准 · revision \d+/i
    )
    await page.getByRole("button", { name: /排程|schedule/i }).click()
    await page.getByLabel(/時區|timezone/i).selectOption("Asia/Taipei")
    await page.getByLabel(/發布時間|publish at/i).fill("2026-08-11T09:00")
    await page.getByRole("button", { name: /確認排程|confirm schedule/i }).click()

    await expect(page.locator(".studio-action-result")).toContainText(/UTC/)
    await page.getByRole("button", { name: /重試|retry/i }).click()
    await expect(page.locator(".studio-workflow-result strong")).toHaveText(
      /已排程 · revision \d+|SCHEDULED · revision \d+/i
    )
  })

  test("publisher can perform an auditable emergency withdrawal", async ({ page }) => {
    await resetFixture(page, "PUBLISHED")
    await loginStudio(page, `/studio/review/${seededArticleId}?role=PUBLISHER`)
    await page.goto(`/studio/review/${seededArticleId}?role=PUBLISHER`, {
      waitUntil: "domcontentloaded"
    })

    await page.getByRole("button", { name: /撤回|withdraw/i }).click()
    await page.getByLabel(/原因|reason/i).fill("rights revoked by owner")
    await page.getByRole("button", { name: /確認撤回|confirm withdrawal/i }).click()

    await expect(page.locator(".studio-workflow-result strong")).toHaveText(
      /已撤回 · revision \d+|WITHDRAWN · revision \d+/i
    )
    await page.getByRole("link", { name: /稽核|audit/i }).click()
    await expect(page.getByText("ARTICLE_WITHDRAWN")).toBeVisible()
  })
})
