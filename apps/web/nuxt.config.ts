export default defineNuxtConfig({
  ssr: true,
  devtools: { enabled: false },
  future: { compatibilityVersion: 4 },
  typescript: { strict: true },
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
