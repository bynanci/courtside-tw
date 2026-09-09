import { expect, test } from "@playwright/test"

const assetId = "00000000-0000-4000-8000-000000000221"

for (const role of ["EDITOR", "PUBLISHER"] as const) {
  test(`${role} archives a library entry and can discover it with preview fallback`, async ({
    page
  }) => {
    const scope = role === "EDITOR" ? "editor" : "publisher"
    let archivedAt: string | null = null
    let version = 3
    let archiveCalls = 0
    await page.route("**/auth/session", (route) =>
      route.fulfill({ json: { authenticated: true, roles: [role] } })
    )
    await page.route("**/auth/csrf", (route) =>
      route.fulfill({ json: { csrfToken: "archive-ui-fixture" } })
    )
    await page.route(`**/api/studio/api/v1/${scope}/media**`, async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith(":archive")) {
        expect(route.request().method()).toBe("POST")
        expect(route.request().headers()["if-match"]).toBe('"3"')
        archiveCalls++
        archivedAt = "2026-09-09T00:00:00Z"
        version++
        await route.fulfill({ json: { assetId, version, archivedAt } })
      } else if (url.pathname.endsWith("/preview")) {
        await route.fulfill({ status: 503, json: { code: "MEDIA_PREVIEW_UNAVAILABLE" } })
      } else if (url.pathname.endsWith(`/${assetId}`)) {
        await route.fulfill({
          json: { assetId, version, altText: "已出版球場照片", state: "READY", rights: null }
        })
      } else {
        const visible = (url.searchParams.get("archived") === "true") === Boolean(archivedAt)
        await route.fulfill({
          json: {
            items: visible
              ? [
                  {
                    assetId,
                    version,
                    archivedAt,
                    mimeType: "image/jpeg",
                    processingState: "READY",
                    altText: "已出版球場照片",
                    width: 10,
                    height: 10
                  }
                ]
              : [],
            nextCursor: null
          }
        })
      }
    })
    await page.goto("/studio/media")
    const library = page.getByRole("region", { name: "媒體庫清單", exact: true })
    await library.getByRole("button", { name: /已出版球場照片/ }).click()
    await expect(library).toContainText("已出版球場照片；私人預覽目前無法顯示。")
    await library.getByRole("button", { name: "封存媒體", exact: true }).click()
    await expect(library).toContainText("已封存媒體。")
    await expect(library.getByRole("button", { name: /已出版球場照片/ })).toHaveCount(0)
    await library.getByRole("button", { name: "已封存", exact: true }).click()
    await library.getByRole("button", { name: /已出版球場照片/ }).click()
    await expect(library).toContainText("2026-09-09T00:00:00Z")
    await expect(library.getByRole("button", { name: "封存媒體", exact: true })).toHaveCount(0)
    expect(archiveCalls).toBe(1)
    if (role === "PUBLISHER")
      await expect(page.getByRole("button", { name: "保存 metadata" })).toHaveCount(0)
  })
}

test("archive conflict clears stale selection and refreshes current library version", async ({
  page
}) => {
  let version = 3
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { authenticated: true, roles: ["PUBLISHER"] } })
  )
  await page.route("**/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "archive-ui-fixture" } })
  )
  await page.route("**/api/studio/api/v1/publisher/media**", async (route) => {
    if (route.request().url().endsWith(":archive")) {
      version = 4
      await route.fulfill({
        status: 409,
        json: { title: "Version conflict", code: "VERSION_CONFLICT" }
      })
    } else {
      await route.fulfill({
        json: {
          items: [
            {
              assetId,
              version,
              archivedAt: null,
              mimeType: "image/jpeg",
              processingState: "FAILED",
              altText: "衝突照片",
              width: null,
              height: null
            }
          ],
          nextCursor: null
        }
      })
    }
  })
  await page.goto("/studio/media")
  const library = page.getByRole("region", { name: "媒體庫清單", exact: true })
  await library.getByRole("button", { name: /衝突照片/ }).click()
  await library.getByRole("button", { name: "封存媒體", exact: true }).click()
  await expect(library).toContainText("重新選取最新資料")
  await expect(library.getByRole("button", { name: "封存媒體", exact: true })).toHaveCount(0)
  await library.getByRole("button", { name: /衝突照片/ }).click()
  await expect(library).toContainText("版本 4")
})
