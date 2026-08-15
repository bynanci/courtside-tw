import { expect, test } from "@playwright/test"

test("verified account deletion clears server library data and local progress", async ({
  page,
  request
}) => {
  const reset = await request.post("http://127.0.0.1:4010/test/reader-library/reset")
  expect(reset.ok()).toBeTruthy()

  await page.addInitScript(() => {
    localStorage.setItem(
      "courtside.reader.progress:v1:index:0190f7b0-7c4b-7e3a-8f12-123456789abd",
      "courtside.reader.progress:v1:record:fixture"
    )
    localStorage.setItem("unrelated.preference", "preserve-me")
  })

  await page.goto("/auth/login?returnTo=%2Fsettings%2Fprivacy")
  await page.goto("/settings/privacy", { waitUntil: "domcontentloaded" })
  await page.getByLabel(/確認刪除|confirm deletion/i).check()
  await page.getByRole("button", { name: /刪除帳號|delete account/i }).click()

  await expect(page.getByTestId("account-deletion-status")).toContainText(/完成|completed/i)
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith("courtside.reader.progress:"))
      )
    )
    .toEqual([])
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("unrelated.preference")))
    .toBe("preserve-me")

  const state = await request.get("http://127.0.0.1:4010/test/reader-library/state")
  expect(await state.json()).toMatchObject({ bookmarks: 0, progress: 0, identifiableProfiles: 0 })
})
