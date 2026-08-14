import { expect, test } from "@playwright/test"

test("editor manages UUID-keyed taxonomy names and aliases through the Studio BFF", async ({
  page
}) => {
  const reset = await page.request.post("http://127.0.0.1:4010/test/studio/reset?state=DRAFT")
  expect(reset.ok()).toBeTruthy()

  await page.goto(`/auth/login?returnTo=${encodeURIComponent("/studio/taxonomy")}`, {
    waitUntil: "domcontentloaded"
  })
  await page.goto("/studio/taxonomy", { waitUntil: "domcontentloaded" })

  await expect(page.getByRole("heading", { level: 1, name: "Taxonomy management" })).toBeVisible()
  await page.getByLabel("Immutable key").fill("league-plg")
  await page.getByLabel("Display name").first().fill("台灣職籃")
  await page.getByLabel("Kind").first().selectOption("LEAGUE")
  await page.getByRole("button", { name: "建立 term" }).click()

  await expect(page.getByText(/已建立 league-plg/)).toBeVisible()
  await expect(page.getByText(/league-plg · ACTIVE · v0/)).toBeVisible()

  await page.getByLabel("New alias").fill("P+ League")
  await page.getByLabel("Alias locale").fill("en")
  await page.getByRole("button", { name: "新增 alias" }).click()

  await expect(page.getByText("P+ League")).toBeVisible()
  await expect(page.getByText("p league")).toBeVisible()
})
