import { expect, test, type Page } from "@playwright/test"

const articleId = "00000000-0000-4000-8000-000000000201"
const issueId = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const coverId = "00000000-0000-4000-8000-000000000203"
async function login(page: Page, path: string, state = "DRAFT", issueState = "") {
  expect(
    (
      await page.request.post(
        `http://127.0.0.1:4010/test/studio/reset?state=${state}&issueState=${issueState}`
      )
    ).ok()
  ).toBeTruthy()
  const loginPath = `/auth/login?returnTo=${encodeURIComponent(path)}`
  let response = await page.goto(loginPath)
  if (response?.status() === 429) {
    expect(await response.json()).toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      instance: "/auth/login"
    })
    const retryAfter = response.headers()["retry-after"]
    expect(retryAfter).toMatch(/^[1-9]\d?$/)
    const seconds = Number(retryAfter)
    expect(seconds).toBeGreaterThanOrEqual(1)
    expect(seconds).toBeLessThanOrEqual(60)
    test.setTimeout(Math.min(120_000, test.info().timeout + seconds * 1000))
    await test.info().attach("studio-login-rate-limit", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify({
          route: "/auth/login",
          status: 429,
          retryAfterSeconds: seconds,
          plannedRetries: 1
        })
      )
    })
    // Test contexts share the real socket quota. Honor one observed expiry.
    response = await test.step("Honor the observed login Retry-After once", async () => {
      await page.waitForTimeout(seconds * 1000)
      return page.goto(loginPath)
    })
  }
  expect(response?.ok()).toBe(true)
  // Verify the browser's Secure loopback cookies with its own fetch context.
  const session = await page.evaluate(async () => {
    const result = await fetch("/auth/session", { credentials: "same-origin" })
    return { status: result.status, body: await result.json() }
  })
  expect(session.status).toBe(200)
  expect(session.body).toMatchObject({ authenticated: true })
  await page.goto(path)
}
async function createContributor(page: Page, slug: string, name: string) {
  await page.getByLabel("作者網址代稱").fill(slug)
  await page.getByLabel("作者公開姓名").fill(name)
  await page.getByRole("button", { name: "建立作者", exact: true }).click()
  await expect(page.getByRole("main").getByRole("status")).toContainText("作者已建立")
}

test("editor creates article and issue drafts through their Studio forms", async ({ page }) => {
  await login(page, "/studio/articles")
  await page.getByLabel("新文章標題").fill("從工作台建立的文章")
  await page.getByLabel("文章網址代稱").fill("studio-created-article")
  await page.getByLabel("新文章導讀").fill("私人草稿導讀")
  const articleRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/v1/editor/articles")
  )
  await page.getByRole("button", { name: "建立文章草稿" }).click()
  expect((await articleRequest).headers()["idempotency-key"]).toBeTruthy()
  await expect(page.getByLabel("標題 Title")).toHaveValue("從工作台建立的文章")
  await page.getByRole("button", { name: "預覽文章", exact: true }).click()
  await expect(page.getByRole("region", { name: "私人文章預覽" })).toContainText("開始撰寫文章。")
  await page.goto("/studio/issues")
  await page.getByLabel("新期刊標題").fill("工作台創刊號")
  await page.getByLabel("期刊網址代稱").fill("studio-first-issue")
  await page.getByLabel("新期刊摘要").fill("期刊草稿摘要")
  await page.getByLabel("封面資產 ID").fill(coverId)
  await page.getByRole("button", { name: "建立期刊草稿" }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/issues/${issueId}$`))
  await expect(page.getByRole("textbox", { name: /期數標題|Title/ })).toHaveValue("工作台創刊號")
})

test("editor manages contributors and persists ordered bylines across reload and archive", async ({
  page
}) => {
  await login(page, "/studio/contributors")
  await createContributor(page, "author-one", "第一作者")
  await page.getByLabel("編輯公開姓名").fill("第一作者改名")
  await page.getByRole("button", { name: "儲存姓名" }).click()
  await expect(page.getByRole("main").getByRole("status")).toContainText("公開署名已更新")
  await createContributor(page, "photo-two", "第二攝影")
  await page.goto(`/studio/articles/${articleId}`)
  await page.getByLabel("選擇作者").selectOption({ label: "第一作者改名" })
  await page.getByRole("button", { name: "加入署名" }).click()
  await page.getByLabel("選擇作者").selectOption({ label: "第二攝影" })
  await page.getByLabel("署名角色").selectOption("PHOTOGRAPHER")
  await page.getByRole("button", { name: "加入署名" }).click()
  await page.getByRole("button", { name: "上移署名 第二攝影" }).click()
  const assignment = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith("/contributors")
  )
  await page.getByRole("button", { name: "儲存署名順序" }).click()
  expect((await assignment).headers()["if-match"]).toBe('"1"')
  await expect(page.getByText("署名與順序已儲存。", { exact: true })).toBeVisible()
  await page.reload()
  const credits = page.getByRole("list", { name: "已安排署名" }).getByRole("listitem")
  await expect(credits.nth(0)).toContainText("第二攝影")
  await expect(credits.nth(1)).toContainText("第一作者改名")
  await page.goto("/studio/contributors")
  await page.getByRole("button", { name: "第一作者改名", exact: true }).click()
  await page.getByLabel("編輯公開姓名").fill("不得覆寫的署名")
  await page.getByRole("button", { name: "儲存姓名" }).click()
  await expect(page.getByRole("alert")).toContainText("已用於文章署名的姓名會保留")
  await page.getByLabel("作者封存原因").fill("停止新增署名，保留既有作品。")
  await page.getByRole("button", { name: "確認封存作者" }).click()
  await expect(page.getByRole("main").getByRole("status")).toContainText("既有文章署名繼續保留")
  await page.goto(`/studio/articles/${articleId}`)
  await expect(page.getByRole("list", { name: "已安排署名" })).toContainText("第一作者改名")
  await expect(
    page.getByLabel("選擇作者").getByRole("option", { name: "第一作者改名" })
  ).toHaveCount(0)
})

test("private preview renders the shared blocks with authenticated image blobs and revokes URLs", async ({
  page
}) => {
  await login(page, `/studio/articles/${articleId}`)
  const response = await page.reload()
  expect(response?.headers()["cache-control"]).toContain("no-store")
  expect(response?.headers()["content-security-policy"]).toMatch(/img-src[^;]*blob:/)
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL.bind(URL)
    Reflect.set(window, "previewRevokedUrls", [])
    URL.revokeObjectURL = (url) => {
      Reflect.get(window, "previewRevokedUrls").push(url)
      revoke(url)
    }
  })
  await page.getByRole("button", { name: "預覽文章", exact: true }).click()
  const preview = page.getByRole("region", { name: "私人文章預覽" })
  await expect(preview.locator(".article-block")).toHaveCount(12)
  const image = preview.getByRole("img", { name: "球場在夜間燈光下的全景", exact: true })
  await expect(image).toHaveAttribute("src", /^blob:/)
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  const blobUrl = await image.getAttribute("src")
  await page.getByRole("button", { name: "關閉私人預覽" }).click()
  await expect(preview).toHaveCount(0)
  expect(
    await page.evaluate((url) => Reflect.get(window, "previewRevokedUrls").includes(url), blobUrl)
  ).toBe(true)
  const publicResponse = await page.request.get("/articles/opening-night")
  expect(publicResponse.headers()["content-security-policy"]).not.toContain("blob:")
})

test("preview keeps readable content when private media is unavailable", async ({ page }) => {
  await login(page, `/studio/articles/${articleId}`)
  await page.route("**/api/studio/api/v1/editor/media/*/preview", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ detail: "Private media provider unavailable" })
    })
  )
  await page.getByRole("button", { name: "預覽文章", exact: true }).click()
  const preview = page.getByRole("region", { name: "私人文章預覽" })
  await expect(preview).toContainText("目前無法取得私人預覽")
  await expect(preview.getByTestId("article-image-fallback")).toContainText(
    "球場在夜間燈光下的全景"
  )
  await expect(preview).toContainText("這是一份涵蓋台籃雜誌 MVP 內容區塊的固定 fixture。")
})

test("publisher archives an issue with its current server version", async ({ page }) => {
  await login(page, "/studio/review/issues", "PUBLISHED")
  await page.getByRole("button", { name: /^封存期刊 / }).click()
  const archive = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith(":archive")
  )
  await page.getByRole("button", { name: "確認封存期刊" }).click()
  expect((await archive).headers()["if-match"]).toBe('"1"')
  await expect(page.getByRole("main").getByRole("status")).toContainText("已封存")
  await page.reload()
  await expect(page.getByRole("region", { name: "Publisher 期刊清單" })).toContainText("ARCHIVED")
})

test("query role cannot grant contributor or publisher issue access", async ({ page }) => {
  await login(page, "/studio/articles")
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, roles: ["READER"] })
    })
  )
  await page.goto("/studio/contributors?role=EDITOR")
  await expect(page.getByRole("alert")).toContainText("需要 EDITOR role")
  await expect(page.getByRole("button", { name: "建立作者", exact: true })).toHaveCount(0)
  await page.goto("/studio/review/issues?role=PUBLISHER")
  await expect(page.getByRole("alert")).toContainText("需要 PUBLISHER role")
})

test("editor assigns a published article revision, submits an issue and publisher reviews its pinned TOC", async ({
  page
}) => {
  await login(page, `/studio/issues/${issueId}`, "PUBLISHED", "DRAFT")
  // Clearing a required field must not disable the field itself.
  const title = page.getByRole("textbox", { name: "期數標題 Title", exact: true })
  const originalTitle = await title.inputValue()
  await title.fill("")
  await expect(title).toBeEnabled()
  await title.fill(originalTitle)
  await page.getByLabel("文章所屬章節").selectOption({ label: "開場" })
  await page
    .getByRole("combobox", { name: "已發布文章", exact: true })
    .selectOption({ label: "Studio fixture article · r1" })
  const assignment = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith(`/issues/${issueId}/articles`)
  )
  await page.getByRole("button", { name: "加入期刊文章", exact: true }).click()
  const request = await assignment
  expect(request.headers()["if-match"]).toBe('"1"')
  expect(request.postDataJSON().articles[0].revisionId).toBe("00000000-0000-4000-8000-000000000202")
  await expect(page.getByRole("list", { name: "開場文章" })).toContainText("固定版本 r1")
  await page.reload()
  await expect(page.getByRole("list", { name: "開場文章" })).toContainText("Studio fixture article")
  await page.getByRole("button", { name: "送出期刊審核", exact: true }).click()
  await expect(
    page.getByText("期刊已送出審核，目錄與引用版本已凍結。", { exact: true })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "加入期刊文章", exact: true })).toBeDisabled()
  await page.goto("/studio/review/issues")
  await page.getByRole("button", { name: /^檢視期刊目錄 / }).click()
  await expect(page.getByLabel("期刊審閱目錄")).toContainText(
    "Studio fixture article · 固定版本 r1"
  )
  await page.getByRole("button", { name: "核准期刊", exact: true }).click()
  await expect(page.getByRole("main").getByRole("status")).toContainText("期刊已核准")
  await page.getByRole("button", { name: "立即發布期刊", exact: true }).click()
  await expect(page.getByRole("main").getByRole("status")).toContainText("期刊已發布")
})

test("newer section reads never relabel stale metadata with a writable issue version", async ({
  page
}) => {
  await login(page, "/studio/issues")
  await page.route(`**/api/studio/api/v1/editor/issues/${issueId}/sections`, async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    await route.fulfill({ response, json: { ...data, issueVersion: data.issueVersion + 1 } })
  })
  await page.goto(`/studio/issues/${issueId}`)
  await expect(page.getByText("期刊與章節的版本不同", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "保存期數 Save", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "送出期刊審核", exact: true })).toBeDisabled()
  await page.unroute(`**/api/studio/api/v1/editor/issues/${issueId}/sections`)
  await page.getByRole("button", { name: "重新讀取 Reload", exact: true }).click()
  await expect(page.getByRole("button", { name: "保存期數 Save", exact: true })).toBeEnabled()
})
