<script setup lang="ts">
import IssueCoverCard from "../components/issues/IssueCoverCard.vue"
import ReadingState from "../components/issues/ReadingState.vue"
import { canonicalUrl, jsonLd } from "../composables/public-seo"
import { fetchPublicIssuePage } from "../features/issues/public-issue-api"

const config = useRuntimeConfig()
const {
  data: page,
  error,
  pending
} = await useAsyncData("public-home-issues", () =>
  fetchPublicIssuePage(config.public.apiBaseUrl, 20)
)
const featuredIssue = computed(
  () => page.value?.items.find((issue) => issue.articleCount > 0) ?? null
)
const canonical = canonicalUrl(config.public.siteUrl, "/")

useHead(() => ({
  title: "Courtside TW — 台灣籃球雜誌",
  meta: [
    { name: "description", content: "從本期封面開始，閱讀台灣籃球的場邊觀察。" },
    { property: "og:title", content: "Courtside TW — 台灣籃球雜誌" },
    { property: "og:description", content: "從本期封面開始，閱讀台灣籃球的場邊觀察。" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical }
  ],
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      key: "courtside-home-jsonld",
      type: "application/ld+json",
      innerHTML: jsonLd({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Courtside TW",
        url: canonical,
        inLanguage: "zh-Hant-TW"
      })
    }
  ]
}))
</script>

<template>
  <div class="site-page">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <header class="site-header">
      <NuxtLink to="/" class="site-brand" aria-label="Courtside TW 首頁">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/">首頁</NuxtLink>
        <NuxtLink to="/issues">所有期數</NuxtLink>
      </nav>
    </header>

    <main id="main-content" class="site-shell" tabindex="-1">
      <section class="home-hero" aria-labelledby="home-heading">
        <p class="eyebrow">Taiwan Hoops Magazine</p>
        <h1 id="home-heading">先閱讀，<br aria-hidden="true" />再決定你要記住什麼。</h1>
        <p class="home-hero__lede">
          Courtside TW 把每一期做成可直接閱讀的籃球雜誌；不需要登入、錢包或外部服務。
        </p>
        <NuxtLink to="/issues" class="button-link button-link--quiet">瀏覽所有期數</NuxtLink>
      </section>

      <section class="home-feature" aria-labelledby="featured-heading">
        <div class="section-heading">
          <p class="eyebrow">最新一期</p>
          <h2 id="featured-heading">從封面進入本期目錄</h2>
        </div>
        <IssueCoverCard
          v-if="featuredIssue"
          :issue="featuredIssue"
          priority
          test-id="home-issue-link"
        />
        <ReadingState
          v-else-if="error"
          tone="error"
          title="目前無法載入本期"
          body="請稍後再試；閱讀路徑不會要求你改用帳號或錢包。"
        />
        <ReadingState
          v-else-if="!pending"
          title="尚未有公開期數"
          body="已發布且權利有效的期數會直接出現在這裡。"
        />
      </section>
    </main>
  </div>
</template>
