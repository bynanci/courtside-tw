<script setup lang="ts">
import IssueCoverCard from "../../components/issues/IssueCoverCard.vue"
import ReadingState from "../../components/issues/ReadingState.vue"
import { canonicalUrl, jsonLd } from "../../composables/public-seo"
import { fetchPublicIssuePage } from "../../features/issues/public-issue-api"

const config = useRuntimeConfig()
const {
  data: page,
  error,
  pending
} = await useAsyncData("public-issue-index", () =>
  fetchPublicIssuePage(config.public.apiBaseUrl, 20)
)
const canonical = canonicalUrl(config.public.siteUrl, "/issues")

useHead(() => ({
  title: "所有期數 — Courtside TW",
  meta: [
    { name: "description", content: "依發布時間閱讀 Courtside TW 的公開台灣籃球期刊。" },
    { property: "og:title", content: "所有期數 — Courtside TW" },
    { property: "og:description", content: "依發布時間閱讀 Courtside TW 的公開台灣籃球期刊。" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical }
  ],
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      key: "courtside-issues-jsonld",
      type: "application/ld+json",
      innerHTML: jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Courtside TW 所有期數",
        url: canonical,
        inLanguage: "zh-Hant-TW"
      })
    }
  ]
}))
</script>

<template>
  <div class="site-page">
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/">首頁</NuxtLink>
        <NuxtLink to="/issues">所有期數</NuxtLink>
      </nav>
    </header>

    <main class="site-shell issue-index">
      <div class="page-intro">
        <p class="eyebrow">Magazine Archive</p>
        <h1>所有期數</h1>
        <p>只顯示已發布且使用權利仍有效的公開內容。</p>
      </div>

      <div v-if="page?.items.length" class="issue-grid" aria-label="公開期數">
        <IssueCoverCard v-for="issue in page.items" :key="issue.issueId" :issue="issue" />
      </div>
      <ReadingState
        v-else-if="error"
        tone="error"
        title="期數目錄暫時無法載入"
        body="請稍後重試。"
      />
      <ReadingState
        v-else-if="!pending"
        title="尚未有公開期數"
        body="完成發布與權利檢查的期數會出現在這裡。"
      />
    </main>
  </div>
</template>
