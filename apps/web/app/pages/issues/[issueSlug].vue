<script setup lang="ts">
import IssueToc from "../../components/issues/IssueToc.vue"
import ReadingState from "../../components/issues/ReadingState.vue"
import OfflineDownloadPanel from "../../features/offline/components/OfflineDownloadPanel.vue"
import { canonicalUrl, jsonLd } from "../../composables/public-seo"
import {
  fetchPublicIssue,
  publicMediaUrl,
  PublicIssueApiError,
  type PublicIssueDetail
} from "../../features/issues/public-issue-api"
import { issueRoute, parsePublicIssueSlug } from "../../features/issues/public-issue-contract"

const route = useRoute()
const config = useRuntimeConfig()
const rawSlug = Array.isArray(route.params.issueSlug)
  ? route.params.issueSlug[0]
  : route.params.issueSlug
let issueSlug = "not-found"

try {
  issueSlug = parsePublicIssueSlug(String(rawSlug))
} catch {
  // Use the same safe public-read path as an unknown slug instead of reflecting malformed input.
}

const {
  data: issue,
  error,
  pending
} = await useAsyncData<PublicIssueDetail>("public-issue-" + issueSlug, () =>
  fetchPublicIssue(config.public.apiBaseUrl, issueSlug)
)

if (
  import.meta.server &&
  error.value instanceof PublicIssueApiError &&
  error.value.statusCode === 404
) {
  setResponseStatus(useRequestEvent()!, 404)
}

const canonical = computed(() =>
  canonicalUrl(config.public.siteUrl, issue.value ? issueRoute(issue.value.slug) : "/issues")
)
const coverSrc = computed(() =>
  issue.value ? publicMediaUrl(config.public.apiBaseUrl, issue.value.cover.url) : ""
)

useHead(() => {
  const current = issue.value
  const title = current ? current.title + " — Courtside TW" : "期數目錄 — Courtside TW"
  const description = current ? current.summary : "閱讀 Courtside TW 已發布且權利有效的公開期數。"
  return {
    title,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: canonical.value },
      ...(current
        ? [
            {
              property: "og:image",
              content: publicMediaUrl(config.public.apiBaseUrl, current.cover.url)
            }
          ]
        : [])
    ],
    link: [{ rel: "canonical", href: canonical.value }],
    script: current
      ? [
          {
            key: "courtside-issue-jsonld",
            type: "application/ld+json",
            innerHTML: jsonLd({
              "@context": "https://schema.org",
              "@type": "Magazine",
              name: current.title,
              description: current.summary,
              datePublished: current.publishedAt,
              image: publicMediaUrl(config.public.apiBaseUrl, current.cover.url),
              url: canonical.value,
              inLanguage: "zh-Hant-TW"
            })
          }
        ]
      : []
  }
})
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

    <main class="site-shell issue-page">
      <NuxtLink to="/issues" class="back-link">← 返回所有期數</NuxtLink>

      <section v-if="issue" class="issue-header" aria-labelledby="issue-heading">
        <div class="issue-header__cover">
          <img
            :src="coverSrc"
            :alt="issue.cover.alt"
            :width="issue.cover.width"
            :height="issue.cover.height"
            fetchpriority="high"
          />
        </div>
        <div class="issue-header__copy">
          <p class="eyebrow">第 {{ issue.issueNumber }} 期</p>
          <h1 id="issue-heading">{{ issue.title }}</h1>
          <p>{{ issue.summary }}</p>
          <time :datetime="issue.publishedAt">公開閱讀</time>
        </div>
      </section>

      <IssueToc v-if="issue" :issue="issue" />
      <OfflineDownloadPanel
        v-if="issue"
        :api-base-url="config.public.apiBaseUrl"
        :issue-slug="issueSlug"
      />
      <ReadingState
        v-else-if="error instanceof PublicIssueApiError && error.statusCode === 404"
        title="找不到這一期"
        body="這期可能尚未發布、已撤回，或網址不正確。"
      />
      <ReadingState
        v-else-if="error"
        tone="error"
        title="期數目錄暫時無法載入"
        body="請稍後重試。"
      />
      <ReadingState v-else-if="!pending" title="找不到這一期" body="請從公開期數目錄重新開始。" />
    </main>
  </div>
</template>
