import { expect, test, type Page } from "@playwright/test"

const ISSUE = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const STAMP = "0190f7b0-7c4b-7e3a-8f12-123456789acd"
const stamp = {
  id: STAMP,
  season: "2026",
  credentialType: "READER_STAMP",
  status: "CLAIMED",
  issuedAt: "2026-09-12T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  version: 0
}
async function session(page: Page, authenticated = true) {
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      json: { authenticated, roles: authenticated ? ["READER"] : [] }
    })
  )
}
async function catalog(page: Page) {
  await page.route("**/api/v1/public/issues?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            issueId: ISSUE,
            slug: "issue-2026-01",
            title: "場邊誌測試期",
            publishedAt: "2026-08-01T00:00:00Z"
          }
        ],
        page: { nextCursor: null, limit: 20 }
      }
    })
  )
}

test("OIDC reader without a wallet explicitly claims and reloads a private stamp", async ({
  page
}) => {
  await session(page)
  await catalog(page)
  let claimed = false
  let writes = 0
  await page.route("**/api/reader/me/passport", (route) =>
    route.fulfill({ json: { items: claimed ? [stamp] : [], wallets: [] } })
  )
  await page.route("**/api/reader/me/passport/claims", async (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({ issueId: ISSUE, season: "2026" })
    expect(route.request().headers()["idempotency-key"]).toBeTruthy()
    claimed = true
    await route.fulfill({ json: stamp })
  })
  await page.goto("/settings/privacy")
  await expect(page.getByRole("heading", { name: "我的賽季護照" })).toBeVisible()
  expect(writes).toBe(0)
  await page.getByLabel("選擇已閱讀的期數").selectOption(ISSUE)
  await expect(page.getByRole("button", { name: "確認並申請領取" })).toBeDisabled()
  await page.getByLabel("我同意核對這一期的閱讀完成紀錄，並將印章保存在我的帳號").check()
  await page.getByRole("button", { name: "確認並申請領取" }).click()
  await expect(page.getByTestId("passport-claim-result")).toContainText("已領取")
  await expect(page.getByTestId("reader-stamp")).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId("reader-stamp")).toHaveCount(1)
  expect(writes).toBe(1)
  expect(
    await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) =>
        /passport|stamp/iu.test(key)
      )
    )
  ).toEqual([])
})

test("uncertain claim response retries one command and never displays fabricated success", async ({
  page
}) => {
  await session(page)
  await catalog(page)
  const keys: string[] = []
  await page.route("**/api/reader/me/passport", (route) =>
    route.fulfill({ json: { items: [], wallets: [] } })
  )
  await page.route("**/api/reader/me/passport/claims", (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "")
    return keys.length === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: stamp })
  })
  await page.goto("/settings/privacy")
  await page.getByLabel("選擇已閱讀的期數").selectOption(ISSUE)
  await page.getByLabel("我同意核對這一期的閱讀完成紀錄，並將印章保存在我的帳號").check()
  await page.getByRole("button", { name: "確認並申請領取" }).click()
  await expect(page.getByTestId("reader-passport").getByRole("alert")).toContainText("重試")
  await expect(page.getByTestId("reader-stamp")).toHaveCount(0)
  await page.getByRole("button", { name: "重試這次領取" }).click()
  await expect(page.getByTestId("reader-stamp")).toHaveCount(1)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})

test("refresh presents withdrawal supersession and expiry, then session expiry clears private data", async ({
  page
}) => {
  await session(page)
  await catalog(page)
  let expired = false
  await page.route("**/api/reader/me/passport", (route) =>
    expired
      ? route.fulfill({ status: 401 })
      : route.fulfill({
          json: {
            items: ["REVOKED", "SUPERSEDED", "EXPIRED"].map((status, index) => ({
              ...stamp,
              id: "0190f7b0-7c4b-7e3a-8f12-123456789ac" + index,
              status
            })),
            wallets: []
          }
        })
  )
  await page.goto("/settings/privacy")
  await expect(page.getByTestId("reader-stamp")).toHaveCount(3)
  for (const label of ["已撤銷", "已由新版取代", "已到期"])
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  expired = true
  await page.getByRole("button", { name: "重新整理護照" }).click()
  await expect(page.getByTestId("reader-stamp")).toHaveCount(0)
  await expect(
    page.getByTestId("reader-passport").getByRole("link", { name: "重新登入" })
  ).toBeVisible()
})

test("anonymous settings and public articles never claim or require a passport", async ({
  page
}) => {
  await session(page, false)
  let privateRequests = 0
  await page.route("**/api/reader/**", (route) => {
    privateRequests++
    return route.fulfill({ status: 401 })
  })
  await page.goto("/settings/privacy")
  await expect(page.getByTestId("reader-passport")).toHaveCount(0)
  await page.goto("/articles/opening-night")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("主場燈光亮起之前")
  await expect(page.getByTestId("article-completion")).toHaveCount(0)
  expect(privateRequests).toBe(0)
})

test("article completion requires an explicit click and uses current revision and final real block", async ({
  page
}) => {
  await session(page)
  const complete: unknown[] = []
  await page.route("**/api/reader/api/v1/me/progress/*", (route) => {
    const body = route.request().postDataJSON() as { percent: number }
    if (body.percent === 100) complete.push(body)
    return route.fulfill({
      json: {
        articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abe",
        ...body,
        updatedAt: new Date().toISOString()
      }
    })
  })
  await page.goto("/articles/courtside-notes?issue=issue-2026-01")
  await page.getByTestId("article-completion").scrollIntoViewIfNeeded()
  expect(complete).toHaveLength(0)
  await page.getByRole("button", { name: "確認本篇閱讀完成" }).click()
  await expect(page.getByRole("button", { name: "本篇已確認完成" })).toBeDisabled()
  expect(complete).toEqual([
    {
      revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab2",
      blockId: "00000000-0000-4000-8000-000000000101",
      percent: 100
    }
  ])
  await expect(page.getByRole("link", { name: "查看我的賽季護照" })).toHaveAttribute(
    "href",
    "/settings/privacy"
  )
})
