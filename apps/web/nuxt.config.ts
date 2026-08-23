import { removeCreativeRuntimePrefetch } from "./config/creative-resource-hints"

export default defineNuxtConfig({
  ssr: true,
  devtools: { enabled: false },
  future: { compatibilityVersion: 4 },
  typescript: { strict: true },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080",
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? "https://courtside.tw",
      offlineAppShell: {
        enabled: process.env.NUXT_PUBLIC_OFFLINE_APP_SHELL_ENABLED !== "false",
        scriptPath: "/offline-sw.js",
        scope: "/"
      },
      creative: {
        motion: {
          enabled: process.env.NUXT_PUBLIC_CREATIVE_MOTION_ENABLED !== "false",
          patterns: {
            route: process.env.NUXT_PUBLIC_CREATIVE_MOTION_ROUTE !== "false",
            issueCover: process.env.NUXT_PUBLIC_CREATIVE_MOTION_ISSUE_COVER !== "false",
            tocReveal: false,
            readingProgress: process.env.NUXT_PUBLIC_CREATIVE_MOTION_READING_PROGRESS !== "false",
            feedback: process.env.NUXT_PUBLIC_CREATIVE_MOTION_FEEDBACK !== "false"
          }
        }
      }
    },
    oidc: {
      issuer: "",
      authorizationEndpoint: "",
      tokenEndpoint: "",
      jwksUri: "",
      revocationEndpoint: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      scope: "openid profile email",
      sessionTtlSeconds: 900,
      transactionTtlSeconds: 300,
      allowInsecureHttp: false,
      sessionStore: "memory"
    }
  },
  css: ["~/assets/css/main.css", "~/assets/css/article.css"],
  nitro: {
    compressPublicAssets: true
  },
  hooks: {
    "build:manifest": removeCreativeRuntimePrefetch
  },
  app: {
    head: {
      htmlAttrs: { lang: "zh-Hant-TW" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "theme-color",
          content: "#f2eee5",
          media: "(prefers-color-scheme: light)"
        },
        {
          name: "theme-color",
          content: "#080808",
          media: "(prefers-color-scheme: dark)"
        },
        {
          name: "description",
          content: "Courtside TW 台灣籃球數位雜誌的 SSR 起始頁。"
        }
      ]
    }
  }
})
