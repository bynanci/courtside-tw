<script setup lang="ts">
import { canonicalUrl, jsonLd } from "../../composables/public-seo"
import {
  issueRoute,
  parsePublicArticleSlug,
  parsePublicIssueSlug
} from "../../features/issues/public-issue-contract"

const route = useRoute()
const config = useRuntimeConfig()
const rawArticleSlug = Array.isArray(route.params.articleSlug)
  ? route.params.articleSlug[0]
  : route.params.articleSlug
const rawIssueSlug = Array.isArray(route.query.issue) ? route.query.issue[0] : route.query.issue
let articleSlug = ""
let issueSlug: string | null = null

try {
  articleSlug = parsePublicArticleSlug(String(rawArticleSlug))
} catch {
  if (import.meta.server) {
    setResponseStatus(useRequestEvent()!, 404)
  }
}
try {
  issueSlug = rawIssueSlug ? parsePublicIssueSlug(String(rawIssueSlug)) : null
} catch {
  issueSlug = null
}

const canonical = canonicalUrl(
  config.public.siteUrl,
  articleSlug ? "/articles/" + articleSlug : "/articles"
)

useHead(() => ({
  title: "文章閱讀頁 — Courtside TW",
  meta: [
    { name: "description", content: "Courtside TW 的公開文章閱讀頁。" },
    { property: "og:title", content: "文章閱讀頁 — Courtside TW" },
    { property: "og:description", content: "Courtside TW 的公開文章閱讀頁。" },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonical }
  ],
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      key: "courtside-article-shell-jsonld",
      type: "application/ld+json",
      innerHTML: jsonLd({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Courtside TW 文章閱讀頁",
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

    <main class="site-shell article-shell">
      <NuxtLink v-if="issueSlug" :to="issueRoute(issueSlug)" class="back-link"
        >← 返回本期目錄</NuxtLink
      >
      <NuxtLink v-else to="/issues" class="back-link">← 返回所有期數</NuxtLink>

      <article aria-labelledby="article-heading">
        <p class="eyebrow">Public Reading</p>
        <h1 id="article-heading" data-testid="article-header">文章閱讀頁</h1>
        <p>完整文章內容將在下一個公開文章投影階段提供；本期目錄與閱讀路徑已保持可直接連結。</p>
      </article>
    </main>
  </div>
</template>
