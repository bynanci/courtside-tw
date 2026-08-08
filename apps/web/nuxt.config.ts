export default defineNuxtConfig({
  ssr: true,
  devtools: { enabled: false },
  future: { compatibilityVersion: 4 },
  typescript: { strict: true },
  runtimeConfig: {
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
  app: {
    head: {
      htmlAttrs: { lang: "zh-Hant-TW" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content: "Courtside TW 台灣籃球數位雜誌的 SSR 起始頁。"
        }
      ]
    }
  }
})
