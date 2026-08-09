import { defineConfig } from "@playwright/test"

const webPort = 4173

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI
    ? [["html", { outputFolder: "test-results/html", open: "never" }], ["list"]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:" + webPort,
    viewport: { width: 375, height: 812 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node tests/e2e/start-server.mjs",
    url: "http://127.0.0.1:" + webPort,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
