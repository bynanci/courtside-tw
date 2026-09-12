import { expect, test, type Page } from "@playwright/test"

const ADDRESS = "0x0000000000000000000000000000000000000001"

async function fakeWallet(page: Page, errorCode?: number) {
  await page.addInitScript(
    ({ address, error }) => {
      const methods: string[] = []
      const listeners = new Map<string, (value: unknown) => void>()
      Object.assign(window, {
        ethereum: {
          async request({ method }: { method: string }) {
            methods.push(method)
            if (error) throw Object.assign(new Error("Injected provider failure"), { code: error })
            if (method === "eth_chainId") return "0x1"
            if (method === "personal_sign") return `0x${"11".repeat(65)}`
            return [address]
          },
          on(event: string, listener: (value: unknown) => void) {
            listeners.set(event, listener)
          },
          removeListener(event: string) {
            listeners.delete(event)
          }
        },
        walletTest: {
          methods,
          emit(event: string) {
            listeners.get(event)?.([])
          }
        }
      })
    },
    { address: ADDRESS, error: errorCode }
  )
}

async function privateApi(page: Page) {
  let linked = false
  let verifyCount = 0
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { authenticated: true, roles: ["READER"] } })
  )
  await page.route("**/api/reader/me/passport", (route) =>
    route.fulfill({
      json: {
        wallets: linked
          ? [{ chainNamespace: "eip155", address: ADDRESS, linkedAt: new Date().toISOString() }]
          : []
      }
    })
  )
  await page.route("**/api/reader/auth/siwe/challenge", async (route) => {
    const input = route.request().postDataJSON() as {
      domain: string
      address: string
      chainId: string
      uri: string
    }
    const now = new Date()
    const expires = new Date(now.getTime() + 300_000).toISOString()
    const message = `${input.domain} wants you to sign in with your Ethereum account:\n${input.address}\n\nLink this wallet to your Courtside reader profile.\n\nURI: ${input.uri}\nVersion: 1\nChain ID: ${input.chainId.slice(7)}\nNonce: 0123456789abcdef\nIssued At: ${now.toISOString()}\nExpiration Time: ${expires}`
    await route.fulfill({
      json: {
        nonce: "0123456789abcdef",
        domain: input.domain,
        chainId: input.chainId,
        expiresAt: expires,
        message
      }
    })
  })
  await page.route("**/api/reader/auth/siwe/verify", (route) => {
    linked = true
    verifyCount += 1
    return route.fulfill({ json: { verified: true, sessionLinked: true } })
  })
  await page.route("**/api/reader/me/wallets/**", (route) => {
    linked = false
    return route.fulfill({ status: 204 })
  })
  return {
    get verifyCount() {
      return verifyCount
    }
  }
}

test("anonymous origin reading does not request a failed wallet or provenance provider", async ({
  page
}) => {
  await fakeWallet(page, 4900)
  let optionalRequests = 0
  await page.route(/\/(?:auth\/siwe|provenance)(?:\/|$)/u, (route) => {
    optionalRequests += 1
    return route.fulfill({ status: 503 })
  })
  await page.goto("/articles/opening-night")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("主場燈光亮起之前")
  await expect(page.getByTestId("wallet-settings")).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as unknown as { walletTest: { methods: string[] } }).walletTest.methods
    )
  ).toEqual([])
  expect(optionalRequests).toBe(0)
})

test.describe("explicitly enabled private wallet settings", () => {
  test.skip(
    process.env.COURTSIDE_WALLET_E2E !== "1",
    "Run with playwright.wallet.config.ts to enable the isolated optional feature."
  )

  test("connect, separate consent, link and post-reload unlink preserve OIDC reading", async ({
    page
  }) => {
    await fakeWallet(page)
    const api = await privateApi(page)
    await page.goto("/settings/privacy")
    await expect(page.getByRole("heading", { name: "選擇是否連結錢包" })).toBeVisible()
    expect(
      await page.evaluate(
        () => (window as unknown as { walletTest: { methods: string[] } }).walletTest.methods
      )
    ).toEqual([])
    await page.getByRole("button", { name: "選擇錢包並連結" }).click()
    await expect(page.getByRole("heading", { name: "確認這次簽章" })).toBeVisible()
    await expect(page.getByRole("button", { name: "開啟錢包並簽章" })).toBeDisabled()
    await page.getByLabel("我同意將這個錢包地址連結至我的讀者帳號").check()
    await page.getByRole("button", { name: "開啟錢包並簽章" }).click()
    await expect(page.getByRole("status").filter({ hasText: "錢包已連結" })).toBeVisible()
    expect(api.verifyCount).toBe(1)
    expect(
      await page.evaluate(() =>
        [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) =>
          /wallet|siwe|address|signature/iu.test(key)
        )
      )
    ).toEqual([])
    await page.reload()
    await expect(page.getByText(ADDRESS, { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => (window as unknown as { walletTest: { methods: string[] } }).walletTest.methods
      )
    ).toEqual([])
    await page.getByRole("button", { name: /^解除錢包/u }).click()
    await page.getByRole("button", { name: "確認解除連結", exact: true }).click()
    await expect(page.getByText("目前沒有已連結錢包。")).toBeVisible()
    await expect(page.getByRole("button", { name: "下載資料" })).toBeVisible()
    await page.goto("/articles/opening-night")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("主場燈光亮起之前")
  })

  test("account change invalidates consent and never signs the previous account", async ({
    page
  }) => {
    await fakeWallet(page)
    await privateApi(page)
    await page.goto("/settings/privacy")
    await page.getByRole("button", { name: "選擇錢包並連結" }).click()
    await expect(page.getByRole("heading", { name: "確認這次簽章" })).toBeVisible()
    await page.evaluate(() =>
      (window as unknown as { walletTest: { emit(event: string): void } }).walletTest.emit(
        "accountsChanged"
      )
    )
    await expect(page.getByRole("alert")).toContainText("已變更")
    await expect(page.getByRole("button", { name: "開啟錢包並簽章" })).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        (window as unknown as { walletTest: { methods: string[] } }).walletTest.methods.includes(
          "personal_sign"
        )
      )
    ).toBe(false)
  })

  for (const error of [4001, 4100, 4900, 4901]) {
    test(`provider failure ${error} leaves private account tools and public reading usable`, async ({
      page
    }) => {
      await fakeWallet(page, error)
      await privateApi(page)
      await page.goto("/settings/privacy")
      await page.getByRole("button", { name: "選擇錢包並連結" }).click()
      await expect(page.getByRole("alert")).toBeVisible()
      await expect(page.getByRole("button", { name: "下載資料" })).toBeVisible()
      await page.goto("/articles/opening-night")
      await expect(page.getByRole("heading", { level: 1 })).toContainText("主場燈光亮起之前")
    })
  }
})
