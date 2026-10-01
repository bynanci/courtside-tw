import { defineConfig } from "@playwright/test"
import base from "./playwright.config"

process.env.COURTSIDE_WALLET_E2E = "1"

export default defineConfig({
  ...base,
  testMatch: "**/us7-wallet-provenance.spec.ts",
  webServer: {
    ...(base.webServer as object),
    command: "node tests/e2e/start-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NUXT_PUBLIC_WEB3_WALLET_ENABLED: "true", NUXT_PUBLIC_WEB3_WALLET_CHAIN_ID: "eip155:1" }
  }
})
