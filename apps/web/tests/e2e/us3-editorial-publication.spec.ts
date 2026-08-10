import { expect, test } from "@playwright/test"

test.describe("US3 Studio editorial publication", () => {
  test("editor can create a revision, upload media and submit for review", async ({ page }) => {
    await page.goto("/studio?role=EDITOR", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("studio-shell")).toBeVisible()
    await expect(page.getByTestId("studio-role")).toContainText("EDITOR")
    await page.getByTestId("studio-new-article").click()
    await page.getByTestId("article-title").fill("主場燈光亮起之前")
    await page.getByTestId("article-content").fill("一段可預覽的文章內容。")
    await page.getByTestId("media-upload").setInputFiles({
      name: "court.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fixture")
    })
    await expect(page.getByTestId("media-upload-state")).toContainText("已驗證")
    await page.getByTestId("submit-for-review").click()
    await expect(page.getByTestId("workflow-status")).toContainText("待出版者審核")
  })

  test("publisher can approve, schedule in Asia/Taipei and withdraw a revision", async ({ page }) => {
    await page.goto("/studio?role=PUBLISHER", { waitUntil: "domcontentloaded" })

    await expect(page.getByTestId("studio-shell")).toBeVisible()
    await expect(page.getByTestId("studio-role")).toContainText("PUBLISHER")
    await page.getByTestId("publisher-approve").click()
    await page.getByTestId("schedule-timezone").selectOption("Asia/Taipei")
    await page.getByTestId("publisher-schedule").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已排程")
    await page.getByTestId("publisher-withdraw").click()
    await expect(page.getByTestId("workflow-status")).toContainText("已撤回")
  })

  test("stale concurrent edit is shown as a recoverable conflict", async ({ page }) => {
    await page.goto("/studio?role=EDITOR", { waitUntil: "domcontentloaded" })

    await page.getByTestId("studio-new-article").click()
    await page.getByTestId("article-title").fill("第一次修訂")
    await page.getByTestId("article-save").click()
    await page.getByTestId("article-title").fill("第二次修訂")
    await page.getByTestId("article-save").click()

    await expect(page.getByTestId("version-conflict")).toContainText("內容已被其他人更新")
    await expect(page.getByTestId("retry-save")).toBeVisible()
  })
})
