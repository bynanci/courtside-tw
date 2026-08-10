import { expect, test, type Page, type Route } from "@playwright/test"

const ARTICLE_ID = "00000000-0000-4000-8000-000000000701"
const ISSUE_ID = "00000000-0000-4000-8000-000000000702"

test.describe("US3 Studio editorial publication", () => {
  test.beforeEach(async ({ page }) => {
    await installEditorialApiMock(page)
  })

  test("editor can create a revision, upload media and submit for review", async ({ page }) => {
    await page.goto("/studio?role=EDITOR", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("studio-shell")).toBeVisible()
    await expect(page.getByTestId("studio-shell")).toHaveAttribute("data-hydrated", "true")
    await expect(page.getByTestId("studio-role")).toContainText("EDITOR")
    await page.getByTestId("studio-new-article").click()
    await page.getByTestId("article-title").fill("主場燈光亮起之前")
    await page.getByTestId("article-content").fill("一段可預覽的文章內容。")
    await page.getByTestId("media-upload").setInputFiles({
      name: "court.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fixture")
    })
    await page.getByTestId("submit-for-review").click()
    await expect(page.getByTestId("media-upload-state")).toContainText("已驗證")
    await expect(page.getByTestId("workflow-status")).toContainText("待出版者審核")
  })

  test("publisher can approve, schedule in Asia/Taipei and withdraw a revision", async ({
    page
  }) => {
    await page.goto("/studio?role=PUBLISHER&articleId=" + ARTICLE_ID + "&issueId=" + ISSUE_ID, {
      waitUntil: "domcontentloaded"
    })

    await expect(page.getByTestId("studio-shell")).toBeVisible()
    await expect(page.getByTestId("studio-shell")).toHaveAttribute("data-hydrated", "true")
    await expect(page.getByTestId("studio-role")).toContainText("PUBLISHER")
    await page.getByTestId("publisher-approve").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已核准")
    await page.getByTestId("schedule-timezone").selectOption("Asia/Taipei")
    await page.getByTestId("publisher-schedule").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已排程")
    await page.getByTestId("publisher-publish").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已發布")
    await page.getByTestId("publisher-withdraw").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已撤回")
  })

  test("stale concurrent edit is shown as a recoverable conflict", async ({ page }) => {
    await page.goto("/studio?role=EDITOR", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("studio-shell")).toHaveAttribute("data-hydrated", "true")
    await page.getByTestId("studio-new-article").click()
    await page.getByTestId("article-title").fill("第一次修訂")
    await page.getByTestId("article-content").fill("第一次修訂內容。")
    await page.getByTestId("article-save").click()
    await expect(page.getByTestId("workflow-status")).toContainText("草稿已儲存")
    await page.getByTestId("article-title").fill("第二次修訂")
    await page.getByTestId("article-save").click()

    await expect(page.getByTestId("version-conflict")).toContainText("內容已被其他人更新")
    await expect(page.getByTestId("retry-save")).toBeVisible()
  })
})

async function installEditorialApiMock(page: Page): Promise<void> {
  await page.route("**/upload/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: ""
    })
  })
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4173",
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "Content-Type, Idempotency-Key, If-Match"
        }
      })
      return
    }

    if (request.method() === "POST" && requestUrl.pathname === "/api/v1/editor/articles") {
      await json(route, 201, {
        articleId: ARTICLE_ID,
        revisionId: "00000000-0000-4000-8000-000000000705",
        version: 1,
        title: "主場燈光亮起之前",
        slug: "studio-article",
        state: "DRAFT"
      })
      return
    }
    if (request.method() === "PATCH" && requestUrl.pathname === "/api/v1/editor/articles") {
      await json(route, 200, {
        articleId: ARTICLE_ID,
        revisionId: "00000000-0000-4000-8000-000000000706",
        version: 2,
        title: "第二次修訂",
        slug: "studio-article",
        state: "DRAFT"
      })
      return
    }
    if (request.method() === "POST" && requestUrl.pathname === "/api/v1/editor/media/uploads") {
      await json(route, 201, {
        assetId: "00000000-0000-4000-8000-000000000703",
        uploadUrl: "http://127.0.0.1:4010/upload/000000000703",
        expiresAt: "2026-08-10T02:00:00Z",
        maxSizeBytes: 52428800
      })
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/editor/media/00000000-0000-4000-8000-000000000703:complete"
    ) {
      await workflow(route, "ACCEPTED", 1)
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/editor/articles/" + ARTICLE_ID + ":submit"
    ) {
      await workflow(route, "ACCEPTED", 2)
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/publisher/articles/" + ARTICLE_ID + ":approve"
    ) {
      await workflow(route, "APPROVED", 2)
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/publisher/issues/" + ISSUE_ID + ":schedule"
    ) {
      await workflow(route, "SCHEDULED", 2)
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/publisher/issues/" + ISSUE_ID + ":publish"
    ) {
      await workflow(route, "PUBLISHED", 3)
      return
    }
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/v1/publisher/articles/" + ARTICLE_ID + ":withdraw"
    ) {
      await workflow(route, "WITHDRAWN", 3)
      return
    }
    await json(route, 404, {
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      detail: "unmocked editorial endpoint"
    })
  })
}

async function workflow(route: Route, status: string, version: number): Promise<void> {
  await json(route, 202, {
    operationId: "00000000-0000-4000-8000-000000000704",
    status,
    version
  })
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-credentials": "true"
    },
    body: JSON.stringify(body)
  })
}
